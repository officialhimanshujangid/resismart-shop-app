import React from 'react';
import { View, useColorScheme } from 'react-native';
import { IconButton } from 'react-native-paper';
import { Stack, Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { HelpButton } from '../../../src/features/help/HelpButton';
import { SkeletonList } from '../../../src/components/ui';

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
  const { t } = useTranslation();
  const { ready, hasModule, can } = usePartnerEntitlements();

  if (!ready) {
    return (
      <View style={{ flex: 1, padding: 18, paddingTop: 64, backgroundColor: c.background }}>
        <SkeletonList rows={4} />
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
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: t('catalog.nav.index'),
          // The shop-wide stock ledger (contract §5) lives one tap from the list.
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <IconButton
                icon="history"
                size={22}
                onPress={() => router.push('/catalog/movements')}
                accessibilityLabel={t('stockHistory.navShop')}
                style={{ margin: 0 }}
              />
              <HelpButton c={c} />
            </View>
          ),
        }}
      />
      {/* >>> MP1-COMPLETE — the "?" on add / edit product too (help for this screen via its pathname). */}
      <Stack.Screen name="create" options={{ title: t('catalog.nav.create'), presentation: 'modal', headerRight: () => <HelpButton c={c} /> }} />
      <Stack.Screen name="[id]" options={{ title: t('catalog.nav.detail'), headerRight: () => <HelpButton c={c} /> }} />
      {/* <<< MP1-COMPLETE */}
      <Stack.Screen name="scan" options={{ title: t('catalog.nav.scan'), headerShown: false }} />
      <Stack.Screen name="history/[id]" options={{ title: t('stockHistory.navProduct') }} />
      <Stack.Screen name="movements" options={{ title: t('stockHistory.navShop') }} />
    </Stack>
  );
}
