import React from 'react';
import { View, useColorScheme } from 'react-native';
import { Stack, Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { HelpButton } from '../../../src/features/help/HelpButton';
import { SkeletonList } from '../../../src/components/ui';

/**
 * The gate for `/services` — this app's C3 price-list screens (list, create,
 * edit). Reached from More, a Stack push rather than a tab, so nothing
 * upstream stops a stale link or a typed deep link from landing here
 * directly — same fail-closed shape as `catalog/_layout.tsx` and
 * `parties/_layout.tsx`.
 *
 * Module `BOOKINGS`, permission `CATALOG_VIEW` — deliberately not
 * `BOOKINGS_VIEW`. `partner-service.routes.ts` explains why: the price list
 * is what `CATALOG_MANAGE` describes ("add and change services, products,
 * prices and stock"); `BOOKINGS_MANAGE` is the diary (accept/reschedule/
 * close), not the prices. Gating on the wrong permission would hand a
 * receptionist who only answers the phone the power to rewrite every price.
 */
export default function ServicesLayout() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { ready, hasModule, can } = usePartnerEntitlements();

  if (!ready) {
    return (
      <View style={{ flex: 1, padding: 18, paddingTop: 64, backgroundColor: c.background }}>
        <SkeletonList rows={4} />
      </View>
    );
  }

  if (!hasModule('BOOKINGS') || !can('CATALOG_VIEW', 'READ')) {
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
      {/* `name` is the route segment and never moves; only the header title is
          translated. */}
      <Stack.Screen name="index" options={{ title: t('services.nav.list'), headerRight: () => <HelpButton c={c} /> }} />
      <Stack.Screen name="create" options={{ title: t('services.nav.create'), presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ title: t('services.nav.detail') }} />
    </Stack>
  );
}
