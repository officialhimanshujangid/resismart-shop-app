import React from 'react';
import { useColorScheme } from 'react-native';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { usePartnerEntitlements } from '../../../src/hooks';
import { themeColors } from '../../../src/constants/colors';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

const tabIcon =
  (name: IconName) =>
  ({ color, size }: { color: string; size: number }) => (
    <MaterialCommunityIcons name={name} size={size} color={color} />
  );

/**
 * The tab bar, gated on `GET /partners/me/entitlements`, FAIL-CLOSED.
 *
 * The rule, and it is the same rule as everywhere else in this project: **a
 * module the partner cannot access is NOT RENDERED**, not rendered-and-disabled.
 * `Tabs.Protected` is how that is enforced rather than a `filter()` over an
 * array of screens — a false guard removes the route from the navigator
 * entirely, so there is no disabled tab to look at AND no reachable URL either.
 * A `href: null` or a greyed-out tab would still tell a receptionist that the
 * business has a Billing screen.
 *
 * Fail-closed means the loading state and the error state are the SAME state:
 *
 *   - `usePartnerEntitlements` reports `ready: false` until an answer arrives
 *     and returns the fully-closed answer on any failure, so every guard below
 *     is false in both cases.
 *   - Today is therefore the only tab on screen while the gate is being
 *     resolved, and it stays the only one if the resolve fails. That is
 *     deliberate: the alternative — draw all five and remove the ones that come
 *     back denied — has already shown the partner's staff a menu that was never
 *     theirs, and on a phone that flash is the most visible thing on the display.
 *   - Today is never guarded. It is the app's floor: an overview a suspended
 *     partner, a staff member awaiting a role, and somebody with no connection
 *     can all be shown, and it is where the reason is explained.
 *
 * There is deliberately NO tab for a PLAN-LOCKED module. Locked is the one case
 * where hiding is wrong — a partner who never learns Promotion exists never buys
 * it — but the place to sell it is the More screen's module list, which draws
 * every entry `moduleMenuEntries()` hands it, LOCKED ones included, with the
 * upgrade card behind them. A tab that opens an advertisement is not a tab.
 *
 * Gate 3 (the person's role) and gate 2 (the module) are BOTH required, and gate
 * 3 is checked first, exactly as `sidebarContent.tsx` does on the web: a
 * receptionist with no BOOKINGS_VIEW does not get a Bookings tab even in a
 * business whose plan includes bookings.
 */
export default function TabsLayout() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { ready, can, hasModule, menu } = usePartnerEntitlements();

  const showBookings = hasModule('BOOKINGS') && can('BOOKINGS_VIEW', 'READ');
  const showOrders = hasModule('ORDERS') && can('ORDERS_VIEW', 'READ');
  const showBilling = hasModule('INVOICING') && can('INVOICING_VIEW', 'READ');

  /**
   * More holds the screens every business has whatever it sells — customers,
   * reports, staff, settings — plus the module list that sells what is locked.
   * It is shown when there is at least one row to put in it, which is what keeps
   * a staff member who is still `awaitingRole` from tapping into an empty page:
   * they have no permissions at all, so nothing qualifies and the tab does not
   * appear. Today explains why.
   */
  const showMore =
    ready &&
    (menu.length > 0 ||
      can('CUSTOMERS', 'READ') ||
      can('REPORTS', 'READ') ||
      can('STAFF', 'READ') ||
      can('SETTINGS', 'READ'));

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textDisabled,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.divider,
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: isDark ? 0.3 : 0.08,
          shadowRadius: 12,
          height: 62,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Today', tabBarIcon: tabIcon('view-dashboard-outline') }}
      />

      <Tabs.Protected guard={showBookings}>
        <Tabs.Screen
          name="bookings"
          options={{ title: 'Bookings', tabBarIcon: tabIcon('calendar-check-outline') }}
        />
      </Tabs.Protected>

      <Tabs.Protected guard={showOrders}>
        <Tabs.Screen
          name="orders"
          options={{ title: 'Orders', tabBarIcon: tabIcon('package-variant-closed') }}
        />
      </Tabs.Protected>

      <Tabs.Protected guard={showBilling}>
        <Tabs.Screen
          name="billing"
          options={{ title: 'Billing', tabBarIcon: tabIcon('receipt') }}
        />
      </Tabs.Protected>

      <Tabs.Protected guard={showMore}>
        <Tabs.Screen
          name="more"
          options={{ title: 'More', tabBarIcon: tabIcon('dots-horizontal') }}
        />
      </Tabs.Protected>
    </Tabs>
  );
}
