import React from 'react';
import { Linking, Share, StyleSheet, View, useColorScheme } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../constants/colors';
import { inviteLink, whatsappShareUrl } from '../logic';
import type { CreatedInvite } from '../types';

/**
 * Right after an invitation is created: the link, ONCE. The token cannot be
 * read back later (contract §2.2), so this sheet says so and offers WhatsApp
 * and the system share sheet (which also has "Copy"). The link text itself is
 * selectable for a long-press copy.
 */
export function ShareInviteDialog({ created, businessName, onDone }: {
  created: CreatedInvite | null;
  businessName: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const link = created ? inviteLink(created.token) : '';
  const message = created
    ? t(created.invite.kind === 'TRANSFER' ? 'owners.share.messageTransfer' : 'owners.share.messageCoOwner', {
        name: created.invite.toName, business: businessName, link,
      })
    : '';

  const openWhatsApp = () => {
    void Linking.openURL(whatsappShareUrl(message, created?.invite.toPhone)).catch(() => {
      void Share.share({ message });
    });
  };

  return (
    <Portal>
      <Dialog visible={created !== null} onDismiss={onDone} style={[styles.dialog, { backgroundColor: c.surface }]}>
        <Dialog.Title style={{ color: c.textPrimary }}>{t('owners.share.title')}</Dialog.Title>
        <Dialog.Content style={styles.content}>
          <Text style={[styles.body, { color: c.textSecondary }]}>
            {t('owners.share.body', { name: created?.invite.toName ?? '' })}
          </Text>
          <View style={[styles.linkBox, { backgroundColor: c.surfaceVariant, borderColor: c.border }]}>
            <Text selectable style={[styles.link, { color: c.textPrimary }]} testID="invite-link">{link}</Text>
          </View>
          <Text style={[styles.once, { color: c.warning }]}>{t('owners.share.onceOnly')}</Text>
          <Text style={[styles.body, { color: c.textSecondary }]}>{t('owners.share.codeNote')}</Text>
        </Dialog.Content>
        <Dialog.Actions style={styles.actions}>
          <Button icon="whatsapp" onPress={openWhatsApp}>{t('owners.share.whatsapp')}</Button>
          <Button icon="share-variant" onPress={() => void Share.share({ message })}>{t('owners.share.shareOrCopy')}</Button>
          <Button mode="contained" onPress={onDone}>{t('common.done')}</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: { width: '92%', maxWidth: 560, alignSelf: 'center' },
  content: { gap: 10 },
  body: { fontSize: 13, lineHeight: 19 },
  linkBox: { borderRadius: radii.sm, borderWidth: StyleSheet.hairlineWidth, padding: 10 },
  link: { fontSize: 12.5 },
  once: { fontSize: 12.5, fontWeight: '600', lineHeight: 18 },
  actions: { flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4, paddingHorizontal: 12 },
});
