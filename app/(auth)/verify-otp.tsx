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
import { useTranslation } from 'react-i18next';

import { useAuth } from '../../src/context/AuthContext';
import { AppButton } from '../../src/components/AppButton';
import { Hero } from '../../src/components/Hero';
import { OtpDeliveryNotice } from '../../src/components/OtpDeliveryNotice';
import { OtpAltVia, OtpDeliveredVia, OtpVia, ProfileInfo } from '../../src/api/auth.api';
import { themeColors, radii } from '../../src/constants/colors';
import { ContextPickerModal } from '../../src/components/ContextPickerModal'; // M01 audit
import { apiErrorMessage } from '../../src/api/axios'; // M01 audit

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
 * ── Saying where the code went ────────────────────────────────────────────
 *
 * The code is REQUESTED on the screen before this one, so the delivery report
 * that came back with it is handed over as params rather than re-fetched — a
 * second request just to learn what the first one did would send a second code.
 * From then on this screen owns the report, because every re-request it makes
 * returns a fresh one.
 *
 * `POST /auth/login/otp/request` is the enumeration-safe endpoint: it answers
 * 200 for everybody and its `deliveredVia` is the transport used OR MERELY
 * INTENDED. It cannot report a failed delivery, and it must not be made to —
 * so there is no 502 branch here and no "we could not deliver" copy. What the
 * user gets instead, and what actually helps them, is the other transport as a
 * button. Anything thrown by a re-request is a 429, a 400 or the network.
 *
 * Params:
 *   identifier         email or phone — whichever the code was sent to
 *   reason             'new-account' softens the copy for someone who has just
 *                      registered and is being asked for a third code in two minutes
 *   message            the server's own sentence, which already names the transport
 *   deliveredVia       'whatsapp' | 'sms' | 'email'
 *   alternatives       comma-separated rungs the server will still accept
 *   whatsappAvailable  '1' | '0' — a platform fact, safe to print
 *   email              the identity's verified email, where the sending flow knows
 *                      one. Present from the signup wizard (whose identifier is a
 *                      PHONE) and absent from sign-in, where the identifier
 *                      already is the email and offering it would be a no-op.
 */

const CODE_LENGTH = 6;
/**
 * M01 audit: 60, the server's own resend gap (`otpResendCooldownSeconds`, 60
 * unless a deployment overrides it) — at 30 the button was offered half a
 * minute early and its first tap was always a 429.
 */
const RESEND_SECONDS = 60;

/** What the screen is currently telling the user about delivery. */
interface DeliveryView {
  message: string | null;
  deliveredVia: OtpDeliveredVia | null;
  alternatives: OtpAltVia[];
  whatsappAvailable: boolean | null;
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Params arrive as strings; anything unrecognised becomes "we were not told". */
const asDeliveredVia = (v: unknown): OtpDeliveredVia | null =>
  v === 'whatsapp' || v === 'sms' || v === 'email' ? v : null;

const asAlternatives = (v: unknown): OtpAltVia[] =>
  asString(v)
    .split(',')
    .filter((s): s is OtpAltVia => s === 'whatsapp' || s === 'sms');

const asTriState = (v: unknown): boolean | null => (v === '1' ? true : v === '0' ? false : null);

export default function VerifyOtpScreen() {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const c = themeColors(isDark);
  const params = useLocalSearchParams<{
    identifier?: string;
    reason?: string;
    message?: string;
    deliveredVia?: string;
    alternatives?: string;
    whatsappAvailable?: string;
    email?: string;
  }>();
  const isNewAccount = params.reason === 'new-account';
  const emailIdentity = asString(params.email);

  const { requestLoginOtp, verifyLoginOtp, selectContext } = useAuth();
  const inputRef = useRef<RNTextInput>(null);
  // >>> M01 audit — the business picker, on THIS screen (see `ContextPickerModal`).
  const [picker, setPicker] = useState<{ handle: string; profiles: ProfileInfo[] } | null>(null);
  const [picking, setPicking] = useState(false);
  // <<< M01 audit

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  /** The transport being requested right now, or `null`. Never the cooldown. */
  const [sending, setSending] = useState<OtpVia | null>(null);
  /**
   * Set only once this screen has sent a code of its own. Until then the params
   * are the truth, and they are read fresh on every render rather than captured
   * into state — expo-router can deliver them a beat after the first paint, and
   * a `useState` initialiser would freeze the empty version.
   */
  const [sentHere, setSentHere] = useState<DeliveryView | null>(null);
  /**
   * The address this screen switched to, when the user chose "use email
   * instead". It replaces the param for verification as well as for sending —
   * the code is bound to the target it went to.
   */
  const [switchedTo, setSwitchedTo] = useState<string | null>(null);

  const identifier = switchedTo ?? asString(params.identifier);

  const delivery: DeliveryView = sentHere ?? {
    message: asString(params.message) || null,
    deliveredVia: asDeliveredVia(params.deliveredVia),
    alternatives: asAlternatives(params.alternatives),
    whatsappAvailable: asTriState(params.whatsappAvailable),
  };
  const [snack, setSnack] = useState<{ visible: boolean; message: string; error: boolean }>({
    visible: false,
    message: '',
    error: false,
  });

  const show = (message: string, error = false) => setSnack({ visible: true, message, error });

  useEffect(() => {
    if (cooldown <= 0) return;
    // `handle`, not `t` — `t` is the translator in this component.
    const handle = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(handle);
  }, [cooldown]);

  const submit = useCallback(
    async (value: string) => {
      if (value.length !== CODE_LENGTH || busy) return;
      setBusy(true);
      try {
        const result = await verifyLoginOtp(identifier, value);
        if (result.success) {
          /**
           * No navigation, and TWO guards do the moving — which is worth being
           * precise about, because for a long time only one of them did and a
           * partner who had just registered was left standing here.
           *
           * `app/_layout.tsx` swaps `(app)` for `(auth)` on the session. That
           * alone cannot help somebody who registered a moment ago: they are
           * created in DRAFT, so `needsOnboarding` is true both before and after
           * this line and the group they are in never changes. `(auth)/_layout`
           * is what moves them — this screen leaves the navigator when the
           * session opens, and the wizard is the route left standing.
           *
           * An already-live partner is carried by the root guard as before.
           * Either way, pushing a route here would race the swap.
           */
          return;
        }
        // >>> M01 audit — #46: the code was right, the account is waiting out its 30-day deletion.
        if (result.pendingDeletion) {
          router.replace('/(auth)/restore-account');
          return;
        }
        // Somebody who works in two partner businesses and signs in with a
        // code. The picker is shown HERE: it used to send them back to the
        // password form "to pick one", which a passwordless partner cannot use
        // and whose code button led straight back to this screen — a loop.
        if (result.requiresContextSelection && result.userId) {
          setPicker({ handle: result.userId, profiles: result.profiles ?? [] });
          return;
        }
        // <<< M01 audit
        show(result.error ?? t('auth.verifyOtp.codeFailed'), true);
        setCode('');
      } finally {
        setBusy(false);
      }
    },
    [busy, identifier, verifyLoginOtp, t],
  );

  /**
   * One path for every re-request: the plain resend, the alternative-transport
   * buttons and the switch to email all land here, so there is exactly one place
   * that knows what a new code does to the screen.
   *
   * `to` is passed rather than read off `identifier` because the email switch
   * changes the target and the send, and the two must not be able to disagree.
   */
  const send = useCallback(
    async (via: OtpVia, to: string) => {
      if (sending || !to) return;
      setSending(via);
      try {
        const result = await requestLoginOtp(to, via);
        if (!result.success || !result.delivery) {
          // A 429, a 400, or no network. Never a delivery failure — this
          // endpoint does not report those. See the header.
          show(result.error ?? t('auth.verifyOtp.resendFailed'), true);
          return;
        }
        if (to !== identifier) setSwitchedTo(to);
        setSentHere({
          message: result.delivery.message,
          deliveredVia: result.delivery.deliveredVia,
          alternatives: result.delivery.alternatives,
          whatsappAvailable: result.delivery.whatsappAvailable,
        });
        // The old code is dead the moment a new one is minted, so clearing the
        // boxes is not politeness — it stops a half-typed old code being
        // submitted against the new one.
        setCode('');
        // Restarts the countdown on the SAME-transport resend only. The
        // alternative buttons are never gated by it: the server waives the
        // cooldown on a transport switch, and greying the one control that is
        // guaranteed to work would be the old silence in a new shape.
        setCooldown(RESEND_SECONDS);
      } finally {
        setSending(null);
      }
    },
    [identifier, requestLoginOtp, sending, t],
  );

  const resend = useCallback(() => {
    if (cooldown > 0) return;
    void send('auto', identifier);
  }, [cooldown, identifier, send]);

  const onChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    // Submitted as soon as the last digit lands. A partner holding a phone in
    // one hand and a customer's order in the other should not have to find a
    // button as well.
    if (digits.length === CODE_LENGTH) void submit(digits);
  };

  // >>> M01 audit — finish (or abandon) a sign-in that resolved several businesses.
  const pickBusiness = async (profile: ProfileInfo) => {
    if (!picker) return;
    setPicking(true);
    try {
      // On success the session opens and `(auth)/_layout` takes this screen away.
      await selectContext(picker.handle, profile.tenantId, profile.role);
      setPicker(null);
    } catch (err) {
      show(apiErrorMessage(err, t('auth.login.contextFailed')), true);
    } finally {
      setPicking(false);
    }
  };

  const cancelPick = () => {
    if (picking) return;
    setPicker(null);
    setCode('');
    show(t('auth.login.noProfileChosen'));
  };
  // <<< M01 audit

  if (!identifier) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.background }]}>
        <View style={styles.centre}>
          <Text style={[styles.title, { color: c.textPrimary }]}>{t('auth.verifyOtp.nothingToVerifyTitle')}</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            {t('auth.verifyOtp.nothingToVerifyBody')}
          </Text>
          <AppButton label={t('auth.verifyOtp.backToSignIn')} onPress={() => router.replace('/(auth)/login')} />
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
          <Hero
            isDark={isDark}
            variant="brand"
            logoSize="medium"
            style={styles.brandHero}
          />

          <Text style={[styles.title, { color: c.textPrimary }]}>
            {isNewAccount ? t('auth.verifyOtp.titleNewAccount') : t('auth.verifyOtp.title')}
          </Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>
            {/* The identifier lives here and the TRANSPORT lives in the notice
                below, which prints the server's own sentence. Saying "we have
                sent a code" here as well would be this screen asserting a
                delivery it did not perform and cannot see. */}
            {isNewAccount
              ? t('auth.verifyOtp.subtitleNewAccount', { identifier })
              : t('auth.verifyOtp.subtitle', { identifier })}
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
              label={t('auth.verifyOtp.verify')}
              onPress={() => void submit(code)}
              disabled={code.length !== CODE_LENGTH}
            />
          )}

          {/* Under the code input, as the obvious next move for somebody who is
              watching the wrong app. `onUseEmail` is offered only where there is
              a second identity to fall back to — from the signup wizard, whose
              identifier is a phone. On sign-in the identifier already IS the
              email, so the control would do nothing and is omitted. */}
          <OtpDeliveryNotice
            c={c}
            message={delivery.message}
            deliveredVia={delivery.deliveredVia}
            alternatives={delivery.alternatives}
            whatsappAvailable={delivery.whatsappAvailable}
            sending={sending}
            onRetry={(via) => void send(via, identifier)}
            onUseEmail={
              emailIdentity && emailIdentity !== identifier
                ? () => void send('auto', emailIdentity)
                : undefined
            }
          />

          {/* Same-transport resend, and the ONLY control the countdown touches. */}
          <TouchableOpacity
            onPress={resend}
            disabled={cooldown > 0 || !!sending}
            style={styles.resend}
          >
            <Text style={{ color: cooldown > 0 || sending ? c.textDisabled : c.primary, fontWeight: '600' }}>
              {cooldown > 0 ? t('auth.verifyOtp.resendIn', { seconds: cooldown }) : t('auth.verifyOtp.resend')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={styles.resend}>
            <Text style={{ color: c.textSecondary }}>{t('auth.verifyOtp.differentAccount')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* M01 audit — several businesses: pick one here, not on the password form. */}
      <ContextPickerModal
        visible={!!picker}
        profiles={picker?.profiles ?? []}
        loading={picking}
        onSelect={(p) => { void pickBusiness(p); }}
        onCancel={cancelPick}
      />

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
  centre: { flex: 1, justifyContent: 'center', padding: 22, gap: 12 },
  // 22, not 28: six code boxes plus their gaps have to fit between these two
  // edges, and at 28 on a 360dp screen each box was down to 44dp.
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
  title: { fontSize: 24, fontWeight: '600' },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 10 },
  boxes: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginVertical: 10 },
  box: {
    flex: 1,
    // `minHeight`, so a digit rendered at a large system font scale grows the
    // box instead of being clipped by it.
    minHeight: 58,
    paddingVertical: 10,
    borderRadius: radii.field,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxText: { fontSize: 24, fontWeight: '600' },
  hidden: { position: 'absolute', opacity: 0, height: 1, width: 1 },
  spinner: { marginVertical: 14 },
  resend: { alignSelf: 'center', paddingVertical: 10 },
});
