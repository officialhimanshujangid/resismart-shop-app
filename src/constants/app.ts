export const API_BASE_URL = 'https://resismart-backend-q0lf.onrender.com/api/v1';

/**
 * The WEB OAuth client id — the audience every Google ID token is checked
 * against, on the server and here.
 *
 * NOT this app's Android or iOS client id. Those must exist in the Google
 * console (sign-in fails without them) but they never appear in code: the token
 * this app sends has to carry the WEB id as its `aud`, because that is what the
 * backend verifies against.
 *
 * Empty turns Google sign-in off everywhere in this app.
 */
export const GOOGLE_WEB_CLIENT_ID = '42483573914-fl7mnssbpc8r80ljm1se9i5vt6hmcgdi.apps.googleusercontent.com';
// export const API_BASE_URL = 'http://10.182.174.83:8000/api/v1'; // local dev

// These key strings deliberately keep the retired "shop" spelling. They are the on-device
// SecureStore namespace of an already-installed app: renaming them would make every stored
// token and profile unreadable on the next launch, silently signing out every user who is
// mid-session when the rename ships — the same breakage the JWT normalization in
// auth.middleware.ts exists to prevent, and the rename contract forbids adding a second
// compatibility shim to migrate them. The keys are private to this device and never travel
// over the wire, so the stale word costs nothing. Rename them only alongside a deliberate
// forced-logout release.
export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'resismart_shop_access_token',
  REFRESH_TOKEN: 'resismart_shop_refresh_token',
  USER_PROFILE: 'resismart_shop_user_profile',
  USER_INFO: 'resismart_shop_user_info',
};

/**
 * Non-secret device state, kept OUT of SecureStore and out of `STORAGE_KEYS`.
 *
 * Two separate reasons, and both bite:
 *
 *  - SecureStore's Android backend refuses values over 2048 bytes, so an offline
 *    invoice draft or a cached list simply fails to write — and `storage.set`
 *    swallows the error, so the failure is a draft that quietly never existed.
 *  - Everything under `STORAGE_KEYS` is wiped by `logout()`. A push token, the
 *    last-used scan method and a queue of unsynced drafts must survive a sign-out;
 *    binning a partner's unsent bills because they switched accounts is not a
 *    recoverable mistake.
 *
 * These live in AsyncStorage via `src/lib/store.ts`. Nothing secret goes here —
 * AsyncStorage is plaintext on disk.
 */
export const DEVICE_KEYS = {
  /** The Expo push token last accepted by the server, so we re-register only on change. */
  PUSH_TOKEN: 'resismart_partner_push_token',
  /** Which partner id that token was registered under — a context switch must re-register. */
  PUSH_TOKEN_SCOPE: 'resismart_partner_push_scope',
  /** Offline invoice drafts awaiting sync. Owned by the billing screen. */
  INVOICE_DRAFTS: 'resismart_partner_invoice_drafts',
  /** Last scanner input method, remembered per device (PARTNERS_PLAN §12.1). */
  SCAN_METHOD: 'resismart_partner_scan_method',
};

/**
 * Session-scoped device state that is NOT a credential, and is too large to
 * trust to SecureStore's 2 KB Android cap.
 *
 * The third category, between `STORAGE_KEYS` (SecureStore, credentials, wiped
 * on sign-out) and `DEVICE_KEYS` (AsyncStorage, must SURVIVE a sign-out).
 * These live in AsyncStorage like `DEVICE_KEYS` but are cleared by `logout()`
 * and by the session-expired handler, because they describe the account that
 * has just left the device rather than the device itself.
 */
export const SESSION_CACHE_KEYS = {
  /**
   * Every partner business this session may switch to.
   *
   * Cached because the cold-start rehydrate has no other source for it: the
   * list arrives on the login and refresh responses, and a restart replays
   * neither. Without this the "Switch business" menu was empty after every app
   * restart and signing out was the only way back to a second shop.
   *
   * Business names and ids only — no token, no customer data. Cleared on
   * sign-out so the next person to use this counter tablet does not read the
   * previous account's shop list.
   */
  AVAILABLE_CONTEXTS: 'resismart_partner_available_contexts',
};

export const APP_NAME = 'ResiSmart Partner';
export const APP_VERSION = '1.0.0';

/**
 * The web panel's origin — the ONE place this app hands a partner off to a
 * browser.
 *
 * `https://resismart.in` is the site origin the backend itself falls back to
 * (`PUBLIC_SITE_URL` in `marketplace-public.controller.ts` and
 * `email.service.ts`), and the dashboard is served by the same Next app under
 * `/dashboard/**` — the `(public)` and `(dashboard)` route groups are two
 * halves of one deployment, so there is no separate app host to point at.
 *
 * Deliberately NOT derived from `API_BASE_URL`. That is Render, the API host,
 * and it serves no pages at all; building a browser link from it would open a
 * 404 that reads as a broken button.
 */
export const WEB_PANEL_URL = 'https://resismart.in';

/**
 * Where a partner buys or changes their plan.
 *
 * This app is deliberately READ-ONLY about subscriptions — see
 * `src/api/billing.api.ts`'s header for why an in-app Razorpay flow is not
 * worth its failure modes. Sending them here is the honest alternative to a
 * button that does nothing.
 */
export const WEB_BILLING_URL = `${WEB_PANEL_URL}/dashboard/billing`;

/**
 * The two Android notification channels every partner alert lands on (K2).
 *
 * Android 8+ ignores importance, sound and DND behaviour set at send time —
 * it is fixed when the CHANNEL is created, not when a message arrives — so
 * both must exist before any push can reach a killed app. The ids are bare
 * names the backend already hardcodes (`channelForPriority` in
 * `notification-categories.ts`: HIGH → `'urgent'`, else → `'default'`), so a
 * channel named anything else here would silently never be matched and every
 * push would fall back to the OS default sound.
 */
export const PUSH_CHANNEL_URGENT = 'urgent';
export const PUSH_CHANNEL_DEFAULT = 'default';
