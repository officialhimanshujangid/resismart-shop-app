import React from 'react';
import { View, useColorScheme } from 'react-native';
import { ActivityIndicator } from 'react-native-paper';
import { Stack, Redirect } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';

/**
 * The entitlement gate for `parties/` — index, new and [id].
 *
 * Same fail-closed shape as `catalog/_layout.tsx`, and it exists for the same
 * reason: these screens are reached by a Stack push from More, never by a tab,
 * so `(tabs)/_layout.tsx`'s `Tabs.Protected` never sees them. Without a gate
 * here the ONLY thing keeping a partner's staff out of the customer ledger was
 * More choosing not to draw the row — a stale link, a deep link, or a `back`
 * out of a screen pushed before a role changed all walk straight in. More's
 * `can(...)` filter is a menu, not a boundary.
 *
 * Gate 3 ONLY. `CUSTOMERS` is a permission row, not a `PartnerModule` — there
 * is no `parties_enabled` capability in `PARTNER_MODULE_INFO`, so "does the
 * plan sell it" is not a question that can be asked here, and calling
 * `hasModule` with anything would be inventing a lock the server does not have.
 *
 * While the answer is outstanding this draws a spinner rather than the screen:
 * `usePartnerEntitlements` reports `ready: false` both while loading and on
 * failure, so a redirect fires only once a real "no" has arrived — and the
 * screen never flashes before it does.
 *
 * `headerShown: false` matches what these screens already had. Before this
 * file existed they inherited `(app)/_layout.tsx`'s Stack, which hides headers
 * because each screen draws its own top bar; a nested Stack with headers on
 * would stack a second one above every one of them.
 */
export default function PartiesLayout() {
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

  if (!can('CUSTOMERS', 'READ')) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }} />;
}
