// export const API_BASE_URL = 'http://10.182.174.83:8000/api/v1';
export const API_BASE_URL = 'https://resismart-backend-q0lf.onrender.com/api/v1';

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

export const APP_NAME = 'ResiSmart Partner';
export const APP_VERSION = '1.0.0';

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
