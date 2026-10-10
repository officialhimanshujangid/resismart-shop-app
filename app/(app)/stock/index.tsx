import React, { useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Rect } from 'react-native-svg';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
import { Card, Row, SectionLabel } from '../../../src/features/more/ui';
import { HelpButton } from '../../../src/features/help/HelpButton';
// M20 — DS v1: sliding segment, token badges, stock bars, section rise.
import { LargeTitle, LargeTitleBar, ScanLine, Segmented, StatusBadge, useLargeTitleScroll } from '../../../src/components/ui';
import { useAppTheme } from '../../../src/theme/useAppTheme';
import { heroSky, radius, tintsFor, MIN_TOUCH } from '../../../src/theme/tokens';
import { PressableScale, Rise } from '../../../src/theme/motion';
import { StockBar } from '../../../src/features/catalog/components/StockBar';
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
  const { ds, tints } = useAppTheme();
  const { scrollY, onScroll } = useLargeTitleScroll();
  /** The SAME destination as the "Stock counts" row below — the open count (it has the scanner) or the counts list. */
  const goCount = () => (open ? router.push({ pathname: '/stock/counts/[id]', params: { id: open._id } }) : router.push('/stock/counts'));

  const left = (
    <Rise index={0} style={styles.stack}>
      {/* UX-P (C10): the dark scan hero — a dashed frame with the sweeping line.
          Tapping it does exactly what the "Stock counts" row does (continue the
          open count, or start from the counts list); nothing new is counted here. */}
      <PressableScale onPress={goCount} haptic accessibilityRole="button" accessibilityLabel={open ? t('stock.home.countsOpen', { number: open.number }) : t('stock.home.counts')} testID="stock-scan-hero">
        <LinearGradient colors={[heroSky.dark[0], heroSky.dark[2]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.frame}>
            <Svg width={150} height={54} viewBox="0 0 150 54" style={styles.bars}>
              {BARS.map(([x, w]) => <Rect key={x} x={x} y={0} width={w} height={54} fill={HERO_INK} />)}
            </Svg>
            <ScanLine color={HERO_MINT} />
          </View>
          <View style={styles.heroCaption}>
            <MaterialCommunityIcons name="barcode-scan" size={16} color={HERO_SOFT} />
            <Text style={[styles.heroText, { color: HERO_SOFT }]} numberOfLines={2}>
              {open ? t('stock.home.countsOpen', { number: open.number }) : t('stock.home.countsSub')}
            </Text>
          </View>
        </LinearGradient>
      </PressableScale>
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
    </Rise>
  );

  const right = canView ? (
    <Rise index={1} style={styles.stack}>
      {(low.data?.data?.length ?? 0) > 0 && (
        <Card c={c}>
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>{t('stock.home.lowList')}</Text>
          {low.data!.data.map((p, i) => (
            <PressableScale key={p._id} onPress={() => router.push({ pathname: '/catalog/[id]', params: { id: p._id } })} style={styles.lowRow} accessibilityRole="button">
              {/* UX-P (C10): a soft product block, the name, and the stock bar filling in. */}
              <View style={[styles.thumb, { backgroundColor: tints[THUMB_TINTS[i % THUMB_TINTS.length]].from }]}>
                <MaterialCommunityIcons name="package-variant" size={20} color={tints[THUMB_TINTS[i % THUMB_TINTS.length]].icon} />
              </View>
              <View style={styles.lowName}>
                <Text style={{ color: c.textPrimary, fontWeight: '600' }} numberOfLines={2}>{p.name}</Text>
                <StockBar qty={p.stockQty} lowAt={p.lowStockAt} max={p.maxStockQty} width={140} style={styles.lowBar} />
              </View>
              <StatusBadge
                tone={p.stockQty <= 0 ? 'danger' : 'warn'}
                label={p.stockQty <= 0 ? t('today.outOfStock') : t('stock.home.left', { qty: p.stockQty, unit: p.unit })}
              />
            </PressableScale>
          ))}
        </Card>
      )}
      <SectionLabel c={c}>{t('stock.home.adjustmentsSection')}</SectionLabel>
      <Segmented<Period>
        value={period}
        options={[{ key: 'MONTH', label: t('stock.home.thisMonth') }, { key: 'LAST30', label: t('stock.home.last30') }]}
        onChange={setPeriod}
        testID="stock-period"
      />
      <AdjustmentsReportCard c={c} from={from} to={to} />
    </Rise>
  ) : undefined;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: ds.ground }]} edges={['top']}>
      <LargeTitleBar title={t('stock.home.title')} scrollY={scrollY} right={<HelpButton c={c} />} />
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={styles.content}>
        {/* UX-P (C10): "N products need you" over the big title, once the low list has loaded. */}
        <LargeTitle
          title={t('stock.home.title')}
          eyebrow={canView && low.data ? t('stock.home.needYou', { count: low.data.total }) : t('stock.home.subtitle')}
          scrollY={scrollY}
        />
        <TwoPane left={left} right={right} />
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

/** Camera-hero chrome: always drawn over the dark green hero (both themes), so fixed on purpose. */
const HERO_INK = '#FFFFFF';
const HERO_MINT = tintsFor(true).green.icon;
const HERO_SOFT = '#CFEFDC';
const THUMB_TINTS = ['amber', 'blue', 'green', 'violet'] as const;
/** A decorative barcode: [x, width] of each bar. */
const BARS: [number, number][] = [
  [0, 4], [8, 2], [14, 6], [24, 2], [30, 4], [40, 2], [46, 6], [56, 2], [62, 4], [72, 6],
  [82, 2], [88, 4], [98, 2], [104, 6], [114, 2], [120, 4], [130, 6], [140, 2], [146, 4],
];

const styles = StyleSheet.create({
  root: { flex: 1 },
  // DS §3: screen gutter 18; 16 between every block (no stuck cards).
  content: { paddingHorizontal: 18, paddingBottom: 32, gap: 16 },
  stack: { gap: 16 },
  hero: { height: 150, borderRadius: radius.cardLg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', gap: 10, paddingHorizontal: 16 },
  frame: { width: 200, height: 86, borderRadius: radius.md, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.5)', alignItems: 'center', justifyContent: 'center' },
  bars: { opacity: 0.9 },
  heroCaption: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  heroText: { fontSize: 12.5, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '600' },
  lowRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: MIN_TOUCH + 12, paddingVertical: 4 },
  thumb: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  lowName: { flex: 1, minWidth: 0 },
  lowBar: { marginTop: 6 },
});
