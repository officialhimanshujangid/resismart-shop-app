import React from 'react';
import { Alert, StyleSheet, Switch, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { themeColors, palette } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import { settingsApi } from '../../../src/api/settings.api';
import { apiErrorMessage } from '../../../src/api/axios';
import { Card, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';

/**
 * WhatsApp opt-in — DPDP consent, not a display preference. `optedIn` is
 * recorded against the signed-in person's own account phone
 * (`recordConsent`), not against the business, matching the server's own
 * comment on why: it is the signed-in person's number that agreed.
 */
export default function WhatsAppSettingsScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const canEdit = can('SETTINGS', 'FULL');
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: qk.whatsappSettings(), queryFn: settingsApi.whatsapp.get });

  const save = useMutation({
    mutationFn: (optedIn: boolean) => settingsApi.whatsapp.setOptIn(optedIn),
    onSuccess: (data) => queryClient.setQueryData(qk.whatsappSettings(), data),
    onError: (err) => Alert.alert('Could not save', apiErrorMessage(err)),
  });

  if (query.isPending) return <Screen c={c} title="WhatsApp alerts"><Loading c={c} /></Screen>;
  if (query.isError || !query.data) {
    return <Screen c={c} title="WhatsApp alerts"><ErrorBlock c={c} message={apiErrorMessage(query.error, 'Could not load this.')} onRetry={() => query.refetch()} /></Screen>;
  }

  const w = query.data;

  return (
    <Screen c={c} title="WhatsApp alerts">
      {!w.configured && (
        <Card c={c} style={{ backgroundColor: palette.coral.soft }}>
          <Text style={{ color: palette.coral[600], fontWeight: '700' }}>Not wired up yet</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>WhatsApp is not connected on this install. This switch will do nothing until it is.</Text>
        </Card>
      )}
      {w.configured && !w.available && (
        <Card c={c} style={{ backgroundColor: palette.coral.soft }}>
          <Text style={{ color: palette.coral[600], fontWeight: '700' }}>Not on your plan</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>Upgrade your plan to receive alerts on WhatsApp.</Text>
        </Card>
      )}
      {!w.phone && (
        <Card c={c}>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>Add a phone number to your account before turning this on.</Text>
        </Card>
      )}

      <Card c={c}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.textPrimary, fontSize: 15, fontWeight: '700' }}>Send me alerts on WhatsApp</Text>
            {w.phone && <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>To {w.phone}</Text>}
          </View>
          <Switch
            value={w.optedIn}
            disabled={!canEdit || !w.phone || save.isPending}
            onValueChange={(v) => save.mutate(v)}
          />
        </View>
        {w.optedInAt && w.optedIn && (
          <Text style={{ color: c.textDisabled, fontSize: 11 }}>Agreed on {new Date(w.optedInAt).toLocaleDateString('en-IN')}</Text>
        )}
        {w.optedOutAt && !w.optedIn && (
          <Text style={{ color: c.textDisabled, fontSize: 11 }}>Turned off on {new Date(w.optedOutAt).toLocaleDateString('en-IN')}</Text>
        )}
      </Card>

      <SectionLabel c={c}>What you'll get</SectionLabel>
      {w.events.length === 0 ? (
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>Nothing configured yet.</Text>
      ) : (
        <Card c={c} style={{ padding: 0 }}>
          {w.events.map((e, i) => (
            <View key={e.template} style={[styles.eventRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
              <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>{e.label}</Text>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventRow: { padding: 12 },
});
