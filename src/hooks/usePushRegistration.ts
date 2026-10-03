import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { useQueryClient } from '@tanstack/react-query';
import { notificationApi } from '../api/notification.api';
import { store } from '../lib/store';
import { DEVICE_KEYS, PUSH_CHANNEL_URGENT, PUSH_CHANNEL_DEFAULT } from '../constants/app';
import { qk } from '../lib/queryKeys';
import { pushScopeKey } from '../lib/appIdentity'; // NOTIFY-ROUTE
import i18n from '../i18n';
import { useLanguage } from '../i18n/useLanguage';

/**
 * Register this device so a new booking reaches a partner who is not looking at
 * the app.
 *
 * ── The transport (K3) ──────────────────────────────────────────────────────
 *
 * **Expo Push, not FCM — this hook used to be Android-only, and this is the
 * fix.** It went through `firebase-admin`'s raw FCM token
 * (`getDevicePushTokenAsync()`), which only understands an FCM registration
 * token: on iOS that call instead hands back an APNs device token, a foreign
 * shape FCM rejects outright (`messaging/invalid-registration-token`), so iOS
 * was skipped deliberately rather than registering a token that would fail
 * every single send. `getExpoPushTokenAsync({ projectId })` replaces it with
 * `ExponentPushToken[...]` — one token shape that works on both platforms —
 * and `backend/src/services/push.service.ts` runs an Expo transport alongside
 * FCM, telling the two apart by the token's own shape
 * (`Expo.isExpoPushToken`), so nothing about `/notifications/devices` itself
 * changes. `mobile-society`'s `usePushRegistration` made this same move first;
 * this hook mirrors it.
 *
 * ── The two channels (K2) ────────────────────────────────────────────────
 *
 * On Android 8+ the CHANNEL owns the sound, importance and DND behaviour —
 * not the message — so a killed app plays the right tone only because
 * `urgent` and `default` already exist by the time a push arrives.
 * `PUSH_CHANNEL_URGENT` / `PUSH_CHANNEL_DEFAULT` name exactly the ids the
 * backend's `notification-categories.ts` hardcodes, so a HIGH payload's
 * `channelId: 'urgent'` always finds a channel that already has `urgent.wav`
 * wired to it — never the other way round.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────
 *
 * `push.service.ts` addresses tokens by SCOPE id, which in a partner session is
 * the partner id. A device is therefore registered per business, and a partner
 * who switches to their second shop must re-register — otherwise they keep
 * getting the first shop's alerts and none of the second's. That is why the
 * stored token is keyed with the partner id it was registered under.
 */

/** Android 8+ fixes importance, sound and DND behaviour when the channel is
 *  created, not when a message is sent — both must exist before any push can
 *  arrive at a killed app.
 *
 *  `i18n.t` on the singleton, not a `t` from a hook: this is called from an
 *  effect and re-called on a language change (see `usePushRegistration`), and
 *  the same reasoning `features/billing/pdf.ts` records applies — the singleton
 *  is the instance every screen already renders from. The two names below are
 *  the only strings in this app a partner reads OUTSIDE it, in Android's own
 *  notification settings. */
async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Promise.all([
    Notifications.setNotificationChannelAsync(PUSH_CHANNEL_URGENT, {
      name: i18n.t('notifications.channels.urgent.name'),
      description: i18n.t('notifications.channels.urgent.description'),
      importance: Notifications.AndroidImportance.MAX,
      sound: 'urgent',
      vibrationPattern: [0, 400, 250, 400],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    }),
    Notifications.setNotificationChannelAsync(PUSH_CHANNEL_DEFAULT, {
      name: i18n.t('notifications.channels.default.name'),
      description: i18n.t('notifications.channels.default.description'),
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'notification',
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    }),
  ]);
}

/**
 * How a notification behaves while the app is OPEN.
 *
 * `shouldShowBanner` and `shouldShowList` are both required in SDK 54 — the
 * single `shouldShowAlert` field older code used was split in two and no longer
 * exists, so a handler copied from an older project silently returns an object
 * with neither field set and nothing is ever shown.
 *
 * Installed once, lazily, rather than at module scope. The handler is global, so
 * setting it in an effect would re-register it on every mount; setting it at
 * import time would instead initialise the notifications native module the
 * moment anything imports `@/hooks` — including the SIGNED-OUT signup wizard,
 * which has no business touching push.
 */
let handlerInstalled = false;

function installHandlerOnce(): void {
  if (handlerInstalled) return;
  handlerInstalled = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export interface PushRegistrationInput {
  /** Only run once there is a session — the endpoint is authenticated. */
  enabled: boolean;
  /** The partner the current session is scoped to. A change forces re-registration. */
  partnerId: string | null;
}

export function usePushRegistration({ enabled, partnerId }: PushRegistrationInput): void {
  const queryClient = useQueryClient();
  const { language } = useLanguage();

  /**
   * The channels are (re-)declared on every language change, not only on the
   * first launch.
   *
   * A channel's name and description are read when it is CREATED, and a channel
   * is never re-created once it exists — so a partner who installs in English
   * and switches to Hindi would keep reading "Urgent alerts" in Android's own
   * notification settings forever, which is the one place this app cannot
   * re-render. Re-issuing `createNotificationChannel` for an id that already
   * exists is the documented way to fix that, and it is safe precisely because
   * it is so narrow: Android updates the name, description and group of an
   * existing channel and NOTHING else. Importance, sound, vibration and DND
   * belong to the partner once the channel exists, and a rename must not — and
   * here cannot — undo a tone they chose themselves.
   *
   * Its own effect rather than a line inside the registration effect below: that
   * one is keyed on the session and must not re-run for a language switch, and
   * this one must not wait for a push token to be worth doing.
   */
  useEffect(() => {
    if (Constants.appOwnership === 'expo') return; // push was removed from Expo Go on SDK 53+
    // Never fatal, for the same reason the registration effect swallows its own
    // failures: a channel that could not be named is not worth a broken launch.
    void ensureAndroidChannels().catch((error) => console.warn('[push] channels skipped:', error));
  }, [language]);

  useEffect(() => {
    if (!enabled || !partnerId) return;
    if (Constants.appOwnership === 'expo') return; // push was removed from Expo Go on SDK 53+
    // NOTIFY-ROUTE: no Expo push token in a browser build (the web registers its
    // own browser subscription), so a web build never registers — or names itself.
    if (Platform.OS === 'web') return;
    let cancelled = false;

    (async () => {
      try {
        // A simulator has no push service to hand out a token, and asking throws.
        if (!Device.isDevice) return;

        installHandlerOnce();
        // The channels are the effect above's job now, not this one's — it
        // mounts in the same commit, so they still exist well before any push
        // can arrive, and they no longer depend on a token being obtained.

        const existing = await Notifications.getPermissionsAsync();
        const granted =
          existing.granted ||
          (await Notifications.requestPermissionsAsync()).granted;
        // Declined is a real answer and is not re-asked on every launch. Android
        // stops showing the dialog after two refusals anyway, so a loop here
        // would burn the partner's remaining chances to say yes.
        if (!granted || cancelled) return;

        const projectId =
          Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
        if (!projectId) return; // no EAS project configured — nothing to register against

        const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
        if (cancelled || !token) return;

        const [storedToken, storedScope] = await Promise.all([
          store.get(DEVICE_KEYS.PUSH_TOKEN),
          store.get(DEVICE_KEYS.PUSH_TOKEN_SCOPE),
        ]);
        // Re-register only when something actually changed. Expo tokens rotate
        // rarely, and a POST on every cold start is a write per launch per device
        // for nothing.
        // NOTIFY-ROUTE: a versioned key, so a token registered before the server
        // stored which app it belongs to is re-registered once, named.
        const scopeKey = pushScopeKey(partnerId);
        if (storedToken === token && storedScope === scopeKey) return;

        await notificationApi.registerDevice({
          platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
          token,
          deviceLabel: Device.deviceName ?? `${Device.manufacturer ?? ''} ${Device.modelName ?? ''}`.trim(),
        });
        if (cancelled) return;

        await store.set(DEVICE_KEYS.PUSH_TOKEN, token);
        await store.set(DEVICE_KEYS.PUSH_TOKEN_SCOPE, scopeKey); // NOTIFY-ROUTE
      } catch (error) {
        // Never fatal. Push is an extra way to hear about a booking; the app has
        // to keep working for a partner who denied the permission, is on a
        // simulator, or is running a build with no EAS project wired up.
        console.warn('[push] registration skipped:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, partnerId]);

  /**
   * A push that ARRIVES while the app is open means the server has data we do
   * not. Invalidating on receipt keeps a phone that was in a pocket from showing
   * yesterday's list the moment it is unlocked — the same job SSE does when the
   * screen is already open, for the case where it is not.
   */
  useEffect(() => {
    if (!enabled) return;
    if (Constants.appOwnership === 'expo') return; // Expo Go does not support push notifications
    const sub = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications() });
      void queryClient.invalidateQueries({ queryKey: qk.today() });
    });
    return () => sub.remove();
  }, [enabled, queryClient]);
}
