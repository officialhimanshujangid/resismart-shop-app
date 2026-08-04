import React from 'react';
import { useColorScheme, View } from 'react-native';
import { router } from 'expo-router';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { Card, Row, Screen } from '../../../src/features/more/ui';

export default function SettingsHubScreen() {
  const c = themeColors(useColorScheme() === 'dark');
  const { can } = usePartnerEntitlements();
  const level = can('SETTINGS', 'FULL') ? 'Manage' : 'View only';

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
        <Row
          c={c}
          icon="whatsapp"
          title="WhatsApp alerts"
          subtitle="Bookings, orders and plan alerts on WhatsApp"
          onPress={() => router.push('/settings/notifications')}
        />
      </Card>
    </Screen>
  );
}
