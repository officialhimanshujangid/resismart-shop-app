import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { Text, Snackbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { authApi } from '../../src/api/auth.api';
import { apiErrorMessage } from '../../src/api/axios';
import { AppInput } from '../../src/components/AppInput';
import { Button, GlassCard, IconButton, Title } from '../../src/components/ui';
import { AuthHero, HERO_OVERLAP } from '../../src/components/ui/AuthHero';
import { SuccessCheck, useShake } from '../../src/components/ui/Feedback';
import { useAppTheme } from '../../src/theme/useAppTheme';
import { Rise } from '../../src/theme/motion';
import { themeColors } from '../../src/constants/colors';

/** Follows the system theme, for the reason spelled out at the top of `login.tsx`. */

/** Built from `t` — see the same note on `buildLoginSchema` in `login.tsx`. */
const buildSchema = (t: (key: string) => string) => z.object({
  email: z.string().min(1, t('auth.forgot.emailRequired')).email(t('auth.forgot.emailInvalid')),
});
type FormData = z.infer<ReturnType<typeof buildSchema>>;

export default function ForgotPasswordScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { status } = useAppTheme();
  const link = status.brand.fg; // brand green that clears AA as small text
  /** 1R presentation only: the form card shakes on a refused or invalid send. */
  const shake = useShake();
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; error: boolean }>({
    visible: false, message: '', error: false,
  });

  const {
    control,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(useMemo(() => buildSchema(t), [t])),
    defaultValues: { email: '' },
  });

  const showSnack = (message: string, error = false) =>
    setSnackbar({ visible: true, message, error });

  /**
   * "Check your inbox" is only said when the server actually took the request.
   *
   * It used to be said on EVERY outcome — the catch set `submitted` too — so a
   * partner on a dead connection watched a confident confirmation for an email
   * that had never left the phone, and then waited for it. That is not the
   * privacy behaviour it looks like: `forgotPassword` already answers 200 for an
   * address it has never seen (see the controller's own note on not leaking
   * whether an account exists), so ANY failure reaching this catch is a
   * transport or server problem and can be reported as one without saying
   * anything about the account.
   *
   * `email` alone is right here, unlike `login.tsx`: `forgotPasswordSchema` on
   * the server takes `z.string().email()` and looks the user up by email only,
   * so a mobile number genuinely has nothing to reset. A passwordless partner —
   * which is every partner the wizard creates — wants the "sign in with a
   * one-time code" link on the sign-in screen instead, not this screen.
   */
  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      await authApi.forgotPassword({ email: data.email });
      setSubmitted(true);
    } catch (err) {
      showSnack(apiErrorMessage(err, t('auth.forgot.sendFailed')), true);
      shake.shake();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    // 1R: green hero (with a glass "Back" on it) under the status bar; the
    // form — or the "check your inbox" result — is a glass card on its edge.
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AuthHero
            compact
            subtitle={t('auth.forgot.heroSubtitle')}
            top={
              /* M01 audit: opened cold (a link, a reload) there is no screen
                 behind — go to sign-in instead of a dead tap. */
              <IconButton
                icon="arrow-left"
                variant="glass"
                accessibilityLabel={t('auth.forgot.back')}
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/login'))}
                testID="forgot-back"
              />
            }
          />

          <Rise index={1} style={styles.cardWrap}>
          <Animated.View style={shake.style}>
          <GlassCard padding={22}>
          <View style={styles.header}>
            <Title style={styles.centred}>{t('auth.forgot.title')}</Title>
            <Text style={[styles.subtitle, { color: c.textSecondary }]}>
              {t('auth.forgot.subtitle')}
            </Text>
          </View>

          {submitted ? (
            <View style={styles.successCard}>
              <SuccessCheck size={60} testID="forgot-sent" />
              <Text style={[styles.successTitle, { color: c.textPrimary }]}>{t('auth.forgot.successTitle')}</Text>
              {/* "If there is an account" — the server deliberately answers the
                  same whether or not the address is one it knows, so promising a
                  delivered email would be a promise this screen cannot keep. */}
              {/* TWO fragments rather than one interpolated sentence, because
                  the address in the middle is BOLD and interpolation cannot
                  carry a style. Each language owns both halves, so neither is
                  forced into English word order: English wraps the address in
                  "for … , a link is on its way", Hindi puts its postposition
                  after it. */}
              <Text style={[styles.successMessage, { color: c.textSecondary }]}>
                {t('auth.forgot.successBodyBefore')}
                <Text style={{ fontWeight: '600' }}>{getValues('email')}</Text>
                {t('auth.forgot.successBodyAfter')}{'\n\n'}
                {t('auth.forgot.successExpiry')}
              </Text>
              <Button
                label={t('auth.forgot.returnToSignIn')}
                onPress={() => router.replace('/(auth)/login')}
                icon="login"
                variant="outline"
                fullWidth
                style={styles.returnBtn}
              />
            </View>
          ) : (
            <View style={styles.formCard}>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, onBlur, value } }) => (
                  <AppInput
                    label={t('auth.forgot.email')}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.email?.message}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    leftIcon="email-outline"
                  />
                )}
              />
              <Button
                label={t('auth.forgot.send')}
                onPress={handleSubmit(onSubmit, () => shake.shake())}
                loading={isLoading}
                icon="send"
                fullWidth
                style={styles.submitBtn}
              />
              <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={styles.signInLink} activeOpacity={0.7}>
                {/* The brand green that clears AA as small text. */}
                <Text style={[styles.signInText, { color: link }]}>
                  {t('auth.forgot.rememberSignIn')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          </GlassCard>
          </Animated.View>
          </Rise>
        </ScrollView>
      </KeyboardAvoidingView>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={5000}
        style={{ backgroundColor: snackbar.error ? c.error : c.success }}
        action={{ label: t('auth.forgot.ok'), onPress: () => setSnackbar((s) => ({ ...s, visible: false })) }}
      >
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
}

/** Layout only — colours are applied at render. See the note in `login.tsx`. */
const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
  cardWrap: {
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    paddingHorizontal: 16,
    marginTop: -HERO_OVERLAP,
  },
  header: { alignItems: 'center', marginBottom: 8, gap: 8 },
  centred: { textAlign: 'center' },
  // No `paddingHorizontal` here: at a large font scale on a 360dp screen it was
  // squeezing this sentence into a column narrow enough to break mid-word.
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  formCard: { gap: 8 },
  submitBtn: { marginTop: 8 },
  signInLink: { alignItems: 'center', paddingVertical: 12, minHeight: 44, justifyContent: 'center' },
  signInText: { fontWeight: '600', fontSize: 14, textAlign: 'center' },
  successCard: { alignItems: 'center', gap: 14, paddingTop: 4 },
  successTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  successMessage: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  returnBtn: { marginTop: 8 },
});
