import React from 'react';
import { View, useColorScheme } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { Stack, Redirect } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';

/**
 * The entitlement gate for `reviews/` — C7. See `parties/_layout.tsx` for the
 * full reasoning; same fail-closed shape, same gate-3-only rule: `CUSTOMERS`
 * is a permission row, not a `PartnerModule`, so there is no plan lock to ask
 * about here, only "does this role hold Customers at READ".
 *
 * This screen is reached by a Stack push from More, never by a tab, so
 * `(tabs)/_layout.tsx`'s `Tabs.Protected` never sees it — without a gate here
 * a stale link or a `back` out of a screen pushed before a role changed would
 * walk straight into the customer-facing review list.
 */
export default function ReviewsLayout() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { ready, can } = usePartnerEntitlements();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!can('CUSTOMERS', 'READ')) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}
