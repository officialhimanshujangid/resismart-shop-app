import React from 'react';
import { View, useColorScheme } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { Stack, Redirect } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';

/**
 * The entitlement gate for `settings/` — index, business, invoice and
 * notifications. See `parties/_layout.tsx` for the full reasoning; same
 * fail-closed shape, same gate-3-only rule (`SETTINGS` is a permission row, not
 * a `PartnerModule`).
 *
 * READ, not FULL, and the split matters more here than anywhere else: these
 * screens are legitimately readable at READ — `settings/index.tsx` already
 * labels itself "View only" from `can('SETTINGS', 'FULL')` — while GSTIN,
 * invoice numbering and bank details may only be CHANGED at FULL. Turning this
 * layout into a FULL gate would delete a state the screens are built to render.
 */
export default function SettingsLayout() {
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

  if (!can('SETTINGS', 'READ')) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}
