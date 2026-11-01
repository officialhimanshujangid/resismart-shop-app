// >>> NOTIFY-ROUTE
import Constants from 'expo-constants';

/**
 * Who is registering this device for push — the SHOP (partner) app.
 *
 * The server stores the app with each push token and keeps every notification
 * in the app it belongs to (backend `constants/notification-apps.ts`): a
 * partner's orders and bookings reach this app and the web only, never the
 * society or guard app of the same person. Same header pair the guard app
 * already sends (`mobile-guard/src/lib/appIdentity.ts`).
 *
 * Sent on the notification calls — device register/unregister, the inbox list,
 * mark-read (`api/notification.api.ts`) and the SSE stream (`lib/sse.ts`). The
 * backend's CORS config allows `X-ResiSmart-App` / `X-App-Version`, so a web
 * build's preflight accepts them too.
 */
export const SHOP_APP_NAME = 'shop';
export const SHOP_APP_VERSION: string = Constants.expoConfig?.version || '1.0.0';

export function appIdentityHeaders(): Record<string, string> {
  return { 'X-ResiSmart-App': SHOP_APP_NAME, 'X-App-Version': SHOP_APP_VERSION };
}

/**
 * What `usePushRegistration` stores beside the token to decide "nothing changed,
 * skip the POST". Versioned so a token registered before the server knew which
 * app it belongs to is re-registered exactly once, this time named.
 */
export const PUSH_ROUTING_VERSION = 'app-v1';
export function pushScopeKey(partnerId: string): string {
  return `${partnerId}#${SHOP_APP_NAME}-${PUSH_ROUTING_VERSION}@${SHOP_APP_VERSION}`; // SY (B1): + the app version
}
// <<< NOTIFY-ROUTE
// >>> SY (B1 + M4) — the app VERSION is part of the key, so an updated build
// (same Expo token) re-registers once and the server stores its new
// `appVersion` (a 1.2.0 → 1.3.0 Staff-app update must count as the Staff app).
// The stored value also carries WHEN it was registered: on the app coming to the
// foreground a registration older than a day is sent again, so a token the
// server deleted (a post ended, the device cap, pruning) comes back by itself.
export const PUSH_REREGISTER_MS = 24 * 60 * 60 * 1000;
/** What is stored beside the token: `<scope key>|<registered at, ms>`. */
export function stampPushScope(scopeKey: string, now: number = Date.now()): string {
  return `${scopeKey}|${now}`;
}
/** The scope key part of a stored value (a value from before SY has no stamp). */
export function storedScopeKey(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const i = stored.lastIndexOf('|');
  return i < 0 ? stored : stored.slice(0, i);
}
/** True when the stored registration is older than a day (or carries no stamp). */
export function pushRegistrationDue(stored: string | null | undefined, now: number = Date.now()): boolean {
  if (!stored) return true;
  const i = stored.lastIndexOf('|');
  if (i < 0) return true;
  const at = Number(stored.slice(i + 1));
  return !Number.isFinite(at) || at > now + 60_000 || now - at >= PUSH_REREGISTER_MS;
}
/** Skip the POST only when the token, the scope key (app + version) AND the day all still match. */
export function pushRegistrationFresh(
  storedToken: string | null | undefined, stored: string | null | undefined, token: string, scopeKey: string, now: number = Date.now(),
): boolean {
  return storedToken === token && storedScopeKey(stored) === scopeKey && !pushRegistrationDue(stored, now);
}
// <<< SY

