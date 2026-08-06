import React, { useMemo } from 'react';
import { Alert, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { themeColors, radii, palette } from '../../../src/constants/colors';
import { usePartnerEntitlements, ModuleMenuEntry } from '../../../src/hooks';
import { useAuth } from '../../../src/context/AuthContext';
import { PartnerModule } from '../../../src/types/api-contract.generated';
import { Card, Row, SectionLabel } from '../../../src/features/more/ui';
import { toHref } from '../../../src/features/billing/routeHref';

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
  // No in-app purchase flow for a base-plan module (Bookings/Catalogue/
  // Orders/Invoicing) — that is a plan upgrade, not a one-off spend like a
  // boost, and this build has no subscription-purchase screen. Say so rather
  // than pretending a tap does something.
  Alert.alert(
    entry.label,
    `${entry.blurb}\n\nYour current plan does not include this. Ask your ResiSmart contact to upgrade your plan to turn it on.`,
  );
}

export default function MoreScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { menu, ready, entitlements, can, hasModule } = usePartnerEntitlements();
  const { user, profile, logout } = useAuth();

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
   * `toHref()` (not a bare string literal) for these three: `.expo/types/router.d.ts`
   * is regenerated from the file system at typecheck time, and this file
   * cannot know whether 1C's `services`/`availability` routes have been
   * generated yet in a given build — see `routeHref.ts`'s header. Cast, not
   * suppressed: `router.push`/`Href` still reject a malformed object.
   */
  const businessRows = useMemo(() => {
    const rows: { key: string; label: string; icon: string; blurb: string; href: ReturnType<typeof toHref>; visible: boolean }[] = [
      // `/parties`, not `/parties/index`: expo-router strips the trailing
      // `/index` when it builds a route key, so the `/index` spelling these
      // four shipped with matched no route at all and every Business row was
      // a dead tap.
      { key: 'CUSTOMERS', label: 'Parties', icon: 'account-group-outline', blurb: 'Customers, suppliers, and the ones who are both — with their running balance.', href: toHref('/parties'), visible: can('CUSTOMERS', 'READ') },
      // C7 — reviews reply. Same `CUSTOMERS` permission row Parties uses;
      // there is no dedicated review permission on the server (see
      // `features/reviews/api.ts`'s header).
      { key: 'REVIEWS', label: 'Reviews', icon: 'star-outline', blurb: 'What residents said after a booking or an order, and your reply to it.', href: toHref('/reviews'), visible: can('CUSTOMERS', 'READ') },
      { key: 'PAYMENTS', label: 'Payments', icon: 'cash-multiple', blurb: 'Money in against a sale, money out against a purchase — allocated to what it settles.', href: toHref('/payments'), visible: hasModule('INVOICING') && can('INVOICING_VIEW', 'READ') },
      { key: 'SERVICES', label: 'Services', icon: 'clipboard-list-outline', blurb: 'The services you offer, and what each one costs.', href: toHref('/services'), visible: hasModule('BOOKINGS') && can('CATALOG_VIEW', 'READ') },
      { key: 'AVAILABILITY', label: 'Availability', icon: 'clock-outline', blurb: 'Your working hours — no hours set, no booking can reach you.', href: toHref('/availability'), visible: hasModule('BOOKINGS') && can('BOOKINGS_VIEW', 'READ') },
      { key: 'REPORTS', label: 'Reports', icon: 'chart-line', blurb: 'Sales, purchases, GST returns, outstanding and profit.', href: toHref('/reports'), visible: can('REPORTS', 'READ') },
      { key: 'STAFF', label: 'Staff', icon: 'account-tie-outline', blurb: 'Who works here, their roles, and what each role may touch.', href: toHref('/staff'), visible: can('STAFF', 'READ') },
      { key: 'SETTINGS', label: 'Settings', icon: 'cog-outline', blurb: 'Business details, how invoices look, and WhatsApp alerts.', href: toHref('/settings'), visible: can('SETTINGS', 'READ') },
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
                <Text style={{ color: palette.coral[600], fontWeight: '700' }}>
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
              <Row c={c} icon="logout" title="Sign out" onPress={handleSignOut} danger />
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBlock: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: '800' },
  business: { fontSize: 13, marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 8, gap: 10 },
  listCard: { padding: 0, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
});
