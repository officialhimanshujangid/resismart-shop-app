import React, { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, useColorScheme, View } from 'react-native';
import { router } from 'expo-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { documentsApi } from '../../../src/features/billing/documents.api';
import type { PartnerDocumentType } from '../../../src/features/billing/types';
import { ChipRow, EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { ActionRow, PillButton, useIsWide } from '../../../src/features/p1/ui';
import { PurchaseDocRow } from '../../../src/features/purchases/components/PurchaseDocRow';

/**
 * Purchases home (screen S3): purchase orders, goods received, supplier bills
 * and returns (debit notes), one tab each. A row opens the document itself
 * (`billing/[id]`), which carries the P1 actions — Receive against a PO,
 * Return goods against a bill. GOODS_RECEIPT is listed here but never created
 * from the generic New screen (§4.4): goods are received against a PO.
 */
type Tab = 'PO' | 'GRN' | 'BILL' | 'RETURN';
const TYPE_OF: Record<Tab, PartnerDocumentType> = {
  PO: 'PURCHASE_ORDER', GRN: 'GOODS_RECEIPT', BILL: 'PURCHASE_INVOICE', RETURN: 'DEBIT_NOTE',
};
const PAGE = 20;

export default function PurchasesHomeScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const wide = useIsWide();
  const { can, hasModule } = usePartnerEntitlements();
  const canManage = can('PURCHASES_MANAGE', 'FULL');
  const [tab, setTab] = useState<Tab>('PO');

  const query = useInfiniteQuery({
    queryKey: qk.billing.documents({ purchaseTab: tab }),
    queryFn: ({ pageParam }) => documentsApi.list({ type: TYPE_OF[tab], page: pageParam, limit: PAGE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last && last.page * last.limit < last.total ? last.page + 1 : undefined),
  });
  const rows = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p?.data ?? []), [query.data]);

  const tabs = (['PO', 'GRN', 'BILL', 'RETURN'] as Tab[]).map((k) => ({ key: k, label: t(`purchases.tab.${k}`) }));

  return (
    <Screen c={c} title={t('purchases.title')} subtitle={t('purchases.subtitle')} scroll={false}>
      <View style={styles.controls}>
        <ChipRow c={c} value={tab} options={tabs} onChange={setTab} />
        {canManage && (
          <ActionRow>
            {tab === 'PO' && (
              <PillButton
                c={c}
                icon="plus"
                label={t('purchases.newPo')}
                onPress={() => router.push({ pathname: '/billing/new', params: { direction: 'PURCHASE', docType: 'PURCHASE_ORDER' } })}
              />
            )}
            {tab === 'BILL' && (
              <PillButton
                c={c}
                icon="plus"
                label={t('purchases.newBill')}
                onPress={() => router.push({ pathname: '/billing/new', params: { direction: 'PURCHASE', docType: 'PURCHASE_INVOICE' } })}
              />
            )}
            {(tab === 'GRN' || tab === 'BILL') && (
              <PillButton c={c} tone="outline" icon="file-document-multiple-outline" label={t('purchases.billFromGrns')} onPress={() => router.push('/purchases/bill-from-grns')} />
            )}
            {tab === 'PO' && hasModule('CATALOG') && can('STOCK_VIEW', 'READ') && (
              <PillButton c={c} tone="outline" icon="cart-arrow-down" label={t('purchases.reorderList')} onPress={() => router.push('/stock/reorder')} />
            )}
          </ActionRow>
        )}
      </View>

      {query.isPending ? (
        <Loading c={c} />
      ) : query.isError && rows.length === 0 ? (
        <ErrorBlock c={c} message={apiErrorMessage(query.error, t('purchases.loadFailed'))} onRetry={() => query.refetch()} />
      ) : (
        <FlatList
          key={wide ? 'wide' : 'narrow'}
          data={rows}
          numColumns={wide ? 2 : 1}
          columnWrapperStyle={wide ? { gap: 10 } : undefined}
          keyExtractor={(d) => d._id}
          renderItem={({ item }) => (
            <View style={wide ? { flex: 1 } : undefined}>
              <PurchaseDocRow c={c} doc={item} onPress={() => router.push({ pathname: '/billing/[id]', params: { id: item._id } })} />
            </View>
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          onRefresh={() => void query.refetch()}
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onEndReachedThreshold={0.4}
          onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage(); }}
          ListFooterComponent={query.isFetchingNextPage ? <ActivityIndicator color={c.primary} style={{ marginVertical: 16 }} /> : null}
          ListEmptyComponent={<EmptyBlock c={c} icon="truck-outline" title={t(`purchases.empty.${tab}`)} body={t('purchases.emptyBody')} />}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: 16, paddingTop: 4, gap: 10 },
  list: { padding: 16, paddingBottom: 40, flexGrow: 1 },
});
