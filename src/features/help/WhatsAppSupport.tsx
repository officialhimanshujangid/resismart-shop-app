import React from 'react';
import { Alert, Linking, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../constants/colors';
import { supportWhatsAppUrl } from '../../constants/support';

/**
 * "Still stuck? Chat on WhatsApp" — the way out of Help when the answer is not
 * there. Opens a chat with ResiSmart support, pre-filled with what the partner
 * was looking at (`topic`: a topic title, the screen's topic, or what they
 * searched for), so support does not have to ask.
 */
export function WhatsAppSupport({ c, topic }: { c: ColorScheme; topic?: string | null }) {
  const { t } = useTranslation();
  const about = topic?.trim();

  const open = () => {
    const message = about ? t('help.whatsappMessageAbout', { topic: about }) : t('help.whatsappMessage');
    Linking.openURL(supportWhatsAppUrl(message)).catch(() => {
      Alert.alert(t('help.whatsappFailedTitle'), t('help.whatsappFailedBody'));
    });
  };

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.divider }]}>
      <Text style={[styles.title, { color: c.textPrimary }]}>{t('help.stillStuck')}</Text>
      <Button
        mode="contained"
        icon="whatsapp"
        // M19 colour: WhatsApp's own dark teal — white on it is 7.6:1 (#128C7E was 4.1:1, under AA).
        buttonColor="#075E54"
        textColor="#FFFFFF"
        contentStyle={styles.btnContent}
        labelStyle={styles.btnLabel}
        onPress={open}
      >
        {t('help.chatOnWhatsapp')}
      </Button>
      <Text style={[styles.hours, { color: c.textSecondary }]}>{t('help.supportHours')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card, borderWidth: 1, padding: 16, gap: 10, marginTop: 8 },
  title: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  btnContent: { height: 52 },
  btnLabel: { fontSize: 16 },
  hours: { fontSize: 13, textAlign: 'center' },
});
