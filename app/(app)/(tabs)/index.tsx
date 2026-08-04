import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Button, Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../../src/context/AuthContext';
import { usePartnerEntitlements } from '../../../src/hooks';
import { themeColors, radii } from '../../../src/constants/colors';
import { formatPaise } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { qk } from '../../../src/lib/queryKeys';

import { BookingCard } from '../../../src/features/bookings/components/BookingCard';
import { BookingActionModal } from '../../../src/features/bookings/components/BookingActionModal';
import { useBookingAction } from '../../../src/features/bookings/hooks';
import { BookingVerb, PartnerBookingView, VERB_LABELS } from '../../../src/features/bookings/booking.types';
import { LIVE_STATUSES } from '../../../src/features/bookings/format';
import { useLowStockProducts, usePendingOrders, useTodayBookings, useTodaySale } from '../../../src/features/today/hooks';

/**
 * The screen a partner opens twenty times a day.
 *
 * Today is the ONLY tab that is never gated by `Tabs.Protected` (see
 * `(tabs)/_layout.tsx`) — it is what a partner sees when the entitlements
 * answer is outstanding, when it fails, when their business is suspended, and
 * when they are staff nobody has given a role to yet. The banner logic below
 * MUST stay in front of the dashboard content for exactly that reason: a
 * suspended business must not see a stale sale total with no explanation of why
 * new bookings have stopped arriving.
 *
 * Every tile is gated on its OWN module + permission, independently — a
 * partner who bought Bookings but not Orders gets a bookings timeline and
 * nothing else, rather than three empty cards.
 */

const CONFIRM_COPY: Partial<Record<BookingVerb, string>> = {
  accept: 'Accept this booking?',
  start: 'Start this job now?',
  reach: 'Send the customer their completion code now?',
  noShow: 'Mark this as nobody turning up? This closes the job.',
};

export default function TodayScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const { entitlements, ready, failed, refresh, hasModule, can } = usePartnerEntitlements();
  const business = entitlements.business;

  const showBookings = ready && hasModule('BOOKINGS') && can('BOOKINGS_VIEW', 'READ');
  const showOrders = ready && hasModule('ORDERS') && can('ORDERS_VIEW', 'READ');
  const showCatalog = ready && hasModule('CATALOG') && can('CATALOG_VIEW', 'READ');

  const bookingsQuery = useTodayBookings(showBookings);
  const ordersQuery = usePendingOrders(showOrders);
  const lowStockQuery = useLowStockProducts(showCatalog);
  const sale = useTodaySale(showBookings, showOrders);
  const { act, pendingId, isPending } = useBookingAction();

  const [formTarget, setFormTarget] = useState<{ booking: PartnerBookingView; verb: BookingVerb } | null>(null);

  const runQuick = useCallback(
    (booking: PartnerBookingView, verb: BookingVerb) => {
      const prompt = CONFIRM_COPY[verb];
      const fire = () => act(booking.id, verb).catch((e) => Alert.alert('Could not do that', apiErrorMessage(e)));
      if (!prompt) return fire();
      Alert.alert(VERB_LABELS[verb], prompt, [
        { text: 'Not now', style: 'cancel' },
        { text: VERB_LABELS[verb], onPress: fire },
      ]);
    },
    [act],
  );

  const submitForm = useCallback(
    (body: Record<string, unknown>) => {
      if (!formTarget) return;
      act(formTarget.booking.id, formTarget.verb, body)
        .then(() => setFormTarget(null))
        .catch((e) => Alert.alert('Could not do that', apiErrorMessage(e)));
    },
    [act, formTarget],
  );

  const refreshing = bookingsQuery.isFetching || ordersQuery.isFetching || lowStockQuery.isFetching;
  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk.today() });
  }, [queryClient]);

  const banner = (() => {
    if (failed) {
      return {
        title: 'We could not check your access',
        body: 'You are signed in, but we cannot tell what this business has switched on. Everything else stays hidden until we can.',
        action: 'Try again',
      };
    }
    if (!ready) return null;
    if (business?.status === 'SUSPENDED') {
      return {
        title: 'This business is suspended',
        body: 'ResiSmart has paused this account. Contact support to have it looked at.',
      };
    }
    if (business && business.status !== 'ACTIVE' && business.verificationStatus !== 'VERIFIED') {
      return {
        title: 'Your registration is not finished',
        body: 'Complete the remaining steps and send your profile for verification to start taking bookings.',
      };
    }
    if (entitlements.awaitingRole) {
      return {
        title: 'Waiting for your permissions',
        body: 'You are on this business’s staff list, but nobody has said yet what you may do. Ask the owner to set your role.',
      };
    }
    return null;
  })();

  const todaysBookings = (bookingsQuery.data?.data ?? [])
    .slice()
    .sort((a, b) => {
      const aLive = LIVE_STATUSES.includes(a.status) ? 0 : 1;
      const bLive = LIVE_STATUSES.includes(b.status) ? 0 : 1;
      return aLive - bLive || a.slotStart.localeCompare(b.slotStart);
    });

  const pendingOrders = ordersQuery.data?.data ?? [];
  const lowStock = lowStockQuery.data?.data ?? [];

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={[styles.greeting, { color: c.textSecondary }]}>Today</Text>
        <Text style={[styles.name, { color: c.textPrimary }]}>
          {profile?.tenantName ?? user?.name ?? 'Your business'}
        </Text>

        {banner && (
          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{banner.title}</Text>
            <Text style={[styles.cardBody, { color: c.textSecondary }]}>{banner.body}</Text>
            {banner.action && (
              <Button mode="contained" onPress={refresh} style={styles.cardAction}>
                {banner.action}
              </Button>
            )}
          </Surface>
        )}

        {ready && !banner && (showBookings || showOrders) && (
          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>Today&apos;s sale</Text>
            <Text style={[styles.saleFigure, { color: c.textPrimary }]}>
              {sale.loading ? '—' : formatPaise(sale.totalPaise)}
            </Text>
            <Text style={[styles.cardBody, { color: c.textSecondary }]}>
              Completed bookings and delivered orders, today.
              {sale.maybeIncomplete ? ' (Showing at least this much — a busy day may run higher.)' : ''}
            </Text>
          </Surface>
        )}

        {ready && !banner && showOrders && pendingOrders.length > 0 && (
          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
                Pending orders ({ordersQuery.data?.total ?? pendingOrders.length})
              </Text>
            </View>
            <Text style={[styles.cardBody, { color: c.textSecondary }]}>
              Waiting on you to accept or turn down.
            </Text>
            {pendingOrders.slice(0, 3).map((o) => (
              <View key={o.id} style={styles.orderRow}>
                <Text style={[styles.orderCode, { color: c.textPrimary }]}>{o.code}</Text>
                <Text style={[styles.orderMeta, { color: c.textSecondary }]} numberOfLines={1}>
                  {o.customer.name} · {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                </Text>
                <Text style={[styles.orderMoney, { color: c.textPrimary }]}>
                  {formatPaise(o.amounts.totalPaise)}
                </Text>
              </View>
            ))}
            <Button
              mode="text"
              compact
              onPress={() => router.push('/(app)/(tabs)/orders')}
              style={{ alignSelf: 'flex-start' }}
            >
              Go to Orders
            </Button>
          </Surface>
        )}

        {ready && !banner && showCatalog && lowStock.length > 0 && (
          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
              Low stock ({lowStockQuery.data?.total ?? lowStock.length})
            </Text>
            {lowStock.slice(0, 5).map((p) => (
              <View key={p._id} style={styles.orderRow}>
                <Text style={[styles.orderCode, { color: c.textPrimary }]} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={[styles.orderMoney, { color: p.stockQty <= 0 ? c.error : c.textSecondary }]}>
                  {p.stockQty <= 0 ? 'Out of stock' : `${p.stockQty} left`}
                </Text>
              </View>
            ))}
            <Button
              mode="text"
              compact
              onPress={() => router.push('/(app)/(tabs)/more')}
              style={{ alignSelf: 'flex-start' }}
            >
              Manage catalogue
            </Button>
          </Surface>
        )}

        {ready && !banner && showBookings && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Today&apos;s bookings</Text>
            {todaysBookings.length === 0 && !bookingsQuery.isLoading && (
              <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
                <Text style={[styles.cardBody, { color: c.textSecondary }]}>Nothing on the diary today.</Text>
              </Surface>
            )}
            {todaysBookings.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                isDark={isDark}
                pending={isPending && pendingId === b.id}
                onQuickAction={(verb) => runQuick(b, verb)}
                onOpenForm={(verb) => setFormTarget({ booking: b, verb })}
              />
            ))}
          </View>
        )}

        {ready && !banner && !showBookings && !showOrders && !showCatalog && (
          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>Nothing switched on yet</Text>
            <Text style={[styles.cardBody, { color: c.textSecondary }]}>
              Turn on Bookings, Orders or Catalogue from Settings to see them here.
            </Text>
          </Surface>
        )}
      </ScrollView>

      <BookingActionModal
        visible={Boolean(formTarget)}
        verb={formTarget?.verb ?? null}
        booking={formTarget?.booking ?? null}
        isDark={isDark}
        submitting={isPending}
        onDismiss={() => setFormTarget(null)}
        onSubmit={submitForm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  greeting: { fontSize: 13, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase' },
  name: { fontSize: 24, fontWeight: '800', marginBottom: 6 },
  card: { borderRadius: radii.card, padding: 18, gap: 6 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardBody: { fontSize: 14, lineHeight: 20 },
  cardAction: { marginTop: 6, alignSelf: 'flex-start' },
  saleFigure: { fontSize: 30, fontWeight: '800' },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  orderCode: { fontSize: 13, fontWeight: '700', flex: 1 },
  orderMeta: { fontSize: 12, flex: 1.4 },
  orderMoney: { fontSize: 13, fontWeight: '700' },
  section: { gap: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
});
