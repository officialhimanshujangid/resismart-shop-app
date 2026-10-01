import React, { useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';
import { formatPaise } from '../../../src/lib/money';
import { moneyApi } from '../../../src/features/money/api';
import { Card, ChipRow, EmptyBlock, ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { Banner, StatGrid, StatTile, TwoPane } from '../../../src/features/p1/ui';
import { isoEndOfDay, isoOfDay, monthStartYmd, todayYmd } from '../../../src/features/p1/dates';

/**
 * Profit & loss summary (screen S23): sales, cost of what was sold, gross
 * profit, stock lost or found, expenses by category, net profit. Needs COSTS
 * (a role without it gets 403 COSTS_NOT_PERMITTED, said as sent). Every
 * figure is drawn only if the server sent it.
 */
type Period = 'MONTH' | 'LAST_MONTH' | 'FY';

function windowOf(p: Period, now = new Date()): { from: string; to: string } {
  if (p === 'MONTH') return { from: monthStartYmd(now), to: todayYmd(now) };
  if (p === 'LAST_MONTH') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: todayYmd(start), to: todayYmd(end) };
  }
  const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return { from: todayYmd(new Date(fyStartYear, 3, 1)), to: todayYmd(now) };
}

export default function PnlScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { can } = usePartnerEntitlements();
  const [period, setPeriod] = useState<Period>('MONTH');
  const w = windowOf(period);
  const allowed = can('COSTS', 'READ') && can('REPORTS', 'READ');

  const q = useQuery({
    queryKey: qk.money.pnl(w.from, w.to),
    queryFn: () => moneyApi.pnl({ from: isoOfDay(w.from) as string, to: isoEndOfDay(w.to) as string }),
    enabled: allowed,
  });
  const r = q.data;

  const money = (label: string, v: number | undefined, tone?: string, bold?: boolean, testID?: string) =>
    v === undefined ? null : (
      <View style={styles.line} key={label} testID={testID}>
        <Text style={{ color: bold ? c.textPrimary : c.textSecondary, flex: 1, fontWeight: bold ? '700' : '400' }}>{label}</Text>
        <Text style={{ color: tone ?? c.textPrimary, fontWeight: bold ? '800' : '600' }}>{formatPaise(v)}</Text>
      </View>
    );

  const expensesTotal = r?.expensesPaise ?? r?.expenses?.reduce((s, e) => s + e.amountPaise, 0);
  const net = r?.netProfitPaise;

  return (
    <Screen c={c} title={t('money.pnl')} subtitle={t('money.pnlSub')}>
      <ChipRow
        c={c}
        value={period}
        options={[{ key: 'MONTH', label: t('stock.home.thisMonth') }, { key: 'LAST_MONTH', label: t('money.pnlLastMonth') }, { key: 'FY', label: t('money.pnlFy') }]}
        onChange={setPeriod}
      />
      {!allowed ? (
        <EmptyBlock c={c} icon="lock-outline" title={t('errors.COSTS_NOT_PERMITTED')} />
      ) : q.isPending ? <Loading c={c} /> : q.isError || !r ? (
        <ErrorBlock c={c} message={apiErrorMessage(q.error, t('money.loadFailed'))} onRetry={() => q.refetch()} />
      ) : (
        <TwoPane
          left={(
            <View style={{ gap: 10 }}>
              <StatGrid>
                {r.revenuePaise !== undefined && <StatTile c={c} label={t('money.pnlSales')} value={formatPaise(r.revenuePaise)} />}
                {r.grossProfitPaise !== undefined && <StatTile c={c} label={t('money.pnlGross')} value={formatPaise(r.grossProfitPaise)} />}
                {net !== undefined && <StatTile c={c} label={t('money.pnlNet')} value={formatPaise(net)} tone={net < 0 ? c.error : c.success} testID="pnl-net" />}
              </StatGrid>
              <Card c={c}>
                {money(t('money.pnlSales'), r.revenuePaise)}
                {money(t('money.pnlCogs'), r.cogsPaise !== undefined ? -Math.abs(r.cogsPaise) : undefined, c.error)}
                {money(t('money.pnlGross'), r.grossProfitPaise, undefined, true)}
                {(r.stockAdjustments ?? []).map((a, i) => money(
                  a.label ?? (a.reasonCode ? t(`catalog.stockReason.${a.reasonCode}`, { defaultValue: a.reasonCode }) : t('money.pnlStock')),
                  a.valuePaise, a.valuePaise < 0 ? c.error : c.success, false, `pnl-adj-${i}`,
                ))}
                {r.stockAdjustments === undefined ? money(t('money.pnlStock'), r.stockLossesPaise, c.error) : null}
                {money(t('money.pnlExpenses'), expensesTotal !== undefined ? -Math.abs(expensesTotal) : undefined, c.error)}
                {money(t('money.pnlNet'), net, net !== undefined && net < 0 ? c.error : c.success, true)}
              </Card>
            </View>
          )}
          right={(
            <View style={{ gap: 10 }}>
              {(r.expenses ?? []).length > 0 && (
                <Card c={c}>
                  <Text style={[styles.title, { color: c.textPrimary }]}>{t('money.pnlExpenseSection')}</Text>
                  {r.expenses!.map((e) => money(e.categoryName, e.amountPaise))}
                </Card>
              )}
              {(r.uncostedItems ?? []).length > 0 && (
                <Banner c={c} tone="warn" body={t('money.pnlUncosted', { count: r.uncostedItems!.length, list: r.uncostedItems!.slice(0, 5).map((u) => u.itemName).join(', ') })} />
              )}
              {(r.notes ?? []).map((n, i) => <Text key={i} style={{ color: c.textSecondary, fontSize: 12 }}>{n}</Text>)}
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 14, fontWeight: '700' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 30 },
});
