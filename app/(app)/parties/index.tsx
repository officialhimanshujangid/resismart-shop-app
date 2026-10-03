import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { FAB, Searchbar, Switch, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { usePartnerEntitlements, usePlanUsage } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { partiesApi, PartnerParty, PartySide } from '../../../src/api/parties.api';
import { formatPaise } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { ChipRow, EmptyBlock, ErrorBlock, Loading } from '../../../src/features/more/ui';
import { Hero, GlassStat } from '../../../src/components/Hero';

/**
 * The Parties list — customers, suppliers, and the ones who are both.
 *
 * Tabs use `side`, never `kind`: a party who is `BOTH` must appear under
 * Customers AND Suppliers, and `kindsForSide()` on the server is exactly the
 * `$in` filter that keeps that true. Filtering this list by `kind === side`
 * here would silently drop every dual party from whichever tab renders
 * second, the precise bug the model's header documents.
 */

/**
 * `key` is the WIRE value — it is posted as `side` and turned into the `$in`
 * filter above — so it stays an English literal. Only `labelKey` is display.
 */
const TABS: { key: PartySide; labelKey: string }[] = [
  { key: 'CUSTOMER', labelKey: 'parties.list.tabCustomers' },
  { key: 'SUPPLIER', labelKey: 'parties.list.tabSuppliers' },
];

/**
 * One page. Was `limit: 100` with no pager at all, which was not a large
 * default — it was a CEILING: a shop with 150 customers could not reach the
 * last 50 from anywhere in this app, and nothing on screen said so. Twenty
 * with accumulate-on-scroll, matching `(tabs)/orders.tsx`.
 */
const PAGE_LIMIT = 20;

export default function PartiesListScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { t } = useTranslation();
  const { can, ready } = usePartnerEntitlements();
  const { capacity } = usePlanUsage();
  const queryClient = useQueryClient();
  const [side, setSide] = useState<PartySide>('CUSTOMER');
  const [q, setQ] = useState('');
  /**
   * Hiding a party was a ONE-WAY DOOR, and the app was actively pushing people
   * through it: `parties/new.tsx` tells a partner at their plan limit to "hide a
   * party you no longer trade with", while this list asked for `isActive: 'true'`
   * and offered no way back. A hidden party was gone — from the list, from
   * search, from the ledger they might need at GST time — permanently.
   *
   * The server never deleted anything (`partiesApi.remove` sets `isActive:
   * false`) and `PUT /parties/:id` has always accepted `isActive: true`, so the
   * undo existed the whole time with nothing calling it.
   */
  const [showHidden, setShowHidden] = useState(false);

  const canManage = can('CUSTOMERS', 'FULL');
  const cap = capacity('max_customers');

  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PartnerParty[]>([]);

  // Any change of filter starts the accumulated list over at page 1.
  useEffect(() => {
    setPage(1);
    setRows([]);
  }, [side, q, showHidden]);

  const query = useQuery({
    queryKey: [...qk.parties.list(q), side, showHidden ? 'hidden' : 'active', page],
    queryFn: () =>
      partiesApi.list({
        side,
        q: q.trim() || undefined,
        isActive: showHidden ? 'false' : 'true',
        page,
        limit: PAGE_LIMIT,
      }),
    enabled: ready,
    staleTime: 15_000,
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
  const hasMore = query.data ? rows.length < total : false;
  const loadMore = useCallback(() => {
    if (query.isFetching || !hasMore) return;
    setPage((p) => p + 1);
  }, [query.isFetching, hasMore]);

  /**
   * Put a hidden party back on the list.
   *
   * `PUT`, not a dedicated endpoint — `UpdatePartyPayload` carries `isActive`
   * and `partner-party.controller.ts` writes it. Invalidating the whole
   * `qk.parties.all()` branch rather than patching the row: the party moves
   * between two differently-filtered lists, and there is no correct in-place
   * edit for "it is no longer in this list".
   */
  const unhide = useMutation({
    mutationFn: (id: string) => partiesApi.update(id, { isActive: true }),
    onSuccess: () => {
      setPage(1);
      setRows([]);
      void queryClient.invalidateQueries({ queryKey: qk.parties.all() });
      // A restored party counts against `max_customers` again.
      void queryClient.invalidateQueries({ queryKey: qk.usage() });
    },
    onError: (e: unknown) => Alert.alert(t('parties.list.restoreFailed'), apiErrorMessage(e)),
  });

  const confirmUnhide = useCallback(
    (party: PartnerParty) => {
      Alert.alert(
        t('parties.list.unhideTitle'),
        t('parties.list.unhideBody', { name: party.name }),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('parties.list.unhideConfirm'), onPress: () => unhide.mutate(party._id) },
        ],
      );
    },
    [unhide, t],
  );

  const renderItem = ({ item }: { item: PartnerParty }) => (
    <View style={[styles.row, { backgroundColor: c.surface }]}>
      <Pressable
        onPress={() => router.push({ pathname: '/parties/[id]', params: { id: item._id } })}
        style={styles.rowTouchable}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>{item.name}</Text>
          <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
            {item.phone || item.email || (item.isWalkIn ? t('parties.list.walkIn') : '—')}
            {item.kind === 'BOTH' ? t('parties.list.kindBothSuffix') : ''}
          </Text>
        </View>
        {showHidden && canManage ? (
          <Pressable
            onPress={() => confirmUnhide(item)}
            disabled={unhide.isPending}
            style={[styles.unhideBtn, { borderColor: c.primary }]}
            accessibilityLabel={t('parties.list.unhideLabel', { name: item.name })}
          >
            <Text style={{ color: c.primary, fontWeight: '600', fontSize: 12 }}>
              {unhide.isPending ? '…' : t('parties.list.unhideConfirm')}
            </Text>
          </Pressable>
        ) : (
          <View style={{ alignItems: 'flex-end' }}>
            <Text
              style={[
                styles.balance,
                { color: item.outstandingPaise > 0 ? c.error : item.outstandingPaise < 0 ? c.success : c.textSecondary },
              ]}
            >
              {formatPaise(Math.abs(item.outstandingPaise))}
            </Text>
            <Text style={[styles.balanceLabel, { color: c.textDisabled }]}>
              {item.outstandingPaise > 0
                ? t('parties.list.theyOwe')
                : item.outstandingPaise < 0 ? t('parties.list.youOwe') : t('parties.list.settled')}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );

  const heroCount = useMemo(() => String(total), [total]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      {/* >>> WEB-UI — the whole screen scrolls as one list: the hero, tabs,
          search and the hidden toggle are the list's header now (an element,
          so the search box keeps its focus), and the parties are not squeezed
          into a strip under them. Loading / error / empty sit under the header. */}
        <FlatList
          data={rows}
          keyExtractor={(p) => p._id}
          renderItem={(info) => <View style={styles.item}>{renderItem(info)}</View>}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          onRefresh={() => { setPage(1); void query.refetch(); }}
          refreshing={query.isRefetching && page === 1}
          onEndReachedThreshold={0.4}
          onEndReached={loadMore}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.header}>
      <Hero
        isDark={isDark}
        eyebrow={t('parties.list.eyebrow')}
        title={t('parties.list.title')}
        subtitle={t('parties.list.subtitle')}
        style={styles.hero}
      >
        {query.data ? (
          <GlassStat
            icon={side === 'CUSTOMER' ? 'account-outline' : 'truck-outline'}
            label={showHidden
              ? t('parties.list.statHidden')
              : t(side === 'CUSTOMER' ? 'parties.list.tabCustomers' : 'parties.list.tabSuppliers')}
            value={heroCount}
          />
        ) : null}
      </Hero>

      <View style={styles.controls}>
        <ChipRow c={c} value={side} options={TABS.map((tab) => ({ key: tab.key, label: t(tab.labelKey) }))} onChange={setSide} />
        <Searchbar
          placeholder={t('parties.list.searchPlaceholder')}
          value={q}
          onChangeText={setQ}
          style={[styles.search, { backgroundColor: c.surfaceVariant }]}
          inputStyle={{ fontSize: 14 }}
        />
        <View style={styles.hiddenToggle}>
          <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>{t('parties.list.showHidden')}</Text>
          <Switch value={showHidden} onValueChange={setShowHidden} color={c.primary} />
        </View>
      </View>
            </View>
          }
          ListFooterComponent={
            query.isFetching && page > 1 ? (
              <ActivityIndicator color={c.primary} style={{ marginVertical: 16 }} />
            ) : null
          }
          ListEmptyComponent={
            query.isPending && rows.length === 0 ? (
              <Loading c={c} />
            ) : query.isError && rows.length === 0 ? (
              <ErrorBlock c={c} message={apiErrorMessage(query.error, t('parties.list.loadFailed'))} onRetry={() => query.refetch()} />
            ) : (
            <EmptyBlock
              c={c}
              icon="account-group-outline"
              title={
                showHidden
                  ? t('parties.list.emptyHiddenTitle')
                  : q
                    ? t('parties.list.emptySearchTitle')
                    : t(side === 'CUSTOMER' ? 'parties.list.emptyCustomersTitle' : 'parties.list.emptySuppliersTitle')
              }
              body={
                showHidden
                  ? t('parties.list.emptyHiddenBody')
                  : q
                    ? t('parties.list.emptySearchBody')
                    : t('parties.list.emptyBody')
              }
            />
            )
          }
        />
      {/* <<< WEB-UI */}

      {/* No Add button while looking at hidden parties — the action that belongs
          on that list is "show again", and it is on each row. */}
      {canManage && !showHidden && (
        <FAB
          icon="plus"
          label={cap.atLimit ? t('parties.list.limitReached') : t('parties.list.addParty')}
          disabled={cap.atLimit}
          style={[styles.fab, { backgroundColor: cap.atLimit ? c.textDisabled : c.primary }]}
          color={c.textInverse}
          onPress={() => router.push({ pathname: '/parties/new', params: { kind: side } })}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { marginHorizontal: 16, marginTop: 8, marginBottom: 8 },
  controls: { paddingHorizontal: 16, gap: 10, paddingBottom: 4 },
  search: { borderRadius: radii.field, elevation: 0 },
  // >>> WEB-UI — the header is inside the list now: the side padding moved onto
  // each row, and the 16dp under the controls onto the header.
  listContent: { paddingBottom: 96, flexGrow: 1 },
  header: { paddingBottom: 16 },
  item: { paddingHorizontal: 16 },
  // <<< WEB-UI
  row: { borderRadius: radii.card },
  rowTouchable: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  balance: { fontSize: 14, fontWeight: '600' },
  balanceLabel: { fontSize: 10, marginTop: 1 },
  hiddenToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 2 },
  unhideBtn: { borderWidth: 1.5, borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 6 },
  fab: { position: 'absolute', right: 16, bottom: 20, borderRadius: radii.pill },
});
