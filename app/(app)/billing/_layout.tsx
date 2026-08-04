import React from 'react';
import { View, useColorScheme } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { Stack, Redirect } from 'expo-router';
import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';

/**
 * The gate `app/(app)/billing/` has never had.
 *
 * `(tabs)/billing.tsx` is behind `Tabs.Protected`, but that only keeps the TAB
 * off the bar — it does nothing for this directory's own pushed screens
 * (`new`, `drafts`, `[id]`), which expo-router registers the moment the files
 * exist. `catalog/_layout.tsx` closed the identical gap for catalog; this is
 * the same fix for the one pushed tree that had been left without it, so a
 * stale nav stack or a typed deep link can no longer render an invoice to
 * someone with no INVOICING module and no `INVOICING_VIEW`. Fail-closed in the
 * same shape: nothing but a spinner while the answer is outstanding, a
 * redirect the instant it resolves to "no" — never draw the screen first and
 * remove it after. The API enforces this already
 * (`requirePartnerModule('INVOICING')` / `requirePartnerPermission('INVOICING_VIEW')`)
 * — this only keeps the screen itself from being reachable in the meantime.
 *
 * `headerShown: false`, not a header stack like catalog's — every screen in
 * this directory draws its own top bar (back button, title, actions), so a
 * navigation header here would be a second one stacked on the first.
 */
export default function BillingLayout() {
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
    // `/(app)/(tabs)`, not `/(app)`: `(app)/_layout.tsx` is a Stack whose only
    // child is the `(tabs)` group, so `(app)` has no index route of its own
    // and is not a navigable pathname. Redirecting there landed nowhere.
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
