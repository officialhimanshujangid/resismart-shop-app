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
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { authApi } from '../../src/api/auth.api';
import { apiErrorMessage } from '../../src/api/axios';
import { AppButton } from '../../src/components/AppButton';
import { AppInput } from '../../src/components/AppInput';
import { Hero } from '../../src/components/Hero';
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
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={c.primary} />
            <Text style={[styles.backText, { color: c.primary }]}>{t('auth.forgot.back')}</Text>
          </TouchableOpacity>

          <Hero
            isDark={isDark}
            variant="brand"
            logoSize="medium"
            subtitle={t('auth.forgot.heroSubtitle')}
            style={styles.brandHero}
          />

          <View style={styles.header}>
            <Text style={[styles.title, { color: c.textPrimary }]}>{t('auth.forgot.title')}</Text>
            <Text style={[styles.subtitle, { color: c.textSecondary }]}>
              {t('auth.forgot.subtitle')}
            </Text>
          </View>

          {submitted ? (
            <View style={[styles.successCard, { backgroundColor: c.surface, shadowColor: c.shadow }]}>
              <MaterialCommunityIcons name="email-check-outline" size={52} color={c.success} />
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
              <AppButton
                label={t('auth.forgot.returnToSignIn')}
                onPress={() => router.replace('/(auth)/login')}
                mode="outlined"
                style={styles.returnBtn}
              />
            </View>
          ) : (
            <View style={[styles.formCard, { backgroundColor: c.surface, shadowColor: c.shadow }]}>
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
              <AppButton
                label={t('auth.forgot.send')}
                onPress={handleSubmit(onSubmit)}
                loading={isLoading}
                icon="send"
                style={styles.submitBtn}
              />
              <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={styles.signInLink} activeOpacity={0.7}>
                {/* `primary`, not `primaryLight` — `brand[400]` fails AA on white. */}
                <Text style={[styles.signInText, { color: c.primary }]}>
                  {t('auth.forgot.rememberSignIn')}
                </Text>
              </TouchableOpacity>
            </View>
          )}
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
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 16,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, marginBottom: 12 },
  backText: { fontSize: 15, fontWeight: '600' },
  brandHero: { paddingVertical: 26, marginBottom: 24 },
  header: { alignItems: 'center', marginBottom: 32, gap: 12 },
  title: { fontSize: 26, fontWeight: '600', textAlign: 'center' },
  // No `paddingHorizontal` here: at a large font scale on a 360dp screen it was
  // squeezing this sentence into a column narrow enough to break mid-word.
  subtitle: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  formCard: {
    borderRadius: 20, padding: 20, gap: 8,
    elevation: 2, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12,
  },
  submitBtn: { marginTop: 8 },
  signInLink: { alignItems: 'center', paddingVertical: 12 },
  signInText: { fontWeight: '600', fontSize: 14, textAlign: 'center' },
  successCard: {
    borderRadius: 20, padding: 24, alignItems: 'center', gap: 16,
    elevation: 2, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12,
  },
  successTitle: { fontSize: 22, fontWeight: '600', textAlign: 'center' },
  successMessage: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  returnBtn: { marginTop: 8, width: '100%' },
});
