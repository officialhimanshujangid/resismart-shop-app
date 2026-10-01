import React from 'react';
import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { Card } from '../../more/ui';

/**
 * The business's admin email, READ-ONLY (CONTRACT-partner-P0 §1). It is the
 * contact for bills and platform notices and grants no access; ownership
 * changes only through the invitations on this screen.
 */
export function AdminContactCard({ c, email }: { c: ColorScheme; email?: string }) {
  const { t } = useTranslation();
  return (
    <Card c={c}>
      <Text style={[styles.label, { color: c.textSecondary }]}>{t('owners.contact.label')}</Text>
      <Text selectable style={[styles.value, { color: c.textPrimary }]} numberOfLines={2}>
        {email || t('owners.contact.none')}
      </Text>
      <Text style={[styles.hint, { color: c.textSecondary }]}>{t('owners.contact.hint')}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 12, fontWeight: '600', letterSpacing: 0.3 },
  value: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17 },
});
