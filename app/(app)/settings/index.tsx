import React from 'react';
import { useColorScheme, View } from 'react-native';
import { router } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { Card, Row, Screen } from '../../../src/features/more/ui';

export default function SettingsHubScreen() {
  const c = themeColors(useColorScheme() === 'dark');
  const { can, entitlements } = usePartnerEntitlements();
  const level = can('SETTINGS', 'FULL') ? 'Manage' : 'View only';

  /**
   * The row's own subtitle carries the state, so a partner who is invisible
   * learns it from the menu rather than by opening every screen looking for the
   * reason nobody is booking them.
   */
  const verificationSubtitle = entitlements.visibility && !entitlements.visibility.discoverable
    ? 'Residents cannot find you yet — see what is missing'
    : entitlements.business?.verificationStatus === 'VERIFIED'
      ? 'Verified. Documents and status'
      : 'Documents and approval status';

  return (
    <Screen c={c} title="Settings" subtitle={level} back={false}>
      <Card c={c} style={{ padding: 0, overflow: 'hidden' }}>
        <Row
          c={c}
          icon="office-building-outline"
          title="Business details"
          subtitle="Legal name, GSTIN, registered address"
          onPress={() => router.push('/settings/business')}
        />
        <View style={{ height: 1, opacity: 0.5 }} />
        <Row
          c={c}
          icon="receipt-text-outline"
          title="Invoice settings"
          subtitle="Theme, numbering, bank details, thermal printing"
          onPress={() => router.push('/settings/invoice')}
        />
        <View style={{ height: 1, opacity: 0.5 }} />
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
        <View style={{ height: 1, opacity: 0.5 }} />
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
        <View style={{ height: 1, opacity: 0.5 }} />
        <Row
          c={c}
          icon="whatsapp"
          title="WhatsApp alerts"
          subtitle="Bookings, orders and plan alerts on WhatsApp"
          onPress={() => router.push('/settings/notifications')}
        />
        <View style={{ height: 1, opacity: 0.5 }} />
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
