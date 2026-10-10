import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../src/constants/colors';
import { useIsOnline } from '../../src/hooks/useIsOnline';
import { EmptyState, SkeletonList } from '../../src/components/ui';
import { useAppTheme } from '../../src/theme/useAppTheme';
import { radius, typeScale, motion } from '../../src/theme/tokens';
import { PressableScale, easeOut, useMotionOK } from '../../src/theme/motion';
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
import { ErrorBlock, Loading, Screen } from '../../src/features/more/ui';
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

/** Rows past the first screenful mount without the entrance (rule 14). */
const STAGGER_ROWS = 7;

/**
 * One notification (1R): a tinted round icon, the title (bold while unread),
 * the body and the time, and an unread dot. Unread rows sit on the brand soft
 * ground with a green edge; read rows are plain cards with a hairline. The
 * first screenful rises in with a short stagger; press = scale 0.97.
 */
function NotificationItem({
  row, index, onPress,
}: { row: NotificationRow; index: number; onPress: () => void }) {
  const { t } = useTranslation();
  const { ds, tints, shadow } = useAppTheme();
  const motionOK = useMotionOK();
  const unread = !row.readAt;
  const tn = tints[unread ? 'green' : 'blue'];
  return (
    <Animated.View
      entering={motionOK && index < STAGGER_ROWS
        ? FadeInDown.duration(motion.rise.duration * 0.6).delay(index * 60).easing(easeOut)
        : undefined}
    >
      <PressableScale
        onPress={onPress}
        accessibilityRole="button"
        style={[
          styles.row,
          // Unread = green edge (+ dot + bold title) on the plain surface, not a
          // soft fill: muted body text on the soft green would drop under 4.5:1.
          { backgroundColor: ds.surface, borderColor: unread ? ds.primary : ds.line, borderWidth: unread ? 1.5 : 1 },
          shadow('card'),
        ]}
      >
        <View style={styles.icon}>
          <LinearGradient colors={[tn.from, tn.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.iconFill]} />
          <MaterialCommunityIcons name={iconForKind(row.kind) as never} size={20} color={tn.icon} />
        </View>
        <View style={styles.text}>
          {/* `row.title` and `row.body` are the server's own words — the
              notification as it was composed and sent — and are shown exactly as
              they arrive. See `UsageMeter.tsx` for the trade this app makes on
              server-supplied text. */}
          <Text
            style={[styles.title, { color: ds.ink, fontWeight: unread ? '700' : '500' }]}
            numberOfLines={2}
          >
            {row.title}
          </Text>
          {row.body ? (
            <Text style={[typeScale.detail, styles.body, { color: ds.muted }]} numberOfLines={3}>{row.body}</Text>
          ) : null}
          <Text style={[typeScale.caption, styles.when, { color: ds.muted }]}>{whenLabel(row.createdAt, t)}</Text>
        </View>
        {unread ? <View style={[styles.dot, { backgroundColor: ds.primary }]} /> : null}
      </PressableScale>
    </Animated.View>
  );
}

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { ds, status } = useAppTheme();
  const online = useIsOnline();
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
                style={{ color: status.brand.fg, fontSize: 12.5, fontWeight: '600', textAlign: 'right' }}
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
        // Skeleton rows while the first page loads; offline keeps the shared
        // "waiting for signal" words.
        online ? (
          <View style={styles.listContent}><SkeletonList rows={5} testID="notifications-loading" /></View>
        ) : (
          <Loading c={c} label={t('notifications.screen.loading')} />
        )
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row._id}
          renderItem={({ item, index }) => <NotificationItem row={item} index={index} onPress={() => openRow(item)} />}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={refresh}
              tintColor={ds.primary}
              colors={[ds.primary]}
              progressBackgroundColor={ds.surface}
            />
          }
          onEndReachedThreshold={0.4}
          onEndReached={loadOlder}
          ListFooterComponent={
            loadingOlder ? (
              <ActivityIndicator color={ds.primary} style={{ marginVertical: 16 }} />
            ) : null
          }
          ListEmptyComponent={
            <EmptyState
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
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: radius.row, padding: 14, borderWidth: 1 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  iconFill: { borderRadius: 20 },
  text: { flex: 1, minWidth: 0 },
  title: { fontSize: 14.5, lineHeight: 20 },
  body: { marginTop: 2 },
  when: { marginTop: 4 },
  dot: { width: 9, height: 9, borderRadius: 5, marginTop: 6 },
  headerRight: { flexDirection: 'row', alignItems: 'center', flexShrink: 1, maxWidth: 160 },
  markAll: {
    minWidth: 48, minHeight: 44, maxWidth: 104, flexShrink: 1,
    paddingHorizontal: 4, alignItems: 'flex-end', justifyContent: 'center',
  },
});
