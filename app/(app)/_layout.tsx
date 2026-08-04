import React from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';

import { useAuth } from '../../src/context/AuthContext';
import { usePushRegistration, useLiveEvents } from '../../src/hooks';
import { themeColors } from '../../src/constants/colors';

/**
 * The signed-in shell.
 *
 * A STACK, not the tab bar — the tabs live one level down in `(tabs)/_layout`.
 * Splitting them is what lets a detail screen (a booking, an invoice, the
 * scanner) push over the tab bar instead of being trapped inside one tab; a
 * layout that made `(app)` itself the Tabs navigator had no way to do that, and
 * it is why the P0 `(app)/index.tsx` dashboard was replaced by `(tabs)/index`.
 *
 * Screens other agents add under `app/(app)/` are picked up automatically —
 * expo-router registers every file in the directory, and the entries below only
 * configure presentation. There is nothing to edit here to add a route.
 *
 * The two app-wide subscriptions are started HERE and nowhere else:
 *
 *   - push registration, so a booking reaches a partner who is not looking;
 *   - the SSE stream, so one lands on the Today screen without a refresh.
 *
 * Both are one-per-app. Mounted in a tab screen instead they would open one
 * connection per tab, and `sse.service.ts` holds an open response per client in
 * process memory.
 */
export default function AppLayout() {
  const { isAuthenticated, profile } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);

  // In a partner session the tenant IS the partner, so this is the scope every
  // push token and every SSE frame is addressed with.
  const partnerId = profile?.tenantType === 'PARTNER' ? profile.tenantId : null;

  usePushRegistration({ enabled: isAuthenticated, partnerId });
  useLiveEvents(isAuthenticated);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
