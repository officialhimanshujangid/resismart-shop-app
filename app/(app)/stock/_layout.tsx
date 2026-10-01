import React from 'react';
import { View, useColorScheme } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { Stack, Redirect } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';

/**
 * The gate for `stock/` (CONTRACT-partner-P1 §5, §6): the CATALOG module plus
 * STOCK_VIEW or STOCK_COUNT (a counter with STOCK_COUNT only may still open a
 * count). Each screen hides what the person may not do.
 */
export default function StockLayout() {
  const c = themeColors(useColorScheme() === 'dark');
  const { ready, can, hasModule } = usePartnerEntitlements();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  if (!hasModule('CATALOG') || !(can('STOCK_VIEW', 'READ') || can('STOCK_COUNT', 'FULL'))) {
    return <Redirect href="/(app)/(tabs)" />;
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}
