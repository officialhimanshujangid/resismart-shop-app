import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View, useColorScheme } from 'react-native';
import { ActivityIndicator, Button, IconButton, Snackbar, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { formatPaise } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { paymentsApi } from '../../../src/features/payments/payments.api';
import {
  PAYMENT_MODE_LABEL, PaymentDirection, PaymentRecord, partyNameOf,
} from '../../../src/features/payments/types';
import { ChipRow, EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { toHref } from '../../../src/features/billing/routeHref';

/**
 * Payments, both directions — C1. `IN`/`OUT` are two tabs of the SAME model
 * (see `types.ts`'s header); this screen and `billing/[id].tsx`'s
 * record-on-a-document action are the two places `POST /partners/me/payments`
 * is reached from this app. Mirrors web `payments/page.tsx`.
 */

const PAGE_LIMIT = 25;

export default function PaymentsScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const queryClient = useQueryClient();
  const { can } = usePartnerEntitlements();
  const canManage = can('INVOICING_MANAGE', 'FULL');

  const [direction, setDirection] = useState<PaymentDirection>('IN');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PaymentRecord[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
    setRows([]);
  }, [direction]);

  const filters = useMemo(() => ({ direction, page, limit: PAGE_LIMIT }), [direction, page]);
  const query = useQuery({
    queryKey: qk.payments.list(filters),
    queryFn: () => paymentsApi.list(filters),
  });

  useEffect(() => {
    if (!query.data) return;
    setRows((prev) => {
      if (query.data.page === 1) return query.data.data;
      const seen = new Set(prev.map((p) => p._id));
      return [...prev, ...query.data.data.filter((p) => !seen.has(p._id))];
    });
  }, [query.data]);

  const total = query.data?.total ?? 0;
  const hasMore = rows.length < total;
  const loadMore = useCallback(() => {
    if (query.isFetching || !hasMore) return;
    setPage((p) => p + 1);
  }, [query.isFetching, hasMore]);

  const onRefresh = useCallback(() => {
    setPage(1);
    void queryClient.invalidateQueries({ queryKey: qk.payments.all() });
  }, [queryClient]);

  const cancelPayment = useCallback(
    async (payment: PaymentRecord) => {
      setCancellingId(payment._id);
      try {
        await paymentsApi.cancel(payment._id);
        setRows((prev) => prev.map((p) => (p._id === payment._id ? { ...p, status: 'CANCELLED' } : p)));
        void queryClient.invalidateQueries({ queryKey: qk.payments.all() });
        setToast('Payment cancelled.');
      } catch (e: unknown) {
        setToast(apiErrorMessage(e, 'Could not cancel this payment.'));
      } finally {
        setCancellingId(null);
      }
    },
    [queryClient],
  );

  if (!can('INVOICING_VIEW', 'READ')) {
    // The layout already redirects this case; this is only the render frame
    // between "ready" flipping true and the redirect committing.
    return null;
  }

  return (
    <Screen
      title="Payments"
      subtitle="Money in and out, allocated to what it settles"
      c={c}
      back={false}
      scroll={false}
      right={
        canManage ? (
          <IconButton
            icon="plus"
            mode="contained"
            size={20}
            onPress={() => router.push(toHref(`/(app)/payments/new?direction=${direction}`))}
            accessibilityLabel="Record a payment"
          />
        ) : undefined
      }
    >
      <View style={styles.filterRow}>
        <ChipRow
          c={c}
          value={direction}
          onChange={setDirection}
          options={[
            { key: 'IN', label: 'Payments in' },
            { key: 'OUT', label: 'Payments out' },
          ]}
        />
      </View>

      {query.isPending ? (
        <Loading c={c} label="Loading your payments…" />
      ) : query.isError ? (
        <ErrorBlock c={c} message={apiErrorMessage(query.error, 'We could not load your payments.')} onRetry={() => void query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyBlock
          c={c}
          icon="wallet-outline"
          title={direction === 'IN' ? 'No payments received yet' : 'No payments made yet'}
          body={direction === 'IN'
            ? 'A payment against an invoice shows up here the moment it is recorded.'
            : 'A payment against a purchase invoice shows up here the moment it is recorded.'}
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={query.isFetching && page === 1} onRefresh={onRefresh} />}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          ListFooterComponent={query.isFetching && page > 1 ? <ActivityIndicator style={{ marginVertical: 16 }} /> : null}
          renderItem={({ item }) => (
            <PaymentRow
              item={item}
              c={c}
              direction={direction}
              canManage={canManage}
              cancelling={cancellingId === item._id}
              onCancel={() => cancelPayment(item)}
            />
          )}
        />
      )}

      <Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={3500}>
        {toast}
      </Snackbar>
    </Screen>
  );
}

function PaymentRow({
  item, c, direction, canManage, cancelling, onCancel,
}: {
  item: PaymentRecord;
  c: ReturnType<typeof themeColors>;
  direction: PaymentDirection;
  canManage: boolean;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const cancelled = item.status === 'CANCELLED';
  return (
    <View style={[styles.row, { backgroundColor: c.surface }]}>
      <View style={[styles.rowIcon, { backgroundColor: direction === 'IN' ? c.success + '1f' : c.error + '1f' }]}>
        <IconButtonGlyph direction={direction} color={direction === 'IN' ? c.success : c.error} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.partyName, { color: c.textPrimary }]} numberOfLines={1}>{partyNameOf(item)}</Text>
        <Text style={[styles.meta, { color: c.textSecondary }]}>
          {new Date(item.receivedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          {' · '}{PAYMENT_MODE_LABEL[item.mode]}
        </Text>
        {item.onAccountPaise > 0 && !cancelled && (
          <Text style={[styles.onAccount, { color: c.primary }]}>{formatPaise(item.onAccountPaise)} on account</Text>
        )}
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.amount, { color: c.textPrimary }]}>{formatPaise(item.amountPaise)}</Text>
        {cancelled ? (
          <Text style={[styles.cancelledLabel, { color: c.textDisabled }]}>Cancelled</Text>
        ) : canManage ? (
          <Button
            mode="text"
            compact
            textColor={c.error}
            loading={cancelling}
            disabled={cancelling}
            onPress={onCancel}
            style={styles.cancelBtn}
            labelStyle={styles.cancelLabel}
          >
            Cancel
          </Button>
        ) : null}
      </View>
    </View>
  );
}

/** Tiny inline glyph rather than pulling in another icon dependency for two arrows. */
function IconButtonGlyph({ direction, color }: { direction: PaymentDirection; color: string }) {
  return (
    <Text style={{ color, fontSize: 16, fontWeight: '900' }}>{direction === 'IN' ? '↓' : '↑'}</Text>
  );
}

const styles = StyleSheet.create({
  filterRow: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  list: { padding: 16, paddingTop: 4, gap: 10, paddingBottom: 32 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radii.card, padding: 14 },
  rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  partyName: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
  onAccount: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  amount: { fontSize: 15, fontWeight: '800' },
  cancelledLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  cancelBtn: { margin: 0, minWidth: 0 },
  cancelLabel: { fontSize: 11, marginVertical: 0, marginHorizontal: 4 },
});
