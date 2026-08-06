import React from 'react';
import { View, useColorScheme } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { Stack, Redirect } from 'expo-router';
import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';

/**
 * Same fail-closed gate as `billing/_layout.tsx`, and the same permission —
 * per `frontend/.../partner/payments/page.tsx`'s own header: "Gate 3 for this
 * screen is `INVOICING_*`, not a payments-specific key: recording money
 * against a document is part of billing, not a separate permission surface."
 * `INVOICING_VIEW` opens the list; `INVOICING_MANAGE` (checked per-screen)
 * is what lets a payment actually be recorded or cancelled.
 */
export default function PaymentsLayout() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { ready, hasModule, can } = usePartnerEntitlements();

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  if (!hasModule('INVOICING') || !can('INVOICING_VIEW', 'READ')) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.background },
      }}
    />
  );
}
