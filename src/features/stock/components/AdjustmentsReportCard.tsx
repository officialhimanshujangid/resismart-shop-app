import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { qk } from '../../../lib/queryKeys';
import { formatPaise } from '../../../lib/money';
import { apiErrorMessage } from '../../../api/axios';
import { Card } from '../../more/ui';
import { isoEndOfDay, isoOfDay } from '../../p1/dates';
import { stockApi } from '../api';

/**
 * Where stock went this period without a sale (screen S8, "shrinkage"): each
 * adjustment reason with its units and — for a viewer holding COSTS — its value.
 * Reason labels share the stock-adjust catalogue plus the count reasons.
 */
export function AdjustmentsReportCard({ c, from, to }: { c: ColorScheme; from: string; to: string }) {
  const { t, i18n } = useTranslation();
  const q = useQuery({
    queryKey: qk.stock.adjustments({ from, to }),
    queryFn: () => stockApi.adjustments({ from: isoOfDay(from), to: isoEndOfDay(to), limit: 1 }),
  });
  const label = (code: string) => {
    const key = `catalog.stockReason.${code}`;
    return i18n.exists(key) ? t(key) : i18n.exists(`stock.countReason.${code}`) ? t(`stock.countReason.${code}`) : code;
  };

  return (
    <Card c={c}>
      <Text style={[styles.title, { color: c.textPrimary }]}>{t('stock.home.adjustmentsTitle')}</Text>
      {q.isPending ? (
        <Text style={{ color: c.textSecondary }}>{t('common.loading')}</Text>
      ) : q.isError ? (
        <Text style={{ color: c.textSecondary }}>{apiErrorMessage(q.error, t('stock.home.adjustmentsFailed'))}</Text>
      ) : !q.data?.byReason?.length ? (
        <Text style={{ color: c.textSecondary }}>{t('stock.home.adjustmentsNone')}</Text>
      ) : (
        q.data.byReason.map((r) => (
          <View key={r.reasonCode} style={styles.row} testID={`adj-${r.reasonCode}`}>
            <Text style={{ color: c.textPrimary, flex: 1 }} numberOfLines={1}>{label(r.reasonCode)}</Text>
            <Text style={{ color: r.qty < 0 ? c.error : c.textPrimary, fontWeight: '600' }}>{r.qty > 0 ? `+${r.qty}` : String(r.qty)}</Text>
            {r.valuePaise !== undefined ? (
              <Text style={{ color: c.textSecondary, minWidth: 90, textAlign: 'right' }}>{formatPaise(r.valuePaise)}</Text>
            ) : null}
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
});
