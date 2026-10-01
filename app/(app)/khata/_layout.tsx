import React from 'react';
import { View, useColorScheme } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { Stack, Redirect } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';

/** The gate for `khata/` (§7.2): the INVOICING module plus CUSTOMERS at READ. */
export default function KhataLayout() {
  const c = themeColors(useColorScheme() === 'dark');
  const { ready, can, hasModule } = usePartnerEntitlements();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }
  if (!hasModule('INVOICING') || !can('CUSTOMERS', 'READ')) return <Redirect href="/(app)/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}
