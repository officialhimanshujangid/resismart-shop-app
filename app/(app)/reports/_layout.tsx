import React from 'react';
import { View, useColorScheme } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { Stack, Redirect } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';

/**
 * The entitlement gate for `reports/`. See `parties/_layout.tsx` for the full
 * reasoning — same fail-closed shape, same gate-3-only rule (`REPORTS` is a
 * permission row, not a `PartnerModule`), same `headerShown: false` to keep the
 * chrome these screens already draw for themselves.
 *
 * Worth stating for this one in particular: reports are the whole business in
 * numbers — turnover, profit, what every customer still owes. It was the one
 * route tree in the app with no layout guard at all, so a role that had just
 * lost `REPORTS` kept full access to all of it for as long as the screen stayed
 * on the stack.
 */
export default function ReportsLayout() {
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

  if (!can('REPORTS', 'READ')) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}
