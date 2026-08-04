import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
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
import { authApi } from '../../src/api/auth.api';
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
import { AppInput } from '../../src/components/AppInput';
import { AppLogo } from '../../src/components/AppLogo';
import { themeColors, radii, ColorScheme } from '../../src/constants/colors';
import { qk } from '../../src/lib/queryKeys';
import { useOnboardingStatus, resumeStep } from '../../src/hooks';
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
 *      step opens. The step lives on the partner DOCUMENT, so it survives a
 *      reinstall and follows the partner to another device.
 *   2. Every step is saved to the server the moment it is completed, not batched
 *      at the end. `saveOnboardingStep` advances `partner.onboardingStep` and
 *      never moves it backwards.
 *   3. A partner who signs in with an unfinished registration is routed BACK
 *      here rather than into the app — see `useOnboardingGate`, which the root
 *      layout applies.
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
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const { status, loading: statusLoading } = useOnboardingStatus({ enabled: isAuthenticated });
  const [step, setStep] = useState<number>(1);
  const [landed, setLanded] = useState(!isAuthenticated);
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
   * Land on the SAVED step, exactly once.
   *
   * `landed` guards it because the status query refetches — without the guard,
   * a refetch triggered by finishing step 3 would yank the partner back to
   * whatever the server said a moment ago, mid-typing on step 4.
   */
  useEffect(() => {
    if (landed || !status) return;
    setStep(resumeStep(status));
    setLanded(true);
  }, [landed, status]);

  const refreshStatus = useCallback(
    (next: OnboardingStatus | undefined) => {
      if (next) queryClient.setQueryData(qk.onboarding.status(), next);
      void queryClient.invalidateQueries({ queryKey: qk.entitlements() });
    },
    [queryClient],
  );

  const goNext = useCallback(() => setStep((s) => Math.min(5, s + 1)), []);

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
          <View style={styles.header}>
            <AppLogo size="small" showTagline={false} />
          </View>

          <StepRail current={step} c={c} onJump={(n) => isAuthenticated && n < step && setStep(n)} />

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
          {step === 5 && <StepPapers c={c} busy={busy} setBusy={setBusy} show={show} onSaved={refreshStatus} />}

          {step === 1 && !isAuthenticated && (
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')} style={styles.footerLink}>
              <Text style={{ color: c.textSecondary }}>
                Already registered? <Text style={{ color: c.primary, fontWeight: '700' }}>Sign in</Text>
              </Text>
            </TouchableOpacity>
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

function StepRail({ current, c, onJump }: { current: number; c: ColorScheme; onJump: (n: number) => void }) {
  return (
    <View style={styles.rail}>
      {STEPS.map((s) => {
        const done = s.n < current;
        const active = s.n === current;
        return (
          <TouchableOpacity
            key={s.n}
            style={styles.railItem}
            onPress={() => onJump(s.n)}
            disabled={!done}
            activeOpacity={done ? 0.7 : 1}
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
            <Text style={[styles.railLabel, { color: active ? c.textPrimary : c.textDisabled }]}>{s.label}</Text>
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
  const [sent, setSent] = useState(false);
  const [emailCode, setEmailCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [tokens, setTokens] = useState<{ email?: string; phone?: string }>({});

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

  const sendCodes = async () => {
    setBusy(true);
    try {
      await Promise.all([
        authApi.otpRequest('EMAIL', email.trim(), 'PARTNER_REGISTRATION'),
        authApi.otpRequest('PHONE', phone.trim(), 'PARTNER_REGISTRATION'),
      ]);
      setSent(true);
      show('Codes sent. Check your email and your phone.');
    } catch (e) {
      show(apiErrorMessage(e), true);
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
      if (!otp.success) {
        show('Your business is created. Please sign in to finish setting it up.', true);
        setTimeout(() => router.replace('/(auth)/login'), 2000);
        return;
      }
      router.push({
        pathname: '/(auth)/verify-otp',
        params: {
          identifier: phone.trim(),
          reason: 'new-account',
          ...(otp.devCode ? { devCode: otp.devCode } : {}),
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
        <AppButton label="Send verification codes" loading={busy} disabled={!canSend} onPress={sendCodes} />
      ) : (
        <>
          <Text style={[styles.note, { color: c.textSecondary }]}>
            We sent a 6-digit code to each. Both are verified before the business is created — they both become
            ways to sign in.
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
          <TouchableOpacity onPress={sendCodes} disabled={busy} style={styles.footerLink}>
            <Text style={{ color: c.primary, fontWeight: '600' }}>Send the codes again</Text>
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
 * This captures the pin from GPS rather than from a draggable map: a real map
 * needs `react-native-maps`, an API key per platform and a dev build, which is a
 * shipping decision and not this agent's to take. The numbers stay visible and
 * editable so a shop whose GPS lands on the wrong side of the road can correct
 * it — see the report for what a proper pin would cost.
 */
function StepLocation({ c, busy, setBusy, show, onSaved }: StepProps) {
  const { data: existing } = useQuery({ queryKey: qk.partner.me(), queryFn: () => partnerApi.me() });

  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    const p = existing?.partner;
    if (!p) return;
    setAddress((v) => v || (p.address && !p.address.startsWith('To be confirmed') ? p.address : ''));
    setCity((v) => v || p.city || '');
    setState((v) => v || p.state || '');
    setPincode((v) => v || p.pincode || '');
    const [lng, lat] = p.location?.coordinates ?? [];
    if (typeof lat === 'number' && typeof lng === 'number' && !(lat === 0 && lng === 0)) {
      setCoords((v) => v ?? { lat, lng });
    }
  }, [existing]);

  const locate = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        show('We need location access to place your shop on the map. You can also type the coordinates.', true);
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });

      // Best-effort only. A failed reverse geocode must not block the step —
      // the partner can type the three fields, and the pin is what actually
      // matters for discovery.
      try {
        const [place] = await Location.reverseGeocodeAsync(position.coords);
        if (place) {
          if (place.city) setCity((v) => v || place.city || '');
          if (place.region) setState((v) => v || place.region || '');
          if (place.postalCode) setPincode((v) => v || place.postalCode || '');
          if (!address && place.street) {
            setAddress([place.streetNumber, place.street, place.district].filter(Boolean).join(', '));
          }
        }
      } catch {
        /* the pin is the part that matters */
      }
    } catch (e) {
      show(apiErrorMessage(e, 'Could not read your location.'), true);
    } finally {
      setLocating(false);
    }
  };

  const valid =
    address.trim().length >= 5 &&
    city.trim().length > 0 &&
    state.trim().length > 0 &&
    /^\d{6}$/.test(pincode.trim()) &&
    coords !== null &&
    !(coords.lat === 0 && coords.lng === 0);

  return (
    <View style={styles.step}>
      <StepHeading c={c} title="Where you are" blurb="Residents find you by distance, so the pin matters more than the address." />

      <TouchableOpacity
        onPress={locate}
        disabled={locating}
        style={[styles.pinCard, { backgroundColor: coords ? c.surfaceVariant : c.surface, borderColor: coords ? c.primary : c.border }]}
      >
        <MaterialCommunityIcons
          name={coords ? 'map-marker-check' : 'map-marker-plus-outline'}
          size={28}
          color={coords ? c.primary : c.textDisabled}
        />
        <View style={styles.flex}>
          <Text style={[styles.pinTitle, { color: c.textPrimary }]}>
            {coords ? 'Pin placed' : 'Place the pin on your shop'}
          </Text>
          <Text style={[styles.note, { color: c.textSecondary }]}>
            {coords
              ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)} — tap to take it again from where you are standing.`
              : 'Stand at your shop and tap here. This is what puts you in front of nearby residents.'}
          </Text>
        </View>
        {locating && <ActivityIndicator />}
      </TouchableOpacity>

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
      {isPending ? (
        <ActivityIndicator style={styles.spinner} />
      ) : (
        <View style={styles.chips}>
          {offered.map((cat) => (
            <Chip key={cat._id} selected={picked.includes(cat._id)} onPress={() => toggle(cat._id)} style={styles.chip}>
              {cat.name}
            </Chip>
          ))}
        </View>
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
 * shop owner to act on and are rendered VERBATIM with a tap-through to the step
 * — "your profile is incomplete" is exactly the message this shape exists to
 * prevent.
 */
function StepPapers({ c, busy, setBusy, show, onSaved }: StepProps) {
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
          <Text style={[styles.dayName, { color: c.textPrimary }]}>{DAY_NAMES[day.day]}</Text>
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
          <Text style={[styles.label, { color: c.error }]}>Still needed</Text>
          {missing.map((m) => (
            <Text key={`${m.step}-${m.field}`} style={{ color: c.textSecondary, marginTop: 4 }}>
              • {m.message} <Text style={{ color: c.textDisabled }}>(step {m.step})</Text>
            </Text>
          ))}
        </View>
      )}

      <AppButton label="Send for verification" loading={busy} onPress={saveAndSubmit} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 22, paddingBottom: 48, gap: 8 },
  header: { alignItems: 'center', marginBottom: 6 },
  rail: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18, marginTop: 6 },
  railItem: { alignItems: 'center', gap: 6, flex: 1 },
  railDot: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  railNum: { fontSize: 12, fontWeight: '700' },
  railLabel: { fontSize: 11, fontWeight: '600' },
  step: { gap: 4 },
  heading: { marginBottom: 10, gap: 4 },
  h1: { fontSize: 23, fontWeight: '800' },
  h2: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '700', marginTop: 10, marginBottom: 6 },
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
  choiceTitle: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  pinCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: radii.card,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  pinTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { marginBottom: 4 },
  divider: { marginVertical: 14 },
  spinner: { marginVertical: 16 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1 },
  dayName: { width: 42, fontSize: 14, fontWeight: '700' },
  missing: { borderWidth: 1.5, borderRadius: radii.card, padding: 14, marginTop: 14 },
  footerLink: { alignSelf: 'center', paddingVertical: 14 },
});
