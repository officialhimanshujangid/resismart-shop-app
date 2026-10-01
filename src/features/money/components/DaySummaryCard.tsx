import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { BILL_OF_SUPPLY_LABEL_KEY, DOCUMENT_TYPE_LABEL_KEY, PartnerDocumentType } from '../../billing/types';
import { Card } from '../../more/ui';
import type { DaySummary } from '../api';

/**
 * The day at a glance (screen S22): sales by kind of bill (a bill of supply
 * reads as one), collections by mode, expenses, and the cash drawer's
 * expected balance — what the counted cash is checked against.
 */
export function DaySummaryCard({ c, s }: { c: ColorScheme; s: DaySummary }) {
  const { t } = useTranslation();
  const salesLabel = (row: DaySummary['sales'][number]) => {
    if (row.printAs && row.printAs.startsWith('BILL_OF_SUPPLY')) return t(BILL_OF_SUPPLY_LABEL_KEY);
    const type = (row.type ?? row.printAs) as PartnerDocumentType | undefined;
    return type && DOCUMENT_TYPE_LABEL_KEY[type] ? t(DOCUMENT_TYPE_LABEL_KEY[type]) : t('money.day.sales');
  };
  const line = (label: string, value: number, tone?: string, testID?: string) => (
    <View style={styles.line} key={label} testID={testID}>
      <Text style={{ color: c.textSecondary, flex: 1 }} numberOfLines={1}>{label}</Text>
      <Text style={{ color: tone ?? c.textPrimary, fontWeight: '600' }}>{formatPaise(value)}</Text>
    </View>
  );
  return (
    <View style={{ gap: 10 }}>
      <Card c={c}>
        <Text style={[styles.title, { color: c.textPrimary }]}>{t('money.day.salesSection')}</Text>
        {s.sales.length === 0 ? <Text style={{ color: c.textSecondary }}>{t('money.day.noSales')}</Text> : null}
        {s.sales.map((r, i) => (
          <View style={styles.line} key={`${r.printAs ?? r.type}-${i}`}>
            <Text style={{ color: c.textSecondary, flex: 1 }} numberOfLines={1}>{t('money.day.salesRow', { label: salesLabel(r), count: r.count })}</Text>
            <Text style={{ color: c.textPrimary, fontWeight: '600' }}>{formatPaise(r.grandPaise)}</Text>
          </View>
        ))}
        {line(t('money.day.creditSales'), s.creditSalesPaise)}
        {line(t('money.day.purchases'), s.purchasesPaise)}
      </Card>
      <Card c={c}>
        <Text style={[styles.title, { color: c.textPrimary }]}>{t('money.day.moneySection')}</Text>
        {s.collections.map((col) => line(t('money.day.collected', { mode: t(`money.mode.${col.mode}`, { defaultValue: col.mode }) }), col.amountPaise, c.success))}
        {line(t('money.day.paidOut'), s.paymentsOutPaise, c.error)}
        {s.expenses.map((e) => line(e.categoryName, e.amountPaise, c.error))}
      </Card>
      <Card c={c}>
        <Text style={[styles.title, { color: c.textPrimary }]}>{t('money.day.drawerSection')}</Text>
        {line(t('money.day.opening'), s.cash.openingPaise)}
        {line(t('money.day.cashIn'), s.cash.inPaise, c.success)}
        {line(t('money.day.cashOut'), s.cash.outPaise, c.error)}
        {line(t('money.day.cashExpenses'), s.cash.expensesPaise, c.error)}
        {line(t('money.day.cashTransfers'), s.cash.transfersPaise)}
        {line(t('money.day.expected'), s.cash.expectedPaise, undefined, 'day-expected')}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 14, fontWeight: '700' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 },
});
