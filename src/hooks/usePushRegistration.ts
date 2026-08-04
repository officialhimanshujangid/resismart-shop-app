import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { useQueryClient } from '@tanstack/react-query';
import { notificationApi } from '../api/notification.api';
import { store } from '../lib/store';
import { DEVICE_KEYS, PUSH_CHANNEL_ID } from '../constants/app';
import { qk } from '../lib/queryKeys';

/**
 * Register this device so a new booking reaches a partner who is not looking at
 * the app.
 *
 * ── The transport, and why this is Android-only today ──────────────────────
 *
 * `backend/src/services/push.service.ts` sends through `firebase-admin`:
 * `getMessaging().send({ token })`. That call takes an **FCM registration
 * token** and nothing else. So:
 *
 *   Android — `getDevicePushTokenAsync()` returns exactly that. Works.
 *   iOS     — it returns an **APNs** device token, which firebase-admin rejects
 *             (`messaging/invalid-registration-token`). Registering it anyway
 *             would create a `PushToken` row that fails on every single send,
 *             quietly incrementing `failureCount` until the pruner deletes it —
 *             i.e. iOS push would look wired up and deliver nothing. So iOS is
 *             skipped deliberately, and the gap is reported rather than hidden.
 *             Closing it needs an owner decision: either add
 *             `@react-native-firebase/messaging` (a config plugin + a dev build,
 *             so it also changes how this app ships) or give the backend an APNs
 *             sender alongside FCM.
 *
 * `getExpoPushTokenAsync()` is NOT used, and that is the mistake worth naming:
 * it returns `ExponentPushToken[...]`, which only Expo's own push service
 * understands. This backend does not use it, so an Expo token stored here would
 * be a string FCM has never heard of.
 *
 * ── Scope ─────────────────────────────────────────────────────────────────
 *
 * `push.service.ts` addresses tokens by SCOPE id, which in a partner session is
 * the partner id. A device is therefore registered per business, and a partner
 * who switches to their second shop must re-register — otherwise they keep
 * getting the first shop's alerts and none of the second's. That is why the
 * stored token is keyed with the partner id it was registered under.
 */

/** Android 8+ fixes importance when the channel is created, not when a message is sent. */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL_ID, {
    name: 'Bookings and orders',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
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

  useEffect(() => {
    if (!enabled || !partnerId) return;
    let cancelled = false;

    (async () => {
      try {
        // A simulator has no push service to hand out a token, and asking throws.
        if (!Device.isDevice) return;
        if (Platform.OS !== 'android') return; // see the header — iOS needs an owner decision

        installHandlerOnce();
        await ensureAndroidChannel();

        const existing = await Notifications.getPermissionsAsync();
        const granted =
          existing.granted ||
          (await Notifications.requestPermissionsAsync()).granted;
        // Declined is a real answer and is not re-asked on every launch. Android
        // stops showing the dialog after two refusals anyway, so a loop here
        // would burn the partner's remaining chances to say yes.
        if (!granted || cancelled) return;

        const devicePushToken = await Notifications.getDevicePushTokenAsync();
        if (cancelled) return;
        // Narrowing on 'android' is what makes `data` a string: the other branch
        // of `DevicePushToken` types it as `any`, which this codebase does not use.
        if (devicePushToken.type !== 'android') return;
        const token = devicePushToken.data;

        const [storedToken, storedScope] = await Promise.all([
          store.get(DEVICE_KEYS.PUSH_TOKEN),
          store.get(DEVICE_KEYS.PUSH_TOKEN_SCOPE),
        ]);
        // Re-register only when something actually changed. FCM rotates tokens
        // rarely, and a POST on every cold start is a write per launch per device
        // for nothing.
        if (storedToken === token && storedScope === partnerId) return;

        await notificationApi.registerDevice({
          platform: 'ANDROID',
          token,
          deviceLabel: Device.deviceName ?? `${Device.manufacturer ?? ''} ${Device.modelName ?? ''}`.trim(),
        });
        if (cancelled) return;

        await store.set(DEVICE_KEYS.PUSH_TOKEN, token);
        await store.set(DEVICE_KEYS.PUSH_TOKEN_SCOPE, partnerId);
      } catch (error) {
        // Never fatal. Push is an extra way to hear about a booking; the app has
        // to keep working for a partner who denied the permission, is on a
        // simulator, or is running a build with no `google-services.json`.
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
    const sub = Notifications.addNotificationReceivedListener(() => {
      void queryClient.invalidateQueries({ queryKey: qk.notifications() });
      void queryClient.invalidateQueries({ queryKey: qk.today() });
    });
    return () => sub.remove();
  }, [enabled, queryClient]);
}
