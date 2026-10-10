import React from 'react';
import { Tabs } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { usePartnerEntitlements } from '../../../src/hooks';
import { useOfflineDrafts } from '../../../src/features/billing/useOfflineDrafts';
import { useNotifications } from '../../../src/features/notifications/hooks';
import { FloatingTabBar } from '../../../src/components/ui/FloatingTabBar';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

// D0 (Design System v1): the bar is drawn by `FloatingTabBar` — a floating
// glass pill with the active tab as a solid green pill. It sizes itself to its
// content and the system font scale, so the old fixed-height constants
// (TAB_LABEL_LINE / TAB_BAR_CHROME) are gone with the default bar.

const tabIcon = (name: IconName) => {
  // Named so React DevTools and `react/display-name` can identify it.
  const TabIcon = ({ color, size }: { color: string; size: number }) => (
    <MaterialCommunityIcons name={name} size={size} color={color} />
  );
  return TabIcon;
};

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
 * >>> X2F — there is no PLAN-LOCKED module any more: every partner plan has
 * every module (Owner, 2026-10-04) and the plan limits catalogue items only. A
 * module tab shows when the business has switched it on and the role may read it.
 * <<< X2F
 *
 * Gate 3 (the person's role) and gate 2 (the module) are BOTH required, and gate
 * 3 is checked first, exactly as `sidebarContent.tsx` does on the web: a
 * receptionist with no BOOKINGS_VIEW does not get a Bookings tab even in a
 * business whose plan includes bookings.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const { ready, can, hasModule, menu } = usePartnerEntitlements();

  /**
   * Bills written offline that have not reached the server yet.
   *
   * On the tab rather than only inside Billing because an unsent invoice is
   * exactly the thing a partner will not think to go and look for — it was
   * "saved" as far as they saw. The engine that fills this runs app-wide from
   * `(app)/_layout.tsx`, so the count is live whichever tab they are standing
   * on. Reading the store costs one `useSyncExternalStore` subscription; there
   * is no request behind it.
   */
  const { pendingCount } = useOfflineDrafts();

  /**
   * Unread alerts, on the tab that holds the inbox.
   *
   * On the TAB rather than only inside the inbox for the same reason the
   * offline-draft count is: an alert that arrived while the phone was in a
   * drawer is exactly the thing nobody thinks to go and look for. Until this
   * phase there was no inbox at all, so anything not caught as a banner was
   * simply lost.
   *
   * This is the one request the tab bar makes on its own. It is small, it is the
   * same `qk.notifications()` cache the More row and the inbox read (react-query
   * dedupes), and it is what finally gives the two existing invalidations —
   * `useLiveEvents` on every SSE frame, `usePushRegistration` on every push
   * received in the foreground — something to invalidate.
   */
  const notifications = useNotifications();
  const unread = notifications.data?.unread ?? 0;

  const showBookings = hasModule('BOOKINGS') && can('BOOKINGS_VIEW', 'READ');
  const showOrders = hasModule('ORDERS') && can('ORDERS_VIEW', 'READ');
  const showBilling = hasModule('INVOICING') && can('INVOICING_VIEW', 'READ');

  /**
   * More holds the screens every business has whatever it sells — customers,
   * reports, staff, settings — plus the switched-on modules without a tab (X2F).
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
      // Design System v1 floating bar. Which tabs exist is still decided only by
      // the `Tabs.Protected` guards below; the bar renders whatever routes the
      // navigator holds and emits the default tabPress / tabLongPress events.
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.today'), tabBarIcon: tabIcon('view-dashboard-outline') }}
      />

      {/* The three module tabs take their names from `modules.<KEY>.label`,
          the same catalogue entries the More menu, Settings → Modules and the
          plan screen read. A module that is called one thing on its tab and
          another in the menu that sells it is the drift that four separate
          copies of the word invite. */}
      {/* D0: order follows the ShopHome template — Today · Orders · Bill ·
          Bookings · More. Same five routes, same guards. */}
      <Tabs.Protected guard={showOrders}>
        <Tabs.Screen
          name="orders"
          options={{ title: t('modules.ORDERS.label'), tabBarIcon: tabIcon('package-variant-closed') }}
        />
      </Tabs.Protected>

      <Tabs.Protected guard={showBilling}>
        <Tabs.Screen
          name="billing"
          options={{
            title: t('modules.INVOICING.label'),
            tabBarIcon: tabIcon('receipt'),
            tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
          }}
        />
      </Tabs.Protected>

      <Tabs.Protected guard={showBookings}>
        <Tabs.Screen
          name="bookings"
          options={{ title: t('modules.BOOKINGS.label'), tabBarIcon: tabIcon('calendar-check-outline') }}
        />
      </Tabs.Protected>

      <Tabs.Protected guard={showMore}>
        <Tabs.Screen
          name="more"
          options={{
            title: t('tabs.more'),
            tabBarIcon: tabIcon('dots-horizontal'),
            tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
          }}
        />
      </Tabs.Protected>
    </Tabs>
  );
}
