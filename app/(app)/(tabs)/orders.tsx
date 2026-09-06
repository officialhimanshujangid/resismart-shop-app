import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, View, StyleSheet, FlatList, useColorScheme, Pressable, RefreshControl } from 'react-native';
import { Text, Searchbar, Snackbar, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
// `as Href` below: the destination carries a query string, so it is not one of
// the literal routes the generated union describes — the same escape hatch
// `(tabs)/bookings.tsx#openBillFor` uses for the identical link.
import { router, type Href } from 'expo-router';

import { themeColors, radii } from '../../../src/constants/colors';
import { Hero } from '../../../src/components/Hero';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage, apiErrorCode } from '../../../src/api/axios';
import {
  useOrders, useOrder, useOrderTransition,
  OrderCard, OrderDetailModal, ReasonPromptModal, RecordReturnModal,
  filterKnownVerbs, verbNeedsReason,
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

const FILTER_CHIPS: { key: keyof typeof STATUS_FILTER_MAP; label: string }[] = [
  { key: 'ACTIVE', label: 'Active' },
  { key: 'PLACED', label: 'New' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'PACKED', label: 'Packed' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { key: 'DELIVERED', label: 'Delivered' },
  // "Finished", not "Closed" — it now holds billed and paid orders as well as
  // the three that went wrong, and "Closed" reads as only the latter.
  { key: 'CLOSED', label: 'Finished' },
];

const PAGE_LIMIT = 20;

export default function OrdersScreen() {
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
  useEffect(() => {
    const t = setTimeout(() => setCode(searchInput.trim()), 350);
    return () => clearTimeout(t);
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
    ? apiErrorMessage(query.error, 'Could not load your orders.')
    : query.isPending && query.isPaused
      ? 'No connection. Check your network and try again.'
      : null;

  // ---- selection / detail sheet ----
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useOrder(selectedId ?? undefined);

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
        ? apiErrorMessage(detail.error, 'Could not load that order.')
        : detail.isPending && detail.isPaused
          ? 'No connection. Check your network and try again.'
          : null;

  // ---- transitions ----
  const transition = useOrderTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reasonTarget, setReasonTarget] = useState<(ReasonPromptTarget & { orderId: string }) | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

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
      itemName: `Order ${order.code}`,
      ratePaise: String(order.amounts.totalPaise),
    });
    if (order.customer.name) q.set('partyName', order.customer.name);
    if (order.customer.phone) q.set('partyPhone', order.customer.phone);
    router.push(`/(app)/billing/new?${q.toString()}` as Href);
  }, []);

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
              'No bill for this order yet',
              'Raise it now? The customer and the amount are filled in for you.',
              [
                { text: 'Not now', style: 'cancel' },
                { text: 'Raise the bill', onPress: () => openBillFor(order) },
              ],
            );
            return;
          }
          setSnackbar(apiErrorMessage(e));
        },
        onSettled: () => setPendingId(null),
      },
    );
  }, [transition, patchRow, openBillFor]);

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
      'Return recorded',
      `Credit note ${result.creditNote.number ?? ''} for ${formatPaise(result.creditNote.totals.grandPaise)} has been raised.`,
    );
  }, [patchRow]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <Hero isDark={isDark} rounded={false} eyebrow="Manage" title="Orders" />

      <Searchbar
        placeholder="Search by order code"
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
              <Text style={[styles.chipLabel, { color: active ? '#fff' : c.textSecondary }]}>{item.label}</Text>
            </Pressable>
          );
        }}
      />

      {!canManage && (
        <View style={[styles.readOnlyBanner, { backgroundColor: c.surfaceVariant }]}>
          <Text style={[styles.readOnlyText, { color: c.textSecondary }]}>
            View only — your role does not include managing orders.
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
              <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>No orders here</Text>
              <Text style={[styles.emptyBody, { color: c.textSecondary }]}>
                {chip === 'ACTIVE'
                  ? 'Nothing needs your attention right now.'
                  : 'Nothing matches this filter yet.'}
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
