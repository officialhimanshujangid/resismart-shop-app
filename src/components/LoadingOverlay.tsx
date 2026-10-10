import React from 'react';
import { StyleSheet, View, Modal } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { radius } from '../theme/tokens';
import { useAppTheme } from '../theme/useAppTheme';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

/**
 * Full-screen "please wait" card. D0: theme-aware (it used the light-only
 * `Colors` map, so a phone in dark mode got a white card at every cold start)
 * and on DS v1 tokens — scrim, 28 px glass-card corners, soft shadow.
 */
export function LoadingOverlay({ visible, message }: LoadingOverlayProps) {
  // Resolved INSIDE the component, not as a default parameter: a default is
  // evaluated at module scope where there is no translator and, worse, would be
  // frozen in whichever language was current when this file first loaded.
  const { t } = useTranslation();
  const { ds, shadow } = useAppTheme();
  return (
    <Modal transparent animationType="fade" visible={visible} statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: ds.scrim }]}>
        <View style={[styles.card, { backgroundColor: ds.surface }, shadow('glass')]}>
          <ActivityIndicator size="large" color={ds.primary} />
          <Text style={[styles.message, { color: ds.muted }]}>{message ?? t('components.loading.pleaseWait')}</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: radius.cardLg,
    paddingVertical: 32,
    paddingHorizontal: 40,
    alignItems: 'center',
    gap: 16,
    maxWidth: '86%',
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
});
