import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { apiErrorMessage } from '../../../api/axios';
import { usePartnerEntitlements } from '../../../hooks';
import { EmptyBlock, ErrorBlock, Loading } from '../../more/ui';
// M20 — DS v1 motion: first screenful rises in; skeletons, not spinners.
import { Rise } from '../../../theme/motion';
import { Skeleton } from '../../../components/ui/States';
import { StockMovement, StockMovementFilters as Filters, useStockMovements } from '../stockMovements';
import { StockMovementFilters } from './StockMovementFilters';
import { StockMovementRow } from './StockMovementRow';

/**
 * The ledger list shared by "Stock history" (one product) and "Stock movements"
 * (the whole shop) — contract §5: "same component, `productId` filter".
 *
 * A FlatList that owns its own scroll (the screens pass `scroll={false}` to
 * their chrome), paginated by `page`/`limit` and loaded on reaching the end.
 */
export function StockMovementList({
  c, scope, productId, header,
}: {
  c: ColorScheme;
  scope: 'product' | 'shop';
  productId?: string;
  /** Rendered above the filters — the product card on the per-product screen. */
  header?: (page: { productName?: string; stockQty?: number; unit?: string; total?: number }) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const { hasModule } = usePartnerEntitlements();
  const [filters, setFilters] = useState<Filters>({});
  const query = useStockMovements(scope, { ...filters, productId });

  const rows: StockMovement[] = useMemo(
    () => (query.data?.pages ?? []).flatMap((p) => (Array.isArray(p?.data) ? p.data : [])),
    [query.data],
  );
  const first = query.data?.pages?.[0];
  const product = first?.product;

  /** A source opens only where this app has the screen AND the module is on. */
  const openerFor = (m: StockMovement): (() => void) | undefined => {
    if (!m.sourceId) return undefined;
    if (m.sourceType === 'DOCUMENT' && hasModule('INVOICING')) {
      const id = m.sourceId;
      return () => router.push({ pathname: '/billing/[id]', params: { id } });
    }
    if (m.sourceType === 'ORDER' && hasModule('ORDERS')) {
      const id = m.sourceId;
      return () => router.push({ pathname: '/(app)/(tabs)/orders', params: { id } });
    }
    return undefined;
  };

  const listHeader = (
    <View style={styles.header}>
      {header?.({ productName: product?.name, stockQty: product?.stockQty, unit: product?.unit, total: first?.total })}
      <StockMovementFilters c={c} value={filters} onChange={setFilters} />
      {first && typeof first.total === 'number' && rows.length > 0 ? (
        <Text style={[styles.count, { color: c.textSecondary }]}>
          {t('stockHistory.showing', { shown: rows.length, total: first.total })}
        </Text>
      ) : null}
    </View>
  );

  let empty: React.ReactElement | null = null;
  if (query.isPending) empty = <Loading c={c} skeleton={4} />;
  else if (query.isError) {
    empty = (
      <ErrorBlock c={c} message={apiErrorMessage(query.error, t('stockHistory.loadFailed'))} onRetry={() => void query.refetch()} />
    );
  } else {
    const filtered = Boolean(filters.type || filters.from || filters.to);
    empty = (
      <EmptyBlock
        c={c}
        icon="history"
        title={filtered ? t('stockHistory.emptyFilteredTitle') : t('stockHistory.emptyTitle')}
        body={filtered ? t('stockHistory.emptyFilteredBody') : t('stockHistory.emptyBody')}
      />
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(m, i) => m.id || `${m.createdAt}-${i}`}
      renderItem={({ item, index }) => {
        const row = (
          <StockMovementRow
            item={item}
            c={c}
            showProduct={scope === 'shop'}
            onOpenSource={openerFor(item)}
            onOpenProduct={
              scope === 'shop' && item.productId
                ? () => router.push({ pathname: '/catalog/[id]', params: { id: item.productId } })
                : undefined
            }
          />
        );
        // The first screenful rises in on a stagger; later pages never animate row by row.
        return index < 8 ? <Rise index={Math.min(index, 5) + 1} distance={10}>{row}</Rise> : row;
      }}
      initialNumToRender={10}
      windowSize={9}
      ListHeaderComponent={listHeader}
      ListEmptyComponent={empty}
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <View style={styles.footer}><Skeleton height={64} rounded={18} /></View>
        ) : query.isFetchNextPageError ? (
          <Text
            style={[styles.footerText, { color: c.primary }]}
            onPress={() => void query.fetchNextPage()}
            accessibilityRole="button"
          >
            {t('stockHistory.loadMoreFailed')}
          </Text>
        ) : !query.hasNextPage && rows.length > 0 ? (
          <Text style={[styles.footerText, { color: c.textSecondary }]}>{t('stockHistory.end')}</Text>
        ) : null
      }
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage && !query.isFetchNextPageError) void query.fetchNextPage();
      }}
      onEndReachedThreshold={0.4}
      refreshControl={
        <RefreshControl refreshing={query.isRefetching && !query.isFetchingNextPage} onRefresh={() => void query.refetch()} />
      }
      contentContainerStyle={styles.content}
      ItemSeparatorComponent={Separator}
      keyboardShouldPersistTaps="handled"
    />
  );
}

function Separator() {
  return <View style={{ height: 8 }} />;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, width: '100%', maxWidth: 760, alignSelf: 'center' },
  header: { gap: 10, marginBottom: 12 },
  count: { fontSize: 12 },
  footer: { marginVertical: 16 },
  footerText: { textAlign: 'center', fontSize: 12.5, marginVertical: 16, fontWeight: '600' },
});
