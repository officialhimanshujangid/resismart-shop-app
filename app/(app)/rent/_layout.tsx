import React from 'react';
import { View, useColorScheme } from 'react-native';
import { Stack, Redirect } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { rentAccess } from '../../../src/features/rent/logic';
import { SkeletonList } from '../../../src/components/ui';

/**
 * The gate for `rent/` — "My shop rent" (CONTRACT-partner-P4 §10.8 / §12 S).
 * The route's own rule, no module gate: the proprietor, or a role that sees the
 * shop's money (INVOICING_VIEW, EXPENSES_VIEW or ACCOUNTS at READ). A notification
 * tap from somebody else lands on Today instead of a 403.
 */
export default function RentLayout() {
  const c = themeColors(useColorScheme() === 'dark');
  const { ready, can } = usePartnerEntitlements();
  if (!ready) {
    return (
      <View style={{ flex: 1, padding: 18, paddingTop: 64, backgroundColor: c.background }}>
        <SkeletonList rows={4} />
      </View>
    );
  }
  if (!rentAccess(can).canView) return <Redirect href="/(app)/(tabs)" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}
