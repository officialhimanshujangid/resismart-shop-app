import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  useColorScheme,
  StatusBar,
} from 'react-native';
import { Text, Modal, Portal, Divider, Snackbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { router } from 'expo-router';

import { useAuth, LoginResult } from '../../src/context/AuthContext';
import { ProfileInfo } from '../../src/api/auth.api';
import { AppButton } from '../../src/components/AppButton';
import { getGoogleIdToken, isGoogleAvailable, GoogleCancelled } from '../../src/lib/google';
import { AppInput } from '../../src/components/AppInput';
import { Hero } from '../../src/components/Hero';
import { ContextPicker } from '../../src/components/ContextPicker';
import { LoadingOverlay } from '../../src/components/LoadingOverlay';
import { themeColors } from '../../src/constants/colors';

/**
 * This screen FOLLOWS THE SYSTEM THEME, like every other screen in the app.
 *
 * It used to hardcode `isDark={false}` on the hero and take every colour from
 * the light-only `Colors` map frozen into a module-level StyleSheet. On a phone
 * set to dark mode that produced the bug the user actually reported: sign-in was
 * light and the registration wizard next door was dark, because
 * `register.tsx` had always read `useColorScheme()`. Roughly fifty files in this
 * app do the same, `app.json` declares `userInterfaceStyle: "automatic"`, and
 * the root layout already hands react-native-paper both schemes — so "follow the
 * system" was the majority behaviour and pinning two screens to light was the
 * odd one out. Layout stays in the StyleSheet; every colour is applied at
 * render from `themeColors(isDark)`, exactly as `constants/colors.ts` prescribes.
 */

/**
 * An EMAIL OR A MOBILE NUMBER, because that is what the server takes.
 *
 * `loginSchema` in `auth.validator.ts` asks only for three characters and the
 * controller branches on `isEmail(identifier)` to look up by email or by
 * normalised phone; `AuthContext.login` says the same in its own signature. This
 * screen was the only thing insisting on an inbox — and every partner the signup
 * wizard creates is passwordless, so the number they typed was also how they get
 * their one-time code. They were told "Enter a valid email address" and stopped.
 *
 * Kept loose deliberately: this is a client hint, not the identity check. Ten
 * digits is the Indian mobile number `normalizePhone` assumes a bare number is;
 * anything with a `+` or a country code has more, never fewer. Being stricter
 * here can only invent refusals the server would not have made.
 */
const DIGITS_ONLY = /^\+?[0-9\s\-().]+$/;
const identifierSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address or mobile number')
  .refine(
    (v) => z.string().email().safeParse(v).success
      || (DIGITS_ONLY.test(v) && v.replace(/\D/g, '').length >= 10),
    'Enter your email address or your 10-digit mobile number',
  );

const loginSchema = z.object({
  identifier: identifierSchema,
  /**
   * NO length floor, and that is deliberate rather than an omission — the same
   * call `auth.validator.ts` documents on its own `password: z.string()`.
   * Raising the bar on what may be SET must not raise the bar on what may be
   * OFFERED: an account holding a shorter password from before the policy would
   * be locked out by its own sign-in form, with a message that tells anybody
   * holding the phone how long the password is.
   */
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { login, selectContext, requestLoginOtp, loginWithGoogle } = useAuth();

  const [isLoading, setIsLoading] = useState(false);
  const [googling, setGoogling] = useState(false);
  /**
   * The address a code is being sent to right now, or `null`.
   *
   * Held as the target rather than as a bare boolean so the link can SAY what is
   * happening — "Sending a code to …" — instead of spinning silently. The
   * transport is not knowable yet; it comes back in the response and is named on
   * the code screen, which is the first moment it is true.
   */
  const [sendingCode, setSendingCode] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<{ visible: boolean; message: string; error: boolean }>({
    visible: false,
    message: '',
    error: false,
  });

  /**
   * Google, as a third way to prove the identity — never a way to create one.
   *
   * `loginWithGoogle` runs the same partner-only gate the password path runs, so
   * a Google account with no partner context is refused here too. A resident
   * cannot open the shop app with it.
   */
  const signInWithGoogle = async () => {
    if (googling) return;
    setGoogling(true);
    try {
      const idToken = await getGoogleIdToken();
      const result = await loginWithGoogle(idToken);
      if (!result.success) {
        setSnackbar({ visible: true, message: result.error ?? 'Google sign-in failed.', error: true });
        return;
      }
      if (result.requiresContextSelection) {
        setPendingProfiles(result.profiles ?? []);
        setPendingUserId(result.userId ?? null);
        setContextModal(true);
      }
      // Otherwise the auth layout redirects once the session lands.
    } catch (e) {
      // Backing out of Google's sheet is a choice, not an error.
      if (e instanceof GoogleCancelled) return;
      setSnackbar({ visible: true, message: (e as Error)?.message ?? 'Google sign-in failed.', error: true });
    } finally {
      setGoogling(false);
    }
  };

  const [contextModal, setContextModal] = useState(false);
  const [pendingProfiles, setPendingProfiles] = useState<ProfileInfo[]>([]);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const showSnack = (message: string, error = false) =>
    setSnackbar({ visible: true, message, error });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    try {
      const result: LoginResult = await login(data.identifier, data.password);
      if (result.success) {
        // `/(app)/(tabs)`, not `/(app)`: `(app)/_layout.tsx` is a Stack whose
        // only child is the `(tabs)` group, so `(app)` has no index route of
        // its own. A successful sign-in was replacing onto a pathname that
        // does not exist.
        router.replace('/(app)/(tabs)');
        return;
      }
      if (result.requiresContextSelection && result.profiles && result.userId) {
        setPendingProfiles(result.profiles);
        setPendingUserId(result.userId);
        setContextModal(true);
        return;
      }
      // A partner created by the signup wizard has NO password —
      // `registerPartnerPublic` opens the identity passwordless and the server
      // answers 401 with `useOtp: true`. Reporting that as a failed sign-in
      // would lock every self-registered partner out of their own app, so the
      // code is sent and the OTP screen is opened instead.
      if (result.requiresOtp) {
        await sendCode(data.identifier);
        return;
      }
      showSnack(result.error ?? 'Login failed. Please try again.', true);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Passwordless sign-in, from the "email me a code" link and from the 401 above.
   *
   * The delivery report the server answers with is CARRIED FORWARD as params
   * rather than left behind. The code screen has to name the transport — a code
   * that fell through from WhatsApp to SMS leaves the partner watching the wrong
   * app — and it cannot ask again without sending a second code, so this is the
   * only chance to hand it over.
   *
   * `/auth/login/otp/request` answers 200 for everybody by design, so there is
   * no "nothing was delivered" branch here: a failure at this point is a 429, a
   * 400 or the network, and the snackbar is the right place for all three.
   * Reporting non-delivery on an unauthenticated endpoint would say whether the
   * account exists.
   *
   * This link posts whatever is in the field unvalidated, and the server takes a
   * phone number just as happily — which is why the code screen is given real
   * alternative-transport buttons rather than an assumption that this is always
   * an inbox. The field says "Email or mobile number" now, so the link and the
   * label finally agree about what may go in it.
   */
  const sendCode = async (identifier: string) => {
    const to = identifier.trim();
    if (!to) {
      showSnack('Enter your email address or mobile number first.', true);
      return;
    }
    if (sendingCode) return;
    setSendingCode(to);
    try {
      const result = await requestLoginOtp(to);
      if (!result.success || !result.delivery) {
        showSnack(result.error ?? 'Could not send a code. Please try again.', true);
        return;
      }
      const { message, deliveredVia, alternatives, whatsappAvailable } = result.delivery;
      router.push({
        pathname: '/(auth)/verify-otp',
        params: {
          identifier: to,
          message,
          deliveredVia,
          // Params are strings on the wire, so the array and the boolean are
          // encoded here and decoded there. `verify-otp` documents the shape.
          alternatives: alternatives.join(','),
          whatsappAvailable: whatsappAvailable ? '1' : '0',
        },
      });
    } finally {
      setSendingCode(null);
    }
  };

  /**
   * Backing out of the profile picker, put back to a state sign-in can leave.
   *
   * Closing this modal used to set `contextModal` to false and nothing else.
   * `pendingUserId` and `pendingProfiles` survived, and no control anywhere on
   * the screen reopens the picker — so a partner who tapped the backdrop was
   * left on a sign-in form holding a half-done sign-in it could not finish, and
   * the only way forward was to sign in again without being told so.
   *
   * The handle in `AuthContext`'s `pending` ref is deliberately NOT reached into
   * from here: it is a private ref with no exported reset, it holds nothing this
   * screen can use once the profiles are gone, and the next `login`/
   * `loginWithGoogle` overwrites it. Clearing what this screen owns is what
   * makes the "Sign in" button mean something again.
   */
  const cancelContextSelection = () => {
    if (contextLoading) return; // a switch is already in flight — let it finish
    setContextModal(false);
    setPendingProfiles([]);
    setPendingUserId(null);
    showSnack('No profile chosen. Sign in again to pick one.');
  };

  const handleContextSelect = async (profile: ProfileInfo) => {
    if (!pendingUserId) return;
    setContextLoading(true);
    try {
      await selectContext(pendingUserId, profile.tenantId, profile.role);
      setContextModal(false);
      // Same non-route as in `onSubmit` above — see the note there.
      router.replace('/(app)/(tabs)');
    } catch (err: any) {
      showSnack(err?.response?.data?.error ?? 'Context selection failed.', true);
    } finally {
      setContextLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      {/* `light-content` in BOTH schemes: the bar sits over the hero, and the
          hero's gradient is a deep green whichever scheme is in force. */}
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Hero
            isDark={isDark}
            variant="brand"
            logoSize="large"
            rounded={false}
            subtitle="Your bookings, orders and billing in one place."
          />

          <View style={[styles.card, { backgroundColor: c.surface, shadowColor: c.shadow }]}>
            <Text style={[styles.cardTitle, { color: c.textPrimary }]}>Welcome back</Text>
            <Text style={[styles.cardSubtitle, { color: c.textSecondary }]}>
              Sign in to your partner account
            </Text>

            <View style={styles.form}>
              <Controller
                control={control}
                name="identifier"
                render={({ field: { onChange, onBlur, value } }) => (
                  <AppInput
                    label="Email or mobile number"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.identifier?.message}
                    // Still the email keyboard: it carries both the digits and
                    // the "@", where the phone pad carries only one of them.
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="username"
                    leftIcon="account-outline"
                  />
                )}
              />

              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, onBlur, value } }) => (
                  <AppInput
                    label="Password"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    error={errors.password?.message}
                    secureTextEntry
                    autoCapitalize="none"
                    autoComplete="password"
                    leftIcon="lock-outline"
                  />
                )}
              />

              <TouchableOpacity
                onPress={() => router.push('/(auth)/forgot-password')}
                style={styles.forgotLink}
                activeOpacity={0.7}
              >
                {/* `primary`, not `primaryLight`: `brand[400]` is only 2.99:1
                    on white and is a dark-mode / fill colour, never light-mode
                    link text. See the ramp note in `constants/colors.ts`. */}
                <Text style={[styles.linkText, { color: c.primary }]}>Forgot password?</Text>
              </TouchableOpacity>

              <AppButton
                label="Sign in"
                onPress={handleSubmit(onSubmit)}
                loading={isLoading}
                icon="login"
                style={styles.signInButton}
              />
            </View>

            {/* Google — absent entirely from a build with no client id, the
                same way the backend answers 503 rather than pretending. */}
            {isGoogleAvailable() ? (
              <View style={styles.googleRow}>
                <AppButton
                  label="Continue with Google"
                  onPress={signInWithGoogle}
                  loading={googling}
                  icon="google"
                  mode="outlined"
                />
              </View>
            ) : null}

            {/*
              This link and the register link below are what make the rest of
              the auth flow REACHABLE at all: without them the 5-step signup
              wizard has no entry point, and a partner whose identity is
              passwordless (which is every partner who registered in the app) has
              no way to reach the code screen.
            */}
            <Controller
              control={control}
              name="identifier"
              render={({ field: { value } }) => (
                <TouchableOpacity
                  onPress={() => sendCode(value)}
                  disabled={!!sendingCode}
                  style={styles.otpLink}
                  activeOpacity={0.7}
                >
                  {/* Says what it is doing while it does it. A bare spinner here
                      is what left partners staring at a screen with no idea
                      whether anything had been sent. */}
                  <Text
                    style={[
                      styles.linkText,
                      styles.centred,
                      { color: sendingCode ? c.textSecondary : c.primary },
                    ]}
                  >
                    {sendingCode
                      ? `Sending a code to ${sendingCode}…`
                      : 'Sign in with a one-time code instead'}
                  </Text>
                </TouchableOpacity>
              )}
            />

            <View style={styles.footer}>
              <TouchableOpacity onPress={() => router.push('/(auth)/register')} activeOpacity={0.7}>
                <Text style={[styles.footerText, { color: c.textSecondary }]}>
                  New to ResiSmart?{' '}
                  <Text style={[styles.footerLink, { color: c.primary }]}>Register your business</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Portal>
        <Modal
          visible={contextModal}
          // Both the backdrop and Android's back button land on the same reset,
          // and neither is allowed to interrupt a switch that is already running.
          dismissable={!contextLoading}
          dismissableBackButton={!contextLoading}
          onDismiss={cancelContextSelection}
          contentContainerStyle={[styles.modal, { backgroundColor: c.surface }]}
        >
          <Text style={[styles.modalTitle, { color: c.textPrimary }]}>Select Your Profile</Text>
          <Text style={[styles.modalSubtitle, { color: c.textSecondary }]}>
            You have multiple profiles. Please select one to continue.
          </Text>
          <Divider style={styles.divider} />
          {contextLoading ? (
            <LoadingOverlay visible message="Selecting profile..." />
          ) : (
            <>
              <ContextPicker profiles={pendingProfiles} onSelect={handleContextSelect} />
              {/* A visible way out. Tapping the backdrop works too, but nothing
                  on screen said so — which is how the dead end above went
                  unnoticed. */}
              <TouchableOpacity onPress={cancelContextSelection} activeOpacity={0.7} style={styles.modalCancel}>
                <Text style={[styles.linkText, styles.centred, { color: c.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </Modal>
      </Portal>

      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar((s) => ({ ...s, visible: false }))}
        duration={4000}
        style={{ backgroundColor: snackbar.error ? c.error : c.success }}
        action={{ label: 'Dismiss', onPress: () => setSnackbar((s) => ({ ...s, visible: false })) }}
      >
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
}

/**
 * LAYOUT ONLY. Every colour is applied at render from `themeColors(isDark)` —
 * see the note at the top of this file.
 *
 * Sizing notes for the narrow end of the range (a 360dp phone at a large system
 * font size, which is the common Android device here, not the edge case):
 *   - the card's horizontal padding is 22, not 28. At 28 a 360dp screen left
 *     304dp of usable width, and the "Sign in with a one-time code instead" line
 *     wrapped mid-phrase at a 1.3× font scale.
 *   - `maxWidth` + `alignSelf` stops the form stretching to a tablet's full
 *     width, where a 700dp-wide text field looks like a bug.
 *   - nothing here sets a fixed height, so every row grows with the font scale
 *     instead of clipping. `Dimensions.get('window')` used to be read at module
 *     load for a `height` nothing consumed; a value captured once at import
 *     cannot survive a rotation anyway, so it is gone.
 */
const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  card: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 32,
    paddingBottom: 48,
    marginTop: -24,
    elevation: 8,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 1,
    shadowRadius: 12,
  },
  cardTitle: { fontSize: 26, fontWeight: '600', marginBottom: 4 },
  cardSubtitle: { fontSize: 14, marginBottom: 28 },
  form: { gap: 4 },
  forgotLink: { alignSelf: 'flex-end', marginTop: 4, marginBottom: 8, paddingVertical: 4 },
  signInButton: { marginTop: 8 },
  otpLink: { alignSelf: 'stretch', paddingVertical: 14 },
  linkText: { fontWeight: '600', fontSize: 14 },
  centred: { textAlign: 'center' },
  googleRow: { marginTop: 12 },
  footer: { marginTop: 20, alignItems: 'center' },
  footerText: { fontSize: 13, textAlign: 'center' },
  footerLink: { fontWeight: '600' },
  modal: {
    borderRadius: 24,
    marginHorizontal: 20,
    padding: 24,
    gap: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '600' },
  modalSubtitle: { fontSize: 14 },
  divider: { marginVertical: 4 },
  modalCancel: { paddingVertical: 12, marginTop: 4 },
});
