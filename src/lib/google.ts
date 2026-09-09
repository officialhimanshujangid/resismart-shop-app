import { GOOGLE_WEB_CLIENT_ID } from '../constants/app';
import type { Translate } from '../features/services/duration';

/**
 * Google Sign-In for the partner app, reduced to "give me an ID token".
 *
 * THE TOKEN IS THE POINT, not the Google profile the SDK also returns. The
 * server reads the identity out of the signed token; anything read off the
 * device is a claim, and the backend acts on none of them.
 *
 * `webClientId` IS THE WEB CLIENT ID, not this app's Android or iOS one. Google
 * mints the token with that as its audience and the server checks the audience
 * against the same value. The Android/iOS client ids must exist in the Google
 * console — sign-in fails without them — but they never appear in code.
 *
 * NOTHING IS IMPORTED AT MODULE LOAD, and that is the whole shape of this file.
 * `@react-native-google-signin/google-signin` reaches for a native module named
 * `RNGoogleSignin` the moment it is imported, and in a binary that does not
 * carry it — Expo Go, or any dev build made before the library was added — that
 * throws at import time and takes the ENTIRE APP down before the first screen
 * paints:
 *
 *     Invariant Violation: TurboModuleRegistry.getEnforcing(...):
 *     'RNGoogleSignin' could not be found.
 *
 * A top-level import therefore turns a feature nobody is using yet into a crash
 * for everybody. Loading it lazily means the app runs in Expo Go exactly as it
 * did before, simply without a Google button.
 *
 * DORMANT WITHOUT A CLIENT ID **OR** WITHOUT THE NATIVE MODULE: either one makes
 * `isGoogleAvailable()` false and the screens fall back to password and OTP.
 */

/** Minimal shape of the bits of the SDK this file uses. */
interface GoogleSdk {
  GoogleSignin: {
    configure: (o: Record<string, unknown>) => void;
    hasPlayServices: (o?: Record<string, unknown>) => Promise<boolean>;
    signIn: () => Promise<unknown>;
    signOut: () => Promise<unknown>;
  };
  statusCodes: Record<string, string>;
}

/** `undefined` = not tried yet, `null` = tried and the native module is absent. */
let sdk: GoogleSdk | null | undefined;

const loadSdk = (): GoogleSdk | null => {
  if (sdk !== undefined) return sdk;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = require('@react-native-google-signin/google-signin') as GoogleSdk;
  } catch {
    sdk = null;
  }
  return sdk;
};

/**
 * True only when this build can actually run a Google sign-in: a client id is
 * configured AND the native module is in the binary.
 */
export const isGoogleAvailable = (): boolean => !!GOOGLE_WEB_CLIENT_ID && !!loadSdk();

let configured = false;
const configureOnce = (mod: GoogleSdk): void => {
  if (configured) return;
  mod.GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    // Exactly the scopes the consent screen declares. Anything more puts this
    // app into Google's verification queue for data it never reads.
    scopes: ['openid', 'email', 'profile'],
    offlineAccess: false,
  });
  configured = true;
};

/**
 * `GoogleSignInStatusCodes.DEVELOPER_ERROR`, as the string the bridge delivers.
 *
 * NOT `statusCodes.DEVELOPER_ERROR`, and the difference is the whole reason this
 * constant is written out here: the installed SDK's `statusCodes` freezes only
 * SIGN_IN_CANCELLED, IN_PROGRESS, PLAY_SERVICES_NOT_AVAILABLE, SIGN_IN_REQUIRED
 * and NULL_PRESENTER — there is no DEVELOPER_ERROR member. Comparing against the
 * missing member would compare against `undefined`, which then matches every
 * error that carries no code at all, and the branch would claim a
 * misconfiguration for an unrelated failure.
 *
 * The native side stringifies `ApiException.getStatusCode()`, so the value that
 * arrives is `'10'`.
 */
const DEVELOPER_ERROR_CODE = '10';

/**
 * Backing out of the sheet is a choice, not a failure worth a red banner.
 *
 * `'cancelled'` is a SENTINEL, not a sentence: both callers test
 * `e instanceof GoogleCancelled` and show nothing at all, so this string never
 * reaches a screen and is deliberately not translated.
 */
export class GoogleCancelled extends Error {
  constructor() { super('cancelled'); this.name = 'GoogleCancelled'; }
}

/**
 * Run the native sign-in sheet and return the ID token.
 *
 * Throws `GoogleCancelled` on a deliberate back-out, and an Error with a
 * readable message otherwise.
 *
 * `t` is handed in — this is a plain module, not a component, and both callers
 * (`(auth)/login.tsx`, `(auth)/register.tsx`) already hold a translator. Every
 * message below is shown verbatim on a sign-in screen (`apiErrorMessage`
 * returns `Error.message` before reaching its own fallback), so they are the
 * partner's words, not a log line.
 */
export async function getGoogleIdToken(t: Translate): Promise<string> {
  const mod = loadSdk();
  if (!mod) {
    throw new Error(t('auth.google.needsDevBuild'));
  }
  if (!GOOGLE_WEB_CLIENT_ID) throw new Error(t('auth.google.notConfigured'));

  configureOnce(mod);

  // Android only, a no-op elsewhere. Without it the sheet fails on devices with
  // outdated Play Services, returning a bare error code and no explanation.
  await mod.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  try {
    const result = await mod.GoogleSignin.signIn();

    /**
     * v13+ returns a discriminated result instead of throwing on cancel; older
     * versions returned the user object directly. Both shapes are read, because
     * the installed version is not something this file should assume.
     */
    const r = result as {
      type?: string;
      data?: { idToken?: string | null };
      idToken?: string | null;
    };

    if (r.type === 'cancelled') throw new GoogleCancelled();

    const idToken = r.data?.idToken ?? r.idToken ?? null;
    if (!idToken) throw new Error(t('auth.google.noToken'));
    return idToken;
  } catch (e: unknown) {
    if (e instanceof GoogleCancelled) throw e;
    const code = (e as { code?: string })?.code;
    const codes = mod.statusCodes ?? {};
    if (code === codes.SIGN_IN_CANCELLED) throw new GoogleCancelled();
    if (code === codes.IN_PROGRESS) throw new Error(t('auth.google.inProgress'));
    if (code === codes.PLAY_SERVICES_NOT_AVAILABLE) {
      throw new Error(t('auth.google.noPlayServices'));
    }
    /**
     * DEVELOPER_ERROR — Android's code 10, and the reason this branch exists.
     *
     * It means Google refused before the account chooser: the SHA-1 of the
     * certificate that signed THIS build, together with the package name, is not
     * registered on an Android OAuth client in the same Google Cloud project as
     * `GOOGLE_WEB_CLIENT_ID`. It is a CONFIGURATION fact — the same build fails
     * for every user on every network, forever, until the console is changed —
     * and it used to fall into the generic message below, where it read exactly
     * like a flaky connection and was retried instead of fixed. A Play-signed
     * release is the classic instance: Play re-signs the upload with its own key,
     * so the SHA-1 that worked in the debug build is not the one users run.
     *
     * The raw code goes in the sentence deliberately. Whoever hits this is far
     * more likely to be the owner testing a new build than a shop owner, and
     * "code 10" is the string that matches Google's own documentation.
     */
    if (code === DEVELOPER_ERROR_CODE) {
      // `DEVELOPER_ERROR` and `code 10` stay verbatim inside the sentence in
      // both catalogues: they are Google's own identifiers and the strings
      // whoever diagnoses this will search their documentation for.
      throw new Error(t('auth.google.developerError'));
    }
    /**
     * Everything left is genuinely unknown, so the code is carried out rather
     * than dropped — without it, the next diagnosis starts from a sentence that
     * says nothing about which of a dozen failures happened.
     */
    throw new Error(
      code
        ? t('auth.google.failedWithCode', { code })
        : t('auth.google.failed')
    );
  }
}

/**
 * Forget the Google session on this device.
 *
 * Called on sign-out so the next tap offers the account chooser rather than
 * silently signing the previous person back in — on a shop counter's shared
 * tablet that is one member of staff acting as another.
 */
export async function forgetGoogle(): Promise<void> {
  const mod = loadSdk();
  if (!mod || !GOOGLE_WEB_CLIENT_ID) return;
  try {
    configureOnce(mod);
    await mod.GoogleSignin.signOut();
  } catch {
    // Best effort. The ResiSmart session is already gone, and a failure to clear
    // Google's own cache must not block signing out.
  }
}
