import React from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../../src/constants/colors';
import { StockMovementList } from '../../../../src/features/catalog/components/StockMovementList';

/** Stock history for ONE product — CONTRACT-partner-P0 §5. Reached from the product screen. */
export default function ProductStockHistoryScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StockMovementList
        c={c}
        scope="product"
        productId={id}
        header={({ productName, stockQty, unit }) => (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
            <View style={styles.cardText}>
              <Text style={[styles.label, { color: c.textSecondary }]}>{t('stockHistory.product')}</Text>
              <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={2}>
                {productName ?? name ?? '—'}
              </Text>
            </View>
            {typeof stockQty === 'number' ? (
              <View style={styles.onHand}>
                <Text style={[styles.label, { color: c.textSecondary }]}>{t('catalog.detail.onHand')}</Text>
                <Text style={[styles.qty, { color: c.textPrimary }]}>
                  {stockQty}{unit ? ` ${unit}` : ''}
                </Text>
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: radii.card, borderWidth: StyleSheet.hairlineWidth,
  },
  cardText: { flex: 1, minWidth: 0 },
  label: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.2 },
  name: { fontSize: 16, fontWeight: '600', marginTop: 2 },
  onHand: { alignItems: 'flex-end' },
  qty: { fontSize: 20, fontWeight: '700', marginTop: 2 },
});
