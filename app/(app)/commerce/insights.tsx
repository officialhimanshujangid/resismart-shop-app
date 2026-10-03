import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii, themeColors } from '../../../src/constants/colors';
import { apiErrorMessage } from '../../../src/api/axios';
import { formatPaise } from '../../../src/lib/money';
import { formatI18nDate } from '../../../src/i18n';
import { Card, ChipRow, EmptyBlock, ErrorBlock, Screen, SectionLabel } from '../../../src/features/more/ui';
import { StatGrid, StatTile } from '../../../src/features/p1/ui';
import { ChoiceChips } from '../../../src/features/p2/ui';
import { useCommerceAccess } from '../../../src/features/commerce/access';
import { useInsight, useStockAlertDemand } from '../../../src/features/commerce/hooks';
import { HEAT_BANDS, heatBands, heatLevel, lastDays } from '../../../src/features/commerce/logic';
import { hourText } from '../../../src/features/commerce/format';
import type { DeadStockRow, HeatCell, StockClass } from '../../../src/features/commerce/types';
import { CommerceHint, NoAccess, Tag } from '../../../src/features/commerce/components/ui';

type Tab = 'OVERVIEW' | 'CUSTOMERS' | 'STAFF' | 'STOCK';
type Range = 7 | 30 | 90;
/** Monday first, as a shop reads a week; the server's rows are 0 = Sunday. */
const WEEK = [1, 2, 3, 4, 5, 6, 0];

/**
 * "Shop insights" (C5, D-4): orders + counter bills together. Tabs keep the
 * phone scroll short; the busy-hours map is folded to 7 days × 6 four-hour
 * bands so it fits a 320dp screen without a sideways scroll.
 */
export default function InsightsScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const access = useCommerceAccess();
  const [range, setRange] = useState<Range>(30);
  const [tab, setTab] = useState<Tab>('OVERVIEW');
  const q = useMemo(() => lastDays(range), [range]);
  const can = access.insights;

  const overview = useInsight('overview', q, can.canView && tab === 'OVERVIEW');
  const heat = useInsight('heatmap', q, can.canView && tab === 'OVERVIEW');
  const customers = useInsight('topCustomers', { ...q, limit: 20 }, can.customers && tab === 'CUSTOMERS');
  const staff = useInsight('staffSales', q, can.canView && tab === 'STAFF');
  const dead = useInsight('deadStock', { limit: 100 }, can.deadStock && tab === 'STOCK');
  const alerts = useStockAlertDemand(can.stockAlerts && tab === 'STOCK');

  if (!can.canView) return <Screen title={t('commerce.insights.title')} c={c}><NoAccess c={c} /></Screen>;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'OVERVIEW', label: t('commerce.insights.tabOverview') },
    ...(can.customers ? [{ key: 'CUSTOMERS' as const, label: t('commerce.insights.tabCustomers') }] : []),
    { key: 'STAFF', label: t('commerce.insights.tabStaff') },
    ...(can.deadStock || can.stockAlerts ? [{ key: 'STOCK' as const, label: t('commerce.insights.tabStock') }] : []),
  ];

  return (
    <Screen title={t('commerce.insights.title')} c={c}>
      <View style={styles.wrap}>
        <CommerceHint c={c} helpKey="insights" />
        <ChipRow
          c={c}
          value={String(range) as '7' | '30' | '90'}
          options={[
            { key: '7', label: t('commerce.common.days7') },
            { key: '30', label: t('commerce.common.days30') },
            { key: '90', label: t('commerce.common.days90') },
          ]}
          onChange={(k) => setRange(Number(k) as Range)}
        />
        <ChipRow c={c} value={tab} options={tabs} onChange={setTab} />

        {tab === 'OVERVIEW' ? (
          <>
            {overview.isPending ? <ActivityIndicator color={c.primary} /> : null}
            {overview.isError ? <ErrorBlock c={c} message={apiErrorMessage(overview.error)} onRetry={() => void overview.refetch()} /> : null}
            {overview.data ? (
              <StatGrid>
                <StatTile c={c} label={t('commerce.insights.aov')} value={formatPaise(overview.data.aovPaise)} testID="insight-aov" />
                <StatTile c={c} label={t('commerce.insights.sales')} value={formatPaise(overview.data.revenuePaise)} />
                <StatTile c={c} label={t('commerce.insights.ordersBills')} value={`${overview.data.orders} + ${overview.data.bills}`} />
                <StatTile c={c} label={t('commerce.insights.itemsPerBill')} value={String(overview.data.basket.unitsPerOrder)} />
                <StatTile c={c} label={t('commerce.insights.discounts')} value={formatPaise(overview.data.discountGivenPaise)} />
                {overview.data.pointsRedeemedPaise > 0 ? <StatTile c={c} label={t('commerce.insights.points')} value={formatPaise(overview.data.pointsRedeemedPaise)} /> : null}
                {overview.data.storeCreditUsedPaise > 0 ? <StatTile c={c} label={t('commerce.insights.credit')} value={formatPaise(overview.data.storeCreditUsedPaise)} /> : null}
                {overview.data.deliveryFeesPaise > 0 ? <StatTile c={c} label={t('commerce.insights.delivery')} value={formatPaise(overview.data.deliveryFeesPaise)} /> : null}
              </StatGrid>
            ) : null}
            <SectionLabel c={c}>{t('commerce.insights.busyHours')}</SectionLabel>
            {heat.isPending ? <ActivityIndicator color={c.primary} /> : null}
            {heat.isError ? <ErrorBlock c={c} message={apiErrorMessage(heat.error)} onRetry={() => void heat.refetch()} /> : null}
            {heat.data ? <BusyHours c={c} grid={heat.data.grid} /> : null}
          </>
        ) : null}

        {tab === 'CUSTOMERS' ? (
          <>
            {customers.isPending ? <ActivityIndicator color={c.primary} /> : null}
            {customers.isError ? <ErrorBlock c={c} message={apiErrorMessage(customers.error)} onRetry={() => void customers.refetch()} /> : null}
            {customers.isSuccess && customers.data.length === 0 ? <EmptyBlock c={c} title={t('commerce.insights.noData')} /> : null}
            {(customers.data ?? []).map((r, i) => (
              <Card key={r.partyId} c={c} style={styles.rowCard}>
                <View style={styles.rowHead}>
                  <Text style={[styles.rank, { color: c.primary }]}>{i + 1}</Text>
                  <Text style={{ color: c.textPrimary, fontWeight: '700', flex: 1, minWidth: 0 }} numberOfLines={1}>{r.name}</Text>
                  <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{formatPaise(r.spendPaise)}</Text>
                </View>
                <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>
                  {[
                    t('commerce.insights.orders', { count: r.orders }),
                    t('commerce.insights.avgBill', { amount: formatPaise(r.aovPaise) }),
                    r.avgGapDays !== null ? t('commerce.insights.every', { count: Math.round(r.avgGapDays) }) : null,
                    r.daysSinceLast !== null ? t('commerce.insights.lastAgo', { count: r.daysSinceLast }) : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
              </Card>
            ))}
          </>
        ) : null}

        {tab === 'STAFF' ? (
          <>
            {staff.isPending ? <ActivityIndicator color={c.primary} /> : null}
            {staff.isError ? <ErrorBlock c={c} message={apiErrorMessage(staff.error)} onRetry={() => void staff.refetch()} /> : null}
            {staff.isSuccess && staff.data.length === 0 ? <EmptyBlock c={c} title={t('commerce.insights.noData')} /> : null}
            {(staff.data ?? []).map((r) => (
              <Card key={r.userId} c={c} style={styles.rowCard}>
                <View style={styles.rowHead}>
                  <Text style={{ color: c.textPrimary, fontWeight: '700', flex: 1, minWidth: 0 }} numberOfLines={1}>{r.name}</Text>
                  <Text style={{ color: c.textPrimary, fontWeight: '700' }}>{formatPaise(r.billsPaise)}</Text>
                </View>
                <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>
                  {t('commerce.insights.staffLine', { bills: r.bills, handled: r.ordersHandled, delivered: r.ordersDelivered })}
                </Text>
              </Card>
            ))}
          </>
        ) : null}

        {tab === 'STOCK' ? <StockTab c={c} dead={dead} alerts={alerts} showDead={can.deadStock} showAlerts={can.stockAlerts} /> : null}
      </View>
    </Screen>
  );
}

/** The folded heatmap: weekdays down, four-hour bands across, shade = orders + bills. */
function BusyHours({ c, grid }: { c: ColorScheme; grid: HeatCell[][] }) {
  const { t } = useTranslation();
  const { cells, max, busiest } = heatBands(grid);
  const shade = (n: number) => {
    const level = heatLevel(n, max);
    return level === 0 ? c.surfaceVariant : `${c.primary}${['', '33', '66', 'A6', 'FF'][level]}`;
  };
  if (max === 0) return <EmptyBlock c={c} icon="clock-outline" title={t('commerce.insights.noData')} />;
  return (
    <Card c={c} style={{ gap: 6 }}>
      <View style={styles.heatRow}>
        <View style={styles.dayCol} />
        {HEAT_BANDS.map(([a]) => (
          <Text key={a} style={[styles.bandHead, { color: c.textSecondary }]} numberOfLines={1}>{t(`commerce.insights.band.${a}`)}</Text>
        ))}
      </View>
      {WEEK.map((d) => (
        <View key={d} style={styles.heatRow}>
          <Text style={[styles.dayCol, { color: c.textSecondary }]} numberOfLines={1}>{t(`common.days.${d}`)}</Text>
          {cells[d].map((n, b) => {
            const level = heatLevel(n, max);
            return (
              <View
                key={b}
                style={[styles.cell, { backgroundColor: shade(n) }]}
                accessible
                accessibilityLabel={t('commerce.insights.cellA11y', { day: t(`common.daysLong.${d}`), band: t(`commerce.insights.band.${HEAT_BANDS[b][0]}`), count: n })}
              >
                {n > 0 ? <Text style={{ fontSize: 10.5, fontWeight: '700', color: level >= 3 ? c.textInverse : c.textPrimary }}>{n}</Text> : null}
              </View>
            );
          })}
        </View>
      ))}
      <View style={styles.legend}>
        <Text style={{ color: c.textSecondary, fontSize: 11 }}>{t('commerce.insights.quiet')}</Text>
        {[1, 2, 3, 4].map((l) => <View key={l} style={[styles.legendCell, { backgroundColor: `${c.primary}${['', '33', '66', 'A6', 'FF'][l]}` }]} />)}
        <Text style={{ color: c.textSecondary, fontSize: 11 }}>{t('commerce.insights.busy')}</Text>
      </View>
      {busiest ? (
        <Text style={{ color: c.textPrimary, fontWeight: '600' }} testID="insight-busiest">
          {t('commerce.insights.busiest', { day: t(`common.daysLong.${busiest.weekday}`), hour: hourText(busiest.hour, t) })}
        </Text>
      ) : null}
    </Card>
  );
}

const CLASS_TONE: Record<StockClass, 'bad' | 'warn' | 'info' | 'good'> = { DEAD: 'bad', SLOW: 'warn', NEW: 'info', MOVING: 'good' };

function StockTab({
  c, dead, alerts, showDead, showAlerts,
}: {
  c: ColorScheme;
  dead: { data?: DeadStockRow[]; isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  alerts: { data?: Array<{ productId: string; name: string; waiting: number }>; isPending: boolean };
  showDead: boolean;
  showAlerts: boolean;
}) {
  const { t } = useTranslation();
  const [classes, setClasses] = useState<StockClass[]>(['DEAD', 'SLOW']);
  const rows = (dead.data ?? []).filter((r) => classes.includes(r.class));
  return (
    <>
      {showDead ? (
        <>
          <SectionLabel c={c}>{t('commerce.insights.slowDead')}</SectionLabel>
          <ChoiceChips
            c={c}
            multi
            options={(['DEAD', 'SLOW', 'NEW'] as StockClass[]).map((k) => ({ key: k, label: t(`commerce.insights.class.${k}`) }))}
            value={classes}
            onChange={setClasses}
          />
          {dead.isPending ? <ActivityIndicator color={c.primary} /> : null}
          {dead.isError ? <ErrorBlock c={c} message={apiErrorMessage(dead.error)} onRetry={() => void dead.refetch()} /> : null}
          {dead.data && rows.length === 0 ? <EmptyBlock c={c} icon="check-circle-outline" title={t('commerce.insights.noSlow')} /> : null}
          {rows.map((r) => (
            <Card key={r.productId} c={c} style={styles.rowCard}>
              <View style={styles.rowHead}>
                <Text style={{ color: c.textPrimary, fontWeight: '700', flex: 1, minWidth: 0 }} numberOfLines={2}>{r.name}</Text>
                <Tag c={c} label={t(`commerce.insights.class.${r.class}`)} tone={CLASS_TONE[r.class]} />
              </View>
              <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>
                {[
                  t('commerce.insights.inStock', { qty: r.stockQty }),
                  r.lastSoldAt ? t('commerce.insights.lastSold', { date: formatI18nDate(r.lastSoldAt, t) }) : t('commerce.insights.neverSold'),
                  r.valuePaise !== undefined ? t('commerce.insights.value', { amount: formatPaise(r.valuePaise) }) : null,
                ].filter(Boolean).join(' · ')}
              </Text>
            </Card>
          ))}
        </>
      ) : null}
      {showAlerts ? (
        <>
          <SectionLabel c={c}>{t('commerce.insights.waiting')}</SectionLabel>
          {alerts.isPending ? <ActivityIndicator color={c.primary} /> : null}
          {alerts.data && alerts.data.length === 0 ? <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>{t('commerce.insights.noneWaiting')}</Text> : null}
          {(alerts.data ?? []).map((r) => (
            <View key={r.productId} style={[styles.waitRow, { borderColor: c.divider }]}>
              <Text style={{ color: c.textPrimary, flex: 1, minWidth: 0 }} numberOfLines={2}>{r.name}</Text>
              <Text style={{ color: c.warning, fontWeight: '700' }}>{t('commerce.insights.waitingCount', { count: r.waiting })}</Text>
            </View>
          ))}
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, width: '100%', maxWidth: 720, alignSelf: 'center' },
  rowCard: { gap: 4, paddingVertical: 12 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rank: { width: 22, fontWeight: '800', textAlign: 'center' },
  heatRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dayCol: { width: 34, fontSize: 11.5, fontWeight: '600' },
  bandHead: { flex: 1, fontSize: 10, textAlign: 'center' },
  cell: { flex: 1, minHeight: 30, maxHeight: 44, aspectRatio: 1.2, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'flex-end' },
  legendCell: { width: 16, height: 12, borderRadius: 3 },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 10, minHeight: 48 },
});
