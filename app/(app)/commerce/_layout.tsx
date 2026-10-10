import React from 'react';
import { View, useColorScheme } from 'react-native';
import { Stack } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { SkeletonList } from '../../../src/components/ui';

/**
 * `commerce/` — the online-shop upgrade's shop screens (CONTRACT-commerce §14,
 * C3–C6): Online shop settings, Offers, Store credit & points, Send offer,
 * Insights, Quick keys.
 *
 * No single gate here: each screen needs a different module + role row (see
 * `features/commerce/access.ts`), so each screen decides for itself and draws
 * "not for your role" / "switched off" in place — a notification tap or a deep
 * link never lands on a 403. This layout only holds the stack until the
 * entitlement answer is in.
 */
export default function CommerceLayout() {
  const c = themeColors(useColorScheme() === 'dark');
  const { ready } = usePartnerEntitlements();
  if (!ready) {
    return (
      <View style={{ flex: 1, padding: 18, paddingTop: 64, backgroundColor: c.background }}>
        <SkeletonList rows={4} />
      </View>
    );
  }
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}
