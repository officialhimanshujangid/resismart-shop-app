import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { ColorScheme, palette } from '../../../constants/colors';
import { formatI18nDate } from '../../../i18n';
import { Card, Row } from '../../more/ui';
import { useMyInvites } from '../hooks';

/**
 * "Invitations for you" — owner invitations sent to THIS person's phone/email
 * (`GET /partner-invites/mine`). Silent when there are none or the read fails:
 * it is an announcement, not a screen, and must never block More.
 */
export function MyInvitationsCard({ c }: { c: ColorScheme }) {
  const { t } = useTranslation();
  const mine = useMyInvites();
  const rows = mine.data ?? [];
  if (rows.length === 0) return null;

  return (
    <Card c={c} style={[styles.card, { borderColor: palette.brand[300] }]}>
      <Text style={[styles.title, { color: c.textPrimary }]}>{t('owners.mine.title', { count: rows.length })}</Text>
      {rows.map((inv, i) => (
        <View key={inv.id}>
          {i > 0 ? <View style={[styles.divider, { backgroundColor: c.divider }]} /> : null}
          <Row
            c={c}
            icon={inv.kind === 'TRANSFER' ? 'swap-horizontal' : 'account-key-outline'}
            title={inv.partnerName}
            subtitle={t(inv.kind === 'TRANSFER' ? 'owners.mine.rowTransfer' : 'owners.mine.rowCoOwner', {
              name: inv.invitedByName,
              date: formatI18nDate(inv.expiresAt, t),
            })}
            onPress={() => router.push({ pathname: '/invites/[id]', params: { id: inv.id } })}
          />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 0, paddingTop: 12, overflow: 'hidden', borderWidth: 1 },
  title: { fontSize: 13, fontWeight: '700', paddingHorizontal: 14 },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 62 },
});
