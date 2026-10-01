import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import { formatI18nDate } from '../../../i18n';
import { shownStatus } from '../logic';
import type { InviteView } from '../types';
import { Pill, statusTone } from './Pill';

/**
 * One invitation. Pending rows carry Resend / Cancel as compact text buttons on
 * their own line (they wrap, never push the row off-screen at 320dp).
 */
export function InviteRow({
  c, invite, busy, onCancel, onResend,
}: {
  c: ColorScheme;
  invite: InviteView;
  busy?: boolean;
  onCancel?: () => void;
  onResend?: () => void;
}) {
  const { t } = useTranslation();
  const status = shownStatus(invite);
  const contact = [invite.toPhone, invite.toEmail].filter(Boolean).join(' · ');
  const pending = status === 'PENDING';
  const when = pending
    ? t('owners.expires', { date: formatI18nDate(invite.expiresAt, t) })
    : invite.closedAt || invite.acceptedAt
      ? t('owners.closedOn', { date: formatI18nDate(invite.acceptedAt ?? invite.closedAt, t) })
      : t('owners.sentOn', { date: formatI18nDate(invite.createdAt, t) });

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
      <View style={styles.pills}>
        <Pill c={c} tone={invite.kind === 'TRANSFER' ? 'bad' : 'brand'} label={t(`owners.kind.${invite.kind}`, { defaultValue: invite.kind })} />
        <Pill c={c} tone={statusTone(status)} label={t(`owners.status.${status}`, { defaultValue: status })} />
      </View>
      <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>{invite.toName}</Text>
      {contact ? <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>{contact}</Text> : null}
      <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={2}>
        {t('owners.invitedBy', { name: invite.invitedByName })} · {when}
      </Text>
      {invite.note ? (
        <Text style={[styles.note, { color: c.textSecondary }]} numberOfLines={3}>“{invite.note}”</Text>
      ) : null}
      {!pending && invite.closedReason ? (
        <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={2}>{invite.closedReason}</Text>
      ) : null}
      {pending && (onCancel || onResend) ? (
        <View style={styles.actions}>
          {onResend ? (
            <Pressable onPress={onResend} disabled={busy} hitSlop={6} accessibilityRole="button" style={styles.action}>
              <Text style={[styles.actionText, { color: busy ? c.textDisabled : c.primary }]}>{t('owners.resend')}</Text>
            </Pressable>
          ) : null}
          {onCancel ? (
            <Pressable onPress={onCancel} disabled={busy} hitSlop={6} accessibilityRole="button" style={styles.action}>
              <Text style={[styles.actionText, { color: busy ? c.textDisabled : c.error }]}>{t('owners.cancelInvite')}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 3 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  name: { fontSize: 14.5, fontWeight: '600' },
  meta: { fontSize: 12 },
  note: { fontSize: 12, fontStyle: 'italic', marginTop: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 18, marginTop: 6 },
  action: { paddingVertical: 4 },
  actionText: { fontSize: 13, fontWeight: '600' },
});
