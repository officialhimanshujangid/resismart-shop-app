import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View, StyleSheet, FlatList, useColorScheme, Pressable, RefreshControl } from 'react-native';
import { Text, Searchbar, Snackbar, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
// `as Href` below: the destination carries a query string, so it is not one of
// the literal routes the generated union describes — the same escape hatch
// `(tabs)/bookings.tsx#openBillFor` uses for the identical link.
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { Hero } from '../../../src/components/Hero';
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
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const canManage = can('ORDERS_MANAGE', 'FULL');

  const [chip, setChip] = useState<keyof typeof STATUS_FILTER_MAP>('ACTIVE');
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
          setSnackbar(apiErrorMessage(e));
        },
        onSettled: () => setPendingId(null),
      },
    );
  }, [transition, patchRow, openBillFor, t]);

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
    runTransition(order, verb);
  }, [runTransition]);

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
      }),
    );
  }, [patchRow, t]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      {/* The title is `modules.ORDERS.label`, the same catalogue entry the tab
          bar and the More menu read — a module is called one thing in this app. */}
      <Hero isDark={isDark} action={<HelpButton c={c} variant="hero" />} rounded={false} eyebrow={t('orders.list.eyebrow')} title={t('modules.ORDERS.label')} />

      <Searchbar
        placeholder={t('orders.list.searchPlaceholder')}
        value={searchInput}
        onChangeText={setSearchInput}
        style={[styles.search, { backgroundColor: c.surfaceVariant }]}
        inputStyle={styles.searchInput}
        elevation={0}
      />

      <FlatList
        horizontal
        data={FILTER_CHIPS}
        keyExtractor={(f) => f.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        renderItem={({ item }) => {
          const active = item.key === chip;
          return (
            <Pressable
              onPress={() => setChip(item.key)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? c.primary : c.surfaceVariant,
                  borderColor: active ? c.primary : c.divider,
                },
              ]}
            >
              <Text style={[styles.chipLabel, { color: active ? '#fff' : c.textSecondary }]}>{t(item.labelKey)}</Text>
            </Pressable>
          );
        }}
      />

      {!canManage && (
        <View style={[styles.readOnlyBanner, { backgroundColor: c.surfaceVariant }]}>
          <Text style={[styles.readOnlyText, { color: c.textSecondary }]}>
            {t('orders.list.readOnly')}
          </Text>
        </View>
      )}

      <FlatList
        data={rows}
        keyExtractor={(o) => o.id}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            pending={pendingId === item.id}
            onPress={() => setSelectedId(item.id)}
            onAction={canManage ? (verb) => handleAction(item, verb) : () => undefined}
          />
        )}
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
          loadError ? (
            <ErrorBlock c={c} message={loadError} onRetry={() => void query.refetch()} />
          ) : query.isLoading ? (
            <ActivityIndicator color={c.primary} />
          ) : (
            <View style={styles.emptyBox}>
              <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>{t('orders.list.emptyTitle')}</Text>
              <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
                {chip === 'ACTIVE'
                  ? t('orders.list.emptyActive')
                  : t('orders.list.emptyFiltered')}
              </Text>
            </View>
          )
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
      />

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
  search: { marginHorizontal: 14, marginTop: 12, borderRadius: radii.field },
  searchInput: { fontSize: 14 },
  chipRow: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, marginRight: 8 },
  chipLabel: { fontSize: 12.5, fontWeight: '600' },
  readOnlyBanner: { marginHorizontal: 14, marginBottom: 6, borderRadius: radii.sm, paddingVertical: 6, paddingHorizontal: 10 },
  readOnlyText: { fontSize: 11.5, fontWeight: '600' },
  listPad: { paddingBottom: 24 },
  emptyGrow: { flexGrow: 1, justifyContent: 'center' },
  emptyBox: { alignItems: 'center', gap: 4, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15, fontWeight: '600' },
  emptyBody: { fontSize: 13, textAlign: 'center' },
  footerSpinner: { marginVertical: 16 },
});
