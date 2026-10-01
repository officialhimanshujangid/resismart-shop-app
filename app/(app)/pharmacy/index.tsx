import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, useColorScheme, View } from 'react-native';
import { TextInput } from 'react-native-paper';
import { router, type Href } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { radii, themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { apiErrorMessage } from '../../../src/api/axios';
import { useDebouncedValue } from '../../../src/features/billing/useDebouncedValue';
import { ChipRow, EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { ActionRow, PillButton, useIsWide } from '../../../src/features/p1/ui';
import { pharmacyApi, pharmacyKeys } from '../../../src/features/pharmacy/api';
import { BatchRowItem } from '../../../src/features/pharmacy/components/BatchRowItem';
import { BucketTiles } from '../../../src/features/pharmacy/components/BucketTiles';
import { PagerFooter } from '../../../src/features/pharmacy/components/PagerFooter';
import { batchPath } from '../../../src/features/pharmacy/logic';
import type { BatchStatus } from '../../../src/features/pharmacy/types';

/**
 * Pharmacy home: the near-expiry buckets (tap → Near expiry), the batches on
 * the shelf with a search and status chips (All / Near expiry / Expired / OK),
 * earliest expiry first, and the Prescription register link for RX_REGISTER
 * holders. A person who holds only RX_REGISTER sees just that link.
 */
type Filter = 'ALL' | Exclude<BatchStatus, 'EMPTY'>;
const FILTERS: Filter[] = ['ALL', 'NEAR_EXPIRY', 'EXPIRED', 'OK'];
const PAGE = 30;

export default function PharmacyHomeScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const wide = useIsWide();
  const { can } = usePartnerEntitlements();
  const canView = can('PHARMACY_VIEW', 'READ');
  const canRegister = can('RX_REGISTER', 'READ');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [q, setQ] = useState('');
  const search = useDebouncedValue(q.trim(), 300);

  const buckets = useQuery({
    queryKey: pharmacyKeys.nearExpiry(),
    queryFn: () => pharmacyApi.nearExpiry(),
    enabled: canView,
  });
  const params = { status: filter === 'ALL' ? undefined : filter, q: search || undefined };
  const list = useInfiniteQuery({
    queryKey: pharmacyKeys.batches(params),
    queryFn: ({ pageParam }) => pharmacyApi.batches({ ...params, page: pageParam, limit: PAGE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.limit < last.total ? last.page + 1 : undefined),
    enabled: canView,
  });
  const rows = useMemo(() => (list.data?.pages ?? []).flatMap((p) => p.data), [list.data]);
  const total = list.data?.pages[list.data.pages.length - 1]?.total ?? 0;

  const links = (
    <ActionRow>
      {canView ? (
        <PillButton c={c} tone="outline" icon="clock-alert-outline" label={t('p2.pharmacy.nearExpiry.title')} onPress={() => router.push('/pharmacy/near-expiry' as Href)} testID="hub-near-expiry" />
      ) : null}
      {canRegister ? (
        <PillButton c={c} tone="outline" icon="notebook-outline" label={t('p2.pharmacy.register.title')} onPress={() => router.push('/pharmacy/rx-register' as Href)} testID="hub-rx-register" />
      ) : null}
    </ActionRow>
  );

  if (!canView) {
    return (
      <Screen c={c} title={t('p2.pharmacy.title')} subtitle={t('p2.pharmacy.subtitle')}>
        {links}
      </Screen>
    );
  }

  const header = (
    <View style={styles.header}>
      <BucketTiles c={c} buckets={buckets.data?.buckets ?? []} onPress={() => router.push('/pharmacy/near-expiry' as Href)} testID="hub-buckets" />
      {links}
      <TextInput
        mode="outlined"
        placeholder={t('p2.pharmacy.hub.search')}
        value={q}
        onChangeText={(s) => setQ(s.slice(0, 60))}
        left={<TextInput.Icon icon="magnify" />}
        outlineStyle={{ borderRadius: radii.field }}
        style={{ backgroundColor: 'transparent' }}
        testID="hub-search"
      />
      <ChipRow c={c} value={filter} options={FILTERS.map((k) => ({ key: k, label: t(`p2.pharmacy.hub.filter.${k}`) }))} onChange={setFilter} />
    </View>
  );

  return (
    <Screen c={c} title={t('p2.pharmacy.title')} subtitle={t('p2.pharmacy.subtitle')} scroll={false}>
      <FlatList
        key={wide ? 'wide' : 'narrow'}
        data={list.isPending || (list.isError && rows.length === 0) ? [] : rows}
        numColumns={wide ? 2 : 1}
        columnWrapperStyle={wide ? { gap: 10 } : undefined}
        keyExtractor={(b) => b.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={wide ? { flex: 1, minWidth: 0 } : undefined}>
            <BatchRowItem c={c} row={item} onPress={() => router.push(batchPath(item) as Href)} testID={`batch-${item.id}`} />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={styles.list}
        onRefresh={() => { void list.refetch(); void buckets.refetch(); }}
        refreshing={list.isRefetching && !list.isFetchingNextPage}
        ListEmptyComponent={
          list.isPending ? <Loading c={c} />
            : list.isError ? <ErrorBlock c={c} message={apiErrorMessage(list.error, t('p2.pharmacy.hub.loadFailed'))} onRetry={() => list.refetch()} />
              : <EmptyBlock c={c} icon="pill" title={t('p2.pharmacy.hub.empty')} body={t('p2.pharmacy.hub.emptyBody')} />
        }
        ListFooterComponent={(
          <PagerFooter
            c={c}
            shown={rows.length}
            total={total}
            hasMore={!!list.hasNextPage}
            loading={list.isFetchingNextPage}
            onMore={() => void list.fetchNextPage()}
            testID="hub-pager"
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 12, paddingBottom: 12 },
  list: { padding: 16, paddingBottom: 40, flexGrow: 1 },
});
