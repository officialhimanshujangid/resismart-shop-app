import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Portal, Modal, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Href, router } from 'expo-router';

import { themeColors, radii, palette } from '../../../src/constants/colors';
import { usePartnerEntitlements, ModuleMenuEntry } from '../../../src/hooks';
import { useAuth } from '../../../src/context/AuthContext';
import { PartnerModule } from '../../../src/types/api-contract.generated';
import { Card, Row, SectionLabel } from '../../../src/features/more/ui';
import { ContextPicker } from '../../../src/components/ContextPicker';
import { useNotifications } from '../../../src/features/notifications/hooks';

/**
 * The More tab: everything that is not a bottom tab.
 *
 * Two different lists sit on this one screen, and the rule for each is
 * different:
 *
 *   1. `menu` (from `usePartnerEntitlements`) — the gate-2 modules, filtered
 *      to the ones that do NOT already have a bottom tab. Bookings, Orders
 *      and Invoicing, when ON, are reached from their tabs; repeating them
 *      here would be two paths to the same screen and the tab bar would win
 *      every time, making the More row dead weight. When one of THOSE three
 *      is LOCKED it has no tab at all (`(tabs)/_layout.tsx` removes a locked
 *      route from the navigator), so it still has to surface here — LOCKED
 *      is the one state `moduleMenuEntries()` shows regardless of gate 3's
 *      READ/FULL split, and hiding it would mean a partner never learns the
 *      module exists to buy. Catalogue and Promotion never have a tab, so
 *      they always appear, ON or LOCKED.
 *   2. The fixed "Business" rows (Parties/Reports/Staff/Settings) — gate-3
 *      permission only, no plan lock. `PARTNER_MODULE_CATALOG` on the server
 *      does not carry a capability for any of them (see `PARTNER_MODULE_INFO`
 *      in `usePartnerEntitlements.ts`, which only has five keys), so the only
 *      question is "does this role hold READ", never "does the plan sell it".
 *
 * `moduleMenuEntries()` already applies gate 3 first and absolute (a
 * receptionist with no read on a module's permission never sees its row at
 * all, whatever the plan says) — this screen does not re-check it.
 */

/** Modules with their own bottom tab when ON — see the header. */
const TAB_COVERED: ReadonlySet<PartnerModule> = new Set(['BOOKINGS', 'ORDERS', 'INVOICING']);

/**
 * Where a tap on an ON module row goes.
 *
 * Every literal here is checked against `.expo/types/router.d.ts`, so a route
 * that is renamed or deleted breaks the BUILD instead of becoming a dead tap.
 *
 * PROMOTION was `/promotion/index`, which is not a route: expo-router strips a
 * trailing `/index` when it builds a route key (`typed-routes/generate.js`,
 * `groupRouteNodes`). It compiled only because the generated declaration file
 * in the working tree had been hand-written to contain the `/index` spellings
 * — that file is gitignored, so nothing reviewed it.
 *
 * CATALOG returned `null` here, on the belief that `app/(app)/catalog/` was
 * still an empty folder. It is not: `catalog/` holds index/create/[id]/scan,
 * and More is the ONLY way into any of them (catalogue never gets a bottom
 * tab), so `null` made the whole catalogue area — barcode scanner included —
 * unreachable from anywhere in the app.
 */
function destinationFor(module: PartnerModule): '/catalog' | '/promotion' | null {
  switch (module) {
    case 'CATALOG':
      return '/catalog';
    case 'PROMOTION':
      return '/promotion';
    default:
      return null;
  }
}

/**
 * Where a tap on a LOCKED module row goes, which is NOT the same question.
 *
 * A LOCKED row may only navigate to a screen that sells the upgrade itself.
 * `promotion/index.tsx` is the one that does: it reads `boostAvailable`/
 * `upgradeRequired` and draws the upgrade card in place of the buy button,
 * exactly as `getBoostPackages` was built to support (spec: "the packages are
 * returned even when the plan excludes boost").
 *
 * `/catalog` deliberately does NOT qualify even though `destinationFor` has a
 * route for it — `catalog/_layout.tsx` redirects a partner without the module
 * straight back out, so sending a LOCKED Catalogue tap there would bounce them
 * to Today and read as a broken button. Those fall through to the Alert.
 */
function lockedDestinationFor(module: PartnerModule): '/promotion' | null {
  return module === 'PROMOTION' ? '/promotion' : null;
}

function onLockedTap(entry: ModuleMenuEntry) {
  const dest = lockedDestinationFor(entry.module);
  if (dest) {
    router.push(dest);
    return;
  }
  /**
   * Everything else goes to the plan screen.
   *
   * This used to be a native alert ending "ask your ResiSmart contact to
   * upgrade your plan". That sentence was defending the absence of an in-app
   * PURCHASE flow, and that absence is still deliberate — a plan upgrade is a
   * subscription, not a one-off spend like a boost, and this app does not run
   * Razorpay (see `settings/plan.tsx`'s header). But it was doing a second job
   * it was never entitled to do: it was also the app's only answer to "what
   * plan am I on, and what would this cost", and it answered that with a phone
   * call.
   *
   * `settings/plan.tsx` now answers it — current plan, status, renewal date,
   * every module's ON/OFF/LOCKED state, usage against the ceilings, and a link
   * to the web panel where the upgrade is actually bought. A LOCKED row is only
   * ever drawn for somebody holding SETTINGS at FULL (`moduleMenuEntries`), so
   * every partner who can reach this line can reach that screen.
   */
  router.push('/settings/plan');
}

export default function MoreScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { menu, ready, entitlements, can, hasModule } = usePartnerEntitlements();
  const { user, profile, logout, availableContexts, switchToContext } = useAuth();

  /**
   * The unread badge, and the query that finally READS `qk.notifications()`.
   *
   * That key was invalidated by `useLiveEvents` on every SSE frame and by
   * `usePushRegistration` on every push received while the app is open, and no
   * query had ever been registered under it — so both invalidations were no-ops.
   * Mounting the inbox query here means the badge on this row is live whichever
   * tab the partner is standing on, which is the point of putting it on a screen
   * they pass through rather than only inside the inbox itself.
   */
  const notifications = useNotifications();
  const unread = notifications.data?.unread ?? 0;

  /**
   * A partner with two businesses could not switch between them.
   *
   * `availableContexts` was exposed with the comment "for a 'switch shop' menu"
   * and no screen read it. Signing out and back in was the only way across.
   * `ContextPicker` is reused rather than replaced — it is the same list, in the
   * same shape, that the sign-in flow already draws, and two pickers for one
   * decision is how the two come to disagree about what a business looks like.
   */
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  /**
   * The businesses that are NOT the one already open. A picker whose first row
   * is where you already are invites a tap that costs a full session swap, a
   * cleared cache and a push re-registration, and lands you back on the screen
   * you were on.
   *
   * Compared on `contextId` where the stored profile has one — that is the
   * server's own unambiguous handle, and somebody who is PARTNER_ADMIN of one
   * shop and PARTNER_STAFF of another has two contexts that a `tenantId`
   * comparison cannot tell apart. `tenantId` is the fallback for a session
   * persisted by a build that predates contexts.
   */
  const otherContexts = useMemo(
    () =>
      availableContexts.filter((ctx) =>
        profile?.contextId ? ctx.contextId !== profile.contextId : ctx.tenantId !== profile?.tenantId,
      ),
    [availableContexts, profile?.contextId, profile?.tenantId],
  );

  const handleSwitch = useCallback(
    (tenantId: string, role: string) => {
      // Searched within `otherContexts`, not the whole list: the picker is only
      // ever shown those rows, and looking in the full list could resolve a
      // tenantId+role pair back to the context already open.
      const chosen = otherContexts.find((ctx) => ctx.tenantId === tenantId && ctx.role === role);
      if (!chosen) return;
      setSwitching(true);
      switchToContext(chosen.contextId)
        .then(() => setSwitcherOpen(false))
        .catch((e: unknown) =>
          Alert.alert('Could not switch business', e instanceof Error ? e.message : 'Please try again.'),
        )
        .finally(() => setSwitching(false));
    },
    [otherContexts, switchToContext],
  );

  const moduleRows = useMemo(
    () => menu.filter((e) => !(e.state === 'ON' && TAB_COVERED.has(e.module))),
    [menu],
  );

  /**
   * The fixed "Business" rows — gate-3 permission only, no plan lock (see the
   * header). Three of these are NOT `PartnerAccessModule` literals with a
   * matching `can(key, 'READ')` shortcut the way Parties/Reports/Staff/Settings
   * are, so they carry their own `visible` boolean instead of the uniform
   * `.filter(row => can(row.key, 'READ'))` the original four used:
   *
   *   - Payments (C1) — gated the SAME way `billing/_layout.tsx` gates the
   *     whole Billing tree: `INVOICING` module + `INVOICING_VIEW`. Recording
   *     money is part of billing, not a separate permission surface — see
   *     web `payments/page.tsx`'s own header.
   *   - Services (C3) and Availability (C2) — built by this wave's sibling
   *     agent (1C) at `app/(app)/services` and `app/(app)/availability`.
   *     Both sit under the BOOKINGS module gate on the server
   *     (`partner-service.routes.ts`), Services behind `CATALOG_VIEW` (the
   *     service price-list is catalogue data) and Availability behind
   *     `BOOKINGS_VIEW`. Neither has its own bottom tab — like Catalogue,
   *     they are sub-screens of a module that IS tab-covered, so More is the
   *     only path in.
   *
   * These eight were wrapped in `toHref()` rather than written as bare literals,
   * on the reasoning that this file could not know whether 1C's
   * `services`/`availability` routes had been generated yet in a given build.
   * That is no longer true and the wrapper is gone from this file: since
   * `scripts/generate-router-types.js` regenerates the declaration file as a
   * PREREQUISITE of `npm run typecheck`, "not generated yet" is not a state a
   * typecheck can be in. Leaving the cast on would have quietly cancelled the
   * guarantee this header opens with — More is the only path into every one of
   * these eight areas, so a rename that slipped past the compiler here is eight
   * dead taps and no build failure. See `routeHref.ts` for the wrapper's other
   * call sites, which want the same treatment in their own pass.
   */
  const businessRows = useMemo(() => {
    const rows: { key: string; label: string; icon: string; blurb: string; href: Href; visible: boolean }[] = [
      // `/parties`, not `/parties/index`: expo-router strips the trailing
      // `/index` when it builds a route key, so the `/index` spelling these
      // four shipped with matched no route at all and every Business row was
      // a dead tap.
      { key: 'CUSTOMERS', label: 'Parties', icon: 'account-group-outline', blurb: 'Customers, suppliers, and the ones who are both — with their running balance.', href: '/parties', visible: can('CUSTOMERS', 'READ') },
      // C7 — reviews reply. Same `CUSTOMERS` permission row Parties uses;
      // there is no dedicated review permission on the server (see
      // `features/reviews/api.ts`'s header).
      { key: 'REVIEWS', label: 'Reviews', icon: 'star-outline', blurb: 'What residents said after a booking or an order, and your reply to it.', href: '/reviews', visible: can('CUSTOMERS', 'READ') },
      { key: 'PAYMENTS', label: 'Payments', icon: 'cash-multiple', blurb: 'Money in against a sale, money out against a purchase — allocated to what it settles.', href: '/payments', visible: hasModule('INVOICING') && can('INVOICING_VIEW', 'READ') },
      { key: 'SERVICES', label: 'Services', icon: 'clipboard-list-outline', blurb: 'The services you offer, and what each one costs.', href: '/services', visible: hasModule('BOOKINGS') && can('CATALOG_VIEW', 'READ') },
      { key: 'AVAILABILITY', label: 'Availability', icon: 'clock-outline', blurb: 'Your working hours — no hours set, no booking can reach you.', href: '/availability', visible: hasModule('BOOKINGS') && can('BOOKINGS_VIEW', 'READ') },
      { key: 'REPORTS', label: 'Reports', icon: 'chart-line', blurb: 'Sales, purchases, GST returns, outstanding and profit.', href: '/reports', visible: can('REPORTS', 'READ') },
      { key: 'STAFF', label: 'Staff', icon: 'account-tie-outline', blurb: 'Who works here, their roles, and what each role may touch.', href: '/staff', visible: can('STAFF', 'READ') },
      { key: 'SETTINGS', label: 'Settings', icon: 'cog-outline', blurb: 'Business details, how invoices look, and WhatsApp alerts.', href: '/settings', visible: can('SETTINGS', 'READ') },
    ];
    return rows.filter((row) => row.visible);
  }, [can, hasModule]);

  const handleSignOut = () => {
    Alert.alert('Sign out', 'You will need to sign in again to use this app.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { void logout(); } },
    ]);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <View style={styles.headerBlock}>
        <Text style={[styles.title, { color: c.textPrimary }]}>More</Text>
        <Text style={[styles.business, { color: c.textSecondary }]} numberOfLines={1}>
          {profile?.tenantName || 'Your business'}
        </Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {!ready ? (
          <Card c={c}><Text style={{ color: c.textSecondary }}>Loading your menu…</Text></Card>
        ) : (
          <>
            {moduleRows.length > 0 && (
              <>
                <SectionLabel c={c}>Sell more</SectionLabel>
                <Card c={c} style={styles.listCard}>
                  {moduleRows.map((entry, i) => {
                    // Resolved ONCE per row and closed over. Calling
                    // `destinationFor` again inside `onPress` is what forced
                    // the old `as '/promotion/index'` cast — TypeScript cannot
                    // carry the null-check across two separate calls — and
                    // that cast is precisely what let a non-route literal
                    // through the compiler in the first place.
                    const dest = entry.state === 'LOCKED' ? null : destinationFor(entry.module);
                    return (
                      <View key={entry.module}>
                        <Row
                          c={c}
                          icon={entry.icon}
                          title={entry.label}
                          subtitle={
                            entry.state === 'LOCKED'
                              ? `Not on your plan — ${entry.blurb}`
                              : dest
                                ? entry.blurb
                                : `${entry.blurb} (screens for this are being built separately)`
                          }
                          onPress={
                            entry.state === 'LOCKED'
                              ? () => onLockedTap(entry)
                              : dest
                                ? () => router.push(dest)
                                : undefined
                          }
                        />
                        {i < moduleRows.length - 1 && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
                      </View>
                    );
                  })}
                </Card>
              </>
            )}

            {businessRows.length > 0 && (
              <>
                <SectionLabel c={c}>Business</SectionLabel>
                <Card c={c} style={styles.listCard}>
                  {businessRows.map((row, i) => (
                    <View key={row.key}>
                      <Row c={c} icon={row.icon} title={row.label} subtitle={row.blurb} onPress={() => router.push(row.href)} />
                      {i < businessRows.length - 1 && <View style={[styles.divider, { backgroundColor: c.divider }]} />}
                    </View>
                  ))}
                </Card>
              </>
            )}

            {entitlements.awaitingRole && (
              <Card c={c} style={{ backgroundColor: palette.coral.soft }}>
                <Text style={{ color: palette.coral[600], fontWeight: '600' }}>
                  You are on the staff list, but nobody has given you a role yet.
                </Text>
                <Text style={{ color: c.textSecondary, fontSize: 12 }}>
                  Ask a business admin to assign you one under Staff.
                </Text>
              </Card>
            )}

            <SectionLabel c={c}>Account</SectionLabel>
            <Card c={c} style={styles.listCard}>
              <Row c={c} icon="account-circle-outline" title={user?.name || 'Your account'} subtitle={user?.phone || user?.email} />
              <View style={[styles.divider, { backgroundColor: c.divider }]} />
              {/* Not gated on any permission: these are this PERSON's own
                  messages, and `/notifications` is ungated server-side for
                  exactly that reason — a permission check there could only stop
                  somebody reading their own post. */}
              <Row
                c={c}
                icon="bell-outline"
                title="Alerts"
                subtitle={unread > 0 ? `${unread} unread` : 'Bookings, orders and plan notices'}
                right={
                  unread > 0 ? (
                    <View style={[styles.badge, { backgroundColor: c.secondary }]}>
                      <Text style={[styles.badgeText, { color: c.textInverse }]}>
                        {unread > 99 ? '99+' : String(unread)}
                      </Text>
                    </View>
                  ) : undefined
                }
                onPress={() => router.push('/notifications')}
              />
              {otherContexts.length > 0 && (
                <>
                  <View style={[styles.divider, { backgroundColor: c.divider }]} />
                  <Row
                    c={c}
                    icon="store-outline"
                    title="Switch business"
                    subtitle={`You also run ${otherContexts.length === 1 ? otherContexts[0].tenantName : `${otherContexts.length} other businesses`}`}
                    onPress={() => setSwitcherOpen(true)}
                  />
                </>
              )}
              <View style={[styles.divider, { backgroundColor: c.divider }]} />
              <Row c={c} icon="logout" title="Sign out" onPress={handleSignOut} danger />
            </Card>
          </>
        )}
      </ScrollView>

      <Portal>
        <Modal
          visible={switcherOpen}
          onDismiss={() => { if (!switching) setSwitcherOpen(false); }}
          contentContainerStyle={[styles.switcher, { backgroundColor: c.surface }]}
        >
          <Text style={[styles.switcherTitle, { color: c.textPrimary }]}>Switch business</Text>
          <Text style={[styles.switcherBody, { color: c.textSecondary }]}>
            Everything on screen is replaced with the business you pick — bookings, orders, customers and takings.
          </Text>
          {switching ? (
            <ActivityIndicator color={c.primary} style={{ marginVertical: 24 }} />
          ) : (
            /* `ContextPicker` hands back the whole profile row it was given; only
               `tenantId` + `role` identify which one was tapped, and
               `switchToContext` resolves those back to the `contextId` the
               refresh endpoint actually switches by. */
            <ContextPicker
              profiles={otherContexts.map((ctx) => ({
                tenantType: ctx.tenantType,
                tenantId: ctx.tenantId,
                role: ctx.role,
                tenantName: ctx.tenantName,
              }))}
              onSelect={(p) => handleSwitch(p.tenantId, p.role)}
            />
          )}
        </Modal>
      </Portal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBlock: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: '600' },
  business: { fontSize: 13, marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 8, gap: 10 },
  listCard: { padding: 0, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
  badge: { minWidth: 22, height: 22, borderRadius: radii.pill, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  switcher: { margin: 20, borderRadius: radii.sheet, padding: 20, gap: 12 },
  switcherTitle: { fontSize: 18, fontWeight: '700' },
  switcherBody: { fontSize: 12.5, lineHeight: 18 },
});
