import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme } from '../../../constants/colors';
import { Card } from '../../more/ui';

/**
 * The two ways ownership changes. Buttons size to their labels and wrap onto a
 * second line on a narrow phone — never stretched edge to edge on a tablet.
 * The re-rented-shop sentence sits right next to "Hand over", as the contract asks.
 */
export function OwnerActionsCard({
  c, transferPending, onInvite, onTransfer,
}: {
  c: ColorScheme;
  transferPending: boolean;
  onInvite: () => void;
  onTransfer: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card c={c}>
      <Text style={[styles.title, { color: c.textPrimary }]}>{t('owners.actions.title')}</Text>
      <View style={styles.buttons}>
        <Button mode="contained" icon="account-plus-outline" onPress={onInvite} style={styles.btn}>
          {t('owners.actions.invite')}
        </Button>
        <Button
          mode="outlined"
          icon="swap-horizontal"
          onPress={onTransfer}
          disabled={transferPending}
          textColor={c.error}
          style={[styles.btn, { borderColor: transferPending ? c.divider : c.error }]}
        >
          {t('owners.actions.transfer')}
        </Button>
      </View>
      {transferPending ? (
        <Text style={[styles.hint, { color: c.warning }]}>{t('errors.PARTNER_TRANSFER_ALREADY_PENDING')}</Text>
      ) : null}
      <Text style={[styles.hint, { color: c.textSecondary }]}>{t('owners.actions.rerent')}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 15, fontWeight: '600' },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  btn: { borderRadius: 12 },
  hint: { fontSize: 12, lineHeight: 17 },
});
