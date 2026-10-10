import React, { useCallback, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../../src/context/AuthContext';
import { usePartnerEntitlements } from '../../../src/hooks';
import { useTranslation } from 'react-i18next';

import { blockerFix, splitBlockers } from '../../../src/api/partner.api';
import { formatPaise } from '../../../src/lib/money';
import { formatI18nDate } from '../../../src/i18n';
import { apiErrorMessage, apiErrorCode, apiErrorParams } from '../../../src/api/axios';
import { isCodeRefusal } from '../../../src/lib/completionCode';
import { qk } from '../../../src/lib/queryKeys';
import { Kpi, findKpi, findSeries, formatKpiValue } from '../../../src/api/analytics.api';
import {
  AreaChart, Button, Card, Detail, EmptyState, ErrorState, GlassCard, HeroHeader, ListRow, Money,
  SectionTitle, Skeleton, SkeletonList, StatusBadge, Storefront,
} from '../../../src/components/ui';
import { radius, typeScale, type StatusTone, type TintName } from '../../../src/theme/tokens';
import { useAppTheme } from '../../../src/theme/useAppTheme';
import { Rise, useCountUp } from '../../../src/theme/motion';
import { HelpButton } from '../../../src/features/help/HelpButton';
import { P2TodayShortcuts } from '../../../src/features/p2/P2Shortcuts';
// >>> SHORTCUTS — the grid replaces the P1 pill row (`features/p1/TodayShortcuts`): its three
// actions (Add expense, Khata, Close the day) are tiles in it, gated like their screens.
import { shortcutTilesFor, TodayShortcutGrid } from '../../../src/features/today/ShortcutGrid';
// <<< SHORTCUTS
import { blockerText } from '../../../src/features/today/blockerText';
import { useCommerceAccess } from '../../../src/features/commerce/access';
import { homeBannerOf } from '../../../src/features/society/logic';
import { HomeSocietyBanner } from '../../../src/features/society/components/HomeSocietyBanner';
import { AnnouncementBanner } from '../../../src/components/AnnouncementBanner'; // >>> OC6 <<<
import { useMyReach } from '../../../src/features/society/hooks';
import { useMyRent } from '../../../src/features/rent/hooks';
import { rentAccess } from '../../../src/features/rent/logic';
import { RentTodayCard } from '../../../src/features/rent/components/RentTodayCard';
import { PauseOrdersCard } from '../../../src/features/commerce/components/PauseOrdersCard';

import { BookingCard } from '../../../src/features/bookings/components/BookingCard';
import { BookingActionModal, CodeRefusal } from '../../../src/features/bookings/components/BookingActionModal';
import { useBookingAction } from '../../../src/features/bookings/hooks';
import { BookingConflictView, BookingVerb, PartnerBookingView, VERB_LABEL_KEYS } from '../../../src/features/bookings/booking.types';
import { slotConflictsOf } from '../../../src/features/bookings/booking.api';
import { LIVE_STATUSES } from '../../../src/features/bookings/format';
import { useLowStockProducts, usePendingOrders, useTodayAnalytics, useTodayBookings } from '../../../src/features/today/hooks';

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
 *
 * M04-H (2026-10-06): redesigned to the DS v1 ShopHome template, green, light +
 * dark — `HeroHeader` with the animated storefront, the glass sales card over
 * its edge (count-up sale, the 14-day trend drawing in, stat cells, the one
 * primary "New bill"), DS service tiles, list rows, the warm "Running low"
 * card, skeletons / error / empty states, sections rising in a stagger, a
 * tinted pull-to-refresh. Presentation only: same queries, gates, handlers and
 * testIDs; the bug fixes made on the way are tagged M04-H-0n where they are.
 */

/**
 * The card above the dashboard, and whether it REPLACES the dashboard.
 *
 * `tone` is the field that decides that, and it had to exist the moment this
 * screen grew a banner that is not a warning. Everything below used to be gated
 * on `!banner`, which was right while every banner meant "something is wrong
 * and the numbers under it would be misleading" — a suspension, an invisible
 * shop. It is wrong for `info`: "you are live, we are still checking your
 * documents" is the ordinary state of every partner in their first days, and
 * blanking their takings, their diary and their pending orders for it would
 * hide the whole app from everybody who has just signed up.
 */
interface TodayBanner {
  title: string;
  body: string;
  /** A quieter second line — things costing the partner business without hiding them. */
  note?: string;
  /** `warning` takes over the screen; `info` sits above a dashboard that still draws. */
  tone: 'warning' | 'info';
  action?: string;
  onAction?: () => void;
}

/**
 * Verbs whose confirmation is a native alert rather than the form sheet — see
 * `BookingCard.CONFIRM_DIRECTLY`.
 *
 * Catalogue keys, and deliberately the SAME four entries `(tabs)/bookings.tsx`
 * points at: Today runs the identical quick actions on the identical cards, so
 * one pair of sentences serves both rather than two translations of the same
 * question drifting apart. The verb keys are the wire values — see
 * `VERB_LABEL_KEYS`.
 */
const CONFIRM_COPY_KEYS: Partial<Record<BookingVerb, string>> = {
  accept: 'bookings.confirm.accept',
  start: 'bookings.confirm.start',
  reach: 'bookings.confirm.reach',
  noShow: 'bookings.confirm.noShow',
};

export default function TodayScreen() {
  const { t, i18n } = useTranslation();
  // DS v1 theme (light + dark): `c` is the legacy map the child components still
  // take; `ds` / `status` are the tokens this screen draws with.
  const { isDark, c, ds, status } = useAppTheme();
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();
  const { entitlements, ready, failed, refresh, hasModule, can } = usePartnerEntitlements();
  const business = entitlements.business;
  const visibility = entitlements.visibility;

  const showBookings = ready && hasModule('BOOKINGS') && can('BOOKINGS_VIEW', 'READ');
  const showOrders = ready && hasModule('ORDERS') && can('ORDERS_VIEW', 'READ');
  const showCatalog = ready && hasModule('CATALOG') && can('CATALOG_VIEW', 'READ');
  /**
   * Gate 3 on the board itself, and it is NOT covered by the three above.
   *
   * `analytics-partner-today.routes.ts` sits behind
   * `requirePartnerPermission('REPORTS', 'READ')` — its own header explains why
   * the MODULE gate would be wrong here and the PERMISSION gate is still
   * required: the board answers with the day's takings, and takings are what
   * `REPORTS` guards everywhere else in this app (`(tabs)/_layout.tsx`,
   * `more.tsx`, `reports/_layout.tsx` all ask). Asking on module alone meant a
   * staff member with `REPORTS: NONE` — a delivery hand, an assistant hired
   * this morning — fired a 403 on every load and every pull-to-refresh and read
   * "—" in every tile forever, with nothing on screen saying why.
   */
  const showReports = ready && can('REPORTS', 'READ');

  const bookingsQuery = useTodayBookings(showBookings);
  const ordersQuery = usePendingOrders(showOrders);
  const lowStockQuery = useLowStockProducts(showCatalog);
  // Not gated on any one module — see `analytics.api.ts`'s header. Only fired
  // when at least one of the three tiles it feeds could show something AND this
  // person may read the takings at all; the "Nothing switched on yet" card
  // below covers the all-false case, and the KPI row simply does not draw for
  // somebody without REPORTS.
  const analyticsQuery = useTodayAnalytics(showReports && (showBookings || showOrders || showCatalog));
  const board = analyticsQuery.data;
  /** The 14-day trend both `today_sale` and `today_orders` draw from. */
  const salesSpark = findSeries(board, 'sales')?.points ?? [];
  /**
   * `board`'s own KPI when it has loaded, a `value: null` placeholder while it
   * has not — a tile always has a frame to draw ("—" via `formatKpiValue"),
   * never a gap that reflows the grid the moment the request resolves.
   */
  const kpiOf = (key: string, label: string, unit: Kpi['unit'], goodWhen: Kpi['goodWhen']): Kpi =>
    findKpi(board, key) ?? { key, label, value: null, unit, previous: null, deltaPercent: null, direction: null, goodWhen };
  const { act, pendingId, isPending } = useBookingAction();
  /** P3: the home-society banner (society partners only; nothing for independents). */
  const myReach = useMyReach();
  /** P4: the shop rent due card — only asked by somebody the rent route lets in. */
  const myRent = useMyRent(ready && rentAccess(can).canView);

  const [formTarget, setFormTarget] = useState<{ booking: PartnerBookingView; verb: BookingVerb } | null>(null);
  /** The appointments the last submit was refused for — see `submitForm`. */
  const [conflicts, setConflicts] = useState<BookingConflictView[]>([]);
  /** A wrong / locked completion code — shown in the sheet, beside "Send a new code". */
  const [codeRefusal, setCodeRefusal] = useState<CodeRefusal | null>(null);

  const runQuick = useCallback(
    (booking: PartnerBookingView, verb: BookingVerb) => {
      const promptKey = CONFIRM_COPY_KEYS[verb];
      const fire = () => act(booking.id, verb).catch((e) => Alert.alert(t('bookings.actionFailed'), apiErrorMessage(e)));
      if (!promptKey) return fire();
      Alert.alert(t(VERB_LABEL_KEYS[verb]), t(promptKey), [
        { text: t('common.notNow'), style: 'cancel' },
        { text: t(VERB_LABEL_KEYS[verb]), onPress: fire },
      ]);
    },
    [act, t],
  );

  const submitForm = useCallback(
    (body: Record<string, unknown>) => {
      if (!formTarget) return;
      setConflicts([]);
      act(formTarget.booking.id, formTarget.verb, body)
        .then(() => setFormTarget(null))
        .catch((e) => {
          /**
           * A refusal that NAMES the appointments in the way stays in the sheet.
           *
           * `extend` answers 409 `SLOT_TAKEN_AHEAD` carrying `data.conflicts[]`,
           * and flattening that into "Could not do that" throws away the only
           * part the partner can act on — they are standing in a flat with the
           * job half done, and "Mrs Sharma at 3:30" is what tells them whether
           * to ring, to move it, or to ask for ten minutes instead of thirty.
           * The sheet stays open so the smaller number is one tap away.
           */
          const named = slotConflictsOf(e);
          if (named.length) return setConflicts(named);
          // A code refusal stays in the sheet, where "Send a new code" is.
          if (formTarget.verb === 'complete' && isCodeRefusal(apiErrorCode(e))) {
            return setCodeRefusal({
              code: apiErrorCode(e), params: apiErrorParams(e), message: apiErrorMessage(e), at: Date.now(),
            });
          }
          Alert.alert(t('bookings.actionFailed'), apiErrorMessage(e));
        });
    },
    [act, formTarget, t],
  );

  const refreshing = bookingsQuery.isFetching || ordersQuery.isFetching || lowStockQuery.isFetching || analyticsQuery.isFetching;
  const onRefresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk.today() });
    void queryClient.invalidateQueries({ queryKey: qk.partner.reach() });
    void queryClient.invalidateQueries({ queryKey: qk.rent.all() });
    void queryClient.invalidateQueries({ queryKey: qk.commerce.settings() });
  }, [queryClient]);

  const banner = ((): TodayBanner | null => {
    if (failed) {
      return {
        title: t('today.accessFailedTitle'),
        body: t('today.accessFailedBody'),
        tone: 'warning',
        action: t('common.tryAgain'),
      };
    }
    if (!ready) return null;
    if (business?.status === 'SUSPENDED') {
      return {
        title: t('today.suspendedTitle'),
        body: t('today.suspendedBody'),
        tone: 'warning',
      };
    }
    /**
     * "Residents cannot find you", and WHY — from the server, not from a guess
     * made here.
     *
     * The condition this replaces was `status !== 'ACTIVE' && verificationStatus
     * !== 'VERIFIED'`, and it missed every case that actually bites: a partner
     * who is ACTIVE but never verified (which is how the owner console used to
     * create them) passed it silently, as did one with no map pin and one with
     * no service modes. All three are invisible to every resident at every
     * distance, and this screen told them nothing was wrong.
     *
     * `blockers` arrive already written for the proprietor — rendered verbatim
     * rather than re-worded, so the sentence a partner reads here is the one the
     * web panel shows and the one support will quote back to them.
     */
    const { blocking, alsoCosting } = splitBlockers(visibility);
    /**
     * M04-H-02: the blocker sentence in the READER's language. The server's
     * `message` is English only, so a Hindi partner read English under a Hindi
     * heading; the web panel already translates by `code`
     * (`PartnerVisibilityAlert.tsx`). Same words as the web, and the server's
     * own sentence is still the fallback for a code this build does not know.
     */
    const sentenceOf = (b: Parameters<typeof blockerText>[0]) =>
      blockerText(b, (k) => t(k), (k) => i18n.exists(k));

    if (visibility && !visibility.discoverable) {
      const reasons = blocking.map(sentenceOf);
      /**
       * The button goes to the FIRST BLOCKING blocker that has somewhere to go.
       *
       * `partnerVisibility` lists them in the order it checks them, so the first
       * one with a destination is the first thing standing in the way that the
       * partner can actually do something about. Sending a partner whose only
       * problem is a missing map pin to the documents screen is a button that
       * leads away from the fix — and the `href` the server sends is a WEB
       * route, so it cannot be followed here; `blockerFix` is this app's answer
       * to the same question.
       *
       * It was doing exactly that, and the filter above is why. `NOT_VERIFIED`
       * arrives BEFORE `NO_LOCATION` in check order and `blockerFix` sends it to
       * `/settings/verification`, so every partner with a missing pin was handed
       * a button to the documents screen — the failure this comment already
       * existed to prevent, reached because the list it picked from was the
       * unfiltered one.
       */
      const fix = blocking.map((b) => blockerFix(b.code)).find(Boolean);
      return {
        title: t('today.notFoundTitle'),
        // `reasons` are the SERVER's own blocker sentences, already written for
        // the proprietor — interpolated verbatim, never re-worded here, exactly
        // as `UsageMeter.tsx` states the trade for server-supplied text.
        body: reasons.length
          ? t('today.notFoundBody', { reasons: reasons.join(' ') })
          : t('today.notFoundBodyNoReasons'),
        // The non-gating ones, under the heading that is true of them: they are
        // costing this partner customers, not hiding them. Printing them in the
        // list above put NOT_VERIFIED's "residents can find you and call you"
        // directly beneath "residents cannot find you yet".
        note: alsoCosting.length
          ? t('today.alsoWorthSorting', { reasons: alsoCosting.map(sentenceOf).join(' ') })
          : undefined,
        tone: 'warning',
        // Nothing to offer when every blocker is one only ResiSmart can lift —
        // a suspension, or a profile sitting with a reviewer.
        action: fix ? t(fix.labelKey) : undefined,
        onAction: fix ? () => router.push(fix.href) : undefined,
      };
    }
    /**
     * Ahead of the verification note below, deliberately: that one is about the
     * BUSINESS and this one is about the person holding the phone. Somebody with
     * no role has nothing to act on either way, but "nobody has said what you may
     * do" is the sentence that explains the empty screen they are looking at.
     */
    if (entitlements.awaitingRole) {
      return {
        title: t('today.awaitingRoleTitle'),
        body: t('today.awaitingRoleBody'),
        tone: 'warning',
      };
    }
    /**
     * LIVE, AND NOT YET TRANSACTABLE — the ordinary state of a partner who has
     * just submitted, and the one sentence this screen was never saying.
     *
     * They are `ACTIVE`, they are in every resident's list, their phone rings —
     * and ResiSmart will not take a booking or an order for them until a
     * reviewer has looked. `discoverable` is true throughout, so the branch
     * above never fired and the Today screen said nothing at all while the
     * partner waited for bookings that could not arrive.
     *
     * `NOT_VERIFIED`'s own message is what says it, rendered verbatim like every
     * other blocker sentence — it is already written for this exact state and
     * changes wording when the owner switches KYC off. No action button: there
     * is genuinely nothing for them to do, and a button would imply otherwise.
     */
    if (visibility?.transactable === false) {
      const waiting = alsoCosting.find((b) => b.code === 'NOT_VERIFIED');
      if (waiting) {
        return {
          title: t('today.checkingDocsTitle'),
          // `waiting.message` is the server's own sentence — verbatim, for the
          // reason the `reasons` interpolation above gives.
          body: t('today.checkingDocsBody', { message: sentenceOf(waiting) }),
          tone: 'info',
        };
      }
    }
    return null;
  })();

  /**
   * Is the banner one that should REPLACE the dashboard?
   *
   * Only a warning is. An `info` banner sits above a screen that still draws
   * everything — see `TodayBanner`. Every `!banner` gate below reads this
   * instead, so adding a calm banner never costs a working partner their
   * numbers.
   */
  const blocked = banner !== null && banner.tone === 'warning';

  const todaysBookings = (bookingsQuery.data?.data ?? [])
    .slice()
    .sort((a, b) => {
      const aLive = LIVE_STATUSES.includes(a.status) ? 0 : 1;
      const bLive = LIVE_STATUSES.includes(b.status) ? 0 : 1;
      return aLive - bLive || a.slotStart.localeCompare(b.slotStart);
    });

  const pendingOrders = ordersQuery.data?.data ?? [];
  const lowStock = lowStockQuery.data?.data ?? [];

  // ── Hero content ─────────────────────────────────────────────────────────
  // The business name is the hero's anchor and always renders — Today is the
  // app's floor. The revenue-first headline and the glass tiles only appear
  // once entitlements are settled and no banner is claiming the top of the
  // screen, so a suspended or unverified partner never reads a stale total.
  const businessName = profile?.tenantName ?? user?.name ?? t('today.yourBusiness');
  // `showReports` as well as the modules: the numbers behind these tiles come
  // from an endpoint this person may not read, and a row of "—" that never
  // fills in is worse than a hero with nothing under it.
  const showStats = showReports && !blocked && (showBookings || showOrders || showCatalog);
  const showSale = showStats && (showBookings || showOrders);
  /**
   * The `label` on each of these is the PLACEHOLDER half of `kpiOf` — the one
   * used only while the board has not loaded, and the tiles below draw their own
   * label prop rather than reading it. Translated all the same: a string that is
   * only reachable in a loading state is exactly the one that ships in English
   * because nobody saw it. When the board HAS loaded, `findKpi` returns the
   * server's own Kpi and its `label` is server text — untouched, as everywhere
   * else (see `UsageMeter.tsx`).
   */
  const saleKpi = kpiOf('today_sale', t('today.kpiSale'), 'PAISE', 'UP');
  const ordersKpi = kpiOf('today_orders', t('today.kpiOrders'), 'COUNT', 'UP');
  const pendingKpi = kpiOf('pending_decisions', t('today.kpiPending'), 'COUNT', 'DOWN');
  const lowKpi = kpiOf('low_stock', t('today.kpiLowStock'), 'COUNT', 'DOWN');
  const kpiDelta = (k: Kpi): string | undefined =>
    k.deltaPercent !== null
      ? `${k.direction === 'UP' ? '▲' : k.direction === 'DOWN' ? '▼' : ''} ${Math.abs(k.deltaPercent).toFixed(1)}%`.trim()
      : undefined;
  const saleDelta = kpiDelta(saleKpi);
  /**
   * The delta badge's tone: good news green, bad news amber, flat `info` —
   * never red. Not `neutral`: that kit pair is 4.28:1 in light (< 4.5).
   */
  const deltaTone = (k: Kpi): StatusTone => {
    if (k.direction === 'UP') return k.goodWhen === 'DOWN' ? 'warn' : 'brand';
    if (k.direction === 'DOWN') return k.goodWhen === 'DOWN' ? 'brand' : 'warn';
    return 'info';
  };
  /** First load of the board: skeletons in the sales card, not a row of "—". */
  const boardLoading = analyticsQuery.isLoading;
  /**
   * "New bill" — the screen's ONE primary action (ShopHome template), behind the
   * SAME gate as the Shortcuts tile that opens the same screen
   * (`shortcutTilesFor` → NEW_BILL: INVOICING + INVOICING_VIEW + INVOICING_MANAGE).
   */
  const commerce = useCommerceAccess();
  const canNewBill = shortcutTilesFor({ ready, can, hasModule, commerce }).some((x) => x.key === 'NEW_BILL');
  /**
   * M04-H-03: "Society shop of X — approved · residents of X can find you" must
   * not sit beside a warning that says the opposite. While the business is
   * suspended or not discoverable the APPROVED claim is false, so only the
   * REMOVED fact (still true, still useful) is drawn then.
   */
  const homeBanner = homeBannerOf(myReach.data);
  const listingHidden = ready && (business?.status === 'SUSPENDED' || (!!visibility && !visibility.discoverable));
  const showSocietyBanner = !listingHidden || homeBanner?.kind === 'REVOKED';
  const today = formatI18nDate(new Date(), t);

  return (
    <View style={[styles.root, { backgroundColor: ds.ground }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={ds.primary}
            colors={[ds.primaryFill]}
            progressBackgroundColor={ds.surface}
          />
        )}
      >
        {/* DS v1 ShopHome hero: the green sky with the storefront (the ONLY
            ambient motion on this screen — off under reduce-motion), the
            business name as the anchor (always drawn: Today is the app's floor)
            and the Help "?" as a glass button. It draws under the status bar
            and pads itself by the safe-area inset. */}
        <HeroHeader
          testID="today-hero"
          // `tabs.today` rather than a second key: the eyebrow and the tab name
          // this screen sits under are the same word for the same screen.
          eyebrow={`${t('tabs.today')} · ${today}`}
          title={businessName}
          avatarText={initialsOf(businessName)}
          right={<HelpButton c={c} variant="glass" />}
          illustration={({ width, height }) => (
            <Storefront width={width} height={height} signText={businessName.toUpperCase()} />
          )}
        />

        <View style={[styles.body, showStats ? styles.bodyOverlap : null]}>
          {/* The revenue-first glass card over the hero's edge. Only once
              entitlements are settled and no warning claims the screen, so a
              suspended or unverified partner never reads a stale total. */}
          {showStats ? (
            <Rise index={1}>
              <GlassCard testID="today-sales-card">
                {showSale ? (
                  <View style={styles.saleHead}>
                    <Text style={[typeScale.caption, { color: ds.muted }]}>{t('today.kpiSale')}</Text>
                    {boardLoading ? (
                      <Skeleton width={170} height={36} rounded={radius.sm} style={styles.moneySkeleton} />
                    ) : (
                      <CountUpKpi kpi={saleKpi}>
                        {(text) => <Money size="hero" testID="today-sale-amount">{text}</Money>}
                      </CountUpKpi>
                    )}
                    {saleDelta ? (
                      <StatusBadge
                        tone={deltaTone(saleKpi)}
                        label={t('today.vsDayBefore', { delta: saleDelta })}
                        testID="today-sale-delta"
                      />
                    ) : null}
                  </View>
                ) : null}
                {/* The 14-day sales trend: the line draws in, the area fades
                    after it (reduce-motion: complete at once). A null day is
                    drawn at 0, exactly as the bar chart it replaces did. */}
                {showSale && salesSpark.length > 0 ? (
                  <View style={styles.trend}>
                    <AreaChart
                      testID="today-sales-trend"
                      values={salesSpark.map((p) => p.v ?? 0)}
                      height={56}
                      label={t('today.salesChartLabel')}
                      latestText={formatPaise(salesSpark[salesSpark.length - 1].v ?? 0)}
                    />
                    <Text style={[typeScale.caption, { color: ds.muted }]}>
                      {t('today.salesTrend')} · {t('today.last14Days')}
                    </Text>
                  </View>
                ) : null}
                {analyticsQuery.isError ? (
                  <Text style={[typeScale.detail, { color: status.danger.fg }]} accessibilityRole="alert" testID="today-numbers-error">
                    {apiErrorMessage(analyticsQuery.error, t('today.numbersLoadFailed'))}
                  </Text>
                ) : null}
                <View style={styles.cells}>
                  {showOrders && (
                    <StatCell
                      testID="today-stat-orders"
                      label={t('today.kpiOrders')}
                      kpi={ordersKpi}
                      caption={kpiDelta(ordersKpi)}
                      loading={boardLoading}
                    />
                  )}
                  {(showBookings || showOrders) && (
                    <StatCell
                      testID="today-stat-pending"
                      label={t('today.statToAction')}
                      kpi={pendingKpi}
                      loading={boardLoading}
                    />
                  )}
                  {showCatalog && (
                    <StatCell
                      testID="today-stat-low"
                      warm
                      label={t('today.kpiLowStock')}
                      kpi={lowKpi}
                      loading={boardLoading}
                    />
                  )}
                </View>
                {canNewBill ? (
                  <Button
                    testID="today-new-bill"
                    icon="plus"
                    label={t('billing.list.newInvoice')}
                    fullWidth
                    onPress={() => router.push('/billing/new')}
                  />
                ) : null}
              </GlassCard>
            </Rise>
          ) : null}

          {/* >>> OC6 */}
          <AnnouncementBanner />
          {/* <<< OC6 */}

          {banner ? (
            <Rise index={1}>
              <Card
                testID="today-banner"
                // The one visual difference between the two tones: an informational
                // card is edged in the brand colour, a warning keeps the plain
                // surface with an amber icon. Nothing here is red — a partner
                // waiting on a review has not done anything wrong, and colouring
                // it as a fault would say they had.
                style={banner.tone === 'info' ? { borderLeftWidth: 3, borderLeftColor: ds.primary } : null}
              >
                <View style={styles.bannerHead}>
                  <IconTile
                    tint={banner.tone === 'info' ? 'green' : 'amber'}
                    icon={banner.tone === 'info' ? 'file-search-outline' : 'alert-outline'}
                  />
                  <View style={styles.bannerText}>
                    <SectionTitle>{banner.title}</SectionTitle>
                    <Text style={[styles.bannerBody, { color: ds.ink }]}>{banner.body}</Text>
                    {/* The non-gating blockers, quieter and below the sentence
                        that matters — see `splitBlockers`. Muted (4.5:1+), not
                        the faint/disabled grey it used to be (M04-H-04). */}
                    {banner.note ? (
                      <Text style={[typeScale.detail, { color: ds.muted }]}>{banner.note}</Text>
                    ) : null}
                  </View>
                </View>
                {/* `onAction` where the banner names one, `refresh` otherwise — the
                    only action this card had was "try again", which is the right
                    answer for a failed load and useless for "you have no map pin". */}
                {banner.action ? (
                  <Button
                    testID="today-banner-action"
                    label={banner.action}
                    icon={banner.onAction ? 'arrow-right' : 'refresh'}
                    onPress={banner.onAction ?? refresh}
                  />
                ) : null}
              </Card>
            </Rise>
          ) : null}

          {/* Entitlements still on their way: a skeleton, not an empty screen. */}
          {!ready && !failed ? <SkeletonList rows={3} testID="today-loading" /> : null}

          {/* "Society shop of <society> — approved" / "removed by your society".
              Beside, never instead of, the dashboard — see the component and
              `showSocietyBanner` above. */}
          {showSocietyBanner ? (
            <HomeSocietyBanner c={c} reach={myReach.data} canManage={ready && can('SETTINGS', 'READ')} />
          ) : null}

          {/* P4: "Rent ₹35,400 due 5 Oct" — only with a lease and something due. */}
          <RentTodayCard c={c} list={myRent.data} />

          {/* Commerce C1: the one-tap Pause orders — only for someone who may pause; nothing otherwise. */}
          <PauseOrdersCard c={c} />

          {/* >>> SHORTCUTS: the most-used jobs, one tap each — near the top, above
              the long lists. Each tile gated like its destination; nothing drawn
              when none qualify. Hidden behind a warning banner like the rest. */}
          {ready && !blocked && <TodayShortcutGrid c={c} />}
          {/* <<< SHORTCUTS */}

          {/* A failed pending-orders read used to draw nothing at all (M04-H-01). */}
          {ready && !blocked && showOrders && ordersQuery.isError && !ordersQuery.data ? (
            <InlineError
              testID="today-orders-error"
              title={t('modules.ORDERS.label')}
              message={apiErrorMessage(ordersQuery.error)}
              onRetry={() => void ordersQuery.refetch()}
            />
          ) : null}

          {/* "Happening now": the orders waiting on a decision, as DS list rows. */}
          {ready && !blocked && showOrders && pendingOrders.length > 0 && (
            <Rise index={4} style={styles.section} testID="today-pending-orders">
              <SectionTitle>
                {t('today.pendingOrdersTitle', { count: ordersQuery.data?.total ?? pendingOrders.length })}
              </SectionTitle>
              <Detail>{t('today.pendingOrdersBody')}</Detail>
              {pendingOrders.slice(0, 3).map((o) => (
                <ListRow
                  key={o.id}
                  icon="shopping-outline"
                  tint="sky"
                  title={o.code}
                  // Was `item{n === 1 ? '' : 's'}` — an English `-s` suffix, which
                  // has no Hindi equivalent and which CLDR does not agree with
                  // even in English at zero. `orders.card.itemCount` is the
                  // plural the order cards already use, so the two counts of the
                  // same thing read the same way.
                  detail={t('today.orderMeta', {
                    name: o.customer.name,
                    items: t('orders.card.itemCount', { count: o.itemCount }),
                  })}
                  amount={formatPaise(o.amounts.totalPaise)}
                />
              ))}
              <Button
                variant="soft"
                size="sm"
                icon="arrow-right"
                label={t('today.goToOrders')}
                onPress={() => router.push('/(app)/(tabs)/orders')}
              />
            </Rise>
          )}

          {ready && !blocked && showCatalog && lowStockQuery.isError && !lowStockQuery.data ? (
            <InlineError
              testID="today-low-stock-error"
              title={t('today.kpiLowStock')}
              message={apiErrorMessage(lowStockQuery.error)}
              onRetry={() => void lowStockQuery.refetch()}
            />
          ) : null}

          {/* "Running low" — the template's warm card. */}
          {ready && !blocked && showCatalog && lowStock.length > 0 && (
            <Rise index={4}>
              <Card tone="warm" testID="today-low-stock">
                <View style={styles.warmHead}>
                  <MaterialCommunityIcons name="alert-octagon-outline" size={20} color={status.warn.fg} />
                  <SectionTitle color={status.warn.fg} style={styles.flex}>
                    {t('today.lowStockTitle', { count: lowStockQuery.data?.total ?? lowStock.length })}
                  </SectionTitle>
                </View>
                {lowStock.slice(0, 5).map((p) => (
                  <View key={p._id} style={styles.stockRow}>
                    <Text style={[styles.stockName, { color: ds.ink }]} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {/* Amber "n left" (4.9:1 on the warm card; muted there is 4.45:1). */}
                    <Text style={[typeScale.caption, { color: p.stockQty <= 0 ? status.danger.fg : status.warn.fg }]}>
                      {p.stockQty <= 0 ? t('today.outOfStock') : t('today.stockLeft', { count: p.stockQty })}
                    </Text>
                  </View>
                ))}
                <View style={styles.actions}>
                  {/* `/catalog`, not More. This dropped the partner on the module
                      menu and left them to find the catalogue themselves, from a card
                      that had just named five products running low. `/catalog` is a
                      real route — `more.tsx#destinationFor` navigates to the same
                      literal, and its header documents why. */}
                  <Button
                    variant="outline"
                    size="sm"
                    icon="package-variant"
                    label={t('today.manageCatalogue')}
                    onPress={() => router.push('/catalog')}
                  />
                  {/* P1 (screen S12): straight to the reorder list, which drafts the POs. */}
                  {can('STOCK_VIEW', 'READ') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon="cart-arrow-down"
                      label={t('stock.home.reorder')}
                      onPress={() => router.push('/stock/reorder')}
                    />
                  )}
                </View>
              </Card>
            </Rise>
          )}

          {ready && !blocked && <P2TodayShortcuts c={c} />}

          {ready && !blocked && showBookings && (
            <Rise index={5} style={styles.section} testID="today-bookings">
              <SectionTitle>{t('today.bookingsSection')}</SectionTitle>
              {bookingsQuery.isLoading ? <SkeletonList rows={2} testID="today-bookings-loading" /> : null}
              {/* M04-H-01: a failed read is an error with "Try again", not
                  "Nothing on the diary today" — which it used to say. */}
              {bookingsQuery.isError && !bookingsQuery.data ? (
                <Card padding={0}>
                  <ErrorState
                    testID="today-bookings-error"
                    message={apiErrorMessage(bookingsQuery.error)}
                    onRetry={() => void bookingsQuery.refetch()}
                    style={styles.compactState}
                  />
                </Card>
              ) : null}
              {todaysBookings.length === 0 && !bookingsQuery.isLoading && !(bookingsQuery.isError && !bookingsQuery.data) ? (
                <Card padding={0}>
                  <EmptyState
                    testID="today-bookings-empty"
                    icon="calendar-blank-outline"
                    title={t('today.noBookings')}
                    style={styles.compactState}
                  />
                </Card>
              ) : null}
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
            </Rise>
          )}

          {ready && !blocked && !showBookings && !showOrders && !showCatalog && (
            <Rise index={3}>
              <Card padding={0} testID="today-nothing-on">
                <EmptyState
                  icon="toggle-switch-off-outline"
                  title={t('today.nothingOnTitle')}
                  body={t('today.nothingOnBody')}
                  style={styles.compactState}
                />
              </Card>
            </Rise>
          )}
        </View>
      </ScrollView>

      <BookingActionModal
        visible={Boolean(formTarget)}
        verb={formTarget?.verb ?? null}
        booking={formTarget?.booking ?? null}
        isDark={isDark}
        submitting={isPending}
        conflicts={conflicts}
        codeRefusal={codeRefusal}
        onDismiss={() => { setConflicts([]); setCodeRefusal(null); setFormTarget(null); }}
        onSubmit={submitForm}
      />
    </View>
  );
}

/** "Sharma General Store" → "SG"; the hero avatar. Code points, so Devanagari is not split mid-letter. */
function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? '')
    .join('')
    .toUpperCase();
}

/** A DS tinted icon tile (42 dp, 145° gradient, icon in the tint's deeper colour). */
function IconTile({ tint, icon }: { tint: TintName; icon: string }) {
  const { tints, ds, isDark } = useAppTheme();
  const tn = tints[tint];
  // Light green tint icon is 2.9:1 on its gradient (< 3:1); the deeper brand token reads ≈4:1.
  const iconColor = tint === 'green' && !isDark ? ds.primaryDeep : tn.icon;
  return (
    <View style={styles.iconTile}>
      <LinearGradient colors={[tn.from, tn.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.iconFill]} />
      <MaterialCommunityIcons name={icon as never} size={22} color={iconColor} />
    </View>
  );
}

/**
 * A KPI figure that counts up to its value (DS §5 "numbers may count up";
 * reduce-motion → the final value at once). Its own small component on
 * purpose: the count-up ticks a state ~70 times, and ticking it in
 * `TodayScreen` would re-render the whole screen (booking cards and all) every
 * frame. A `null` KPI still reads "—" — never a stand-in 0 counting to nothing.
 */
function CountUpKpi({ kpi, children }: { kpi: Kpi; children: (text: string) => React.ReactElement }) {
  const shown = useCountUp(kpi.value ?? 0);
  return children(formatKpiValue(kpi.value === null ? null : Math.round(shown), kpi.unit));
}

/** One figure in the sales card (template "Bills / Online / Khata due" cells). Label wraps; value never truncates. */
function StatCell({
  label, kpi, caption, warm = false, loading = false, testID,
}: { label: string; kpi: Kpi; caption?: string; warm?: boolean; loading?: boolean; testID?: string }) {
  const { ds, status } = useAppTheme();
  const bg = warm ? status.warn.bg : ds.surfaceAlt;
  // Brand text, not `muted`: muted on `surfaceAlt` is 4.46:1 (< 4.5); brand fg is 4.9:1.
  const fg = warm ? status.warn.fg : status.brand.fg;
  return (
    <View style={[styles.cell, { backgroundColor: bg }]} testID={testID}>
      <Text style={[typeScale.caption, { color: fg }]}>{label}</Text>
      {loading ? (
        <Skeleton width="60%" height={15} style={styles.cellSkeleton} />
      ) : (
        <CountUpKpi kpi={kpi}>
          {(text) => (
            <Text style={[typeScale.number, { color: warm ? status.warn.fg : ds.ink }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {text}
            </Text>
          )}
        </CountUpKpi>
      )}
      {caption ? <Text style={[typeScale.micro, { color: fg }]}>{caption}</Text> : null}
    </View>
  );
}

/** A strip that failed to load: what went wrong (the server's translated text) and "Try again". */
function InlineError({ title, message, onRetry, testID }: { title: string; message: string; onRetry: () => void; testID?: string }) {
  const { t } = useTranslation();
  const { ds, status } = useAppTheme();
  return (
    <Card testID={testID} padding={14}>
      <View style={styles.bannerHead} accessibilityRole="alert">
        <MaterialCommunityIcons name="alert-circle-outline" size={20} color={status.danger.fg} />
        <View style={styles.bannerText}>
          <Text style={[typeScale.row, { color: ds.ink }]}>{title}</Text>
          <Text style={[typeScale.detail, { color: ds.muted }]}>{message}</Text>
        </View>
      </View>
      <Button variant="ghost" size="sm" icon="refresh" label={t('common.tryAgain')} onPress={onRetry} />
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingBottom: 28 },
  // DS §3: screen padding 18, section gap 20.
  body: { paddingHorizontal: 18, paddingTop: 20, gap: 20 },
  // The glass sales card rides over the hero's lower edge (template −64).
  bodyOverlap: { marginTop: -64, paddingTop: 0 },
  flex: { flex: 1 },
  saleHead: { gap: 4 },
  moneySkeleton: { marginVertical: 2 },
  trend: { gap: 6 },
  cells: { flexDirection: 'row', gap: 6 },
  cell: { flex: 1, minWidth: 0, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 7, gap: 2 },
  cellSkeleton: { marginTop: 2 },
  bannerHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  bannerText: { flex: 1, minWidth: 0, gap: 4 },
  bannerBody: { fontSize: 14, lineHeight: 20 },
  iconTile: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  iconFill: { borderRadius: radius.md },
  section: { gap: 10 },
  warmHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  stockName: { ...typeScale.detail, fontWeight: '600', flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  compactState: { paddingVertical: 20 },
});
