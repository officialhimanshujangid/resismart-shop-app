import React from 'react';
import { View, useColorScheme } from 'react-native';
import { Stack, Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { SkeletonList } from '../../../src/components/ui';

/**
 * The gate for `/availability` — C2, working hours. Reached from More, a
 * Stack push rather than a tab, so nothing upstream stops a stale or deep
 * link from landing here directly — same fail-closed shape as
 * `services/_layout.tsx` and `catalog/_layout.tsx`.
 *
 * Module `BOOKINGS`, permission `BOOKINGS_VIEW`/`BOOKINGS_MANAGE` — the
 * mirror split from services: opening hours are the diary, not the price
 * list, so this screen is gated on `partnerAvailabilityRouter`'s own
 * permission (`BOOKINGS_*`), not `CATALOG_*`.
 */
export default function AvailabilityLayout() {
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

  if (!hasModule('BOOKINGS') || !can('BOOKINGS_VIEW', 'READ')) {
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
          translated — the same split `services/_layout.tsx` draws. */}
      <Stack.Screen name="index" options={{ title: t('availability.nav.title') }} />
    </Stack>
  );
}
