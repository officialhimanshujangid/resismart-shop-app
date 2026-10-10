import React, { useState } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { Text } from 'react-native-paper';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { themeColors } from '../../../src/constants/colors';
import { useAuth } from '../../../src/context/AuthContext';
import { AppInput } from '../../../src/components/AppInput';
import { Button, Card } from '../../../src/components/ui';
import { useShake } from '../../../src/components/ui/Feedback';
import { useAppTheme } from '../../../src/theme/useAppTheme';
import { radius, typeScale } from '../../../src/theme/tokens';
import { Rise, useMotionOK } from '../../../src/theme/motion';
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
 *
 * 1R redesign: the three fields in one card, one primary button on the green
 * fill, the result as a soft status banner that slides in (a refusal also
 * shakes the card).
 */

const MIN_LENGTH = 12;

export default function ChangePasswordScreen() {
  const { t } = useTranslation();
  const c = themeColors(useColorScheme() === 'dark');
  const { ds, status, tints } = useAppTheme();
  const motionOK = useMotionOK();
  const shake = useShake();
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
    if (Object.keys(found).length) { shake.shake(); return; }

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
      shake.shake();
    } finally {
      setBusy(false);
    }
  };

  const pair = result?.error ? status.danger : status.success;

  return (
    <Screen c={c} title={t('account.password.title')}>
      <Rise index={0} style={styles.intro}>
        <View style={[styles.introIcon, { backgroundColor: tints.green.from }]}>
          <MaterialCommunityIcons name="shield-lock-outline" size={22} color={tints.green.icon} />
        </View>
        <Text style={[typeScale.detail, styles.flex, { color: ds.muted }]}>{t('account.password.intro')}</Text>
      </Rise>

      <Rise index={1}>
        <Animated.View style={shake.style}>
          <Card padding={16}>
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
            <Text style={[typeScale.caption, styles.hint, { color: ds.muted }]}>{t('account.password.rule')}</Text>
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
          </Card>
        </Animated.View>
      </Rise>

      {result ? (
        <Animated.View
          key={result.text}
          entering={motionOK ? FadeInDown.duration(280) : undefined}
          style={[styles.notice, { backgroundColor: pair.bg }]}
          accessibilityLiveRegion="polite"
        >
          <MaterialCommunityIcons
            name={result.error ? 'alert-circle-outline' : 'check-circle-outline'}
            size={20}
            color={pair.fg}
          />
          <Text style={[typeScale.row, styles.flex, { color: pair.fg }]}>{result.text}</Text>
        </Animated.View>
      ) : null}

      <Rise index={2}>
        <Button
          label={t('account.password.submit')}
          icon="lock-reset"
          fullWidth
          loading={busy}
          onPress={() => { void submit(); }}
        />
      </Rise>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  introIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  hint: { marginTop: -4 },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: radius.row, padding: 14 },
});
