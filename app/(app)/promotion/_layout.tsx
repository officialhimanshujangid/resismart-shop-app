import React from 'react';
import { View, useColorScheme } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { Stack, Redirect } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';

/**
 * The entitlement gate for `promotion/`. Same fail-closed shape as
 * `parties/_layout.tsx`, with ONE deliberate difference from
 * `catalog/_layout.tsx`, and getting it wrong breaks a feature rather than
 * leaking one:
 *
 * catalog checks `hasModule('CATALOG') && can('CATALOG_VIEW', 'READ')`.
 * This one checks the PERMISSION ONLY and never `hasModule('PROMOTION')`,
 * because promotion is the single place in this app where a LOCKED module is
 * supposed to be reachable. `more.tsx` routes a LOCKED Promotion row straight
 * here on purpose, and `promotion/index.tsx` reads `boostAvailable`/
 * `upgradeRequired` and draws the upgrade card in place of the buy button —
 * that is what `getBoostPackages` deliberately omitting
 * `requirePartnerModule('PROMOTION')` on the server exists to support. A
 * `hasModule` check here would bounce exactly the partner the screen was
 * written to sell to, and the upsell would silently stop working.
 *
 * Gate 3 still applies in full: a receptionist with no `PROMOTION` permission
 * has no business on a screen that spends the business's money, and
 * `can('PROMOTION', 'FULL')` inside the screen is what separates looking from
 * buying.
 */
export default function PromotionLayout() {
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

  if (!can('PROMOTION', 'READ')) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}
