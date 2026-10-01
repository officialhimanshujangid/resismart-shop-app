import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, useColorScheme, View } from 'react-native';
import { Searchbar, Snackbar } from 'react-native-paper';
import { router } from 'expo-router';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { formatPaise } from '../../../src/lib/money';
import { apiErrorMessage } from '../../../src/api/axios';
import { useDebouncedValue } from '../../../src/features/billing/useDebouncedValue';
import { KhataFilter, khataApi } from '../../../src/features/khata/api';
import { useKhataActions } from '../../../src/features/khata/useKhataActions';
import { KhataRowCard } from '../../../src/features/khata/components/KhataRowCard';
import { ChipRow, EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { ActionRow, PillButton, StatGrid, StatTile, useIsWide } from '../../../src/features/p1/ui';

/**
 * Khata (screen S14): who owes the shop, oldest first or biggest first, with
 * the over-limit and overdue flags; one tap reminds (share sheet — free). Bulk
 * mode sends an app notification to the customers who use the ResiSmart app
 * (the others are reminded one by one, by share).
 */
const FILTERS: KhataFilter[] = ['due', 'overdue', 'overLimit', 'all'];
const BULK_MAX = 100;

export default function KhataScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const wide = useIsWide();
  const { can } = usePartnerEntitlements();
  const canManage = can('CUSTOMERS', 'FULL');
  const [filter, setFilter] = useState<KhataFilter>('due');
  const [q, setQ] = useState('');
  const debounced = useDebouncedValue(q, 300);
  const [bulk, setBulk] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const actions = useKhataActions(setToast);

  const query = useInfiniteQuery({
    queryKey: qk.khata.list(filter, debounced.trim()),
    queryFn: ({ pageParam }) => khataApi.list({ filter, q: debounced.trim() || undefined, page: pageParam, limit: 20 }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last && last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
  const rows = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p?.data ?? []), [query.data]);
  const totals = query.data?.pages?.[0]?.totals;

  const bulkRemind = useMutation({
    mutationFn: () => khataApi.remindBulk({ partyIds: picked.slice(0, BULK_MAX), channel: 'PUSH', includeUpiLink: true }),
    onSuccess: (res) => {
      const sent = res.filter((r) => r.outcome === 'SENT').length;
      setToast(t('khata.bulkResult', { sent, skipped: res.length - sent }));
      setBulk(false);
      setPicked([]);
    },
    onError: (e) => setToast(apiErrorMessage(e, t('khata.actionFailed'))),
  });

  return (
    <Screen
      c={c}
      title={t('khata.title')}
      subtitle={t('khata.subtitle')}
      scroll={false}
      floating={<Snackbar visible={!!toast} onDismiss={() => setToast(null)} duration={4000}>{toast}</Snackbar>}
    >
      <View style={styles.controls}>
        {totals && (
          <StatGrid>
            <StatTile c={c} label={t('khata.totalDue')} value={formatPaise(totals.duePaise)} tone={c.error} testID="khata-total" />
            <StatTile c={c} label={t('khata.customers')} value={String(totals.parties)} />
          </StatGrid>
        )}
        <ChipRow c={c} value={filter} options={FILTERS.map((f) => ({ key: f, label: t(`khata.filter.${f}`) }))} onChange={setFilter} />
        <Searchbar placeholder={t('khata.search')} value={q} onChangeText={setQ} style={[styles.search, { backgroundColor: c.surfaceVariant }]} inputStyle={{ fontSize: 14 }} />
        {canManage && (
          <ActionRow>
            {bulk ? (
              <>
                <PillButton
                  c={c}
                  icon="bell-ring-outline"
                  label={t('khata.bulkSend', { count: picked.length })}
                  disabled={!picked.length || bulkRemind.isPending}
                  onPress={() => bulkRemind.mutate()}
                  testID="khata-bulk-send"
                />
                <PillButton c={c} tone="outline" label={t('common.cancel')} onPress={() => { setBulk(false); setPicked([]); }} />
              </>
            ) : (
              <PillButton c={c} tone="outline" icon="checkbox-multiple-marked-outline" label={t('khata.bulk')} onPress={() => setBulk(true)} />
            )}
          </ActionRow>
        )}
      </View>
      {query.isPending ? (
        <Loading c={c} />
      ) : query.isError && rows.length === 0 ? (
        <ErrorBlock c={c} message={apiErrorMessage(query.error, t('khata.loadFailed'))} onRetry={() => query.refetch()} />
      ) : (
        <FlatList
          key={wide ? 'w' : 'n'}
          data={rows}
          numColumns={wide ? 2 : 1}
          columnWrapperStyle={wide ? { gap: 10 } : undefined}
          keyExtractor={(r) => r.partyId}
          renderItem={({ item }) => (
            <View style={wide ? { flex: 1 } : undefined}>
              <KhataRowCard
                c={c}
                row={item}
                onOpen={() => router.push({ pathname: '/parties/[id]', params: { id: item.partyId } })}
                onRemind={canManage && item.outstandingPaise > 0 ? () => void actions.remindShare(item.partyId) : undefined}
                reminding={!!actions.busy}
                selectable={bulk}
                selected={picked.includes(item.partyId)}
                onToggle={() => setPicked((p) => (p.includes(item.partyId) ? p.filter((x) => x !== item.partyId) : p.length >= BULK_MAX ? p : [...p, item.partyId]))}
              />
            </View>
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          onRefresh={() => void query.refetch()}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={c.primary} style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={<EmptyBlock c={c} icon="notebook-check-outline" title={t(`khata.empty.${filter}`)} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  search: { borderRadius: radii.field, elevation: 0 },
  list: { padding: 16, paddingBottom: 40, flexGrow: 1 },
});
