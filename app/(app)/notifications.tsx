import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors, radii, ColorScheme } from '../../src/constants/colors';
import { formatTime, Translate } from '../../src/features/bookings/format';
import { usePartnerEntitlements } from '../../src/hooks';
import { apiErrorMessage } from '../../src/api/axios';
import { NotificationRow, notificationDestination } from '../../src/api/notification.api';
import { categoryModulesOf } from '../../src/features/p2/modules';
import {
  fetchOlderNotifications,
  useMarkNotificationsRead,
  useNotifications,
} from '../../src/features/notifications/hooks';
import { EmptyBlock, ErrorBlock, Loading, Screen } from '../../src/features/more/ui';
import { HelpButton } from '../../src/features/help/HelpButton';

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
 * The endpoint pages by `cursor` (its own `nextCursor`), not by page number, so
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
  // Commerce (CONTRACT-commerce §12.1), before the PARTNER_ catch-all.
  if (kind === 'PARTNER_OFFER') return 'bullhorn-outline';
  if (kind === 'WALLET') return 'wallet-giftcard';
  if (kind === 'BACK_IN_STOCK') return 'package-variant';
  if (kind === 'DELIVERY_ASSIGNED') return 'truck-delivery-outline';
  if (kind.startsWith('PARTNER_')) return 'shield-check-outline';
  return 'bell-outline';
}

/**
 * "just now" / "2:05 PM" / "6 Sep". Long enough ago and the time stops
 * mattering.
 *
 * `t` is handed in — a plain function, not a component, and its one caller
 * already holds a translator. Neither `toLocaleTimeString` nor
 * `toLocaleDateString` appears here any more: this app runs on Hermes, Android's
 * ICU coverage cannot be relied on, and the failure is silent — a Hindi screen
 * quietly rendering an English month with nothing to reveal it. The full account
 * is in `src/i18n/index.ts#formatI18nDate`. The clock face comes from
 * `bookings/format.ts#formatTime`, which is the same one every booking card
 * reads, and the month from `common.months`.
 */
function whenLabel(iso: string, t: Translate): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const minutes = Math.floor((Date.now() - at.getTime()) / 60_000);
  if (minutes < 1) return t('notifications.when.justNow');
  if (minutes < 60) return t('notifications.when.minutesAgo', { count: minutes });
  const sameDay = at.toDateString() === new Date().toDateString();
  if (sameDay) return formatTime(iso, t);
  return t('notifications.when.dayMonth', {
    day: at.getDate(),
    month: t(`common.months.${at.getMonth() + 1}`),
  });
}

function NotificationItem({
  row, c, onPress,
}: { row: NotificationRow; c: ColorScheme; onPress: () => void }) {
  const { t } = useTranslation();
  const unread = !row.readAt;
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <View style={[styles.row, { backgroundColor: c.surface }]}>
        <View style={[styles.icon, { backgroundColor: unread ? c.surfaceVariant : 'transparent' }]}>
          <MaterialCommunityIcons
            name={iconForKind(row.kind) as never}
            size={20}
            color={unread ? c.primary : c.textDisabled}
          />
        </View>
        <View style={{ flex: 1 }}>
          {/* `row.title` and `row.body` are the server's own words — the
              notification as it was composed and sent — and are shown exactly as
              they arrive. See `UsageMeter.tsx` for the trade this app makes on
              server-supplied text. */}
          <Text
            style={[styles.title, { color: c.textPrimary, fontWeight: unread ? '700' : '500' }]}
            numberOfLines={2}
          >
            {row.title}
          </Text>
          {row.body ? (
            <Text style={[styles.body, { color: c.textSecondary }]} numberOfLines={3}>{row.body}</Text>
          ) : null}
          <Text style={[styles.when, { color: c.textDisabled }]}>{whenLabel(row.createdAt, t)}</Text>
        </View>
        {unread && <View style={[styles.dot, { backgroundColor: c.primary }]} />}
      </View>
    </Pressable>
  );
}

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { hasModule, entitlements } = usePartnerEntitlements();
  const query = useNotifications();
  const markRead = useMarkNotificationsRead();

  /** Pages older than the first, held locally — see the header. */
  const [older, setOlder] = useState<NotificationRow[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  /**
   * The server's `nextCursor` for the page below the local tail. `undefined`
   * until a tail page has loaded — the first page's own `nextCursor` is used
   * until then. No cursor = there is no older page.
   */
  const [tailCursor, setTailCursor] = useState<string | null | undefined>(undefined);
  const nextCursor = tailCursor === undefined ? query.data?.nextCursor : tailCursor;

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
    setTailCursor(undefined);
    setExhausted(false);
    void query.refetch();
  }, [query]);

  const loadOlder = useCallback(() => {
    // Paged by the server's stable cursor, not `before=<oldest createdAt>`,
    // which skipped rows sharing that millisecond. No cursor = the end.
    if (loadingOlder || exhausted || rows.length === 0 || !nextCursor) return;
    setLoadingOlder(true);
    fetchOlderNotifications(nextCursor)
      .then((page) => {
        setTailCursor(page.nextCursor ?? null);
        if (!page.nextCursor || page.items.length === 0) setExhausted(true);
        if (page.items.length === 0) return;
        setOlder((prev) => {
          const seen = new Set([...rows.map((r) => r._id), ...prev.map((r) => r._id)]);
          return [...prev, ...page.items.filter((r) => !seen.has(r._id))];
        });
      })
      .catch((e: unknown) => Alert.alert(t('notifications.screen.olderFailed'), apiErrorMessage(e)))
      .finally(() => setLoadingOlder(false));
  }, [loadingOlder, exhausted, rows, nextCursor, t]);

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
      if (
        (dest.requires && !hasModule(dest.requires))
        // P2: a pharmacy / subscription / appointment / job alert whose module is off.
        || (dest.requiresCategory && !categoryModulesOf(entitlements).includes(dest.requiresCategory))
      ) {
        // The heading is the notification's own title, as the server wrote it.
        Alert.alert(row.title, t('notifications.screen.gone'));
        return;
      }
      router.push(dest.href);
    },
    [hasModule, entitlements, markRead, t],
  );

  const loadError = query.isError
    ? apiErrorMessage(query.error, t('notifications.screen.loadFailed'))
    : query.isPending && query.isPaused
      ? t('common.apiError.noConnection')
      : null;

  return (
    <Screen
      c={c}
      title={t('notifications.screen.title')}
      subtitle={unread > 0 ? t('notifications.screen.unread', { count: unread }) : t('notifications.screen.subtitle')}
      scroll={false}
      // With nothing unread the slot is left empty, so `Screen` draws its own
      // Help "?". With unread rows, "Mark all read" sits BESIDE that "?" —
      // width-capped and wrapping to two lines so a long Hindi label never
      // squeezes the title at 320 px.
      right={
        unread > 0 ? (
          <View style={styles.headerRight}>
            <Pressable
              onPress={() => markRead.mutate([])}
              disabled={markRead.isPending}
              style={styles.markAll}
              accessibilityRole="button"
              accessibilityLabel={t('notifications.screen.markAllA11y')}
            >
              <Text
                style={{ color: c.primary, fontSize: 12.5, fontWeight: '600', textAlign: 'right' }}
                numberOfLines={2}
              >
                {markRead.isPending ? '…' : t('notifications.screen.markAll')}
              </Text>
            </Pressable>
            <HelpButton c={c} />
          </View>
        ) : undefined
      }
    >
      {loadError ? (
        <ErrorBlock c={c} message={loadError} onRetry={() => void query.refetch()} />
      ) : query.isPending ? (
        <Loading c={c} label={t('notifications.screen.loading')} />
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
              title={t('notifications.screen.emptyTitle')}
              body={t('notifications.screen.emptyBody')}
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
  headerRight: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, maxWidth: 160 },
  markAll: {
    minWidth: 48, minHeight: 44, maxWidth: 104, flexShrink: 1,
    paddingHorizontal: 4, alignItems: 'flex-end', justifyContent: 'center',
  },
});
