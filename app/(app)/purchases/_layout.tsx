import React from 'react';
import { View, useColorScheme } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { Stack, Redirect } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';

/**
 * The gate for `purchases/` (CONTRACT-partner-P1 §4.3): the INVOICING module
 * plus PURCHASES_VIEW (derived from INVOICING_VIEW for roles that never named
 * it). Same fail-closed shape as `parties/_layout.tsx` — a spinner until the
 * answer lands, a redirect only on a real "no".
 */
export default function PurchasesLayout() {
  const c = themeColors(useColorScheme() === 'dark');
  const { ready, can, hasModule } = usePartnerEntitlements();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  if (!hasModule('INVOICING') || !can('PURCHASES_VIEW', 'READ')) {
    return <Redirect href="/(app)/(tabs)" />;
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}
