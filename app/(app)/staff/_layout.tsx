import React from 'react';
import { View, useColorScheme } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { Stack, Redirect } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';

/**
 * The entitlement gate for `staff/` — index, new and roles. See
 * `parties/_layout.tsx` for the full reasoning; same fail-closed shape, same
 * gate-3-only rule (`STAFF` is a permission row, not a `PartnerModule`).
 *
 * Gated at READ, not FULL, deliberately. `staff/roles.tsx` is where a role's
 * permissions are edited, so FULL is the level that should decide whether the
 * SAVE succeeds — and it does, both in the screens and in
 * `requirePartnerPermission` server-side. Gating the whole tree at FULL here
 * would instead hide the staff list from a supervisor who is allowed to read
 * it, which is a different rule from the one More applies (`can('STAFF',
 * 'READ')`); the two disagreeing is how a row appears in a menu and then
 * bounces when tapped.
 */
export default function StaffLayout() {
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

  if (!can('STAFF', 'READ')) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}
