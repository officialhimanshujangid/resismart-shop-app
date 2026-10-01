import React, { useState } from 'react';
import { Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { catalogApi } from '../../../src/features/catalog/api';
import { stockApi } from '../../../src/features/stock/api';
import { AdjustmentsReportCard } from '../../../src/features/stock/components/AdjustmentsReportCard';
import { Card, ChipRow, Row, Screen, SectionLabel } from '../../../src/features/more/ui';
import { StatGrid, StatTile, TwoPane } from '../../../src/features/p1/ui';
import { monthStartYmd, todayYmd } from '../../../src/features/p1/dates';

/**
 * Stock home (screen S8): how many products are low, whether a count is open,
 * the ways in (counts, reorder list, stock history), and the adjustments
 * report — where stock went without a sale.
 */
type Period = 'MONTH' | 'LAST30';

export default function StockHomeScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { can, hasModule } = usePartnerEntitlements();
  const canView = can('STOCK_VIEW', 'READ');
  const [period, setPeriod] = useState<Period>('MONTH');
  const from = period === 'MONTH' ? monthStartYmd() : todayYmd(new Date(Date.now() - 29 * 86_400_000));
  const to = todayYmd();

  const low = useQuery({
    queryKey: qk.catalog.products({ lowStock: 'true', isActive: 'true', limit: 10 }),
    queryFn: () => catalogApi.list({ lowStock: 'true', isActive: 'true', limit: 10 }),
    enabled: canView,
  });
  const openCounts = useQuery({
    queryKey: qk.stock.counts('open'),
    queryFn: async () => {
      const [counting, review] = await Promise.all([
        stockApi.listCounts({ status: 'COUNTING', limit: 1 }),
        stockApi.listCounts({ status: 'REVIEW', limit: 1 }),
      ]);
      return [...(counting?.data ?? []), ...(review?.data ?? [])];
    },
  });
  const open = openCounts.data?.[0];

  const left = (
    <View style={{ gap: 12 }}>
      <StatGrid>
        {canView && (
          <StatTile
            c={c}
            label={t('stock.home.lowStock')}
            value={low.data ? String(low.data.total) : '—'}
            tone={(low.data?.total ?? 0) > 0 ? c.error : undefined}
            testID="stock-low-tile"
          />
        )}
        <StatTile
          c={c}
          label={t('stock.home.openCount')}
          value={open ? open.number : t('stock.home.noOpenCount')}
        />
      </StatGrid>
      <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
        <Row
          c={c}
          icon="clipboard-check-outline"
          title={t('stock.home.counts')}
          subtitle={open ? t('stock.home.countsOpen', { number: open.number }) : t('stock.home.countsSub')}
          onPress={() => (open ? router.push({ pathname: '/stock/counts/[id]', params: { id: open._id } }) : router.push('/stock/counts'))}
        />
        {canView && (
          <Row c={c} icon="cart-arrow-down" title={t('stock.home.reorder')} subtitle={t('stock.home.reorderSub')} onPress={() => router.push('/stock/reorder')} />
        )}
        {canView && (
          <Row c={c} icon="history" title={t('stock.home.history')} subtitle={t('stock.home.historySub')} onPress={() => router.push('/catalog/movements')} />
        )}
        {hasModule('CATALOG') && can('CATALOG_VIEW', 'READ') && (
          <Row c={c} icon="view-list-outline" title={t('stock.home.catalogue')} subtitle={t('stock.home.catalogueSub')} onPress={() => router.push('/catalog')} />
        )}
      </Card>
    </View>
  );

  const right = canView ? (
    <View style={{ gap: 12 }}>
      {(low.data?.data?.length ?? 0) > 0 && (
        <Card c={c}>
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{t('stock.home.lowList')}</Text>
          {low.data!.data.map((p) => (
            <Pressable key={p._id} onPress={() => router.push({ pathname: '/catalog/[id]', params: { id: p._id } })} style={styles.lowRow} accessibilityRole="button">
              <Text style={{ color: c.textPrimary, flex: 1 }} numberOfLines={1}>{p.name}</Text>
              <View style={[styles.chip, { backgroundColor: `${c.error}1A` }]}>
                <Text style={{ color: c.error, fontSize: 12, fontWeight: '700' }}>
                  {p.stockQty <= 0 ? t('today.outOfStock') : t('stock.home.left', { qty: p.stockQty, unit: p.unit })}
                </Text>
              </View>
            </Pressable>
          ))}
        </Card>
      )}
      <SectionLabel c={c}>{t('stock.home.adjustmentsSection')}</SectionLabel>
      <ChipRow
        c={c}
        value={period}
        options={[{ key: 'MONTH', label: t('stock.home.thisMonth') }, { key: 'LAST30', label: t('stock.home.last30') }]}
        onChange={setPeriod}
      />
      <AdjustmentsReportCard c={c} from={from} to={to} />
    </View>
  ) : undefined;

  return (
    <Screen c={c} title={t('stock.home.title')} subtitle={t('stock.home.subtitle')}>
      <TwoPane left={left} right={right} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: 14, fontWeight: '600' },
  lowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 },
});
