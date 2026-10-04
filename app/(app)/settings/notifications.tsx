import React from 'react';
import { Alert, StyleSheet, Switch, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { themeColors, palette } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { qk } from '../../../src/lib/queryKeys';
import {
  settingsApi,
  type PartnerWhatsAppEvent,
  type PartnerWhatsAppSettings,
} from '../../../src/api/settings.api';
import { apiErrorCode, apiErrorMessage } from '../../../src/api/axios';
import { Card, ErrorBlock, Loading, Screen, SectionLabel } from '../../../src/features/more/ui';
import { formatI18nDate } from '../../../src/i18n';

/**
 * WhatsApp — TWO separate switches, matching the web page (Owner decision Q4).
 *
 * 1. "Message my customers on WhatsApp" — `customerWhatsApp`, a BUSINESS
 *    setting. Off → nothing from this business goes to its customers on
 *    WhatsApp (booking confirmed/reminder/completion code/cancelled, order
 *    updates, invoices, payment receipts, khata reminders); app notifications
 *    still go. Needs no phone.
 * 2. "WhatsApp alerts to me" — `optedIn`, the signed-in admin's OWN DPDP
 *    consent, recorded against their account phone (`recordConsent`). Needed
 *    for plan and trial reminders to them. It does NOT control customer
 *    messages — this screen used to read as if it did.
 *
 * ResiSmart's platform switch (`PARTNER_WHATSAPP_OFF`) overrides both.
 * Each switch saves on its own, flips at once and rolls back on failure.
 */
type Ctx = { previous?: PartnerWhatsAppSettings };

export default function WhatsAppSettingsScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { can } = usePartnerEntitlements();
  const canEdit = can('SETTINGS', 'FULL');
  const queryClient = useQueryClient();
  const key = qk.whatsappSettings();

  const query = useQuery({ queryKey: key, queryFn: settingsApi.whatsapp.get });

  /** Flip the cached block at once; hand back the snapshot for a rollback. */
  const optimistic = async (patch: Partial<PartnerWhatsAppSettings>): Promise<Ctx> => {
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<PartnerWhatsAppSettings>(key);
    if (previous) queryClient.setQueryData<PartnerWhatsAppSettings>(key, { ...previous, ...patch });
    return { previous };
  };
  const rollback = (ctx: Ctx | undefined, field: 'customerWhatsApp' | 'optedIn') => {
    const prev = ctx?.previous;
    if (!prev) return;
    // Only the field this switch owns — the other switch may have saved meanwhile.
    queryClient.setQueryData<PartnerWhatsAppSettings>(key, (cur) => (cur ? { ...cur, [field]: prev[field] } : prev));
  };

  const saveCustomers = useMutation<PartnerWhatsAppSettings, unknown, boolean, Ctx>({
    mutationFn: (on) => settingsApi.whatsapp.setCustomerWhatsApp(on),
    onMutate: (on) => optimistic({ customerWhatsApp: on }),
    onSuccess: (data) => queryClient.setQueryData(key, data),
    onError: (err, _on, ctx) => {
      rollback(ctx, 'customerWhatsApp');
      Alert.alert(t('settings.whatsapp.couldNotSave'), apiErrorMessage(err, t('settings.whatsapp.couldNotSave')));
    },
  });

  const saveMine = useMutation<PartnerWhatsAppSettings, unknown, boolean, Ctx>({
    mutationFn: (optedIn) => settingsApi.whatsapp.setOptIn(optedIn),
    onMutate: (optedIn) => optimistic({ optedIn }),
    onSuccess: (data) => queryClient.setQueryData(key, data),
    onError: (err, _v, ctx) => {
      rollback(ctx, 'optedIn');
      Alert.alert(
        t('settings.whatsapp.couldNotSave'),
        apiErrorCode(err) === 'PARTNER_WHATSAPP_NO_PHONE'
          ? t('settings.whatsapp.needPhone')
          : apiErrorMessage(err, t('settings.whatsapp.couldNotSave')),
      );
    },
  });

  if (query.isPending) return <Screen c={c} title={t('settings.whatsapp.title')}><Loading c={c} /></Screen>;
  if (query.isError || !query.data) {
    return <Screen c={c} title={t('settings.whatsapp.title')}><ErrorBlock c={c} message={apiErrorMessage(query.error, t('settings.whatsapp.couldNotLoad'))} onRetry={() => query.refetch()} /></Screen>;
  }

  const w = query.data;
  // ResiSmart switched partner WhatsApp off for everyone — not the plan's doing,
  // so "Not on your plan" would send the partner to buy something that won't help.
  const platformOff = w.availableReason === 'PARTNER_WHATSAPP_OFF';
  const readOnlyNote = !canEdit ? (
    // A disabled switch with no reason reads as broken.
    <Text style={{ color: c.textSecondary, fontSize: 12 }}>{t('settings.whatsapp.readOnly')}</Text>
  ) : null;

  return (
    <Screen c={c} title={t('settings.whatsapp.title')}>
      {platformOff && (
        <Card c={c} style={{ backgroundColor: palette.coral.soft }}>
          <Text style={{ color: palette.coral[600], fontSize: 13, fontWeight: '600' }}>{t('errors.PARTNER_WHATSAPP_OFF')}</Text>
        </Card>
      )}
      {!platformOff && !w.configured && (
        <Card c={c} style={{ backgroundColor: palette.coral.soft }}>
          <Text style={{ color: palette.coral[600], fontWeight: '600' }}>{t('settings.whatsapp.notWiredTitle')}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('settings.whatsapp.notWiredBody')}</Text>
        </Card>
      )}
      {!platformOff && w.configured && !w.available && (
        <Card c={c} style={{ backgroundColor: palette.coral.soft }}>
          <Text style={{ color: palette.coral[600], fontWeight: '600' }}>{t('settings.whatsapp.notOnPlanTitle')}</Text>
          <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('settings.whatsapp.notOnPlanBody')}</Text>
        </Card>
      )}

      {/* Card 1 — the business switch: WhatsApp to this business's customers. */}
      <Card c={c}>
        <View style={styles.switchRow}>
          <Text style={{ flex: 1, color: c.textPrimary, fontSize: 15, fontWeight: '600' }}>{t('settings.whatsapp.customerTitle')}</Text>
          <Switch
            value={w.customerWhatsApp}
            disabled={!canEdit || saveCustomers.isPending}
            onValueChange={(v) => saveCustomers.mutate(v)}
            accessibilityLabel={t('settings.whatsapp.customerTitle')}
          />
        </View>
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('settings.whatsapp.customerBlurb')}</Text>
        {readOnlyNote}
        {saveCustomers.isSuccess && !saveCustomers.isPending && (
          <Text style={{ color: c.success, fontSize: 12 }} accessibilityLiveRegion="polite">{t('settings.whatsapp.saved')}</Text>
        )}
      </Card>

      <SectionLabel c={c}>{t('settings.whatsapp.customerMessages')}</SectionLabel>
      <EventList c={c} t={t} events={w.customerEvents} />

      {/* Card 2 — the admin's OWN consent, on their own number. */}
      <Card c={c}>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.textPrimary, fontSize: 15, fontWeight: '600' }}>{t('settings.whatsapp.meTitle')}</Text>
            {w.phone && <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>{t('settings.whatsapp.to', { phone: w.phone })}</Text>}
          </View>
          <Switch
            value={w.optedIn}
            disabled={!canEdit || !w.phone || saveMine.isPending}
            onValueChange={(v) => saveMine.mutate(v)}
            accessibilityLabel={t('settings.whatsapp.meTitle')}
          />
        </View>
        <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('settings.whatsapp.meBlurb')}</Text>
        {!w.phone && (
          <Text style={{ color: palette.coral[600], fontSize: 12 }}>{t('settings.whatsapp.needPhone')}</Text>
        )}
        {/* P1+ review (R+06) — this number replied STOP: nothing reaches it on WhatsApp (web parity). */}
        {w.stoppedAt ? (
          <Text style={{ color: palette.coral[600], fontSize: 12 }} accessibilityLiveRegion="polite">
            {t('settings.whatsapp.stoppedLine', { date: formatI18nDate(w.stoppedAt, t) })}
          </Text>
        ) : null}
        {readOnlyNote}
        {saveMine.isSuccess && !saveMine.isPending && (
          <Text style={{ color: c.success, fontSize: 12 }} accessibilityLiveRegion="polite">{t('settings.whatsapp.saved')}</Text>
        )}
        {w.optedInAt && w.optedIn && (
          <Text style={{ color: c.textDisabled, fontSize: 11 }}>{t('settings.whatsapp.agreedOn', { date: formatI18nDate(w.optedInAt, t) })}</Text>
        )}
        {w.optedOutAt && !w.optedIn && (
          <Text style={{ color: c.textDisabled, fontSize: 11 }}>{t('settings.whatsapp.turnedOffOn', { date: formatI18nDate(w.optedOutAt, t) })}</Text>
        )}
      </Card>

      <SectionLabel c={c}>{t('settings.whatsapp.whatYouGet')}</SectionLabel>
      <EventList c={c} t={t} events={w.events} />
    </Screen>
  );
}

function EventList({ c, t, events }: { c: ReturnType<typeof themeColors>; t: TFunction; events: PartnerWhatsAppEvent[] }) {
  if (events.length === 0) {
    return <Text style={{ color: c.textSecondary, fontSize: 13 }}>{t('settings.whatsapp.nothingConfigured')}</Text>;
  }
  return (
    <Card c={c} style={{ padding: 0 }}>
      {events.map((e, i) => (
        <View key={e.template} style={[styles.eventRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.divider }]}>
          {/* `e.label` is the English template header — a translated name by
              template, falling back to it for a template this build does not know. */}
          <Text style={{ color: c.textPrimary, fontSize: 13, fontWeight: '600' }}>
            {t(`settings.whatsapp.events.${e.template}`, { defaultValue: e.label })}
          </Text>
          {e.audience ? (
            <Text style={{ color: c.textSecondary, fontSize: 12, marginTop: 2 }}>
              {e.audience === 'You'
                ? t('settings.whatsapp.audienceYou')
                : e.audience === 'Customers'
                  ? t('settings.whatsapp.audienceCustomers')
                  : e.audience}
            </Text>
          ) : null}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventRow: { padding: 12 },
});
