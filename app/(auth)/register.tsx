import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { Text, Snackbar, Chip, Divider, Switch } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

import { useAuth } from '../../src/context/AuthContext';
import {
  authApi,
  otpDeliveryFailure,
  OtpAltVia,
  OtpDeliveredVia,
  OtpVia,
} from '../../src/api/auth.api';
import {
  partnerApi,
  uploadKycFile,
  PartnerCategory,
  PartnerKycDoc,
  DayTiming,
  OnboardingStatus,
} from '../../src/api/partner.api';
import { apiErrorMessage } from '../../src/api/axios';
import { AppButton } from '../../src/components/AppButton';
import { getGoogleIdToken, isGoogleAvailable, GoogleCancelled } from '../../src/lib/google';
import { AppInput } from '../../src/components/AppInput';
import { Hero } from '../../src/components/Hero';
import { OtpDeliveryNotice } from '../../src/components/OtpDeliveryNotice';
import { MapPicker } from '../../src/components/MapPicker';
import { themeColors, radii, ColorScheme } from '../../src/constants/colors';
import { parseCoords, pointFromLocation } from '../../src/lib/geo';
import { qk } from '../../src/lib/queryKeys';
import { useOnboardingStatus, resumeStep, useIsOnline } from '../../src/hooks';
import {
  PARTNER_KINDS,
  PartnerKind,
  PartnerServiceMode,
  PartnerDocType,
} from '../../src/types/api-contract.generated';

/**
 * The 5-step partner signup wizard (PARTNERS_PLAN §7).
 *
 * ── Why it is RESUMABLE, and what that actually means ─────────────────────
 *
 * `POST /partners/register-public` creates the business at step 1 and opens a
 * login identity for it. Everything after that is four more screens with a
 * document upload in the middle, so the partner who puts the phone down halfway
 * is the NORMAL case. The web version shipped without a resume path and it
 * became an audit finding: step 1 → 2 is exactly where a signup funnel leaks,
 * because step 1 is where the account starts existing and step 2 is where the
 * work starts.
 *
 * Resumable therefore means three things here, not one:
 *
 *   1. `GET /partners/me/onboarding-status` is read ON MOUNT and decides which
 *      step opens — the first one with something still MISSING (`resumeStep`).
 *      Both halves of that answer are computed from the partner DOCUMENT, so it
 *      survives a reinstall and follows the partner to another device.
 *   2. Every step is saved to the server the moment it is completed, not batched
 *      at the end. `saveOnboardingStep` advances `partner.onboardingStep` and
 *      never moves it backwards.
 *   3. A partner with an unfinished registration is held HERE rather than let
 *      into the app, whether they are signing in or have just finished
 *      registering. `useOnboardingGate` is what the root layout reads; the swap
 *      out of the sign-in code screen and onto this one is `(auth)/_layout`.
 *
 * ── Step 4 ────────────────────────────────────────────────────────────────
 *
 * Step 4 is load-bearing (`PARTNERS_PLAN` §7): `serviceModes` decides which
 * modules the business gets and which booking flow residents see, and it is read
 * everywhere and re-derived nowhere. So it is drawn as three full-width cards
 * with the consequence written on each one, not as a dropdown — this is the one
 * screen in the wizard where the partner is making a decision about their
 * business rather than typing something they already know.
 */

const STEPS = [
  { n: 1, label: 'You' },
  { n: 2, label: 'Where' },
  { n: 3, label: 'What' },
  { n: 4, label: 'How' },
  { n: 5, label: 'Papers' },
] as const;

const KIND_COPY: Record<PartnerKind, { title: string; blurb: string; icon: string }> = {
  SERVICE: { title: 'Services', blurb: 'People book your time — repairs, cleaning, tuition.', icon: 'wrench-outline' },
  RETAIL: { title: 'Products', blurb: 'People buy things from you — a shop or a counter.', icon: 'storefront-outline' },
  BOTH: { title: 'Both', blurb: 'You sell products and you take bookings.', icon: 'star-four-points-outline' },
};

const RADIUS_CHOICES = [2, 5, 10, 15, 25, 50];

const DOC_TYPES: { value: PartnerDocType; label: string }[] = [
  { value: 'GST', label: 'GST certificate' },
  { value: 'PAN', label: 'PAN card' },
  { value: 'LICENSE', label: 'Licence' },
  { value: 'SHOP_ACT', label: 'Shop act' },
  { value: 'OTHER', label: 'Something else' },
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A sensible week for a shop, so nobody has to fill in seven rows to get going. */
const defaultWeek = (): DayTiming[] =>
  DAY_NAMES.map((_, day) => ({
    day,
    isOpen: day !== 0,
    windows: day !== 0 ? [{ from: '09:00', to: '21:00' }] : [],
  }));

export default function RegisterScreen() {
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const { isAuthenticated, logout } = useAuth();
  const queryClient = useQueryClient();

  const { status, loading: statusLoading } = useOnboardingStatus({ enabled: isAuthenticated });
  /**
   * Read here as well as inside the steps — same key, same cached response — for
   * the one thing the onboarding status does not carry: the reviewer's note on a
   * REJECTED profile. Being sent back to a form with no idea what was wrong with
   * it is how a partner corrects the wrong field twice and gives up.
   */
  const { data: existing } = useQuery({
    queryKey: qk.partner.me(),
    queryFn: () => partnerApi.me(),
    enabled: isAuthenticated,
  });
  const [step, setStep] = useState<number>(1);
  const [landed, setLanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snack, setSnack] = useState<{ visible: boolean; message: string; error: boolean }>({
    visible: false,
    message: '',
    error: false,
  });
  const show = useCallback(
    (message: string, error = false) => setSnack({ visible: true, message, error }),
    [],
  );

  /**
   * Land on the resume step, exactly once per session.
   *
   * `landed` guards it because the status query refetches — without the guard,
   * a refetch triggered by finishing step 3 would yank the partner back to
   * whatever the server said a moment ago, mid-typing on step 4.
   *
   * It starts FALSE even when the screen mounts signed out, which it used to
   * not. The session can open underneath this screen: step 1 pushes
   * `verify-otp`, and when that code is verified `(auth)/_layout` drops the code
   * screen and lands back HERE, on the same mounted component. Latching `landed`
   * at mount left the partner who had just created their business sitting on
   * step 1 with their own business name in front of them, one screen behind
   * where the server already had them.
   */
  useEffect(() => {
    if (landed || !isAuthenticated || !status) return;
    setStep(resumeStep(status));
    setLanded(true);
  }, [landed, isAuthenticated, status]);

  const refreshStatus = useCallback(
    (next: OnboardingStatus | undefined) => {
      if (next) queryClient.setQueryData(qk.onboarding.status(), next);
      void queryClient.invalidateQueries({ queryKey: qk.entitlements() });
    },
    [queryClient],
  );

  const goNext = useCallback(() => setStep((s) => Math.min(5, s + 1)), []);

  /**
   * Every step is reachable once the business exists, in any order.
   *
   * The rail used to move backwards only, which reads as a safety rail and is
   * not one: each step is saved on its own and the server validates each one
   * independently, so there is no half-written state to protect. What it
   * actually did was strand the partner whose `missing[]` names step 2 while
   * they are standing on step 5. Same rule as the web wizard's
   * `furthest = accountExists ? 5 : step`.
   */
  const furthest = isAuthenticated ? 5 : step;

  /**
   * What the reviewer asked for, when the profile came back.
   *
   * Same fallback chain as the web wizard: the verification note first, then the
   * older top-level `rejectionReason`, then a sentence — because "REJECTED" with
   * nothing beside it is the state this whole screen is meant to get somebody
   * out of.
   */
  const partner = existing?.partner;
  const rejectionNote =
    partner?.status === 'REJECTED'
      ? partner.verification?.note
        || partner.rejectionReason
        || 'Our team asked for a correction before this can go live.'
      : '';

  /**
   * The way out. A signed-in partner mid-wizard is held in `(auth)` by the root
   * layout, so there is no tab bar under this screen and no back gesture off it
   * — signing out is the only exit, and until it was here the only one was
   * killing the app.
   */
  const confirmSignOut = useCallback(() => {
    Alert.alert(
      'Sign out',
      'Everything you have saved so far is kept. You can sign back in and carry on from here.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => { void logout(); } },
      ],
    );
  }, [logout]);

  if (isAuthenticated && statusLoading && !landed) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
        <View style={styles.centre}>
          <ActivityIndicator />
          <Text style={{ color: c.textSecondary, marginTop: 12 }}>Finding where you left off…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Hero
            isDark={isDark}
            variant="brand"
            logoSize="small"
            subtitle="Set up your business — saved as you go."
            style={styles.brandHero}
          />

          <StepRail current={step} furthest={furthest} c={c} onJump={setStep} />

          {rejectionNote ? (
            <View style={[styles.notice, { backgroundColor: c.surface, borderColor: c.warning }]}>
              <MaterialCommunityIcons name="alert-outline" size={20} color={c.warning} />
              <View style={styles.flex}>
                <Text style={[styles.noticeTitle, { color: c.textPrimary }]}>Before we can approve this</Text>
                {/* The reviewer's own words, not a paraphrase — this is the
                    sentence support will quote back to them. */}
                <Text style={[styles.note, { color: c.textSecondary }]}>{rejectionNote}</Text>
              </View>
            </View>
          ) : null}

          {step === 1 && (
            <StepIdentity
              c={c}
              busy={busy}
              setBusy={setBusy}
              show={show}
              isAuthenticated={isAuthenticated}
              onSaved={(next) => {
                refreshStatus(next);
                goNext();
              }}
            />
          )}
          {step === 2 && (
            <StepLocation c={c} busy={busy} setBusy={setBusy} show={show} onSaved={(n) => { refreshStatus(n); goNext(); }} />
          )}
          {step === 3 && (
            <StepWhat c={c} busy={busy} setBusy={setBusy} show={show} onSaved={(n) => { refreshStatus(n); goNext(); }} />
          )}
          {step === 4 && (
            <StepHow c={c} busy={busy} setBusy={setBusy} show={show} onSaved={(n) => { refreshStatus(n); goNext(); }} />
          )}
          {step === 5 && (
            <StepPapers c={c} busy={busy} setBusy={setBusy} show={show} onSaved={refreshStatus} onJump={setStep} />
          )}

          {step === 1 && !isAuthenticated && (
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={styles.footerLink}>
              <Text style={{ color: c.textSecondary }}>
                Already registered? <Text style={{ color: c.primary, fontWeight: '600' }}>Sign in</Text>
              </Text>
            </TouchableOpacity>
          )}

          {/* The two ways off this screen, and they only exist once there is a
              session — signed out, the "Sign in" link above is the way out and
              step 1 is the only step. */}
          {isAuthenticated && (
            <View style={styles.exitRow}>
              {step > 1 ? (
                <TouchableOpacity onPress={() => setStep((s) => Math.max(1, s - 1))} style={styles.footerLink}>
                  <Text style={{ color: c.primary, fontWeight: '600' }}>← Back a step</Text>
                </TouchableOpacity>
              ) : (
                <View />
              )}
              <TouchableOpacity onPress={confirmSignOut} style={styles.footerLink}>
                <Text style={{ color: c.textSecondary }}>Sign out</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

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

// ---------------------------------------------------------------- step chrome

/**
 * `furthest` is how far the partner may JUMP; `current` is where they are. The
 * two are only the same before the account exists — see `furthest` in the screen
 * above for why every step opens once it does.
 */
function StepRail({
  current,
  furthest,
  c,
  onJump,
}: {
  current: number;
  furthest: number;
  c: ColorScheme;
  onJump: (n: number) => void;
}) {
  return (
    <View style={styles.rail}>
      {STEPS.map((s) => {
        const done = s.n < current;
        const active = s.n === current;
        const reachable = s.n <= furthest;
        return (
          <TouchableOpacity
            key={s.n}
            style={styles.railItem}
            onPress={() => onJump(s.n)}
            disabled={!reachable}
            activeOpacity={reachable ? 0.7 : 1}
          >
            <View
              style={[
                styles.railDot,
                {
                  backgroundColor: active ? c.primary : done ? c.success : c.surfaceVariant,
                  borderColor: active ? c.primary : c.border,
                },
              ]}
            >
              {done ? (
                <MaterialCommunityIcons name="check" size={14} color={c.textInverse} />
              ) : (
                <Text style={[styles.railNum, { color: active ? c.textInverse : c.textDisabled }]}>{s.n}</Text>
              )}
            </View>
            {/* Five labels sharing the width of the screen. Capped at 1.3× and
                held to one line so a large system font scale shortens the word
                rather than reflowing the rail into two ragged rows. */}
            <Text
              style={[styles.railLabel, { color: active ? c.textPrimary : c.textDisabled }]}
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
            >
              {s.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface StepProps {
  c: ColorScheme;
  busy: boolean;
  setBusy: (b: boolean) => void;
  show: (message: string, error?: boolean) => void;
  onSaved: (next: OnboardingStatus | undefined) => void;
}

function StepHeading({ c, title, blurb }: { c: ColorScheme; title: string; blurb: string }) {
  return (
    <View style={styles.heading}>
      <Text style={[styles.h1, { color: c.textPrimary }]}>{title}</Text>
      <Text style={[styles.h2, { color: c.textSecondary }]}>{blurb}</Text>
    </View>
  );
}

// ------------------------------------------------------------------- step 1

/**
 * The last thing `POST /auth/otp/request` said about the PHONE leg.
 *
 * `failure` is set from a 502 — the code was minted and nothing carried it. The
 * two are mutually exclusive, and `failure` being set is what keeps the wizard
 * on the form instead of showing a code box for a message that never went.
 */
interface PhoneDelivery {
  message: string | null;
  failure: string | null;
  deliveredVia: OtpDeliveredVia | null;
  alternatives: OtpAltVia[];
  whatsappAvailable: boolean | null;
}

/**
 * Identity — and the only step that runs signed OUT.
 *
 * Both the email and the phone are OTP-verified before the business is created,
 * because `registerPartnerPublicSchema` requires a verification token for each
 * and `attachTenantMembership` opens a login identity on BOTH. That is also why
 * neither can be edited later in the wizard: changing one here would move the
 * business away from the account that can sign in to it, and the partner would
 * find out by being locked out.
 *
 * Once the business exists, the partner must be SIGNED IN to save steps 2–5 —
 * those endpoints run on `PARTNER_PROPRIETOR_CHAIN`. The identity is
 * passwordless, so the way in is a third code, sent to the phone and handled by
 * `verify-otp`. It is a real cost at the worst possible moment in the funnel,
 * which is why the screen says what it is for rather than just asking again.
 */
function StepIdentity({
  c,
  busy,
  setBusy,
  show,
  isAuthenticated,
  onSaved,
}: StepProps & { isAuthenticated: boolean }) {
  const { requestLoginOtp } = useAuth();
  const { data: existing } = useQuery({
    queryKey: qk.partner.me(),
    queryFn: () => partnerApi.me(),
    enabled: isAuthenticated,
  });

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  /**
   * The two legs are tracked SEPARATELY because they fail separately.
   *
   * They used to go out under one `Promise.all` and one `sent` flag, so a phone
   * send that nobody could deliver threw away a perfectly good email code — and
   * the retry then minted a second email code and walked into the rate limit on
   * the leg that had been working. `sent` is now derived from both.
   */
  const [emailDelivery, setEmailDelivery] = useState<string | null>(null);
  const [phoneDelivery, setPhoneDelivery] = useState<PhoneDelivery | null>(null);
  const [sendingPhone, setSendingPhone] = useState<OtpVia | null>(null);
  const [emailCode, setEmailCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [tokens, setTokens] = useState<{ email?: string; phone?: string }>({});
  const [googling, setGoogling] = useState(false);

  useEffect(() => {
    if (existing?.partner) setName((n) => n || existing.partner.name);
  }, [existing]);

  // Resumed and already signed in: the account exists, so this step is only the
  // business name. Everything else on it is account identity, which is changed
  // through the account screens where an OTP is asked for again.
  if (isAuthenticated) {
    return (
      <View style={styles.step}>
        <StepHeading c={c} title="Your business" blurb="The name residents will see when they find you." />
        <AppInput label="Business name" value={name} onChangeText={setName} leftIcon="store-outline" />
        <AppButton
          label="Save and continue"
          loading={busy}
          disabled={name.trim().length < 2}
          onPress={async () => {
            setBusy(true);
            try {
              const res = await partnerApi.saveStep({ step: 1, body: { name: name.trim() } });
              onSaved(res.onboarding);
            } catch (e) {
              show(apiErrorMessage(e), true);
            } finally {
              setBusy(false);
            }
          }}
        />
      </View>
    );
  }

  /**
   * Google standing in for the emailed code.
   *
   * The server returns the same verification receipt `otpVerify` returns, so it
   * goes straight into `tokens.email` — and `createAccount` below already reads
   * `tokens.email ?? await verify(...)`, so the email code step is simply skipped
   * with no other change.
   *
   * The address comes back from the token rather than from this form: whichever
   * account was actually signed into is the one Google vouched for.
   *
   * THE PHONE STILL NEEDS ITS CODE. A Google account says nothing about a phone
   * number, and the shop's contact number is the one customers ring.
   */
  const verifyEmailWithGoogle = async () => {
    if (googling) return;
    setGoogling(true);
    try {
      const idToken = await getGoogleIdToken();
      const res = await authApi.googleVerifyContact(idToken);
      setEmail(res.data.email);
      setTokens((t) => ({ ...t, email: res.data.verificationToken }));
      show('Email verified with Google. Now verify your phone.');
    } catch (e) {
      if (e instanceof GoogleCancelled) return;
      show(apiErrorMessage(e, (e as Error)?.message ?? 'Could not verify with Google.'), true);
    } finally {
      setGoogling(false);
    }
  };

  /**
   * The EMAIL leg. Reports its own outcome and swallows its own error, so the
   * phone leg beside it is never cancelled by an inbox problem.
   *
   * A 502 here is the same "nothing was delivered" the phone can return; it
   * carries the server's own sentence about the address, which `apiErrorMessage`
   * prints verbatim. There is no alternative transport for an inbox, so there is
   * nothing to offer beyond trying again.
   */
  const sendEmailCode = async (): Promise<boolean> => {
    try {
      const { data } = await authApi.otpRequest('EMAIL', email.trim(), 'PARTNER_REGISTRATION');
      setEmailDelivery(data.message);
      // The previous code is dead the moment a new one is minted — clearing the
      // box stops a stale code being submitted against the fresh one.
      setEmailCode('');
      return true;
    } catch (e) {
      setEmailDelivery(null);
      show(apiErrorMessage(e), true);
      return false;
    }
  };

  /**
   * The PHONE leg, on a named transport or on the server's WhatsApp → SMS ladder.
   *
   * THE 502 IS THE POINT. It means the OTP row exists but no transport accepted
   * the message, and it is the case that used to sail through as a 200 and drop
   * the partner onto a code screen for a code that was never sent. Here it sets
   * `failure`, which keeps `sent` false — the form stays up — and turns the
   * server's `alternatives` into the buttons beside it. The resend cooldown is
   * deliberately waived after a failed delivery, so those buttons work
   * immediately; nothing here may gate them behind a timer.
   */
  const sendPhoneCode = async (via: OtpVia = 'auto'): Promise<boolean> => {
    setSendingPhone(via);
    try {
      const { data } = await authApi.otpRequest('PHONE', phone.trim(), 'PARTNER_REGISTRATION', via);
      setPhoneDelivery({
        message: data.message,
        failure: null,
        deliveredVia: data.deliveredVia,
        alternatives: data.alternatives,
        whatsappAvailable: data.whatsappAvailable,
      });
      // Same reason as the email leg: a switch to the other transport mints a
      // new code, so whatever was half-typed for the old one has to go.
      setPhoneCode('');
      return true;
    } catch (e) {
      const failed = otpDeliveryFailure(e);
      if (failed) {
        setPhoneDelivery({
          message: null,
          failure: failed.error,
          deliveredVia: null,
          alternatives: failed.alternatives,
          whatsappAvailable: failed.whatsappAvailable,
        });
        return false;
      }
      // A 429, a 400 or the network — not a delivery report, so it does not get
      // to claim one. Whatever was last known about delivery stays on screen.
      show(apiErrorMessage(e), true);
      return false;
    } finally {
      setSendingPhone(null);
    }
  };

  /**
   * Both legs. `resendAll` is the difference between "get me the code that did
   * not arrive" and "send both again".
   *
   * A leg that already delivered is left alone by default: re-minting a code
   * that arrived wastes a send and walks a WORKING transport into its own rate
   * limit, which is how a half-failure turns into a whole one.
   *
   * Nothing is announced on success. Both legs now print the server's own
   * sentence inline — a snackbar saying "codes sent" over the top of them would
   * be this screen asserting a delivery a second time, in its own words.
   */
  const sendCodes = async (resendAll = false) => {
    setBusy(true);
    try {
      // `Promise.all` is safe here only because both helpers resolve — neither
      // throws — so one leg failing can no longer discard the other.
      await Promise.all([
        resendAll || !emailDelivery ? sendEmailCode() : Promise.resolve(true),
        resendAll || !phoneDelivery?.deliveredVia ? sendPhoneCode() : Promise.resolve(true),
      ]);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (channel: 'EMAIL' | 'PHONE', target: string, code: string) => {
    const res = await authApi.otpVerify(channel, target, 'PARTNER_REGISTRATION', code);
    return res.data.verificationToken;
  };

  const createAccount = async () => {
    setBusy(true);
    try {
      // Verified here rather than as each box fills, so a wrong code is reported
      // once, next to the button that was pressed.
      const emailToken = tokens.email ?? (await verify('EMAIL', email.trim(), emailCode));
      const phoneToken = tokens.phone ?? (await verify('PHONE', phone.trim(), phoneCode));
      setTokens({ email: emailToken, phone: phoneToken });

      await partnerApi.register({
        name: name.trim(),
        contactNumber: phone.trim(),
        address: 'To be confirmed in step 2',
        adminEmail: email.trim(),
        password,
        emailVerificationToken: emailToken,
        phoneVerificationToken: phoneToken,
      });

      // The business exists but there is no session, and steps 2–5 need one.
      const otp = await requestLoginOtp(phone.trim());
      if (!otp.success || !otp.delivery) {
        show('Your business is created. Please sign in to finish setting it up.', true);
        setTimeout(() => router.replace('/(auth)/login'), 2000);
        return;
      }
      router.push({
        pathname: '/(auth)/verify-otp',
        params: {
          identifier: phone.trim(),
          reason: 'new-account',
          // The delivery report travels with the navigation: the code screen has
          // to name the transport, and it cannot ask again without sending a
          // second code.
          message: otp.delivery.message,
          deliveredVia: otp.delivery.deliveredVia,
          alternatives: otp.delivery.alternatives.join(','),
          whatsappAvailable: otp.delivery.whatsappAvailable ? '1' : '0',
          // The sign-in code is a LOGIN code, not a phone verification, and this
          // address was just OTP-verified into the same identity — so if neither
          // WhatsApp nor SMS reaches the handset, the inbox is a real way in.
          // (Which is exactly why the phone VERIFICATION above offers no such
          // thing: that step has to prove the number itself.)
          email: email.trim(),
        },
      });
    } catch (e) {
      show(apiErrorMessage(e), true);
    } finally {
      setBusy(false);
    }
  };

  const canSend =
    name.trim().length >= 2 && phone.trim().length >= 7 && /.+@.+\..+/.test(email) && password.length >= 6;

  /**
   * Both codes are genuinely out. DERIVED, never set by hand — the old boolean
   * flag was flipped optimistically and that is precisely how a partner ended up
   * typing into a code box for a message no transport had accepted.
   */
  const sent = !!emailDelivery && !!phoneDelivery?.deliveredVia;

  return (
    <View style={styles.step}>
      <StepHeading
        c={c}
        title="Start your business profile"
        blurb="Five short steps. Everything is saved as you go, so you can stop and come back."
      />

      <AppInput label="Business name" value={name} onChangeText={setName} leftIcon="store-outline" disabled={sent} />
      <AppInput
        label="Mobile number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        leftIcon="phone-outline"
        autoCapitalize="none"
      />
      <AppInput
        label="Email address"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        leftIcon="email-outline"
      />
      <AppInput
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        leftIcon="lock-outline"
      />

      {!sent ? (
        <>
          <AppButton
            label="Send verification codes"
            loading={busy}
            disabled={!canSend || !!sendingPhone}
            // Wrapped: Paper hands `onPress` a gesture event, which would arrive
            // as a truthy `resendAll` and re-send a leg that already worked.
            onPress={() => void sendCodes()}
          />

          {/*
            Nothing to say until something has been attempted — and once
            something has, this is the entire recovery: the server's own
            sentence, and the transports it will still accept, as buttons.

            NO `onUseEmail` HERE, deliberately. This step verifies a PHONE
            NUMBER; an emailed code proves an inbox and cannot stand in for it.
            The email beside it is a separate leg with its own code.
          */}
          {phoneDelivery || sendingPhone ? (
            <OtpDeliveryNotice
              c={c}
              message={phoneDelivery?.message}
              failure={phoneDelivery?.failure}
              deliveredVia={phoneDelivery?.deliveredVia ?? null}
              alternatives={phoneDelivery?.alternatives ?? []}
              whatsappAvailable={phoneDelivery?.whatsappAvailable ?? null}
              sending={sendingPhone}
              onRetry={(via) => void sendPhoneCode(via)}
            />
          ) : null}

          {/* Google verifies the EMAIL only, so it sits alongside the codes
              rather than instead of them — the phone still needs its own. */}
          {isGoogleAvailable() && !tokens.email ? (
            <View style={{ marginTop: 12 }}>
              <AppButton
                label="Verify email with Google"
                onPress={verifyEmailWithGoogle}
                loading={googling}
                icon="google"
                mode="outlined"
              />
            </View>
          ) : null}
        </>
      ) : (
        <>
          {/* The server's own sentence for the email leg, then ours for what
              the two codes are FOR. The phone leg says where it went in the
              notice below the boxes, next to the buttons that can move it. */}
          <Text style={[styles.note, { color: c.textSecondary }]}>{emailDelivery}</Text>
          <Text style={[styles.note, { color: c.textSecondary }]}>
            Both are verified before the business is created — they both become ways to sign in.
          </Text>
          <AppInput
            label="Code sent to your email"
            value={emailCode}
            onChangeText={setEmailCode}
            keyboardType="numeric"
            leftIcon="email-check-outline"
          />
          <AppInput
            label="Code sent to your phone"
            value={phoneCode}
            onChangeText={setPhoneCode}
            keyboardType="numeric"
            leftIcon="cellphone-check"
          />
          <AppButton
            label="Create my business"
            loading={busy}
            disabled={emailCode.length !== 6 || phoneCode.length !== 6}
            onPress={createAccount}
          />
          {/* Under the code inputs, where somebody who is watching the wrong app
              will look. Still no email fallback — see the note in the other
              branch. */}
          <OtpDeliveryNotice
            c={c}
            message={phoneDelivery?.message}
            failure={phoneDelivery?.failure}
            deliveredVia={phoneDelivery?.deliveredVia ?? null}
            alternatives={phoneDelivery?.alternatives ?? []}
            whatsappAvailable={phoneDelivery?.whatsappAvailable ?? null}
            sending={sendingPhone}
            onRetry={(via) => void sendPhoneCode(via)}
          />

          <TouchableOpacity
            onPress={() => void sendCodes(true)}
            disabled={busy || !!sendingPhone}
            style={styles.footerLink}
          >
            <Text style={{ color: c.primary, fontWeight: '600' }}>Send both codes again</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ------------------------------------------------------------------- step 2

/**
 * Location, and the map pin is REQUIRED.
 *
 * Resident discovery is a `$geoNear` query, so a partner with no coordinates is
 * invisible to every resident however complete the rest of their profile is —
 * better to insist here than to let somebody finish the wizard and wonder why
 * they never get a booking. The server rejects (0, 0) for the same reason: it is
 * a real point in the Gulf of Guinea, so it passes every range check while
 * meaning "the map never loaded".
 *
 * The pin is now placed on a REAL MAP (`components/MapPicker`) — the note that
 * used to sit here said a map needed a development build, and that turned out
 * not to be so: `react-native-maps` is compiled into Expo Go for SDK 54, so it
 * renders under `expo start --go` with no key and no build. See `MapPicker`'s
 * header for the version pin and for what a store binary additionally needs.
 *
 * The two numbers stay TYPEABLE underneath it, and that is not redundancy. They
 * were once rendered as read-only text beside a comment claiming they were
 * editable, which meant the only way past this step was a GPS fix — and a shop
 * whose phone never fixes indoors, or who has denied location permission, had no
 * way to finish registering at all. They are also still the source of truth: the
 * map writes into them, not beside them, so one value decides whether this step
 * may be completed.
 */
function StepLocation({ c, busy, setBusy, show, onSaved }: StepProps) {
  const { data: existing } = useQuery({ queryKey: qk.partner.me(), queryFn: () => partnerApi.me() });

  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [latText, setLatText] = useState('');
  const [lngText, setLngText] = useState('');

  // Shared with Settings → Address & map pin, which asks for the same pair and
  // has to accept exactly what this does. See `lib/geo`.
  const coords = useMemo(() => parseCoords(latText, lngText), [latText, lngText]);

  useEffect(() => {
    const p = existing?.partner;
    if (!p) return;
    setAddress((v) => v || (p.address && !p.address.startsWith('To be confirmed') ? p.address : ''));
    setCity((v) => v || p.city || '');
    setState((v) => v || p.state || '');
    setPincode((v) => v || p.pincode || '');
    // `pointFromLocation` unwraps GeoJSON's [lng, lat] and applies the server's
    // own `hasDiscoveryLocation` rule, under which `[0, 0]` is not a pin.
    const saved = pointFromLocation(p.location);
    if (saved) {
      setLatText((v) => v || String(saved.lat));
      setLngText((v) => v || String(saved.lng));
    }
  }, [existing]);

  /**
   * The map's only way to write — into the boxes, which stay the source of
   * truth, so a pin dropped a shopfront too far can be nudged by typing rather
   * than re-dragged.
   */
  const onPickOnMap = useCallback((lat: number, lng: number) => {
    setLatText(String(lat));
    setLngText(String(lng));
  }, []);

  /**
   * Reverse geocoding, hung off the GPS button ONLY.
   *
   * Standing at the shop is the one moment the phone knows enough to guess the
   * address boxes, and filling them then saves the partner four fields. A
   * dragged pin gets no such treatment: by then the boxes may hold something
   * typed, and overwriting that from a marker nudged twenty metres would be a
   * screen that edits itself.
   *
   * Best-effort throughout — every write is `v || …`, so nothing already
   * entered is replaced, and a failure is swallowed. The pin is the part that
   * decides discoverability; the address is what a resident then reads.
   */
  const fillAddressFromFix = useCallback(async (at: { latitude: number; longitude: number }) => {
    try {
      const [place] = await Location.reverseGeocodeAsync(at);
      if (!place) return;
      if (place.city) setCity((v) => v || place.city || '');
      if (place.region) setState((v) => v || place.region || '');
      if (place.postalCode) setPincode((v) => v || place.postalCode || '');
      if (place.street) {
        setAddress((v) => v || [place.streetNumber, place.street, place.district].filter(Boolean).join(', '));
      }
    } catch {
      /* the pin is the part that matters */
    }
  }, []);

  // `coords` is already null for out-of-range, half-typed and (0, 0), so there
  // is nothing left to re-check about it here.
  const valid =
    address.trim().length >= 5 &&
    city.trim().length > 0 &&
    state.trim().length > 0 &&
    /^\d{6}$/.test(pincode.trim()) &&
    coords !== null;

  return (
    <View style={styles.step}>
      <StepHeading c={c} title="Where you are" blurb="Residents find you by distance, so the pin matters more than the address." />

      {/* No marker until the partner places one, so "the map opened" and "the
          pin is set" can never look the same. `valid` below reads `coords`, not
          the map, so an unplaced pin blocks the step exactly as it always did. */}
      <MapPicker c={c} point={coords} onPick={onPickOnMap} onGpsFix={(at) => void fillAddressFromFix(at)} />

      {/* The same two numbers, by hand. Indoors a phone often never gets a fix,
          and location permission can be refused outright — without these boxes
          either one is the end of the registration. */}
      <View style={styles.coordRow}>
        {/* `numeric`, not `number-pad`: React Native maps it to a keyboard that
            carries the decimal point AND the minus sign on both platforms, and a
            coordinate needs both. */}
        <AppInput
          label="Latitude"
          value={latText}
          onChangeText={setLatText}
          keyboardType="numeric"
          style={styles.coordHalf}
        />
        <AppInput
          label="Longitude"
          value={lngText}
          onChangeText={setLngText}
          keyboardType="numeric"
          style={styles.coordHalf}
        />
      </View>
      <Text style={[styles.note, { color: c.textSecondary }]}>
        {latText || lngText
          ? coords
            ? 'That is a valid point on the map.'
            : 'Latitude is between -90 and 90, longitude between -180 and 180 — and (0, 0) is in the sea.'
          : 'Typing here moves the pin above, so you can also copy the two numbers out of a maps app.'}
      </Text>

      <AppInput label="Full address" value={address} onChangeText={setAddress} multiline leftIcon="map-outline" />
      <AppInput label="City" value={city} onChangeText={setCity} leftIcon="city-variant-outline" />
      <AppInput label="State" value={state} onChangeText={setState} leftIcon="map-marker-outline" />
      <AppInput
        label="Pincode"
        value={pincode}
        onChangeText={setPincode}
        keyboardType="numeric"
        leftIcon="mailbox-outline"
      />

      <AppButton
        label="Save and continue"
        loading={busy}
        disabled={!valid}
        onPress={async () => {
          if (!coords) return;
          setBusy(true);
          try {
            const res = await partnerApi.saveStep({
              step: 2,
              body: {
                address: address.trim(),
                city: city.trim(),
                state: state.trim(),
                pincode: pincode.trim(),
                latitude: coords.lat,
                longitude: coords.lng,
              },
            });
            onSaved(res.onboarding);
          } catch (e) {
            show(apiErrorMessage(e), true);
          } finally {
            setBusy(false);
          }
        }}
      />
    </View>
  );
}

// ------------------------------------------------------------------- step 3

function StepWhat({ c, busy, setBusy, show, onSaved }: StepProps) {
  const online = useIsOnline();
  const { data: existing } = useQuery({ queryKey: qk.partner.me(), queryFn: () => partnerApi.me() });
  const { data: categories, isPending } = useQuery({
    queryKey: qk.onboarding.categories(),
    queryFn: () => partnerApi.categories(),
    // The owner-curated taxonomy changes about never; re-asking on every visit
    // to this step is a request for nothing.
    staleTime: 10 * 60 * 1000,
  });

  const [kind, setKind] = useState<PartnerKind>('SERVICE');
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    const p = existing?.partner;
    if (!p) return;
    if (p.kind) setKind(p.kind);
    const saved = p.categoryIds;
    if (saved?.length) setPicked((v) => (v.length ? v : saved.map(String)));
  }, [existing]);

  /**
   * Only categories this KIND may hold.
   *
   * The same rule the server applies (`applyOnboardingStep` case 3), so the
   * picker cannot offer a combination that would come back as an error naming a
   * category the partner has already tapped. `BOTH` on either side matches
   * everything.
   */
  const offered = useMemo<PartnerCategory[]>(
    () => (categories ?? []).filter((cat) => cat.kindAllowed === 'BOTH' || kind === 'BOTH' || cat.kindAllowed === kind),
    [categories, kind],
  );

  const toggle = (id: string) =>
    setPicked((v) => (v.includes(id) ? v.filter((x) => x !== id) : v.length >= 10 ? v : [...v, id]));

  // Dropping choices that this kind no longer allows, rather than sending them
  // and being refused.
  useEffect(() => {
    const allowed = new Set(offered.map((o) => o._id));
    setPicked((v) => (v.every((id) => allowed.has(id)) ? v : v.filter((id) => allowed.has(id))));
  }, [offered]);

  return (
    <View style={styles.step}>
      <StepHeading c={c} title="What you do" blurb="This decides what residents can search for, and which screens you get." />

      <View style={styles.cards}>
        {PARTNER_KINDS.map((k) => {
          const copy = KIND_COPY[k];
          const active = kind === k;
          return (
            <TouchableOpacity
              key={k}
              onPress={() => setKind(k)}
              style={[
                styles.choiceCard,
                { backgroundColor: active ? c.surfaceVariant : c.surface, borderColor: active ? c.primary : c.border },
              ]}
            >
              <MaterialCommunityIcons
                name={copy.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                size={26}
                color={active ? c.primary : c.textDisabled}
              />
              <View style={styles.flex}>
                <Text style={[styles.choiceTitle, { color: c.textPrimary }]}>{copy.title}</Text>
                <Text style={[styles.note, { color: c.textSecondary }]}>{copy.blurb}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Divider style={styles.divider} />
      <Text style={[styles.label, { color: c.textPrimary }]}>Pick up to 10 categories</Text>
      {/*
        A bare spinner here was a dead end on the registration path.

        Phase 3 wired `onlineManager` (`lib/queryClient.ts`), so with no signal
        react-query PAUSES this query rather than firing it — `isPending` stays
        true forever, no chips arrive, and "Save and continue" is
        `disabled={picked.length === 0}` with nothing to pick. A partner could
        not get past step 3 and was told nothing at all. The spinner now says why
        it is spinning, on the same `onlineManager` flag the cache is acting on,
        and the sentence below the button repeats it where the partner is
        actually looking when nothing happens.
      */}
      {isPending ? (
        <View style={styles.spinner}>
          <ActivityIndicator />
          <Text style={[styles.note, { color: c.textSecondary, marginTop: 8, textAlign: 'center' }]}>
            {online ? 'Loading the list…' : 'No connection — waiting for the network…'}
          </Text>
        </View>
      ) : (
        <View style={styles.chips}>
          {offered.map((cat) => (
            <Chip key={cat._id} selected={picked.includes(cat._id)} onPress={() => toggle(cat._id)} style={styles.chip}>
              {cat.name}
            </Chip>
          ))}
        </View>
      )}
      {isPending && !online && (
        <Text style={[styles.note, { color: c.textSecondary }]}>
          We cannot load the list of work types without a connection. Nothing you have filled in is lost —
          come back to this step once you are back on the network.
        </Text>
      )}

      <AppButton
        label="Save and continue"
        loading={busy}
        disabled={picked.length === 0}
        onPress={async () => {
          setBusy(true);
          try {
            const res = await partnerApi.saveStep({ step: 3, body: { kind, categoryIds: picked } });
            onSaved(res.onboarding);
          } catch (e) {
            show(apiErrorMessage(e), true);
          } finally {
            setBusy(false);
          }
        }}
      />
    </View>
  );
}

// ------------------------------------------------------------------- step 4

/**
 * How the work happens — the step that decides which product this partner gets.
 *
 * `serviceModes` is read everywhere and re-derived nowhere: it decides which
 * modules resolve and which booking flow a resident is shown. So the three
 * options are full-width cards with the consequence spelled out, and the radius
 * only appears once "I travel" is chosen — the server REFUSES a radius sent
 * alongside "customers come to me", precisely so a stale number cannot survive
 * a change of mind and be believed by the discovery query later.
 */
function StepHow({ c, busy, setBusy, show, onSaved }: StepProps) {
  const { data: existing } = useQuery({ queryKey: qk.partner.me(), queryFn: () => partnerApi.me() });
  const [modes, setModes] = useState<PartnerServiceMode[]>([]);
  const [radius, setRadius] = useState<number>(5);

  useEffect(() => {
    const p = existing?.partner;
    if (!p) return;
    const saved = p.serviceModes;
    if (saved?.length) setModes((v) => (v.length ? v : saved));
    if (p.serviceRadiusKm) setRadius(p.serviceRadiusKm);
  }, [existing]);

  const choices: { modes: PartnerServiceMode[]; title: string; blurb: string; icon: string }[] = [
    {
      modes: ['AT_PARTNER'],
      title: 'Customers come to me',
      blurb: 'A shop, a clinic, a salon. Residents see your address and travel to you.',
      icon: 'storefront-outline',
    },
    {
      modes: ['AT_CUSTOMER'],
      title: 'I go to the customer',
      blurb: 'Home visits. Residents inside the distance you set below can book you.',
      icon: 'moped-outline',
    },
    {
      modes: ['AT_PARTNER', 'AT_CUSTOMER'],
      title: 'Both',
      blurb: 'Some jobs at your place, some at theirs. Residents choose when they book.',
      icon: 'swap-horizontal',
    },
  ];

  const same = (a: PartnerServiceMode[], b: PartnerServiceMode[]) =>
    a.length === b.length && a.every((m) => b.includes(m));
  const travels = modes.includes('AT_CUSTOMER');

  return (
    <View style={styles.step}>
      <StepHeading
        c={c}
        title="How you serve customers"
        blurb="This one changes what the app does for you, so it is worth a moment."
      />

      <View style={styles.cards}>
        {choices.map((choice) => {
          const active = same(modes, choice.modes);
          return (
            <TouchableOpacity
              key={choice.title}
              onPress={() => setModes(choice.modes)}
              style={[
                styles.choiceCard,
                styles.choiceCardTall,
                { backgroundColor: active ? c.surfaceVariant : c.surface, borderColor: active ? c.primary : c.border },
              ]}
            >
              <MaterialCommunityIcons
                name={choice.icon as React.ComponentProps<typeof MaterialCommunityIcons>['name']}
                size={30}
                color={active ? c.primary : c.textDisabled}
              />
              <View style={styles.flex}>
                <Text style={[styles.choiceTitle, { color: c.textPrimary }]}>{choice.title}</Text>
                <Text style={[styles.note, { color: c.textSecondary }]}>{choice.blurb}</Text>
              </View>
              <MaterialCommunityIcons
                name={active ? 'radiobox-marked' : 'radiobox-blank'}
                size={22}
                color={active ? c.primary : c.textDisabled}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      {travels && (
        <>
          <Text style={[styles.label, { color: c.textPrimary }]}>How far do you travel?</Text>
          <View style={styles.chips}>
            {RADIUS_CHOICES.map((km) => (
              <Chip key={km} selected={radius === km} onPress={() => setRadius(km)} style={styles.chip}>
                {km} km
              </Chip>
            ))}
          </View>
        </>
      )}

      <AppButton
        label="Save and continue"
        loading={busy}
        disabled={modes.length === 0}
        onPress={async () => {
          setBusy(true);
          try {
            const res = await partnerApi.saveStep({
              step: 4,
              // Sent ONLY when they travel. The server rejects the other
              // combination by name rather than ignoring it.
              body: travels ? { serviceModes: modes, serviceRadiusKm: radius } : { serviceModes: modes },
            });
            onSaved(res.onboarding);
          } catch (e) {
            show(apiErrorMessage(e), true);
          } finally {
            setBusy(false);
          }
        }}
      />
    </View>
  );
}

// ------------------------------------------------------------------- step 5

/**
 * KYC and opening hours, then submit.
 *
 * Documents are uploaded ONE AT A TIME to S3 and attached by URL — two calls,
 * not one multipart submit — so a partner who uploads three files and then loses
 * their connection still has three files uploaded. That is the whole reason
 * `POST /partners/me/kyc-docs` takes a URL instead of a file.
 *
 * The refusal from `submit-for-review` carries `missing[]`: every unfinished
 * item, named, with the step it belongs to. Those sentences are written for a
 * shop owner to act on and are rendered VERBATIM, each one a tap-through to the
 * step that fixes it — "your profile is incomplete" is exactly the message this
 * shape exists to prevent, and a list naming step 2 that cannot open step 2 is
 * the same dead end in longer words.
 */
function StepPapers({ c, busy, setBusy, show, onSaved, onJump }: StepProps & { onJump: (n: number) => void }) {
  const { data: existing } = useQuery({ queryKey: qk.partner.me(), queryFn: () => partnerApi.me() });
  const queryClient = useQueryClient();

  const [gst, setGst] = useState('');
  const [pan, setPan] = useState('');
  const [licence, setLicence] = useState('');
  const [week, setWeek] = useState<DayTiming[]>(defaultWeek());
  const [docs, setDocs] = useState<PartnerKycDoc[]>([]);
  const [docType, setDocType] = useState<PartnerDocType>('GST');
  /**
   * Whether ResiSmart is collecting documents at all. Read from the server's
   * onboarding status, never decided here — the same status object whose
   * `missing[]` this step renders, so the form cannot ask for a document the
   * checklist has stopped requiring.
   *
   * `!== false` so a server that predates the switch still asks. Fail-closed.
   */
  const { data: liveStatus } = useQuery({
    queryKey: qk.onboarding.status(),
    queryFn: partnerApi.onboardingStatus,
  });
  const kycRequired = liveStatus?.kycRequired !== false;
  const [uploading, setUploading] = useState(false);
  const [missing, setMissing] = useState<OnboardingStatus['missing']>([]);

  useEffect(() => {
    const p = existing?.partner;
    if (!p) return;
    setGst((v) => v || p.kyc?.gstNumber || '');
    setLicence((v) => v || p.kyc?.licenseNumber || '');
    if (p.timings?.weekly?.length) setWeek(p.timings.weekly);
    if (p.verification?.docs?.length) setDocs(p.verification.docs);
  }, [existing]);

  const attach = async () => {
    setUploading(true);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        // `mediaTypes: ['images']` — the string-array form. `MediaTypeOptions`
        // is deprecated in this SDK and reads as an object at runtime.
        mediaTypes: ['images'],
        quality: 0.7, // a 6 MB phone photo of a licence is a minute of upload for nothing
      });
      if (picked.canceled || !picked.assets.length) return;
      const asset = picked.assets[0];
      const uploaded = await uploadKycFile({
        uri: asset.uri,
        name: asset.fileName ?? `${docType.toLowerCase()}-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      const res = await partnerApi.addKycDoc({
        type: docType,
        url: uploaded.url,
        fileName: asset.fileName ?? undefined,
      });
      setDocs((d) => [...d, res.doc]);
      queryClient.setQueryData(qk.onboarding.status(), res.onboarding);
      show('Document attached.');
    } catch (e) {
      show(apiErrorMessage(e, 'That upload did not go through.'), true);
    } finally {
      setUploading(false);
    }
  };

  const removeDoc = async (id: string) => {
    try {
      const res = await partnerApi.removeKycDoc(id);
      setDocs((d) => d.filter((x) => x._id !== id));
      queryClient.setQueryData(qk.onboarding.status(), res.onboarding);
    } catch (e) {
      show(apiErrorMessage(e), true);
    }
  };

  const saveAndSubmit = async () => {
    setBusy(true);
    setMissing([]);
    try {
      await partnerApi.saveStep({
        step: 5,
        body: {
          kyc: {
            // Empty string is "I cleared this box"; the server tells that apart
            // from an omitted key, which means "leave it alone".
            gstNumber: gst.trim().toUpperCase(),
            pan: pan.trim().toUpperCase(),
            licenseNumber: licence.trim(),
          },
          timings: { weekly: week },
        },
      });
      const res = await partnerApi.submitForReview();
      onSaved(res.onboarding);
      show('Sent for verification. We will let you know as soon as it has been reviewed.');
    } catch (e) {
      const body = (e as { response?: { data?: { missing?: OnboardingStatus['missing'] } } }).response?.data;
      if (body?.missing?.length) setMissing(body.missing);
      show(apiErrorMessage(e), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.step}>
      <StepHeading
        c={c}
        title="Papers and opening hours"
        blurb="One document is enough to start. We check it before your profile goes live."
      />

      <AppInput label="GSTIN (optional)" value={gst} onChangeText={setGst} autoCapitalize="characters" leftIcon="file-percent-outline" />
      <AppInput label="PAN (optional)" value={pan} onChangeText={setPan} autoCapitalize="characters" leftIcon="card-account-details-outline" />
      <AppInput label="Licence number (optional)" value={licence} onChangeText={setLicence} leftIcon="license" />
      <Text style={[styles.note, { color: c.textSecondary }]}>
        We store only the first and last two characters of a PAN. The document you upload is the evidence a
        reviewer actually looks at.
      </Text>

      {/**
        * The whole documents block disappears when this installation does not
        * ask for them — the owner's switch in Settings → Partner Settings.
        *
        * It must disappear rather than merely stop being required: with KYC off
        * the server has also stopped listing a missing document in `missing[]`,
        * so an upload control left on screen would be asking for something
        * nothing needs and blocking nothing if ignored.
        */}
      {kycRequired && (
        <>
          <Divider style={styles.divider} />
          <Text style={[styles.label, { color: c.textPrimary }]}>Documents</Text>
          <View style={styles.chips}>
            {DOC_TYPES.map((t) => (
              <Chip key={t.value} selected={docType === t.value} onPress={() => setDocType(t.value)} style={styles.chip}>
                {t.label}
              </Chip>
            ))}
          </View>
          <AppButton
            label={uploading ? 'Uploading…' : 'Attach a photo or scan'}
            mode="outlined"
            icon="upload"
            loading={uploading}
            onPress={attach}
          />
          {docs.map((d) => (
            <View key={d._id} style={[styles.docRow, { borderColor: c.divider }]}>
              <MaterialCommunityIcons name="file-check-outline" size={20} color={c.success} />
              <Text style={[styles.flex, { color: c.textPrimary }]} numberOfLines={1}>
                {d.fileName ?? d.type}
              </Text>
              <TouchableOpacity onPress={() => removeDoc(d._id)}>
                <MaterialCommunityIcons name="trash-can-outline" size={20} color={c.error} />
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      <Divider style={styles.divider} />
      <Text style={[styles.label, { color: c.textPrimary }]}>Opening hours</Text>
      {week.map((day, i) => (
        <View key={day.day} style={[styles.dayRow, { borderColor: c.divider }]}>
          <Text style={[styles.dayName, { color: c.textPrimary }]} numberOfLines={1}>
            {DAY_NAMES[day.day]}
          </Text>
          <Text style={[styles.flex, { color: c.textSecondary }]}>
            {day.isOpen ? day.windows.map((w) => `${w.from}–${w.to}`).join(', ') || 'No hours set' : 'Closed'}
          </Text>
          <Switch
            value={day.isOpen}
            onValueChange={(open) =>
              setWeek((w) =>
                w.map((d, idx) =>
                  idx === i
                    ? // An open day with no window is the shape that makes a
                      // booking calendar render an empty day the partner
                      // believes is bookable — so one is put back with the flag.
                      { ...d, isOpen: open, windows: open && !d.windows.length ? [{ from: '09:00', to: '21:00' }] : d.windows }
                    : d,
                ),
              )
            }
          />
        </View>
      ))}

      {missing.length > 0 && (
        <View style={[styles.missing, { backgroundColor: c.surface, borderColor: c.error }]}>
          <Text style={[styles.label, { color: c.error }]}>Still needed — tap one to fix it</Text>
          {missing.map((m) => (
            <TouchableOpacity
              key={`${m.step}-${m.field}`}
              onPress={() => onJump(m.step)}
              style={styles.missingRow}
            >
              <Text style={[styles.flex, { color: c.textSecondary }]}>
                • {m.message} <Text style={{ color: c.primary, fontWeight: '600' }}>Step {m.step}</Text>
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={c.textDisabled} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <AppButton label="Send for verification" loading={busy} onPress={saveAndSubmit} />
    </View>
  );
}

/**
 * Layout only; colours come from `themeColors(isDark)` at render.
 *
 * Sized for a 360dp screen at a large system font scale, not for the simulator:
 * the page padding is 18 rather than 22, the wizard is capped so it does not
 * stretch across a tablet, and nothing in a row is given a fixed width that its
 * own text can outgrow (see `dayName`).
 */
const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: {
    padding: 18,
    paddingBottom: 48,
    gap: 8,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  brandHero: { paddingVertical: 22, marginBottom: 10 },
  rail: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18, marginTop: 6 },
  railItem: { alignItems: 'center', gap: 6, flex: 1, paddingHorizontal: 2 },
  railDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  railNum: { fontSize: 12, fontWeight: '600' },
  railLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
  step: { gap: 4 },
  heading: { marginBottom: 10, gap: 4 },
  h1: { fontSize: 23, fontWeight: '600' },
  h2: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  note: { fontSize: 12.5, lineHeight: 18 },
  cards: { gap: 10, marginVertical: 6 },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radii.card,
    borderWidth: 1.5,
  },
  choiceCardTall: { paddingVertical: 20 },
  choiceTitle: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { marginBottom: 4 },
  divider: { marginVertical: 14 },
  spinner: { marginVertical: 16, alignItems: 'center' },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1 },
  // `minWidth`, not `width`: at a 1.5× font scale "Wed" needs about 50dp and a
  // hard 42 clipped it to "We…" on every row of the opening-hours list.
  dayName: { minWidth: 42, flexShrink: 0, fontSize: 14, fontWeight: '600' },
  missing: { borderWidth: 1.5, borderRadius: radii.card, padding: 14, marginTop: 14 },
  missingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  // The reviewer's note, and the only block on this screen that is not part of
  // a step — it sits under the rail and above whichever step is open.
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: radii.card,
    padding: 14,
    marginBottom: 12,
  },
  noticeTitle: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  coordRow: { flexDirection: 'row', gap: 10 },
  coordHalf: { flex: 1 },
  // Back on the left, sign out on the right, so neither can be hit while
  // reaching for the other.
  exitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  footerLink: { alignSelf: 'center', paddingVertical: 14 },
});
