import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import type { StockCountLine } from '../api';

/**
 * One product in a count being taken: what has been counted so far, and (when
 * the count is not blind, or for a manager) what the system said at the start.
 * Tapping the row types a count for the whole shelf (SET) instead of scanning.
 */
export function CountLineRow({
  c, line, onPress,
}: { c: ColorScheme; line: StockCountLine; onPress?: () => void }) {
  const { t } = useTranslation();
  const counted = line.countedQty !== undefined && line.countedQty !== null;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={t('stock.count.typeCountFor', { name: line.productName })}
      style={[styles.row, { backgroundColor: c.surface }]}
      testID={`count-line-${line.productId}`}
    >
      <View style={styles.main}>
        <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={2}>{line.productName}</Text>
        {line.systemQtyAtStart !== undefined ? (
          <Text style={[styles.meta, { color: c.textSecondary }]}>
            {t('stock.count.systemQty', { qty: line.systemQtyAtStart, unit: line.unit })}
          </Text>
        ) : null}
      </View>
      <View style={[styles.badge, { backgroundColor: counted ? c.primary : c.surfaceVariant }]}>
        <Text style={[styles.badgeText, { color: counted ? c.textInverse : c.textSecondary }]}>
          {counted ? String(line.countedQty) : t('stock.count.notCounted')}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radii.card, padding: 12, minHeight: 56 },
  main: { flex: 1, minWidth: 0 },
  name: { fontSize: 14.5, fontWeight: '600' },
  meta: { fontSize: 12, marginTop: 2 },
  badge: { minWidth: 56, minHeight: 36, paddingHorizontal: 10, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  badgeText: { fontSize: 14, fontWeight: '700' },
});
