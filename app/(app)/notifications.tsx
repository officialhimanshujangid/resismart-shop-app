import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { themeColors, radii, ColorScheme } from '../../src/constants/colors';
import { usePartnerEntitlements } from '../../src/hooks';
import { apiErrorMessage } from '../../src/api/axios';
import { NotificationRow, notificationDestination } from '../../src/api/notification.api';
import {
  NOTIFICATIONS_PAGE,
  fetchOlderNotifications,
  useMarkNotificationsRead,
  useNotifications,
} from '../../src/features/notifications/hooks';
import { EmptyBlock, ErrorBlock, Loading, Screen } from '../../src/features/more/ui';

/**
 * Everything the partner was told while they were not looking.
 *
 * Push registration in this app was already good — Expo tokens, two Android
 * channels, per-partner scope, re-registration on a context switch — and it led
 * nowhere. There was no inbox, so a notification that arrived with the phone off
 * was simply gone: `notificationApi.list` and `markRead` were written and called
 * from nowhere, and `qk.notifications()` was invalidated by both SSE and push
 * and read by no query at all. This screen is the reader.
 *
 * ── Paging ────────────────────────────────────────────────────────────────
 *
 * The endpoint pages by `before` (a `createdAt` cursor), not by page number, so
 * the accumulate-into-state pattern from `(tabs)/orders.tsx` is used with the
 * cursor in place of the page counter. Older pages are held HERE rather than in
 * the query cache on purpose: `qk.notifications()` is invalidated by every SSE
 * frame and every push received while the app is open, and a cached page tree
 * would be thrown away several times an hour mid-scroll. The first page comes
 * from the query (so the badge stays live); everything below it is a local tail
 * that a pull-to-refresh clears.
 *
 * ── Read state ────────────────────────────────────────────────────────────
 *
 * Tapping a row marks THAT row read and then navigates. "Mark all read" sends an
 * empty id list, which the server reads as "all of mine" — see the hook. Neither
 * is optimistic: `markRead` is cheap, and a row that un-greys itself and then
 * greys back on a failed request is worse than one that takes a moment.
 */

/** Kind prefix → the icon that belongs beside it. Prefix-matched, like `keysForKind`. */
function iconForKind(kind: string): string {
  if (kind.startsWith('PARTNER_BOOKING') || kind.startsWith('BOOKING')) return 'calendar-check-outline';
  if (kind.startsWith('PARTNER_ORDER') || kind.startsWith('ORDER')) return 'package-variant-closed';
  if (kind.startsWith('PARTNER_BOOST')) return 'rocket-launch-outline';
  if (kind.startsWith('PARTNER_INVOICE') || kind.startsWith('PARTNER_PAYMENT')) return 'receipt';
  if (kind.startsWith('PARTNER_PLAN')) return 'card-account-details-outline';
  if (kind.startsWith('PARTNER_')) return 'shield-check-outline';
  return 'bell-outline';
}

/** "just now" / "14:05" / "6 Sep". Long enough ago and the time stops mattering. */
function whenLabel(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const minutes = Math.floor((Date.now() - at.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const sameDay = at.toDateString() === new Date().toDateString();
  if (sameDay) return at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return at.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function NotificationItem({
  row, c, onPress,
}: { row: NotificationRow; c: ColorScheme; onPress: () => void }) {
  const unread = !row.readAt;
  return (
    <Pressable onPress={onPress}>
      <View style={[styles.row, { backgroundColor: c.surface }]}>
        <View style={[styles.icon, { backgroundColor: unread ? c.surfaceVariant : 'transparent' }]}>
          <MaterialCommunityIcons
            name={iconForKind(row.kind) as never}
            size={20}
            color={unread ? c.primary : c.textDisabled}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.title, { color: c.textPrimary, fontWeight: unread ? '700' : '500' }]}
            numberOfLines={2}
          >
            {row.title}
          </Text>
          {row.body ? (
            <Text style={[styles.body, { color: c.textSecondary }]} numberOfLines={3}>{row.body}</Text>
          ) : null}
          <Text style={[styles.when, { color: c.textDisabled }]}>{whenLabel(row.createdAt)}</Text>
        </View>
        {unread && <View style={[styles.dot, { backgroundColor: c.primary }]} />}
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { hasModule } = usePartnerEntitlements();
  const query = useNotifications();
  const markRead = useMarkNotificationsRead();

  /** Pages older than the first, held locally — see the header. */
  const [older, setOlder] = useState<NotificationRow[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const rows = useMemo(() => {
    const first = query.data?.items ?? [];
    if (older.length === 0) return first;
    // A frame that arrives mid-scroll refetches the first page, which can now
    // overlap the tail. De-duped by id rather than by position, exactly as the
    // Orders tab does.
    const seen = new Set(first.map((r) => r._id));
    return [...first, ...older.filter((r) => !seen.has(r._id))];
  }, [query.data, older]);

  const unread = query.data?.unread ?? 0;

  const refresh = useCallback(() => {
    setOlder([]);
    setExhausted(false);
    void query.refetch();
  }, [query]);

  const loadOlder = useCallback(() => {
    if (loadingOlder || exhausted || rows.length === 0) return;
    const oldest = rows[rows.length - 1];
    setLoadingOlder(true);
    fetchOlderNotifications(oldest.createdAt)
      .then((page) => {
        if (page.items.length === 0) {
          setExhausted(true);
          return;
        }
        // A short page is the last page — the server has no `total` to compare
        // against, so the page size is the only signal there is.
        if (page.items.length < NOTIFICATIONS_PAGE) setExhausted(true);
        setOlder((prev) => {
          const seen = new Set([...rows.map((r) => r._id), ...prev.map((r) => r._id)]);
          return [...prev, ...page.items.filter((r) => !seen.has(r._id))];
        });
      })
      .catch((e: unknown) => Alert.alert('Could not load older alerts', apiErrorMessage(e)))
      .finally(() => setLoadingOlder(false));
  }, [loadingOlder, exhausted, rows]);

  /**
   * Open what the notification is about.
   *
   * The module gate is checked BEFORE the push, not after: three of the five tab
   * routes are removed from the navigator entirely when their module is off or
   * unsold, and pushing at a route that is not registered is a navigation to a
   * screen that does not exist. A partner whose Orders module was switched off
   * yesterday still has last week's order alerts in here, and tapping one has to
   * do something sane rather than crash the navigator.
   */
  const openRow = useCallback(
    (row: NotificationRow) => {
      if (!row.readAt) markRead.mutate([row._id]);
      const dest = notificationDestination(row);
      if (!dest) return;
      if (dest.requires && !hasModule(dest.requires)) {
        Alert.alert(
          row.title,
          'This is about something your plan or your module settings no longer include, so there is nothing left to open.',
        );
        return;
      }
      router.push(dest.href);
    },
    [hasModule, markRead],
  );

  const loadError = query.isError
    ? apiErrorMessage(query.error, 'Could not load your alerts.')
    : query.isPending && query.isPaused
      ? 'No connection. Check your network and try again.'
      : null;

  return (
    <Screen
      c={c}
      title="Alerts"
      subtitle={unread > 0 ? `${unread} unread` : 'Everything you have been told'}
      scroll={false}
      right={
        unread > 0 ? (
          <Pressable
            onPress={() => markRead.mutate([])}
            disabled={markRead.isPending}
            style={styles.markAll}
            accessibilityLabel="Mark everything read"
          >
            <Text style={{ color: c.primary, fontSize: 12.5, fontWeight: '600' }}>
              {markRead.isPending ? '…' : 'Mark all read'}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.markAll} />
        )
      }
    >
      {loadError ? (
        <ErrorBlock c={c} message={loadError} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading c={c} label="Loading your alerts…" />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row._id}
          renderItem={({ item }) => <NotificationItem row={item} c={c} onPress={() => openRow(item)} />}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          onRefresh={refresh}
          refreshing={query.isRefetching}
          onEndReachedThreshold={0.4}
          onEndReached={loadOlder}
          ListFooterComponent={
            loadingOlder ? (
              <ActivityIndicator color={c.primary} style={{ marginVertical: 16 }} />
            ) : null
          }
          ListEmptyComponent={
            <EmptyBlock
              c={c}
              icon="bell-outline"
              title="Nothing yet"
              body="New bookings, orders and plan notices land here — including the ones that arrive while your phone is off."
            />
          }
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: { padding: 16, paddingBottom: 40, flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: radii.card, padding: 14 },
  icon: { width: 36, height: 36, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14.5 },
  body: { fontSize: 12.5, marginTop: 2, lineHeight: 18 },
  when: { fontSize: 11, marginTop: 4 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  markAll: { minWidth: 48, paddingHorizontal: 8, alignItems: 'flex-end', justifyContent: 'center' },
});
