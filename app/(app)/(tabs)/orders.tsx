import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, useColorScheme, Pressable, RefreshControl } from 'react-native';
import { Text, Searchbar, Snackbar, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import {
  useOrders, useOrder, useOrderTransition,
  OrderCard, OrderDetailModal, ReasonPromptModal,
  filterKnownVerbs, verbNeedsReason,
} from '../../../src/features/orders';
import type { KnownOrderVerb, PartnerOrder, ReasonPromptTarget } from '../../../src/features/orders';

/**
 * This tab is only reachable when the gate says so: ORDERS_VIEW READ / module
 * ORDERS — see `(tabs)/_layout.tsx`. What THIS screen still has to check is
 * gate 3 at FULL before drawing an action button: `ORDERS_VIEW` opened the
 * tab, and READ is not permission to change anything. `canManage` below is
 * that check, and every action surface (swipe buttons, the detail sheet's
 * footer) is built conditionally on it.
 */

const STATUS_FILTER_MAP: Record<string, string | undefined> = {
  ACTIVE: 'PLACED,ACCEPTED,PACKED,OUT_FOR_DELIVERY',
  PLACED: 'PLACED',
  ACCEPTED: 'ACCEPTED',
  PACKED: 'PACKED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CLOSED: 'REJECTED,CANCELLED,RETURNED',
};

const FILTER_CHIPS: { key: keyof typeof STATUS_FILTER_MAP; label: string }[] = [
  { key: 'ACTIVE', label: 'Active' },
  { key: 'PLACED', label: 'New' },
  { key: 'ACCEPTED', label: 'Accepted' },
  { key: 'PACKED', label: 'Packed' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for delivery' },
  { key: 'DELIVERED', label: 'Delivered' },
  { key: 'CLOSED', label: 'Closed' },
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

  // ---- selection / detail sheet ----
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const detail = useOrder(selectedId ?? undefined);

  // ---- transitions ----
  const transition = useOrderTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reasonTarget, setReasonTarget] = useState<(ReasonPromptTarget & { orderId: string }) | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const runTransition = useCallback((order: PartnerOrder, verb: KnownOrderVerb, text?: string) => {
    setPendingId(order.id);
    transition.mutate(
      { id: order.id, verb, text },
      {
        onError: (e: unknown) => setSnackbar(apiErrorMessage(e)),
        onSettled: () => setPendingId(null),
      },
    );
  }, [transition]);

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
        onSuccess: () => setReasonTarget(null),
        onError: (e: unknown) => setSnackbar(apiErrorMessage(e)),
        onSettled: () => setPendingId(null),
      },
    );
  }, [reasonTarget, rows, detail.data, transition]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: c.textPrimary }]}>Orders</Text>
      </View>

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
          query.isLoading ? (
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
        pending={Boolean(selectedId) && pendingId === selectedId}
        onClose={() => setSelectedId(null)}
        onAction={(verb) => {
          if (!detail.data) return;
          handleAction(detail.data, verb);
        }}
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
  headerRow: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 2 },
  title: { fontSize: 22, fontWeight: '800' },
  search: { marginHorizontal: 14, marginTop: 8, borderRadius: radii.field },
  searchInput: { fontSize: 14 },
  chipRow: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, marginRight: 8 },
  chipLabel: { fontSize: 12.5, fontWeight: '700' },
  readOnlyBanner: { marginHorizontal: 14, marginBottom: 6, borderRadius: radii.sm, paddingVertical: 6, paddingHorizontal: 10 },
  readOnlyText: { fontSize: 11.5, fontWeight: '600' },
  listPad: { paddingBottom: 24 },
  emptyGrow: { flexGrow: 1, justifyContent: 'center' },
  emptyBox: { alignItems: 'center', gap: 4, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 15, fontWeight: '700' },
  emptyBody: { fontSize: 13, textAlign: 'center' },
  footerSpinner: { marginVertical: 16 },
});
