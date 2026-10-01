import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatPaise } from '../../../lib/money';
import { signedQty } from '../../catalog/stockMovements';
import { ChipRow } from '../../more/ui';
import { STOCK_COUNT_REASON_CODES, StockCountLine, StockCountReasonCode } from '../api';

/**
 * A line whose count differs from the system (review step): counted vs system,
 * the difference (and its value, for a viewer holding COSTS), and the reason
 * chips a manager picks before posting.
 */
export function VarianceRow({
  c, line, canSetReason, onReason,
}: {
  c: ColorScheme;
  line: StockCountLine;
  canSetReason: boolean;
  onReason: (code: StockCountReasonCode) => void;
}) {
  const { t } = useTranslation();
  const v = line.varianceQty ?? ((line.countedQty ?? 0) - (line.systemQtyAtStart ?? 0));
  const tone = v < 0 ? c.error : v > 0 ? c.success : c.textSecondary;
  return (
    <View style={[styles.card, { backgroundColor: c.surface }]} testID={`variance-${line.productId}`}>
      <View style={styles.top}>
        <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={2}>{line.productName}</Text>
        <Text style={[styles.diff, { color: tone }]}>{signedQty(v)}</Text>
      </View>
      <Text style={{ color: c.textSecondary, fontSize: 12.5 }}>
        {t('stock.count.countedVsSystem', {
          counted: line.countedQty ?? 0,
          system: line.expectedQtyAtPost ?? line.systemQtyAtStart ?? 0,
          unit: line.unit,
        })}
        {line.varianceValuePaise !== undefined ? ` · ${formatPaise(line.varianceValuePaise)}` : ''}
      </Text>
      {canSetReason ? (
        <ChipRow
          c={c}
          value={line.reasonCode ?? ''}
          options={STOCK_COUNT_REASON_CODES.map((code) => ({ key: code, label: t(`stock.countReason.${code}`) }))}
          onChange={onReason}
        />
      ) : line.reasonCode ? (
        <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t(`stock.countReason.${line.reasonCode}`)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, padding: 12, gap: 8 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  name: { flex: 1, fontSize: 14.5, fontWeight: '600' },
  diff: { fontSize: 18, fontWeight: '700', flexShrink: 0 },
});
