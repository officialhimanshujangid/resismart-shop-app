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
  return `${partnerId}#${SHOP_APP_NAME}-${PUSH_ROUTING_VERSION}`;
}
// <<< NOTIFY-ROUTE
