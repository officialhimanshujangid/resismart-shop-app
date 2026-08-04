import React from 'react';
import { View, useColorScheme } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { Stack, Redirect } from 'expo-router';
import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';

/**
 * The catalog's own header stack, nested under `(app)/_layout`'s Stack —
 * expo-router picks this up automatically because it sits at
 * `app/(app)/catalog/_layout.tsx`. Gives the four catalog screens a real
 * header (title + back button) independently of the tab bar, which hides its
 * own headers (`(tabs)/_layout.tsx` sets `headerShown: false`).
 *
 * Also the gate. `(tabs)/_layout.tsx` uses `Tabs.Protected` so a module the
 * partner cannot access never becomes a tab — but catalog is reached from
 * More's own module list (a Stack push, not a tab), so nothing upstream stops
 * a stale link or a typed deep link from landing here directly. Same rule,
 * same fail-closed shape as the tab bar: while the answer is loading, show
 * nothing but a spinner; the moment it resolves to "no", redirect rather than
 * flash the screen first. The API would 404 every request anyway
 * (`requirePartnerModule('CATALOG')` / `requirePartnerPermission('CATALOG_VIEW')`)
 * — this only stops the screen from being reachable at all in the meantime.
 */
export default function CatalogLayout() {
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

  if (!hasModule('CATALOG') || !can('CATALOG_VIEW', 'READ')) {
    // `/(app)/(tabs)`, not `/(app)`: `(app)/_layout.tsx` is a Stack whose only
    // child is the `(tabs)` group, so `(app)` has no index route of its own
    // and is not a navigable pathname. Redirecting there landed nowhere.
    return <Redirect href="/(app)/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.surface },
        headerTintColor: c.textPrimary,
        headerTitleStyle: { fontWeight: '800' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Catalog' }} />
      <Stack.Screen name="create" options={{ title: 'New product', presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ title: 'Product' }} />
      <Stack.Screen name="scan" options={{ title: 'Scan', headerShown: false }} />
    </Stack>
  );
}
