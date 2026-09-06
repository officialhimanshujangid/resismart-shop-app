import React from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { router } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { toHref } from '../../../src/features/billing/routeHref';
import { Card, Row, Screen, SectionLabel } from '../../../src/features/more/ui';

export default function SettingsHubScreen() {
  const c = themeColors(useColorScheme() === 'dark');
  const { can, entitlements, moduleState } = usePartnerEntitlements();
  const level = can('SETTINGS', 'FULL') ? 'Manage' : 'View only';

  /**
   * Invoice settings belongs to the INVOICING module, and this row used to
   * ignore that entirely.
   *
   * `partner-billing-settings.routes.ts` sits behind `requirePartnerModule('INVOICING')`,
   * so a partner whose plan does not sell invoicing tapped "Invoice settings",
   * watched a screen open, and got `404 MODULE_NOT_AVAILABLE` from its very
   * first request. That is the error the owner actually hit.
   *
   * The three states are handled the way the rest of the app handles them —
   * `moduleStateOf`, not a second rule invented here:
   *
   *   ON      open the screen.
   *   OFF     drop the row silently. The partner switched invoicing off
   *           themselves and it is one tap away under Modules, two rows down.
   *           A settings screen that keeps arguing with a setting is one people
   *           stop trusting.
   *   LOCKED  KEEP the row, say plainly that the plan does not include it, and
   *           send the tap to the plan screen instead of into a 404. Hiding it
   *           is the wrong answer for LOCKED for the same reason it is wrong in
   *           the More menu: a partner who never learns invoicing exists never
   *           buys it.
   */
  const invoicingState = moduleState('INVOICING');

  /**
   * The row's own subtitle carries the state, so a partner who is invisible
   * learns it from the menu rather than by opening every screen looking for the
   * reason nobody is booking them.
   *
   * THREE states, not two, because the server reports two booleans and they come
   * apart. `discoverable` false is "nobody can find you". `transactable` false
   * with `discoverable` true is the ordinary state of a partner who has just
   * submitted — findable, callable, and not yet bookable — and reading only the
   * first boolean sent every one of them to a row that said "Documents and
   * approval status", which is a filing cabinet rather than an answer to the
   * question they have. `=== false` so an older response, which carries neither
   * field, still falls through to the verification status below.
   */
  const verificationSubtitle = entitlements.visibility?.discoverable === false
    ? 'Residents cannot find you yet — see what is missing'
    : entitlements.visibility?.transactable === false
      ? 'You are live — we are still checking your documents'
      : entitlements.business?.verificationStatus === 'VERIFIED'
        ? 'Verified. Documents and status'
        : 'Documents and approval status';

  const Divider = () => <View style={[styles.divider, { backgroundColor: c.divider }]} />;

  return (
    <Screen c={c} title="Settings" subtitle={level} back={false}>
      <SectionLabel c={c}>Business</SectionLabel>
      <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
        {/* "for your bills" is doing real work in that subtitle. This screen and
            "Address & map pin" below both show City / State / Pincode and they
            write DIFFERENT documents — this one the invoicing identity, that one
            the listing residents search. Somebody who fills in the wrong pair
            gets a success toast and an unchanged checklist. */}
        <Row
          c={c}
          icon="office-building-outline"
          title="Business details"
          subtitle="Legal name, GSTIN and the registered address for your bills"
          onPress={() => router.push('/settings/business')}
        />
        {invoicingState !== 'OFF' && (
          <>
            <Divider />
            <Row
              c={c}
              icon="receipt-text-outline"
              title="Invoice settings"
              subtitle={
                invoicingState === 'LOCKED'
                  ? 'Not on your plan — see what a plan with billing includes'
                  : 'Theme, numbering, bank details, thermal printing'
              }
              onPress={
                invoicingState === 'LOCKED'
                  ? () => router.push(toHref('/settings/plan'))
                  : () => router.push('/settings/invoice')
              }
            />
          </>
        )}
      </Card>

      {/* The plan itself — what it is, what it costs, when it renews, and every
          receipt ResiSmart has issued. Reachable at SETTINGS READ like the rest
          of this hub; the screen withholds the money from anyone the
          `/billing/**` routes will not authorise, rather than hiding itself. */}
      <SectionLabel c={c}>Plan & billing</SectionLabel>
      <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
        <Row
          c={c}
          icon="card-account-details-outline"
          title="Your plan"
          subtitle={
            entitlements.plan.isTrial
              ? 'On trial — see when it ends, and what your plan includes'
              : `${entitlements.plan.name} · renewal, usage and invoices`
          }
          onPress={() => router.push(toHref('/settings/plan'))}
        />
      </Card>

      <SectionLabel c={c}>Getting found</SectionLabel>
      <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
        {/* The map pin had no editor after registration either, and it is the
            field discovery actually measures: `expo-location` and every
            coordinate in this app lived in the signup wizard, which refuses an
            ACTIVE partner. A business with no pin was invisible at every
            distance with nothing on any screen able to change it. */}
        <Row
          c={c}
          icon="map-marker-outline"
          title="Address & map pin"
          subtitle="The listing residents see, and the pin they are measured against"
          onPress={() => router.push('/settings/address')}
        />
        <Divider />
        {/* `serviceModes` had no editor after registration — see the screen's
            own note. It is the field discovery tests, so a partner without it
            is one no resident can be matched to. */}
        <Row
          c={c}
          icon="map-marker-radius-outline"
          title="Where you work"
          subtitle="Customers come to you, you travel to them, or both"
          onPress={() => router.push('/settings/where-you-work')}
        />
        <Divider />
        {/* Where the proprietor sends documents in and reads what ResiSmart
            decided. It had no entry anywhere: documents could only be attached
            inside the signup wizard, which a signed-in partner cannot get back
            to — so a partner who skipped step 5, or who was added by the owner
            console, could not become verified and therefore could never be
            found by a resident. */}
        <Row
          c={c}
          icon="shield-check-outline"
          title="Verification"
          subtitle={verificationSubtitle}
          onPress={() => router.push('/settings/verification')}
        />
      </Card>

      <SectionLabel c={c}>Alerts & modules</SectionLabel>
      <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
        <Row
          c={c}
          icon="whatsapp"
          title="WhatsApp alerts"
          subtitle="Bookings, orders and plan alerts on WhatsApp"
          onPress={() => router.push('/settings/notifications')}
        />
        <Divider />
        {/* C7 — see what this business uses and switch it off/on, matching
            web `settings/modules`. Reachable at READ (this hub's own gate),
            the screen itself requires SETTINGS FULL to change anything. */}
        <Row
          c={c}
          icon="view-grid-outline"
          title="Modules"
          subtitle="Bookings, Catalogue, Orders, Invoicing, Promotion — on or off"
          onPress={() => router.push('/settings/modules')}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
});
