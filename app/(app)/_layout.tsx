import React, { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '../../src/context/AuthContext';
import {
  usePushRegistration,
  useLiveEvents,
  useNotificationTaps,
  usePartnerEntitlements,
} from '../../src/hooks';
import { draftStore } from '../../src/features/billing/draftStore';
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
 * The four app-wide subscriptions are started HERE and nowhere else:
 *
 *   - push registration, so a booking reaches a partner who is not looking;
 *   - the push TAP handler, so the notification they were sent opens the thing
 *     it is about instead of whatever screen was last on top;
 *   - the SSE stream, so one lands on the Today screen without a refresh;
 *   - the offline-draft queue, so a bill written with no signal sends itself
 *     whether or not anybody opens Billing again.
 *
 * All four are one-per-app. Mounted in a tab screen instead they would open
 * one connection per tab, and `sse.service.ts` holds an open response per
 * client in process memory.
 */
export default function AppLayout() {
  const { isAuthenticated, profile } = useAuth();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const queryClient = useQueryClient();

  // In a partner session the tenant IS the partner, so this is the scope every
  // push token and every SSE frame is addressed with.
  const partnerId = profile?.tenantType === 'PARTNER' ? profile.tenantId : null;

  usePushRegistration({ enabled: isAuthenticated, partnerId });
  useLiveEvents(isAuthenticated);

  /**
   * Where a tapped push actually goes — the other half of push registration.
   *
   * Mounted HERE for the same reason the three above are: it is one-per-app, and
   * the response listener is a global subscription. It is also the highest point
   * in the tree that is inside the navigator, which matters — the cold-start tap
   * is read on mount and `router.push` needs a mounted navigator to push at.
   *
   * `hasModule`/`ready` come from the same entitlements query every screen below
   * already reads (react-query dedupes the request), and they are what stop a
   * tap pushing at a route `(tabs)/_layout.tsx` has removed from the navigator.
   */
  const { hasModule, ready } = usePartnerEntitlements({ enabled: isAuthenticated });
  useNotificationTaps({ enabled: isAuthenticated, hasModule, ready });

  /**
   * Start the offline-draft engine for the whole signed-in session.
   *
   * It used to start inside `useOfflineDrafts`, which only three billing
   * screens mount — so the queue that exists precisely for the case where the
   * partner cannot reach the server only ran if they happened to open Billing.
   * Queue a bill in a basement, close the app, come back online and spend the
   * morning in Orders, and the invoice was neither listed anywhere nor sent.
   * Here it loads from disk, subscribes to NetInfo and sweeps on reconnect
   * from the moment the app has a session. `ensureInitialized` is idempotent,
   * so re-running this effect costs nothing.
   */
  useEffect(() => {
    draftStore.setQueryClient(queryClient);
    draftStore.ensureInitialized();
  }, [queryClient]);

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
