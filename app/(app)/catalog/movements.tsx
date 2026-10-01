import React from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { StockMovementList } from '../../../src/features/catalog/components/StockMovementList';

/** The shop-wide stock ledger — every product, newest first, filterable (contract §5). */
export default function StockMovementsScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  return (
    <View style={[styles.root, { backgroundColor: c.background }]}>
      <StockMovementList
        c={c}
        scope="shop"
        header={() => (
          <Text style={[styles.intro, { color: c.textSecondary }]}>{t('stockHistory.shopIntro')}</Text>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  intro: { fontSize: 12.5, lineHeight: 18 },
});
