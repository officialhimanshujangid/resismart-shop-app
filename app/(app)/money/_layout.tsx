import React from 'react';
import { View, useColorScheme } from 'react-native';
import { Stack, Redirect } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { SkeletonList } from '../../../src/components/ui';

/**
 * The gate for `money/` (§8): the INVOICING module plus any money permission —
 * ACCOUNTS (cash book, day summary), EXPENSES_VIEW or EXPENSES_MANAGE. Each
 * screen then hides the parts the person may not use.
 */
export default function MoneyLayout() {
  const c = themeColors(useColorScheme() === 'dark');
  const { ready, can, hasModule } = usePartnerEntitlements();
  if (!ready) {
    return (
      <View style={{ flex: 1, padding: 18, paddingTop: 64, backgroundColor: c.background }}>
        <SkeletonList rows={4} />
      </View>
    );
  }
  const any = can('ACCOUNTS', 'READ') || can('EXPENSES_VIEW', 'READ') || can('EXPENSES_MANAGE', 'FULL');
  if (!hasModule('INVOICING') || !any) return <Redirect href="/(app)/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}
