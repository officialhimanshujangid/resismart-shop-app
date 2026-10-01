import React, { useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

import { themeColors, radii } from '../../../src/constants/colors';
import { useAuth } from '../../../src/context/AuthContext';
import { AppButton } from '../../../src/components/AppButton';
import { AppInput } from '../../../src/components/AppInput';
import { Screen } from '../../../src/features/more/ui';

/**
 * Change password (POST /auth/change-password).
 *
 * Offered only to an account that HAS a password (`user.hasPassword` from the
 * sign-in, or `hasPassword` from the devices list) — a passwordless partner
 * signs in with a code and has nothing to change (NO_PASSWORD_ON_ACCOUNT).
 *
 * On success the server signs every OTHER device out and hands this one a new
 * session; `changePassword` in AuthContext stores it in place of the old
 * tokens. The minimum is 12 characters (the server's rule; its PASSWORD_POLICY
 * sentence names anything else that is wrong).
 */

const MIN_LENGTH = 12;

export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { changePassword } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string; again?: string }>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; error: boolean } | null>(null);

  const submit = async () => {
    const found: typeof errors = {};
    if (!current) found.current = t('account.password.currentRequired');
    if (next.length < MIN_LENGTH) found.next = t('account.password.tooShort');
    else if (next !== again) found.again = t('account.password.mismatch');
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    setResult(null);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setAgain('');
      setResult({ text: t('account.password.done'), error: false });
    } catch (e) {
      setResult({ text: (e as Error)?.message || t('account.password.failed'), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen c={c} title={t('account.password.title')}>
      <Text style={[styles.body, { color: c.textSecondary }]}>{t('account.password.intro')}</Text>

      <AppInput
        label={t('account.password.current')}
        value={current}
        onChangeText={(v) => { setCurrent(v); setErrors((e) => ({ ...e, current: undefined })); }}
        error={errors.current}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="password"
        leftIcon="lock-outline"
      />
      <AppInput
        label={t('account.password.new')}
        value={next}
        onChangeText={(v) => { setNext(v); setErrors((e) => ({ ...e, next: undefined })); }}
        error={errors.next}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        leftIcon="lock-plus-outline"
      />
      <Text style={[styles.hint, { color: c.textSecondary }]}>{t('account.password.rule')}</Text>
      <AppInput
        label={t('account.password.confirm')}
        value={again}
        onChangeText={(v) => { setAgain(v); setErrors((e) => ({ ...e, again: undefined })); }}
        error={errors.again}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        leftIcon="lock-check-outline"
      />

      {result ? (
        <View
          style={[styles.notice, { backgroundColor: c.surface, borderColor: result.error ? c.error : c.primary }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.body, { color: c.textPrimary }]}>{result.text}</Text>
        </View>
      ) : null}

      <AppButton
        label={t('account.password.submit')}
        icon="lock-reset"
        fullWidth={false}
        style={styles.button}
        loading={busy}
        onPress={() => { void submit(); }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: 13, lineHeight: 19 },
  hint: { fontSize: 12.5, lineHeight: 18, marginTop: -4 },
  notice: { borderWidth: 1, borderRadius: radii.sm, padding: 12 },
  button: { alignSelf: 'flex-start', maxWidth: '100%' },
});
