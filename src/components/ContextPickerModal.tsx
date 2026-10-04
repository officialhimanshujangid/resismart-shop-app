import React from 'react';
import { StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { Divider, Modal, Portal, Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { ProfileInfo } from '../api/auth.api';
import { themeColors } from '../constants/colors';
import { ContextPicker } from './ContextPicker';
import { LoadingOverlay } from './LoadingOverlay';

/**
 * >>> M01 audit — "Which of your businesses?" as a modal, for the sign-in
 * paths that are NOT the password form: the one-time code (`verify-otp`) and
 * "Restore my account" (`restore-account`).
 *
 * The code screen used to answer a person with two businesses by sending them
 * back to the password form "to pick one" — which a passwordless partner (every
 * one the signup wizard creates) cannot use, and whose own "send me a code"
 * button led straight back here: a loop with no way in. The half-done sign-in is
 * already held by `AuthContext` (`selectContext`), so the picker simply belongs
 * on whichever screen finished the proof. Same words and behaviour as the
 * password form's picker in `login.tsx`.
 */
export function ContextPickerModal({
  visible,
  profiles,
  loading,
  onSelect,
  onCancel,
}: {
  visible: boolean;
  profiles: ProfileInfo[];
  loading: boolean;
  onSelect: (profile: ProfileInfo) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  return (
    <Portal>
      <Modal
        visible={visible}
        // Neither the backdrop nor Android's back button may interrupt a switch already running.
        dismissable={!loading}
        dismissableBackButton={!loading}
        onDismiss={onCancel}
        contentContainerStyle={[styles.modal, { backgroundColor: c.surface }]}
      >
        <Text style={[styles.title, { color: c.textPrimary }]}>{t('auth.login.modalTitle')}</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]}>{t('auth.login.modalSubtitle')}</Text>
        <Divider style={styles.divider} />
        {loading ? (
          <LoadingOverlay visible message={t('auth.login.selectingProfile')} />
        ) : (
          <>
            <ContextPicker profiles={profiles} onSelect={onSelect} />
            <TouchableOpacity onPress={onCancel} activeOpacity={0.7} style={styles.cancel}>
              <Text style={[styles.cancelText, { color: c.textSecondary }]}>{t('auth.login.cancel')}</Text>
            </TouchableOpacity>
          </>
        )}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: { borderRadius: 24, marginHorizontal: 20, padding: 24, gap: 12 },
  title: { fontSize: 20, fontWeight: '600' },
  subtitle: { fontSize: 14 },
  divider: { marginVertical: 4 },
  cancel: { paddingVertical: 12, marginTop: 4 },
  cancelText: { fontWeight: '600', fontSize: 14, textAlign: 'center' },
});
