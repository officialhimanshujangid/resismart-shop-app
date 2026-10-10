import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { ActivityIndicator, Portal, Modal, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Href, router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { Detail, GroupRow, ListGroup, SectionTitle, SkeletonList, Title } from '../../../src/components/ui';
import { Rise } from '../../../src/theme/motion';
import { useAppTheme } from '../../../src/theme/useAppTheme';
import { usePartnerEntitlements } from '../../../src/hooks'; // X2F: ModuleMenuEntry no longer needed
import { useAuth } from '../../../src/context/AuthContext';
import { PartnerModule } from '../../../src/types/api-contract.generated';
import { ContextPicker } from '../../../src/components/ContextPicker';
import { useNotifications } from '../../../src/features/notifications/hooks';
import { HelpButton } from '../../../src/features/help/HelpButton';
import { MyInvitationsCard } from '../../../src/features/owners/components/MyInvitationsCard';
import { isOwnerSession } from '../../../src/features/owners/access';
import { useMyReach } from '../../../src/features/society/hooks';
import { isSocietyPartner } from '../../../src/features/society/logic';
import { useMyRent } from '../../../src/features/rent/hooks';
import { hasLease, rentAccess } from '../../../src/features/rent/logic';
import { useP2Doors } from '../../../src/features/p2/P2Shortcuts';
import { commerceDoors, useCommerceAccess } from '../../../src/features/commerce/access';

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
 *      every time, making the More row dead weight. Catalogue and Promotion
 *      never have a tab, so they always appear when ON. (X2F: there is no
 *      plan-LOCKED module any more — every plan has every module.)
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

// >>> X2F — the LOCKED-row tap handlers are gone: every partner plan has every
// module (Owner, 2026-10-04), so a module row is only ever ON here.
// <<< X2F

export default function MoreScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { status } = useAppTheme();
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
  /** P3 "Who can find you" — only a business that joined through its society has the choice. */
  const societyPartner = isSocietyPartner(useMyReach().data);
  /** P4 "My shop rent" — only for a business that rents a unit from a society (the list has a lease). */
  const rentCanView = ready && rentAccess(can).canView;
  const hasRent = hasLease(useMyRent(rentCanView).data);

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
          Alert.alert(
            t('more.switchFailedTitle'),
            e instanceof Error ? e.message : t('more.switchFailedBody'),
          ),
        )
        .finally(() => setSwitching(false));
    },
    [otherContexts, switchToContext, t],
  );

  const p2Doors = useP2Doors();
  /** Commerce C3–C6 (CONTRACT-commerce §14): nothing until a feature is on, except the switch screen. */
  const commerceAccess = useCommerceAccess();
  const growDoors = useMemo(() => commerceDoors(commerceAccess), [commerceAccess]);

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
      { key: 'CUSTOMERS', label: t('more.rows.parties'), icon: 'account-group-outline', blurb: t('more.rows.partiesBlurb'), href: '/parties', visible: can('CUSTOMERS', 'READ') },
      // C7 — reviews. There is no review permission on the server:
      // `GET /reviews/mine` answers BOOKINGS_VIEW or ORDERS_VIEW at READ
      // (see `features/reviews/api.ts`'s header), so the row follows that.
      { key: 'REVIEWS', label: t('more.rows.reviews'), icon: 'star-outline', blurb: t('more.rows.reviewsBlurb'), href: '/reviews', visible: can('BOOKINGS_VIEW', 'READ') || can('ORDERS_VIEW', 'READ') },
      { key: 'PAYMENTS', label: t('more.rows.payments'), icon: 'cash-multiple', blurb: t('more.rows.paymentsBlurb'), href: '/payments', visible: hasModule('INVOICING') && can('INVOICING_VIEW', 'READ') },
      // P1 business suite (CONTRACT-partner-P1 §11). Each row follows the same
      // gate its own `_layout.tsx` applies, so a row is never a dead tap.
      { key: 'KHATA', label: t('more.rows.khata'), icon: 'notebook-outline', blurb: t('more.rows.khataBlurb'), href: '/khata', visible: hasModule('INVOICING') && can('CUSTOMERS', 'READ') },
      { key: 'PURCHASES', label: t('more.rows.purchases'), icon: 'truck-outline', blurb: t('more.rows.purchasesBlurb'), href: '/purchases', visible: hasModule('INVOICING') && can('PURCHASES_VIEW', 'READ') },
      { key: 'STOCK', label: t('more.rows.stock'), icon: 'package-variant', blurb: t('more.rows.stockBlurb'), href: '/stock', visible: hasModule('CATALOG') && (can('STOCK_VIEW', 'READ') || can('STOCK_COUNT', 'FULL')) },
      { key: 'MONEY', label: t('more.rows.money'), icon: 'wallet-outline', blurb: t('more.rows.moneyBlurb'), href: '/money', visible: hasModule('INVOICING') && (can('ACCOUNTS', 'READ') || can('EXPENSES_VIEW', 'READ') || can('EXPENSES_MANAGE', 'FULL')) },
      // P4 (CONTRACT-partner-P4 §12 S): "My shop rent", hidden unless the list has a lease.
      { key: 'RENT', label: t('more.rows.rent'), icon: 'storefront-outline', blurb: t('more.rows.rentBlurb'), href: '/rent', visible: rentCanView && hasRent },
      { key: 'SERVICES', label: t('more.rows.services'), icon: 'clipboard-list-outline', blurb: t('more.rows.servicesBlurb'), href: '/services', visible: hasModule('BOOKINGS') && can('CATALOG_VIEW', 'READ') },
      { key: 'AVAILABILITY', label: t('more.rows.availability'), icon: 'clock-outline', blurb: t('more.rows.availabilityBlurb'), href: '/availability', visible: hasModule('BOOKINGS') && can('BOOKINGS_VIEW', 'READ') },
      { key: 'REPORTS', label: t('more.rows.reports'), icon: 'chart-line', blurb: t('more.rows.reportsBlurb'), href: '/reports', visible: can('REPORTS', 'READ') },
      { key: 'STAFF', label: t('more.rows.staff'), icon: 'account-tie-outline', blurb: t('more.rows.staffBlurb'), href: '/staff', visible: can('STAFF', 'READ') },
      // Team → Owners (CONTRACT-partner-P0 §6.1): owner logins, co-owner
      // invitations, handover. The token ROLE decides — no staff grant reaches it.
      { key: 'OWNERS', label: t('more.rows.owners'), icon: 'account-key-outline', blurb: t('more.rows.ownersBlurb'), href: '/owners', visible: isOwnerSession(profile) },
      // P3 (CONTRACT-partner-P3 §11): "More → Who can find you". Lives under
      // `settings/`, so it follows that layout's SETTINGS READ gate.
      { key: 'REACH', label: t('more.rows.reach'), icon: 'account-search-outline', blurb: t('more.rows.reachBlurb'), href: '/settings/reach', visible: societyPartner && can('SETTINGS', 'READ') },
      { key: 'SETTINGS', label: t('more.rows.settings'), icon: 'cog-outline', blurb: t('more.rows.settingsBlurb'), href: '/settings', visible: can('SETTINGS', 'READ') },
    ];
    return rows.filter((row) => row.visible);
    // `t` is a dependency, not decoration: react-i18next hands back a new `t`
    // when the language changes, and without it here the memo would keep
    // serving the eight rows in the language they were first built in.
  }, [can, hasModule, profile, societyPartner, rentCanView, hasRent, t]);

  const handleSignOut = () => {
    Alert.alert(t('more.signOut'), t('more.signOutBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('more.signOut'), style: 'destructive', onPress: () => { void logout(); } },
    ]);
  };

  // M19 redesign (DS v1): grouped lists (one card per section, hairline rows,
  // tinted icon tiles) instead of a card per row inside a card; Sora title;
  // sections rise in one after another; skeleton rows while the menu loads.
  let section = 0;
  const nextRise = () => Math.min(section++, 6);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top']}>
      <View style={[styles.headerBlock, styles.headerRow]}>
        <View style={{ flex: 1 }}>
          <Title>{t('more.title')}</Title>
          <Detail numberOfLines={1} style={styles.business}>
            {profile?.tenantName || t('more.yourBusiness')}
          </Detail>
        </View>
        <HelpButton c={c} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {!ready ? (
          <View accessibilityLabel={t('more.loadingMenu')}>
            <SkeletonList rows={6} />
          </View>
        ) : (
          <>
            {/* Owner invitations sent to this person — accept one here. */}
            {/* Not wrapped in Rise: it renders nothing when there is no invitation, and an empty wrapper would leave a gap. */}
            <MyInvitationsCard c={c} />

            {moduleRows.length > 0 && (
              <Rise index={nextRise()}>
                <ListGroup title={t('more.sellMoreSection')}>
                  {moduleRows.map((entry) => {
                    // Resolved ONCE per row and closed over (typed-route literal, see `destinationFor`).
                    const dest = destinationFor(entry.module); // X2F: no LOCKED rows
                    // `entry.label` / `entry.blurb` are the English wiring table; the
                    // catalogue is keyed off `entry.module` like settings/modules.tsx.
                    const blurb = t(`modules.${entry.module}.blurb`);
                    return (
                      <GroupRow
                        key={entry.module}
                        icon={entry.icon}
                        tint="teal"
                        title={t(`modules.${entry.module}.label`)}
                        detail={dest ? blurb : t('more.notBuiltSubtitle', { blurb })}
                        onPress={dest ? () => router.push(dest) : undefined}
                      />
                    );
                  })}
                </ListGroup>
              </Rise>
            )}

            {/* P2: the business-type modules this business switched on — nothing otherwise. */}
            {p2Doors.length > 0 && (
              <Rise index={nextRise()}>
                <ListGroup title={t('p2.doors.section')}>
                  {p2Doors.map((door) => (
                    <GroupRow key={door.key} icon={door.icon} tint="violet" title={t(door.labelKey)} detail={t(door.blurbKey)} onPress={() => router.push(door.href)} />
                  ))}
                </ListGroup>
              </Rise>
            )}

            {growDoors.length > 0 && (
              <Rise index={nextRise()}>
                <ListGroup title={t('commerce.doors.section')}>
                  {growDoors.map((door) => (
                    <GroupRow key={door.key} icon={door.icon} tint="amber" title={t(door.labelKey)} detail={t(door.blurbKey)} onPress={() => router.push(door.href)} />
                  ))}
                </ListGroup>
              </Rise>
            )}

            {businessRows.length > 0 && (
              <Rise index={nextRise()}>
                <ListGroup title={t('more.businessSection')}>
                  {businessRows.map((row) => (
                    <GroupRow key={row.key} icon={row.icon} title={row.label} detail={row.blurb} onPress={() => router.push(row.href)} />
                  ))}
                </ListGroup>
              </Rise>
            )}

            {entitlements.awaitingRole && (
              <Rise index={nextRise()}>
                {/* Status pair, not the fixed light coral: correct in light AND dark. */}
                <View
                  accessibilityRole="alert"
                  style={[styles.notice, { backgroundColor: status.warn.bg, borderColor: status.warn.fg }]}
                >
                  <Text style={[styles.noticeTitle, { color: status.warn.fg }]}>{t('more.awaitingRoleTitle')}</Text>
                  <Text style={[styles.noticeBody, { color: c.textPrimary }]}>{t('more.awaitingRoleBody')}</Text>
                </View>
              </Rise>
            )}

            <Rise index={nextRise()}>
              <ListGroup title={t('more.accountSection')}>
                <GroupRow icon="account-circle-outline" tint="blue" title={user?.name || t('more.yourAccount')} detail={user?.phone || user?.email} />
                {/* Not gated on any permission: these are this PERSON's own messages. */}
                <GroupRow
                  icon="bell-outline"
                  tint="blue"
                  title={t('more.alerts')}
                  detail={unread > 0 ? t('more.unread', { count: unread }) : t('more.alertsSub')}
                  trailing={
                    unread > 0 ? (
                      <View style={[styles.badge, { backgroundColor: c.secondary }]}>
                        <Text style={[styles.badgeText, { color: c.textInverse }]}>
                          {unread > 99 ? '99+' : String(unread)}
                        </Text>
                      </View>
                    ) : undefined
                  }
                  chevron
                  onPress={() => router.push('/notifications')}
                />
                {otherContexts.length > 0 ? (
                  <GroupRow
                    icon="store-outline"
                    tint="blue"
                    title={t('more.switchBusiness')}
                    // One business is named; several are counted. `tenantName` is the server's own text.
                    detail={
                      otherContexts.length === 1
                        ? t('more.alsoRunNamed', { name: otherContexts[0].tenantName })
                        : t('more.alsoRunOthers', { count: otherContexts.length })
                    }
                    onPress={() => setSwitcherOpen(true)}
                  />
                ) : null}
                {/* Help (PLAN-02). Ungated: the server filters each article by role. */}
                <GroupRow icon="help-circle-outline" tint="sky" title={t('help.moreRowTitle')} detail={t('help.moreRowSub')} onPress={() => router.push('/help')} />
                {/* Sign-in security — this PERSON's own login, so ungated. */}
                <GroupRow icon="cellphone-link" tint="blue" title={t('more.devicesRow')} detail={t('more.devicesRowSub')} onPress={() => router.push('/account/devices')} />
                {user?.hasPassword ? (
                  <GroupRow icon="lock-reset" tint="blue" title={t('more.changePasswordRow')} detail={t('more.changePasswordRowSub')} onPress={() => router.push('/account/change-password')} />
                ) : null}
                <GroupRow icon="logout" title={t('more.signOut')} onPress={handleSignOut} danger />
                {/* Delete account (Google Play's in-app deletion rule) — last, below Sign out. */}
                <GroupRow
                  icon="account-remove-outline"
                  title={t('more.deleteAccount')}
                  detail={t('more.deleteAccountSub')}
                  onPress={() => router.push('/account/delete')}
                  danger
                />
              </ListGroup>
            </Rise>
          </>
        )}
      </ScrollView>

      <Portal>
        <Modal
          visible={switcherOpen}
          onDismiss={() => { if (!switching) setSwitcherOpen(false); }}
          contentContainerStyle={[styles.switcher, { backgroundColor: c.surface, borderColor: c.border }]}
        >
          <SectionTitle>{t('more.switchBusiness')}</SectionTitle>
          <Detail style={styles.switcherBody}>{t('more.switcherBody')}</Detail>
          {switching ? (
            <ActivityIndicator color={c.primary} style={{ marginVertical: 24 }} />
          ) : (
            /* `ContextPicker` hands back the whole profile row; `tenantId` + `role`
               identify the tap and `switchToContext` resolves them to a `contextId`. */
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
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 12 },
  business: { marginTop: 2 },
  scroll: { flex: 1 },
  // Bottom room so the last row (Delete account) never sits under the floating tab bar's shadow.
  scrollContent: { padding: 16, paddingTop: 8, paddingBottom: 32, gap: 18 },
  notice: { borderRadius: radii.card, borderWidth: 1, padding: 14, gap: 4 },
  noticeTitle: { fontSize: 14, fontWeight: '700' },
  noticeBody: { fontSize: 13, lineHeight: 19 },
  badge: { minWidth: 22, height: 22, borderRadius: radii.pill, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  switcher: { margin: 20, borderRadius: radii.sheet, borderWidth: 1, padding: 20, gap: 12 },
  switcherBody: { lineHeight: 18 },
});
