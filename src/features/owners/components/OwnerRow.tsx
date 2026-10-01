import React from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { formatI18nDate } from '../../../i18n';
import type { AdminView } from '../types';
import { Pill } from './Pill';

/** One owner login: name, contact, badges, and remove / leave when allowed. */
export function OwnerRow({
  c, admin, isSelf, canRemove, busy, onRemove,
}: {
  c: ColorScheme;
  admin: AdminView;
  isSelf: boolean;
  /** False for the last owner — the server would refuse (PARTNER_LAST_ADMIN). */
  canRemove: boolean;
  busy: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const contact = [admin.phone, admin.email].filter(Boolean).join(' · ');
  return (
    <View style={styles.row}>
      <View style={[styles.avatar, { backgroundColor: c.surfaceVariant }]}>
        <Text style={[styles.initial, { color: c.primary }]}>{(admin.name || '?').trim().charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.body}>
        <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>
          {admin.name || t('owners.unnamed')}
        </Text>
        {contact ? (
          <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>{contact}</Text>
        ) : null}
        <Text style={[styles.meta, { color: c.textSecondary }]}>
          {t('owners.since', { date: formatI18nDate(admin.since, t) })}
        </Text>
        <View style={styles.pills}>
          {admin.isPrimary ? <Pill c={c} tone="brand" label={t('owners.primary')} /> : null}
          {isSelf ? <Pill c={c} label={t('owners.you')} /> : null}
          {!admin.isActive ? <Pill c={c} tone="bad" label={t('owners.inactive')} /> : null}
        </View>
      </View>
      {canRemove ? (
        <IconButton
          icon={isSelf ? 'logout' : 'account-remove-outline'}
          iconColor={c.error}
          size={20}
          disabled={busy}
          onPress={onRemove}
          accessibilityLabel={isSelf ? t('owners.leave') : t('owners.removeA11y', { name: admin.name })}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 6 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  initial: { fontSize: 16, fontWeight: '700' },
  body: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 12 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  action: { margin: 0 },
});
