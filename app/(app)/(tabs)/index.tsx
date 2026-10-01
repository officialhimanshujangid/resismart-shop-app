import React, { useCallback, useState } from 'react';
import { Alert, Dimensions, RefreshControl, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Button, Surface, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../../src/context/AuthContext';
import { usePartnerEntitlements } from '../../../src/hooks';
import { useTranslation } from 'react-i18next';

import { blockerFix, splitBlockers } from '../../../src/api/partner.api';
import { themeColors, radii } from '../../../src/constants/colors';
import { formatPaise } from '../../../src/lib/money';
import { apiErrorMessage, apiErrorCode, apiErrorParams } from '../../../src/api/axios';
import { isCodeRefusal } from '../../../src/lib/completionCode';
import { qk } from '../../../src/lib/queryKeys';
import { Kpi, findKpi, findSeries, formatKpiValue } from '../../../src/api/analytics.api';
import { Hero, GlassStat } from '../../../src/components/Hero';
import { HelpButton } from '../../../src/features/help/HelpButton';
import { TodayShortcuts } from '../../../src/features/p1/TodayShortcuts';
import { P2TodayShortcuts } from '../../../src/features/p2/P2Shortcuts';
import { MiniBars } from '../../../src/components/charts';
import { HomeSocietyBanner } from '../../../src/features/society/components/HomeSocietyBanner';
import { useMyReach } from '../../../src/features/society/hooks';
import { useMyRent } from '../../../src/features/rent/hooks';
import { rentAccess } from '../../../src/features/rent/logic';
import { RentTodayCard } from '../../../src/features/rent/components/RentTodayCard';

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
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
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

    if (visibility && !visibility.discoverable) {
      const reasons = blocking.map((b) => b.message);
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
          ? t('today.alsoWorthSorting', { reasons: alsoCosting.map((b) => b.message).join(' ') })
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
          body: t('today.checkingDocsBody', { message: waiting.message }),
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
  const heroSubtitle = showSale && saleDelta ? t('today.vsDayBefore', { delta: saleDelta }) : undefined;
  // Content padding (20×2) then card padding (18×2) — the width the trend chart
  // has to draw into on a solid card below the hero.
  const trendWidth = Dimensions.get('window').width - 40 - 36;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Hero
          action={<HelpButton c={c} variant="hero" />}
          isDark={isDark}
          // `tabs.today` rather than a second key: the eyebrow and the tab name
          // this screen sits under are the same word for the same screen.
          eyebrow={t('tabs.today')}
          title={businessName}
          headline={showSale ? { value: formatKpiValue(saleKpi.value, saleKpi.unit), label: t('today.saleHeadline') } : undefined}
          subtitle={heroSubtitle}
        >
          {showStats ? (
            <>
              {showOrders && (
                <GlassStat
                  icon="package-variant-closed"
                  label={t('today.kpiOrders')}
                  value={formatKpiValue(ordersKpi.value, ordersKpi.unit)}
                  caption={kpiDelta(ordersKpi)}
                />
              )}
              {(showBookings || showOrders) && (
                <GlassStat
                  icon="clock-alert-outline"
                  label={t('today.statToAction')}
                  value={formatKpiValue(pendingKpi.value, pendingKpi.unit)}
                />
              )}
              {showCatalog && (
                <GlassStat
                  icon="alert-octagon-outline"
                  label={t('today.kpiLowStock')}
                  value={formatKpiValue(lowKpi.value, lowKpi.unit)}
                />
              )}
            </>
          ) : null}
        </Hero>

        {/* "Society shop of <society> — approved" / "removed by your society".
            Beside, never instead of, the dashboard — see the component. */}
        <HomeSocietyBanner c={c} reach={myReach.data} canManage={ready && can('SETTINGS', 'READ')} />

        {/* P4: "Rent ₹35,400 due 5 Oct" — only with a lease and something due. */}
        <RentTodayCard c={c} list={myRent.data} />

        {banner && (
          <Surface
            style={[
              styles.card,
              { backgroundColor: c.surface },
              // The one visual difference between the two tones: an informational
              // card is edged in the primary colour, a warning is left as the
              // plain surface every other card on this screen uses. Nothing here
              // is red — a partner waiting on a review has not done anything
              // wrong, and colouring it as a fault would say they had.
              banner.tone === 'info' && { borderLeftWidth: 3, borderLeftColor: c.primary },
            ]}
            elevation={1}
          >
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{banner.title}</Text>
            <Text style={[styles.cardBody, { color: c.textSecondary }]}>{banner.body}</Text>
            {/* The non-gating blockers, quieter and below the fold of the
                sentence that matters — see `splitBlockers`. */}
            {banner.note && (
              <Text style={[styles.cardNote, { color: c.textDisabled }]}>{banner.note}</Text>
            )}
            {/* `onAction` where the banner names one, `refresh` otherwise — the
                only action this card had was "try again", which is the right
                answer for a failed load and useless for "you have no map pin". */}
            {banner.action && (
              <Button
                mode="contained"
                onPress={banner.onAction ?? refresh}
                style={styles.cardAction}
              >
                {banner.action}
              </Button>
            )}
          </Surface>
        )}

        {/* The 14-day sales trend, reusing the shared bar chart on a solid card
            beneath the hero — the shape a proprietor reads as "how did each day
            compare", left off the glass tiles which carry only today's figures. */}
        {showSale && salesSpark.length > 0 && (
          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{t('today.salesTrend')}</Text>
              <Text style={[styles.cardBody, { color: c.textSecondary }]}>{t('today.last14Days')}</Text>
            </View>
            <MiniBars
              c={c}
              points={salesSpark}
              width={trendWidth}
              height={72}
              valueFormatter={formatPaise}
              label={t('today.salesChartLabel')}
            />
          </Surface>
        )}

        {analyticsQuery.isError && (
          <Text style={[styles.errorHint, { color: c.error }]}>
            {apiErrorMessage(analyticsQuery.error, t('today.numbersLoadFailed'))}
          </Text>
        )}

        {ready && !blocked && showOrders && pendingOrders.length > 0 && (
          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            <View style={styles.cardHeaderRow}>
              <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
                {t('today.pendingOrdersTitle', { count: ordersQuery.data?.total ?? pendingOrders.length })}
              </Text>
            </View>
            <Text style={[styles.cardBody, { color: c.textSecondary }]}>
              {t('today.pendingOrdersBody')}
            </Text>
            {pendingOrders.slice(0, 3).map((o) => (
              <View key={o.id} style={styles.orderRow}>
                <Text style={[styles.orderCode, { color: c.textPrimary }]}>{o.code}</Text>
                <Text style={[styles.orderMeta, { color: c.textSecondary }]} numberOfLines={1}>
                  {/* Was `item{n === 1 ? '' : 's'}` — an English `-s` suffix, which
                      has no Hindi equivalent and which CLDR does not agree with
                      even in English at zero. `orders.card.itemCount` is the
                      plural the order cards already use, so the two counts of the
                      same thing read the same way. */}
                  {t('today.orderMeta', {
                    name: o.customer.name,
                    items: t('orders.card.itemCount', { count: o.itemCount }),
                  })}
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
              {t('today.goToOrders')}
            </Button>
          </Surface>
        )}

        {ready && !blocked && showCatalog && lowStock.length > 0 && (
          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>
              {t('today.lowStockTitle', { count: lowStockQuery.data?.total ?? lowStock.length })}
            </Text>
            {lowStock.slice(0, 5).map((p) => (
              <View key={p._id} style={styles.orderRow}>
                <Text style={[styles.orderCode, { color: c.textPrimary }]} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={[styles.orderMoney, { color: p.stockQty <= 0 ? c.error : c.textSecondary }]}>
                  {p.stockQty <= 0 ? t('today.outOfStock') : t('today.stockLeft', { count: p.stockQty })}
                </Text>
              </View>
            ))}
            {/* `/catalog`, not More. This dropped the partner on the module
                menu and left them to find the catalogue themselves, from a card
                that had just named five products running low. `/catalog` is a
                real route — `more.tsx#destinationFor` navigates to the same
                literal, and its header documents why. */}
            <Button
              mode="text"
              compact
              onPress={() => router.push('/catalog')}
              style={{ alignSelf: 'flex-start' }}
            >
              {t('today.manageCatalogue')}
            </Button>
            {/* P1 (screen S12): straight to the reorder list, which drafts the POs. */}
            {can('STOCK_VIEW', 'READ') && (
              <Button mode="text" compact icon="cart-arrow-down" onPress={() => router.push('/stock/reorder')} style={{ alignSelf: 'flex-start' }}>
                {t('stock.home.reorder')}
              </Button>
            )}
          </Surface>
        )}

        {ready && !blocked && <TodayShortcuts c={c} />}
        {ready && !blocked && <P2TodayShortcuts c={c} />}

        {ready && !blocked && showBookings && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>{t('today.bookingsSection')}</Text>
            {todaysBookings.length === 0 && !bookingsQuery.isLoading && (
              <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
                <Text style={[styles.cardBody, { color: c.textSecondary }]}>{t('today.noBookings')}</Text>
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

        {ready && !blocked && !showBookings && !showOrders && !showCatalog && (
          <Surface style={[styles.card, { backgroundColor: c.surface }]} elevation={1}>
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{t('today.nothingOnTitle')}</Text>
            <Text style={[styles.cardBody, { color: c.textSecondary }]}>
              {t('today.nothingOnBody')}
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
        conflicts={conflicts}
        codeRefusal={codeRefusal}
        onDismiss={() => { setConflicts([]); setCodeRefusal(null); setFormTarget(null); }}
        onSubmit={submitForm}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, gap: 14, paddingBottom: 40 },
  card: { borderRadius: radii.card, padding: 18, gap: 6 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardBody: { fontSize: 14, lineHeight: 20 },
  cardNote: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  cardAction: { marginTop: 6, alignSelf: 'flex-start' },
  errorHint: { fontSize: 12, marginTop: -6 },
  orderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  orderCode: { fontSize: 13, fontWeight: '600', flex: 1 },
  orderMeta: { fontSize: 12, flex: 1.4 },
  orderMoney: { fontSize: 13, fontWeight: '600' },
  section: { gap: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
});
