import React from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../../src/constants/colors';
import { StockMovementList } from '../../../../src/features/catalog/components/StockMovementList';
// M20 — DS card look + count-up on the on-hand number (reduce-motion: final at once).
import { useAppTheme } from '../../../../src/theme/useAppTheme';
import { useCountUp } from '../../../../src/theme/motion';
import { fontFamily } from '../../../../src/theme/tokens';

function OnHand({ qty, unit, color }: { qty: number; unit?: string; color: string }) {
  const shown = useCountUp(qty);
  const text = Number.isInteger(qty) ? String(Math.round(shown)) : String(qty);
  return <Text style={[styles.qty, { color }]}>{text}{unit ? ` ${unit}` : ''}</Text>;
}

/** Stock history for ONE product — CONTRACT-partner-P0 §5. Reached from the product screen. */
export default function ProductStockHistoryScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { shadow } = useAppTheme();

  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StockMovementList
        c={c}
        scope="product"
        productId={id}
        header={({ productName, stockQty, unit }) => (
          <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }, shadow('card')]}>
            <View style={styles.cardText}>
              <Text style={[styles.label, { color: c.textSecondary }]}>{t('stockHistory.product')}</Text>
              <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={2}>
                {productName ?? name ?? '—'}
              </Text>
            </View>
            {typeof stockQty === 'number' ? (
              <View style={styles.onHand}>
                <Text style={[styles.label, { color: c.textSecondary }]}>{t('catalog.detail.onHand')}</Text>
                <OnHand qty={stockQty} unit={unit} color={c.textPrimary} />
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
    borderRadius: radii.card, borderWidth: 1,
  },
  cardText: { flex: 1, minWidth: 0 },
  label: { fontSize: 11.5, fontWeight: '600', letterSpacing: 0.2 },
  name: { fontSize: 16, fontWeight: '600', marginTop: 2 },
  onHand: { alignItems: 'flex-end' },
  qty: { fontSize: 22, fontFamily: fontFamily.sora600, marginTop: 2 },
});
