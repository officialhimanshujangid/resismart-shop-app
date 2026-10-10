import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View, StyleSheet, useColorScheme, RefreshControl } from 'react-native';
import { Text, Snackbar, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
// `as Href` below: the destination carries a query string, so it is not one of
// the literal routes the generated union describes — the same escape hatch
// `(tabs)/bookings.tsx#openBillFor` uses for the identical link.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { qk } from '../../../src/lib/queryKeys';

import { themeColors, radii } from '../../../src/constants/colors';
import { HelpButton } from '../../../src/features/help/HelpButton';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage, apiErrorCode, apiErrorParams } from '../../../src/api/axios';
import type { DocumentRx } from '../../../src/features/billing/types';
import { OrderRxSheet } from '../../../src/features/p2/billing/OrderRxSheet';
import {
  useOrders, useOrder, useOrderTransition,
  OrderCard, OrderDetailModal, ReasonPromptModal, RecordReturnModal,
  verbNeedsReason,
} from '../../../src/features/orders';
import type { KnownOrderVerb, PartnerOrder, ReasonPromptTarget, OrderReturnResult } from '../../../src/features/orders';
import { formatPaise } from '../../../src/lib/money';
import { ErrorBlock } from '../../../src/features/more/ui';
import Animated from 'react-native-reanimated';
import {
  EmptyState, LargeTitle, LargeTitleBar, SearchField, SegmentedTabs, SkeletonList, useLargeTitleScroll,
} from '../../../src/components/ui'; // M23 (DS v1) + UX-P (large title, stage tabs, illustrated empty)
import { Rise } from '../../../src/theme/motion'; // M23
// Commerce C2 (fulfilment) — each piece draws nothing unless its feature is on.
import { PillButton } from '../../../src/features/p1/ui';
import { useCommerceAccess } from '../../../src/features/commerce/access';
import { useCommerceSettings } from '../../../src/features/commerce/hooks';
import { assignable, needsProof, type ProofMode } from '../../../src/features/commerce/fulfilmentLogic';
import { fulfilmentApi } from '../../../src/features/commerce/fulfilmentApi';
import { clockText, extrasOf, isPausedNow, storefrontOf } from '../../../src/features/commerce/storefrontApi';
import {
  AssignRiderSheet, DeliverProofSheet, OrderCommerceInfo, PartialAcceptSheet, PickingListSheet,
} from '../../../src/features/commerce/components/FulfilmentSheets';

/**
 * This tab is only reachable when the gate says so: ORDERS_VIEW READ / module
 * ORDERS — see `(tabs)/_layout.tsx`. What THIS screen still has to check is
 * gate 3 at FULL before drawing an action button: `ORDERS_VIEW` opened the
 * tab, and READ is not permission to change anything. `canManage` below is
 * that check, and every action surface (swipe buttons, the detail sheet's
 * footer) is built conditionally on it.
 */

/**
 * Every one of `ORDER_STATUSES` reaches a chip, and that is the whole point.
 *
 * INVOICED and PAID appeared in NO filter here: `ACTIVE` stopped at
 * OUT_FOR_DELIVERY and `CLOSED` listed only the three unhappy endings, so an
 * order vanished from this screen the moment it was billed — the shop's own
 * record of a sale, gone at exactly the step that makes it a sale. Both now sit
 * under `CLOSED`, which is where the web board's "Finished" toggle puts them
 * (`orders/shared.ts#CLOSED_STATUSES`).
 *
 * DELIVERED joins `ACTIVE` for the same reason it is a column on that board and
 * not an outcome beside it: handed over but not yet billed is still a job with
 * something left to do. It keeps its own chip for anybody who wants just that
 * step.
 */
const STATUS_FILTER_MAP: Record<string, string | undefined> = {
  ACTIVE: 'PLACED,ACCEPTED,PACKED,OUT_FOR_DELIVERY,DELIVERED',
  PLACED: 'PLACED',
  ACCEPTED: 'ACCEPTED',
  PACKED: 'PACKED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CLOSED: 'INVOICED,PAID,REJECTED,CANCELLED,RETURNED',
};

/**
 * WHAT EACH CHIP SAYS — a catalogue key per chip, not the words.
 *
 * `key` is what `STATUS_FILTER_MAP` above is keyed by, and the values THERE are
 * the comma-joined wire statuses sent as `status` on
 * `GET /partners/me/orders`. Those never move; only `labelKey` is translated —
 * the split `features/billing/types.ts` is the worked example of.
 *
 * `CLOSED` reads "Finished", not "Closed": it now holds billed and paid orders
 * as well as the three that went wrong, and "Closed" reads as only the latter.
 * The Hindi carries the same distinction.
 */
const FILTER_CHIPS: { key: keyof typeof STATUS_FILTER_MAP; labelKey: string }[] = [
  { key: 'ACTIVE', labelKey: 'orders.list.filterACTIVE' },
  { key: 'PLACED', labelKey: 'orders.list.filterPLACED' },
  { key: 'ACCEPTED', labelKey: 'orders.list.filterACCEPTED' },
  { key: 'PACKED', labelKey: 'orders.list.filterPACKED' },
  { key: 'OUT_FOR_DELIVERY', labelKey: 'orders.list.filterOUT_FOR_DELIVERY' },
  { key: 'DELIVERED', labelKey: 'orders.list.filterDELIVERED' },
  { key: 'CLOSED', labelKey: 'orders.list.filterCLOSED' },
];

const PAGE_LIMIT = 20;

export default function OrdersScreen() {
  const { t, i18n: { language: i18nLang } } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const canManage = can('ORDERS_MANAGE', 'FULL');

  const [chip, setChip] = useState<keyof typeof STATUS_FILTER_MAP>('ACTIVE');
  // UX-P: the big "Orders" title scrolls away under a slim bar.
  const { scrollY, onScroll } = useLargeTitleScroll();
  const [searchInput, setSearchInput] = useState('');
  const [code, setCode] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PartnerOrder[]>([]);

  // Debounce the search box — an order-code search that fired on every
  // keystroke would refetch the whole list mid-word.
  // `timer`, not `t`: this file holds a translator now, and a local `t` would
  // shadow it inside the effect. Seven of these were found across the earlier
  // i18n passes and one of them had already broken `billing/[id].tsx`.
  useEffect(() => {
    const timer = setTimeout(() => setCode(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Any filter change starts the accumulated list over at page 1.
  useEffect(() => {
    setPage(1);
    setRows([]);
  }, [chip, code]);

  const filters = useMemo(
    () => ({ status: STATUS_FILTER_MAP[chip], code: code || undefined, page, limit: PAGE_LIMIT }),
    [chip, code, page],
  );
  const query = useOrders(filters);

  useEffect(() => {
    if (!query.data) return;
    setRows((prev) => {
      if (query.data.page === 1) return query.data.data;
      const seen = new Set(prev.map((o) => o.id));
      return [...prev, ...query.data.data.filter((o) => !seen.has(o.id))];
    });
  }, [query.data]);

  const hasMore = query.data ? rows.length < query.data.total : false;
  const loadMore = useCallback(() => {
    if (query.isFetching || !hasMore) return;
    setPage((p) => p + 1);
  }, [query.isFetching, hasMore]);

  /**
   * Why the list is empty, when it is empty for a reason other than "no
   * orders".
   *
   * `isLoading` goes false on failure as readily as on success, so without this
   * a 500, a 403 or a dropped connection is reported as "No orders here" —
   * a shop being told nothing needs its attention by a screen that never
   * managed to ask. `isPaused` is the offline half of the same question:
   * `onlineManager` (see `lib/queryClient.ts`) holds the request instead of
   * firing it into a dead radio, which would otherwise be an unexplained
   * spinner.
   */
  const loadError = query.isError
    ? apiErrorMessage(query.error, t('orders.list.loadFailed'))
    : query.isPending && query.isPaused
      ? t('orders.list.noConnection')
      : null;

  // ---- selection / detail sheet ----
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useOrder(selectedId ?? undefined);

  /**
   * A notification tap lands here with `?id=<orderId>` (`notificationDestination`)
   * — open that order's sheet, then drop the param so closing the sheet does
   * not reopen it.
   */
  const { id: linkedId } = useLocalSearchParams<{ id?: string }>();
  useEffect(() => {
    if (!linkedId) return;
    setSelectedId(linkedId);
    router.setParams({ id: undefined });
  }, [linkedId]);

  /**
   * The same question for the ONE order behind the detail sheet, and the sheet
   * has to be told about it rather than working it out from `loading` and
   * `order`: with both false-y it used to decide it should not be open at all,
   * so tapping a row whose fetch had failed did nothing whatsoever — no sheet,
   * no error, nothing to retry. Scoped to `selectedId` because `useOrder` is
   * disabled without one, and a disabled query reads as permanently pending.
   */
  const detailError =
    !selectedId
      ? null
      : detail.isError
        ? apiErrorMessage(detail.error, t('orders.detail.loadFailed'))
        : detail.isPending && detail.isPaused
          ? t('orders.list.noConnection')
          : null;

  // ---- transitions ----
  const transition = useOrderTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reasonTarget, setReasonTarget] = useState<(ReasonPromptTarget & { orderId: string }) | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  /** P2 PHARMACY: an accept refused for a missing prescription. */
  const [rxTarget, setRxTarget] = useState<{
    order: PartnerOrder; drug: { name: string; schedule: 'H' | 'H1' }; refusal: string;
  } | null>(null);

  // ---- M5: record a return ----
  const [returnOrder, setReturnOrder] = useState<PartnerOrder | null>(null);

  // ---- Commerce C2: accept with changes, give to a rider, picking list, proof at hand-over ----
  const commerce = useCommerceAccess();
  // Read for every shop that may read it: a new shop is "closed means closed" by default (Owner rule 2)
  // with no feature switched on, and the board must still say so.
  const fulfilmentSettings = useCommerceSettings(commerce.settings.canView);
  const proofMode = fulfilmentSettings.data?.settings.fulfilment
    ? (fulfilmentSettings.data.settings.fulfilment as { proofMode?: ProofMode }).proofMode
    : undefined;
  /** One fulfilment sheet at a time; the detail sheet closes while it is open (a native modal would cover it). */
  const [c2Sheet, setC2Sheet] = useState<{ kind: 'PARTIAL' | 'ASSIGN' | 'PROOF'; order: PartnerOrder } | null>(null);
  const [pickingOpen, setPickingOpen] = useState(false);
  const openC2 = useCallback((kind: 'PARTIAL' | 'ASSIGN' | 'PROOF', order: PartnerOrder) => {
    setSelectedId(null);
    setC2Sheet({ kind, order });
  }, []);

  /**
   * B6 fix: `rows` is this screen's own accumulated-pages array (see the
   * effect above) — `useOrderTransition`'s own `onSuccess` only touches the
   * react-query CACHE (the detail entry + an invalidation of the `orders`
   * branch), which does nothing for a page already sitting in local state
   * until the next full refetch. Without this patch, a mutated order on an
   * earlier page — e.g. `accept` on page 1 while page 2 is also loaded —
   * kept its stale `allowedVerbs` in `rows` until a pull-to-refresh, so the
   * button just pressed appeared to still be there.
   */
  const patchRow = useCallback((updated: PartnerOrder) => {
    setRows((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
  }, []);

  /**
   * The Billing screen, opened to raise the bill for THIS order.
   *
   * `POST /partners/me/orders/:id/invoice` does not raise a bill — the same
   * design as the booking close-out (`(tabs)/bookings.tsx#openBillFor`): it
   * looks for a live document whose `sourceType` is ORDER and whose `sourceId`
   * is this order, and refuses (409 `NO_BILL_RAISED`) otherwise. These params
   * are the link, and the prefill: one line at `amounts.totalPaise` — the
   * order's agreed total, goods + tax + delivery together, not re-priced from
   * the live catalogue. The order carries no `partyId` (contact stays masked
   * until acceptance and is never resolved to a billing party here), so the
   * customer crosses over as a name and the partner picks or confirms the
   * party on the form before issuing.
   */
  const openBillFor = useCallback((order: PartnerOrder) => {
    const q = new URLSearchParams({
      sourceType: 'ORDER',
      sourceId: order.id,
      // Translated, unlike the two params above it: `sourceType`/`sourceId` are
      // the wire link the server reads back, while `itemName` is prefill the
      // partner sees and edits on the bill — and the language they chose is the
      // language their bills go out in (`settings.language.hint` says so).
      // `order.code` is the server's own identifier and is interpolated as-is.
      itemName: t('orders.list.billItemName', { code: order.code }),
      ratePaise: String(order.amounts.totalPaise),
    });
    if (order.customer.name) q.set('partyName', order.customer.name);
    if (order.customer.phone) q.set('partyPhone', order.customer.phone);
    router.push(`/(app)/billing/new?${q.toString()}` as Href);
  }, [t]);

  const runTransition = useCallback((order: PartnerOrder, verb: KnownOrderVerb, text?: string) => {
    setPendingId(order.id);
    transition.mutate(
      { id: order.id, verb, text },
      {
        onSuccess: patchRow,
        onError: (e: unknown) => {
          /**
           * `invoice`'s refusal has an obvious next step, and leaving the
           * partner to find the Billing tab, pick the right customer and
           * retype the total is how a delivered order stays unbilled — the
           * exact reasoning `(tabs)/bookings.tsx#runQuick` already applies to
           * a finished job.
           */
          if (verb === 'invoice' && apiErrorCode(e) === 'NO_BILL_RAISED') {
            Alert.alert(
              t('orders.list.noBillTitle'),
              t('orders.list.noBillBody'),
              [
                { text: t('common.notNow'), style: 'cancel' },
                { text: t('orders.list.raiseBill'), onPress: () => openBillFor(order) },
              ],
            );
            return;
          }
          /**
           * P2 PHARMACY: a Schedule H/H1 medicine on the order — take the
           * prescription and accept again, without leaving the order.
           */
          if (verb === 'accept' && apiErrorCode(e) === 'RX_DETAILS_REQUIRED') {
            const p = apiErrorParams(e) ?? {};
            const schedule = p.schedule === 'H1' ? 'H1' : 'H';
            setRxTarget({ order, drug: { name: String(p.itemName ?? ''), schedule }, refusal: apiErrorMessage(e) });
            return;
          }
          // Commerce C2 (B-5): the shop wants proof at hand-over — take it, then deliver.
          if (verb === 'deliver' && apiErrorCode(e) === 'DELIVERY_PROOF_REQUIRED') {
            openC2('PROOF', order);
            return;
          }
          setSnackbar(apiErrorMessage(e));
        },
        onSettled: () => setPendingId(null),
      },
    );
  }, [transition, patchRow, openBillFor, openC2, t]);

  // ---- P2 PHARMACY: accept with a prescription ----
  const acceptWithRx = useCallback((rx: DocumentRx) => {
    if (!rxTarget) return;
    const order = rxTarget.order;
    setPendingId(order.id);
    transition.mutate(
      { id: order.id, verb: 'accept', rx },
      {
        onSuccess: (updated) => { patchRow(updated); setRxTarget(null); },
        onError: (e: unknown) => setRxTarget((cur) => (cur ? { ...cur, refusal: apiErrorMessage(e) } : cur)),
        onSettled: () => setPendingId(null),
      },
    );
  }, [rxTarget, transition, patchRow]);

  const handleAction = useCallback((order: PartnerOrder, verb: KnownOrderVerb) => {
    if (verbNeedsReason(verb)) {
      setReasonTarget({ orderId: order.id, orderCode: order.code, verb });
      return;
    }
    // Commerce C2 (B-5): proof first when the shop asks for it on a delivery.
    // >>> GAP-C-SHOP — the assigned rider's order detail carries the rule itself (`delivery.proofMode`),
    // so a rider who may not read the shop's settings is asked up front too.
    const mode = order.delivery?.proofMode ?? (commerce.has('DELIVERY_PROOF') ? proofMode : undefined);
    if (verb === 'deliver' && needsProof(mode, order)) {
    // <<< GAP-C-SHOP
      openC2('PROOF', order);
      return;
    }
    runTransition(order, verb);
  }, [runTransition, commerce, proofMode, openC2]);

  /** A fulfilment sheet finished: patch the row, refresh, and bring the order back up. */
  const queryClient = useQueryClient();
  const c2Done = useCallback((updated: PartnerOrder) => {
    patchRow(updated);
    queryClient.setQueryData(qk.orders.detail(updated.id), updated);
    void queryClient.invalidateQueries({ queryKey: qk.orders.all() });
    setSelectedId(updated.id);
  }, [patchRow, queryClient]);

  const submitReason = useCallback((reason: string) => {
    if (!reasonTarget) return;
    const order = rows.find((o) => o.id === reasonTarget.orderId) ?? detail.data;
    if (!order) return;
    setPendingId(order.id);
    transition.mutate(
      { id: order.id, verb: reasonTarget.verb, text: reason },
      {
        onSuccess: (updated) => { patchRow(updated); setReasonTarget(null); },
        onError: (e: unknown) => setSnackbar(apiErrorMessage(e)),
        onSettled: () => setPendingId(null),
      },
    );
  }, [reasonTarget, rows, detail.data, transition, patchRow]);

  /**
   * `{ order, creditNote }` — patch every cache the same way a normal
   * transition does (`runTransition`'s `onSuccess`), then confirm the credit
   * note by name/amount so the shop owner has proof a numbered document was
   * actually raised, not just a silent screen refresh.
   */
  const handleReturnSuccess = useCallback((result: OrderReturnResult) => {
    patchRow(result.order);
    setReturnOrder(null);
    Alert.alert(
      t('orders.list.returnRecordedTitle'),
      // `number` is the server's own document number and goes in verbatim.
      t('orders.list.returnRecordedBody', {
        number: result.creditNote.number ?? '',
        amount: formatPaise(result.creditNote.totals.grandPaise),
      })
      // Commerce C4: say where the money went when it went to store credit.
      + (result.refundedToCredit ? `\n\n${t('commerce.wallet.return.refundedToCredit', { amount: formatPaise(result.refundedToCredit) })}` : ''),
    );
  }, [patchRow, t]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      {/* >>> WEB-UI — the whole screen scrolls as one list. Everything that used
          to sit FIXED above the orders (hero, search, chips, banners) is the
          list's header now, so on a short phone the orders are not squeezed
          into a strip under it. The header is an ELEMENT, not a component
          function, so the search box keeps its focus while typing. */}
      {/* UX-P (A ShopOrders): slim bar on top; its small title fades in as the big one scrolls away. */}
      <LargeTitleBar title={t('modules.ORDERS.label')} scrollY={scrollY} back={false} right={<HelpButton c={c} />} />
      <Animated.FlatList
        data={rows}
        keyExtractor={(o) => o.id}
        onScroll={onScroll}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <View style={styles.header}>
      {/* The title is `modules.ORDERS.label`, the same catalogue entry the tab
          bar and the More menu read — a module is called one thing in this app. */}
      <LargeTitle title={t('modules.ORDERS.label')} eyebrow={t('orders.list.eyebrow')} scrollY={scrollY} style={styles.largeTitle} testID="orders-title" />

      {/* UX-P (A ShopOrders): the stages as sliding tabs. The count badge is drawn on
          the SELECTED stage only — it is the list's own `total`; the other stages'
          counts would each need a request this screen does not make. */}
      <SegmentedTabs
        testID="orders-stages"
        value={chip}
        onChange={setChip}
        contentPadding={14}
        options={FILTER_CHIPS.map((f) => ({
          key: f.key,
          label: t(f.labelKey),
          count: f.key === chip && query.data && !code ? query.data.total : undefined,
        }))}
      />

      {/* M23 (DS v1) — the kit search pill. */}
      <SearchField
        placeholder={t('orders.list.searchPlaceholder')}
        accessibilityLabel={t('orders.list.searchPlaceholder')}
        value={searchInput}
        onChangeText={setSearchInput}
        style={styles.search}
      />


      {/* Commerce C1 (A-1): say when residents cannot order right now — paused, or closed by the shop's hours. */}
      {fulfilmentSettings.data ? (() => {
        const sf = storefrontOf(fulfilmentSettings.data);
        const ex = extrasOf(fulfilmentSettings.data);
        if (isPausedNow(sf)) {
          return (
            <View style={[styles.c2Banner, { backgroundColor: `${c.warning}1A`, borderColor: `${c.warning}55` }]} testID="orders-paused-banner">
              <Text style={{ color: c.warning, fontWeight: '700' }}>
                {t('commerce.storefront.pause.pausedTitle')}
                {' · '}
                {sf.pausedUntil ? t('commerce.storefront.pause.backAt', { time: clockText(sf.pausedUntil, t) }) : t('commerce.storefront.pause.untilResume')}
              </Text>
            </View>
          );
        }
        // Only when residents really cannot order while closed (A-1); a shop taking orders while closed sees nothing new.
        if (!sf.acceptOrdersWhenClosed && ex.openNow === false && ex.opensAt) {
          return (
            <View style={[styles.c2Banner, { backgroundColor: `${c.info}14`, borderColor: `${c.info}44` }]} testID="orders-closed-banner">
              <Text style={{ color: c.info, fontWeight: '600' }}>{t('commerce.storefront.closedNowOpens', { time: clockText(ex.opensAt, t) })}</Text>
            </View>
          );
        }
        return null;
      })() : null}

      {/* Commerce C2 (B-8): the batch picking list, for anybody who can read orders. */}
      {commerce.anyOn ? (
        <View style={styles.c2Bar}>
          <PillButton c={c} tone="outline" icon="clipboard-list-outline" label={t('commerce.fulfilment.pickingTitle')} onPress={() => setPickingOpen(true)} testID="orders-picking" />
        </View>
      ) : null}

      {!canManage && (
        <View style={[styles.readOnlyBanner, { backgroundColor: c.surfaceVariant }]}>
          <Text style={[styles.readOnlyText, { color: c.textSecondary }]}>
            {t('orders.list.readOnly')}
          </Text>
        </View>
      )}
          </View>
        }
        // <<< WEB-UI
        // M23 — the first screenful rises in on a stagger; later pages arrive at once.
        renderItem={({ item, index }) => {
          const card = (
            <OrderCard
              order={item}
              pending={pendingId === item.id}
              onPress={() => setSelectedId(item.id)}
              onAction={canManage ? (verb) => handleAction(item, verb) : () => undefined}
            />
          );
          return index < 8 ? <Rise index={Math.min(index, 6)}>{card}</Rise> : card;
        }}
        initialNumToRender={8}
        windowSize={9}
        removeClippedSubviews
        contentContainerStyle={rows.length === 0 ? styles.emptyGrow : styles.listPad}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && page === 1}
            onRefresh={() => {
              setPage(1);
              void query.refetch();
            }}
            tintColor={c.primary}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        ListFooterComponent={
          query.isFetching && page > 1 ? (
            <ActivityIndicator style={styles.footerSpinner} color={c.primary} />
          ) : null
        }
        ListEmptyComponent={
          // >>> WEB-UI — centred in the space left UNDER the header (the
          // header is part of the list now, so the list itself is not centred).
          <View style={styles.emptyFill}>
          {loadError ? (
            <ErrorBlock c={c} message={loadError} onRetry={() => void query.refetch()} />
          ) : query.isLoading ? (
            <SkeletonList rows={4} />
          ) : (
            <EmptyState
              illustration="orders"
              title={t('orders.list.emptyTitle')}
              body={chip === 'ACTIVE' ? t('orders.list.emptyActive') : t('orders.list.emptyFiltered')}
              testID="orders-empty"
            />
          )}
          </View>
          // <<< WEB-UI
        }
      />

      <OrderDetailModal
        order={detail.data ?? null}
        loading={Boolean(selectedId) && detail.isLoading}
        error={detailError}
        onRetry={() => void detail.refetch()}
        pending={Boolean(selectedId) && pendingId === selectedId}
        canManage={canManage}
        onClose={() => setSelectedId(null)}
        onAction={(verb) => {
          if (!detail.data) return;
          handleAction(detail.data, verb);
        }}
        onRecordReturn={() => {
          if (!detail.data) return;
          setReturnOrder(detail.data);
        }}
        extra={detail.data ? <OrderCommerceInfo order={detail.data} /> : null}
        extraActions={detail.data ? (() => {
          const o = detail.data;
          const partial = canManage && commerce.has('PARTIAL_ACCEPT') && o.status === 'PLACED';
          const rider = canManage && commerce.has('DELIVERY_STAFF') && assignable(o);
          const slip = ['ACCEPTED', 'PACKED', 'OUT_FOR_DELIVERY'].includes(o.status);
          if (!partial && !rider && !slip) return null;
          return (
            <>
              {partial ? <PillButton c={c} tone="outline" icon="playlist-edit" label={t('commerce.fulfilment.acceptWithChanges')} onPress={() => openC2('PARTIAL', o)} testID="order-accept-partial" /> : null}
              {rider ? (
                <PillButton c={c} tone="outline" icon="moped-outline" label={o.delivery?.staffName ? t('commerce.fulfilment.changeRider') : t('commerce.fulfilment.giveToRider')} onPress={() => openC2('ASSIGN', o)} testID="order-assign" />
              ) : null}
              {slip ? (
                <PillButton
                  c={c}
                  tone="outline"
                  icon="clipboard-list-outline"
                  label={t('commerce.fulfilment.packingSlip')}
                  onPress={() => {
                    void fulfilmentApi.sharePickingSlip(o.id, o.code, String(i18nLang).startsWith('hi') ? 'hi' : 'en')
                      .catch((e: unknown) => setSnackbar(apiErrorMessage(e)));
                  }}
                  testID="order-slip"
                />
              ) : null}
            </>
          );
        })() : null}
      />

      {/* Commerce C2 sheets (Paper portals — the detail sheet is closed while one is open). */}
      {c2Sheet?.kind === 'PARTIAL' ? (
        <PartialAcceptSheet order={c2Sheet.order} onDismiss={() => setC2Sheet(null)} onDone={c2Done} />
      ) : null}
      {c2Sheet?.kind === 'ASSIGN' ? (
        <AssignRiderSheet order={c2Sheet.order} onDismiss={() => setC2Sheet(null)} onDone={c2Done} />
      ) : null}
      {c2Sheet?.kind === 'PROOF' ? (
        <DeliverProofSheet order={c2Sheet.order} mode={c2Sheet.order.delivery?.proofMode ?? proofMode} onDismiss={() => setC2Sheet(null)} onDone={c2Done} />
      ) : null}
      {pickingOpen ? <PickingListSheet onDismiss={() => setPickingOpen(false)} /> : null}

      <RecordReturnModal
        order={returnOrder}
        onClose={() => setReturnOrder(null)}
        onSuccess={handleReturnSuccess}
      />

      <ReasonPromptModal
        target={reasonTarget}
        submitting={transition.isPending}
        onCancel={() => setReasonTarget(null)}
        onSubmit={submitReason}
      />

      {/* P2 PHARMACY: only ever opened by a RX_DETAILS_REQUIRED refusal. */}
      <OrderRxSheet
        visible={rxTarget !== null}
        orderCode={rxTarget?.order.code ?? ''}
        drug={rxTarget?.drug ?? null}
        refusal={rxTarget?.refusal}
        submitting={transition.isPending}
        onAccept={acceptWithRx}
        onDismiss={() => setRxTarget(null)}
      />

      <Snackbar visible={Boolean(snackbar)} onDismiss={() => setSnackbar(null)} duration={4000}>
        {snackbar}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // UX-P: one rhythm for the header — 12 between every block, 16 before the first card.
  header: { gap: 12, paddingBottom: 6 },
  largeTitle: { paddingHorizontal: 16 },
  search: { marginHorizontal: 14 },
  readOnlyBanner: { marginHorizontal: 14, borderRadius: radii.sm, paddingVertical: 6, paddingHorizontal: 10 },
  readOnlyText: { fontSize: 11.5, fontWeight: '600' },
  listPad: { paddingBottom: 24 },
  // >>> WEB-UI — the header now sits inside the list; only the empty block is centred.
  emptyGrow: { flexGrow: 1 },
  emptyFill: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  // <<< WEB-UI
  footerSpinner: { marginVertical: 16 },
  c2Bar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14 },
  c2Banner: { marginHorizontal: 14, borderRadius: radii.sm, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12 },
});
