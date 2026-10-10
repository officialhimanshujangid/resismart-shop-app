import React from 'react';
import { Alert, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { themeColors } from '../../../src/constants/colors';
import { usePartnerEntitlements } from '../../../src/hooks';
import { useIsOnline } from '../../../src/hooks/useIsOnline';
import { qk } from '../../../src/lib/queryKeys';
import {
  settingsApi,
  type PartnerWhatsAppEvent,
  type PartnerWhatsAppSettings,
} from '../../../src/api/settings.api';
import { apiErrorCode, apiErrorMessage } from '../../../src/api/axios';
import { ErrorBlock, Loading, Screen } from '../../../src/features/more/ui';
import { Card, SkeletonList } from '../../../src/components/ui';
import { GroupRow, ListGroup, ToggleRow } from '../../../src/components/ui/ListGroup';
import { useAppTheme } from '../../../src/theme/useAppTheme';
import { radius, typeScale } from '../../../src/theme/tokens';
import { Rise } from '../../../src/theme/motion';
import { formatI18nDate } from '../../../src/i18n';

/**
 * WhatsApp — TWO separate switches, matching the web page (Owner decision Q4).
 *
 * 1. "Message my customers on WhatsApp" — `customerWhatsApp`, a BUSINESS
 *    setting. Off → nothing from this business goes to its customers on
 *    WhatsApp; app notifications still go. Needs no phone.
 * 2. "WhatsApp alerts to me" — `optedIn`, the signed-in admin's OWN DPDP
 *    consent, recorded against their account phone. It does NOT control
 *    customer messages.
 *
 * ResiSmart's platform switch (`PARTNER_WHATSAPP_OFF`) overrides both.
 * Each switch saves on its own, flips at once and rolls back on failure.
 *
 * 1R redesign: each switch is a toggle row in its own card, the event lists
 * are grouped rows, notices are soft status cards; sections rise in.
 */
type Ctx = { previous?: PartnerWhatsAppSettings };

export default function WhatsAppSettingsScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { ds, status } = useAppTheme();
  const online = useIsOnline();
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

  if (query.isPending) {
    return (
      <Screen c={c} title={t('settings.whatsapp.title')}>
        {/* Skeleton while it loads; offline keeps the shared "waiting for signal" words. */}
        {online ? <SkeletonList rows={3} /> : <Loading c={c} />}
      </Screen>
    );
  }
  if (query.isError || !query.data) {
    return <Screen c={c} title={t('settings.whatsapp.title')}><ErrorBlock c={c} message={apiErrorMessage(query.error, t('settings.whatsapp.couldNotLoad'))} onRetry={() => query.refetch()} /></Screen>;
  }

  const w = query.data;
  // ResiSmart switched partner WhatsApp off for everyone — not the plan's doing,
  // so "Not on your plan" would send the partner to buy something that won't help.
  const platformOff = w.availableReason === 'PARTNER_WHATSAPP_OFF';
  const readOnlyNote = !canEdit ? (
    // A disabled switch with no reason reads as broken.
    <Text style={[typeScale.caption, { color: ds.muted }]}>{t('settings.whatsapp.readOnly')}</Text>
  ) : null;
  const saved = (
    <View style={styles.savedRow} accessibilityLiveRegion="polite">
      <MaterialCommunityIcons name="check-circle" size={16} color={status.success.fg} />
      <Text style={[typeScale.caption, { color: status.success.fg }, { flexShrink: 1 }]}>{t('settings.whatsapp.saved')}</Text>
    </View>
  );

  const Notice = ({ title, body }: { title: string; body?: string }) => (
    <View style={[styles.notice, { backgroundColor: status.warn.bg }]}>
      <MaterialCommunityIcons name="alert-outline" size={20} color={status.warn.fg} />
      <View style={styles.flex}>
        {/* Words in ink: the warn amber is under 4.5:1 as small text on its own ground. */}
        <Text style={[typeScale.row, { color: ds.ink }]}>{title}</Text>
        {body ? <Text style={[typeScale.detail, { color: ds.ink }]}>{body}</Text> : null}
      </View>
    </View>
  );

  return (
    <Screen c={c} title={t('settings.whatsapp.title')}>
      {platformOff ? (
        <Rise index={0}><Notice title={t('errors.PARTNER_WHATSAPP_OFF')} /></Rise>
      ) : null}
      {!platformOff && !w.configured ? (
        <Rise index={0}><Notice title={t('settings.whatsapp.notWiredTitle')} body={t('settings.whatsapp.notWiredBody')} /></Rise>
      ) : null}
      {!platformOff && w.configured && !w.available ? (
        <Rise index={0}><Notice title={t('settings.whatsapp.notOnPlanTitle')} body={t('settings.whatsapp.notOnPlanBody')} /></Rise>
      ) : null}

      {/* Card 1 — the business switch: WhatsApp to this business's customers. */}
      <Rise index={1}>
        <Card padding={0}>
          <ToggleRow
            icon="account-group-outline"
            title={t('settings.whatsapp.customerTitle')}
            value={w.customerWhatsApp}
            disabled={!canEdit || saveCustomers.isPending}
            onValueChange={(v) => saveCustomers.mutate(v)}
            accessibilityLabel={t('settings.whatsapp.customerTitle')}
          />
          <View style={styles.cardFoot}>
            <Text style={[typeScale.detail, { color: ds.muted }]}>{t('settings.whatsapp.customerBlurb')}</Text>
            {readOnlyNote}
            {saveCustomers.isSuccess && !saveCustomers.isPending ? saved : null}
          </View>
        </Card>
      </Rise>

      <Rise index={2}>
        <EventList t={t} title={t('settings.whatsapp.customerMessages')} events={w.customerEvents} />
      </Rise>

      {/* Card 2 — the admin's OWN consent, on their own number. */}
      <Rise index={3}>
        <Card padding={0}>
          <ToggleRow
            icon="cellphone-message"
            tint="blue"
            title={t('settings.whatsapp.meTitle')}
            detail={w.phone ? t('settings.whatsapp.to', { phone: w.phone }) : undefined}
            value={w.optedIn}
            disabled={!canEdit || !w.phone || saveMine.isPending}
            onValueChange={(v) => saveMine.mutate(v)}
            accessibilityLabel={t('settings.whatsapp.meTitle')}
          />
          <View style={styles.cardFoot}>
            <Text style={[typeScale.detail, { color: ds.muted }]}>{t('settings.whatsapp.meBlurb')}</Text>
            {!w.phone ? (
              <Text style={[typeScale.caption, { color: status.danger.fg }]}>{t('settings.whatsapp.needPhone')}</Text>
            ) : null}
            {/* P1+ review (R+06) — this number replied STOP: nothing reaches it on WhatsApp (web parity). */}
            {w.stoppedAt ? (
              <Text style={[typeScale.caption, { color: status.danger.fg }]} accessibilityLiveRegion="polite">
                {t('settings.whatsapp.stoppedLine', { date: formatI18nDate(w.stoppedAt, t) })}
              </Text>
            ) : null}
            {readOnlyNote}
            {saveMine.isSuccess && !saveMine.isPending ? saved : null}
            {w.optedInAt && w.optedIn ? (
              <Text style={[typeScale.caption, { color: ds.muted }]}>{t('settings.whatsapp.agreedOn', { date: formatI18nDate(w.optedInAt, t) })}</Text>
            ) : null}
            {w.optedOutAt && !w.optedIn ? (
              <Text style={[typeScale.caption, { color: ds.muted }]}>{t('settings.whatsapp.turnedOffOn', { date: formatI18nDate(w.optedOutAt, t) })}</Text>
            ) : null}
          </View>
        </Card>
      </Rise>

      <Rise index={4}>
        <EventList t={t} title={t('settings.whatsapp.whatYouGet')} events={w.events} />
      </Rise>
    </Screen>
  );
}

function EventList({ t, title, events }: { t: TFunction; title: string; events: PartnerWhatsAppEvent[] }) {
  const { ds } = useAppTheme();
  if (events.length === 0) {
    return (
      <View style={styles.emptyList}>
        <Text style={[typeScale.section, { color: ds.ink }]}>{title}</Text>
        <Text style={[typeScale.detail, { color: ds.muted }]}>{t('settings.whatsapp.nothingConfigured')}</Text>
      </View>
    );
  }
  return (
    <ListGroup title={title}>
      {events.map((e) => (
        // `e.label` is the English template header — a translated name by
        // template, falling back to it for a template this build does not know.
        <GroupRow
          key={e.template}
          icon="message-text-outline"
          tint="teal"
          title={t(`settings.whatsapp.events.${e.template}`, { defaultValue: e.label })}
          detail={
            e.audience
              ? e.audience === 'You'
                ? t('settings.whatsapp.audienceYou')
                : e.audience === 'Customers'
                  ? t('settings.whatsapp.audienceCustomers')
                  : e.audience
              : undefined
          }
        />
      ))}
    </ListGroup>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: radius.row, padding: 14 },
  cardFoot: { paddingHorizontal: 16, paddingBottom: 14, gap: 6 },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emptyList: { gap: 6, paddingHorizontal: 4 },
});
