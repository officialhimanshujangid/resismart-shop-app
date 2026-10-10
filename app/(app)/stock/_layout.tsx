import React from 'react';
import { View, useColorScheme } from 'react-native';
import { Stack, Redirect } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { SkeletonList } from '../../../src/components/ui';

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
      <View style={{ flex: 1, padding: 18, paddingTop: 64, backgroundColor: c.background }}>
        <SkeletonList rows={4} />
      </View>
    );
  }
  if (!hasModule('CATALOG') || !(can('STOCK_VIEW', 'READ') || can('STOCK_COUNT', 'FULL'))) {
    return <Redirect href="/(app)/(tabs)" />;
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}
