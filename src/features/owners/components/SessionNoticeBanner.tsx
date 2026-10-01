import React from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { ColorScheme, radii } from '../../../constants/colors';
import type { SessionNotice } from '../../../context/AuthContext';

/**
 * On the sign-in screen: "you no longer have access" — after a handover, a
 * removal or an archive ended this login's last business. A clear sentence in
 * place of a silent bounce back to sign-in.
 */
export function SessionNoticeBanner({ c, notice, onDismiss }: {
  c: ColorScheme;
  notice: SessionNotice;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const archived = notice === 'ARCHIVED';
  return (
    <View
      style={[styles.box, { backgroundColor: c.warning + '1A', borderColor: c.warning }]}
      accessibilityLiveRegion="polite"
      testID="session-notice"
    >
      <MaterialCommunityIcons name={archived ? 'archive-outline' : 'account-lock-outline'} size={20} color={c.warning} />
      <View style={styles.text}>
        <Text style={[styles.title, { color: c.textPrimary }]}>
          {archived ? t('partnerAccess.archivedTitle') : t('partnerAccess.endedTitle')}
        </Text>
        <Text style={[styles.body, { color: c.textSecondary }]}>
          {archived ? t('partnerAccess.archivedBody') : t('partnerAccess.endedBody')}
        </Text>
      </View>
      <IconButton icon="close" size={18} onPress={onDismiss} accessibilityLabel={t('common.close')} style={styles.close} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderRadius: radii.sm, padding: 12, marginTop: 10 },
  text: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 13.5, fontWeight: '700' },
  body: { fontSize: 12.5, lineHeight: 18 },
  close: { margin: -6 },
});
