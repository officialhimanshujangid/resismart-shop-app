import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  useColorScheme,
  TextInput as RNTextInput,
} from 'react-native';
import { Text, Snackbar, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';

import { useAuth } from '../../src/context/AuthContext';
import { AppButton } from '../../src/components/AppButton';
import { AppLogo } from '../../src/components/AppLogo';
import { themeColors, radii } from '../../src/constants/colors';

/**
 * Sign in with a one-time code.
 *
 * This screen exists because most partner identities have NO PASSWORD.
 * `registerPartnerPublic` creates them through `attachTenantMembership` with no
 * hash at all — the comment there is explicit that "login is via OTP; the
 * password field is no longer used as a credential" — so `POST /auth/login`
 * answers those accounts 401 with `useOtp: true`, forever. Without this screen
 * every partner who signed up in the app would be locked out of it.
 *
 * It is also the last step of registration: the wizard creates the business
 * while signed out and then sends the partner here to open the session that
 * lets them save steps 2–5 (those endpoints run on `PARTNER_PROPRIETOR_CHAIN`).
 *
 * Params:
 *   identifier  email or phone — whichever the code was sent to
 *   reason      'new-account' softens the copy for someone who has just
 *               registered and is being asked for a third code in two minutes
 *   devCode     dev only; no SMS gateway is wired, so `requestOtp` hands the
 *               phone code straight back and it is prefilled rather than
 *               invented by the user
 */

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

export default function VerifyOtpScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const params = useLocalSearchParams<{ identifier?: string; reason?: string; devCode?: string }>();
  const identifier = typeof params.identifier === 'string' ? params.identifier : '';
  const isNewAccount = params.reason === 'new-account';

  const { requestLoginOtp, verifyLoginOtp } = useAuth();
  const inputRef = useRef<RNTextInput>(null);

  const [code, setCode] = useState(typeof params.devCode === 'string' ? params.devCode : '');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [snack, setSnack] = useState<{ visible: boolean; message: string; error: boolean }>({
    visible: false,
    message: '',
    error: false,
  });

  const show = (message: string, error = false) => setSnack({ visible: true, message, error });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submit = useCallback(
    async (value: string) => {
      if (value.length !== CODE_LENGTH || busy) return;
      setBusy(true);
      try {
        const result = await verifyLoginOtp(identifier, value);
        if (result.success) {
          // No navigation. `app/_layout.tsx` guards the two route groups on the
          // session, so flipping `isAuthenticated` swaps them — and the
          // onboarding gate decides whether that means the app or the rest of
          // the wizard. Pushing a route here would race that swap.
          return;
        }
        if (result.requiresContextSelection) {
          // Rare on this path: somebody who works in two partner businesses and
          // signs in with a code. The picker lives on the login screen, so send
          // them there with the session already half-open rather than inventing
          // a second picker here.
          show('You work in more than one business. Please sign in from the main screen to pick one.', true);
          setTimeout(() => router.replace('/(auth)/login'), 2200);
          return;
        }
        show(result.error ?? 'That code did not work.', true);
        setCode('');
      } finally {
        setBusy(false);
      }
    },
    [busy, identifier, verifyLoginOtp],
  );

  const resend = useCallback(async () => {
    if (cooldown > 0) return;
    setCooldown(RESEND_SECONDS);
    const result = await requestLoginOtp(identifier);
    if (!result.success) {
      show(result.error ?? 'Could not send another code.', true);
      return;
    }
    if (result.devCode) setCode(result.devCode);
    show('A new code is on its way.');
  }, [cooldown, identifier, requestLoginOtp]);

  const onChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    // Submitted as soon as the last digit lands. A partner holding a phone in
    // one hand and a customer's order in the other should not have to find a
    // button as well.
    if (digits.length === CODE_LENGTH) void submit(digits);
  };

  if (!identifier) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
        <View style={styles.centre}>
          <Text style={[styles.title, { color: c.textPrimary }]}>Nothing to verify</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            We do not know which number or address to check. Please sign in again.
          </Text>
          <AppButton label="Back to sign in" onPress={() => router.replace('/(auth)/login')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}>
            <AppLogo size="medium" showTagline={false} />
          </View>

          <Text style={[styles.title, { color: c.textPrimary }]}>
            {isNewAccount ? 'One last code' : 'Enter your code'}
          </Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            {isNewAccount
              ? `Your business is created. We have sent a sign-in code to ${identifier} so you can finish setting it up.`
              : `We have sent a 6-digit code to ${identifier}.`}
          </Text>

          {/*
            One hidden input behind six boxes, rather than six inputs.
            Six real inputs have to hand focus along on every keystroke and on
            every backspace, and they fight the OS autofill that reads the code
            out of the SMS — which is the only reason anybody gets this screen
            right on the first try.
          */}
          <TouchableOpacity
            activeOpacity={1}
            style={styles.boxes}
            onPress={() => inputRef.current?.focus()}
          >
            {Array.from({ length: CODE_LENGTH }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.box,
                  {
                    backgroundColor: c.surface,
                    borderColor: i === code.length ? c.primary : c.border,
                  },
                ]}
              >
                <Text style={[styles.boxText, { color: c.textPrimary }]}>{code[i] ?? ''}</Text>
              </View>
            ))}
          </TouchableOpacity>

          <RNTextInput
            ref={inputRef}
            value={code}
            onChangeText={onChange}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            maxLength={CODE_LENGTH}
            autoFocus
            style={styles.hidden}
          />

          {busy ? (
            <ActivityIndicator style={styles.spinner} />
          ) : (
            <AppButton
              label="Verify and continue"
              onPress={() => void submit(code)}
              disabled={code.length !== CODE_LENGTH}
            />
          )}

          <TouchableOpacity onPress={resend} disabled={cooldown > 0} style={styles.resend}>
            <Text style={{ color: cooldown > 0 ? c.textDisabled : c.primary, fontWeight: '600' }}>
              {cooldown > 0 ? `Send another code in ${cooldown}s` : 'Send another code'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={styles.resend}>
            <Text style={{ color: c.textSecondary }}>Use a different account</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Snackbar
        visible={snack.visible}
        onDismiss={() => setSnack((s) => ({ ...s, visible: false }))}
        duration={4000}
        style={{ backgroundColor: snack.error ? c.error : c.success }}
      >
        {snack.message}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  centre: { flex: 1, justifyContent: 'center', padding: 28, gap: 12 },
  content: { padding: 28, gap: 14, flexGrow: 1, justifyContent: 'center' },
  logo: { alignItems: 'center', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  boxes: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginVertical: 10 },
  box: {
    flex: 1,
    height: 58,
    borderRadius: radii.field,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxText: { fontSize: 24, fontWeight: '700' },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  spinner: { marginVertical: 14 },
  resend: { alignSelf: 'center', paddingVertical: 10 },
});
