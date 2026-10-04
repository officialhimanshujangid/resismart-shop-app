import React, { useState } from 'react';
import { ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../src/context/AuthContext';
import { ProfileInfo } from '../../src/api/auth.api';
import { apiErrorMessage } from '../../src/api/axios';
import { AppButton } from '../../src/components/AppButton';
import { Hero } from '../../src/components/Hero';
import { ContextPickerModal } from '../../src/components/ContextPickerModal';
import { themeColors, radii } from '../../src/constants/colors';

/**
 * >>> M01 audit — #46 "Your account is scheduled for deletion on <date>".
 *
 * Reached from any sign-in (password, one-time code, Google) that proved the
 * person but answered 409 ACCOUNT_DELETION_PENDING. The same two choices as
 * the society app and the website:
 *
 *   - "Restore my account" spends the one-time ticket (`POST
 *     /auth/account/restore`) and signs in exactly as the sign-in would have —
 *     the partner-only gate and the business picker included;
 *   - "Continue deleting" changes nothing and goes back to sign-in.
 *
 * The ticket lives in AuthContext memory only, never in the route, so a cold
 * open of this screen with nothing waiting goes back to sign-in.
 */
export default function RestoreAccountScreen() {
  const { t, i18n } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { pendingRestore, restoreAccount, dropRestore, selectContext } = useAuth();

  // Captured once, so the screen does not bounce to sign-in while a picker is open.
  const [deleteAt] = useState(() => pendingRestore?.deleteAt ?? '');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [snack, setSnack] = useState<{ visible: boolean; message: string; error: boolean }>({
    visible: false, message: '', error: false,
  });
  const [picker, setPicker] = useState<{ handle: string; profiles: ProfileInfo[] } | null>(null);
  const [picking, setPicking] = useState(false);

  if (!deleteAt) return <Redirect href="/(auth)/login" />;

  const date = !Number.isNaN(Date.parse(deleteAt))
    ? new Date(deleteAt).toLocaleDateString(i18n.language === 'hi' ? 'hi-IN' : 'en-IN', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : '';

  const show = (message: string, error = false) => setSnack({ visible: true, message, error });

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await restoreAccount();
      // Success: the session opens and `(auth)/_layout` takes this screen away.
      if (result.success) return;
      if (result.requiresContextSelection && result.userId) {
        setPicker({ handle: result.userId, profiles: result.profiles ?? [] });
        return;
      }
      setFailed(true);
      show(result.error ?? t('restoreAccount.failed'), true);
    } finally {
      setBusy(false);
    }
  };

  const pickBusiness = async (profile: ProfileInfo) => {
    if (!picker) return;
    setPicking(true);
    try {
      await selectContext(picker.handle, profile.tenantId, profile.role);
      setPicker(null);
    } catch (err) {
      show(apiErrorMessage(err, t('auth.login.contextFailed')), true);
    } finally {
      setPicking(false);
    }
  };

  /** The account is back either way once restored; leaving the picker means signing in again. */
  const leave = () => {
    dropRestore();
    router.replace('/(auth)/login');
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Hero isDark={isDark} variant="brand" logoSize="medium" style={styles.brandHero} />

        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.error }]}>
          <View style={styles.headRow}>
            <MaterialCommunityIcons name="calendar-clock" size={24} color={c.error} />
            <Text style={[styles.title, { color: c.textPrimary }]} accessibilityRole="header">
              {t('restoreAccount.title')}
            </Text>
          </View>
          <Text style={[styles.body, { color: c.textSecondary }]}>{t('restoreAccount.body', { date })}</Text>
        </View>

        <AppButton
          label={t('restoreAccount.restore')}
          icon="restore"
          loading={busy}
          disabled={busy || failed}
          onPress={() => { void restore(); }}
        />
        <AppButton
          label={failed ? t('restoreAccount.backToSignIn') : t('restoreAccount.keep')}
          mode="outlined"
          icon="arrow-left"
          disabled={busy}
          onPress={leave}
        />
      </ScrollView>

      <ContextPickerModal
        visible={!!picker}
        profiles={picker?.profiles ?? []}
        loading={picking}
        onSelect={(p) => { void pickBusiness(p); }}
        onCancel={() => { if (!picking) leave(); }}
      />

      <Snackbar
        visible={snack.visible}
        onDismiss={() => setSnack((s) => ({ ...s, visible: false }))}
        duration={5000}
        style={{ backgroundColor: snack.error ? c.error : c.success }}
      >
        {snack.message}
      </Snackbar>
    </SafeAreaView>
  );
}

/** LAYOUT ONLY — colours are applied at render (see the note in `login.tsx`). */
const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {
    padding: 22,
    gap: 14,
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  brandHero: { paddingVertical: 24, marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: radii.field, padding: 16, gap: 8 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { flex: 1, fontSize: 20, fontWeight: '600' },
  body: { fontSize: 14, lineHeight: 21 },
});
