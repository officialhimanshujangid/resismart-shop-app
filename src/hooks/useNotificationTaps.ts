import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';

import { notificationDestination } from '../api/notification.api';
import { PartnerModule } from '../types/api-contract.generated';
import type { P2Module } from '../features/p2/modules';

/**
 * What happens when a partner TAPS a push.
 *
 * Registration in this app was already carefully built — Expo tokens, two
 * Android channels, per-partner scope, re-registration on a context switch —
 * and then stopped dead. `addNotificationResponseReceivedListener` and
 * `getLastNotificationResponseAsync` appeared nowhere, and `NotificationFrame.link`
 * was read into a type and never used. So tapping "New booking BK-0042" opened
 * whatever screen happened to be on top when the app was last closed, which for
 * most partners is Today.
 *
 * ── Two entry points, and both are needed ─────────────────────────────────
 *
 * `addNotificationResponseReceivedListener` fires while the app is running or
 * backgrounded. It does NOT fire for the tap that COLD-STARTED the app — the
 * response was delivered before any JS existed to listen for it — and that is
 * the common case for a shop whose phone has been in a drawer.
 * `getLastNotificationResponseAsync()` is how that one is collected, and it is
 * read once on mount.
 *
 * Both are de-duplicated through one `handled` ref keyed on the response
 * identifier: the cold-start response is ALSO delivered to the listener on some
 * platform/SDK combinations, and navigating twice pushes the same screen onto
 * the stack twice — a back button that appears to do nothing.
 *
 * ── Why the module gate is checked here ───────────────────────────────────
 *
 * `(tabs)/_layout.tsx` uses `Tabs.Protected`, which REMOVES a route from the
 * navigator rather than disabling it. Pushing at a removed route is a navigation
 * to a screen that does not exist. A partner can perfectly well hold a
 * three-day-old order alert after switching the Orders module off, so the gate
 * is asked before the push and the fallback is the notification list — which is
 * never gated, and which shows them the message they tapped.
 */

export interface NotificationTapsInput {
  /** Only listen once there is a session; a tap before sign-in has nowhere to go. */
  enabled: boolean;
  /** `usePartnerEntitlements().hasModule`, so a destination behind a dead route is never pushed. */
  hasModule: (module: PartnerModule) => boolean;
  /**
   * Has the entitlement answer landed? Until it has, `hasModule` is false for
   * everything (it fails closed), and routing a booking tap to the inbox because
   * the gate had not resolved yet would be a bug that only shows up on a cold
   * start — which is exactly when most taps happen. So a tap is HELD until the
   * answer arrives rather than answered wrongly.
   */
  ready: boolean;
  /**
   * P2: is this business-type module effective? Absent = none are (the HARD
   * RULE direction), so a P2 alert on a phone that cannot answer lands on the inbox.
   */
  hasCategoryModule?: (module: P2Module) => boolean;
}

export function useNotificationTaps({ enabled, hasModule, ready, hasCategoryModule }: NotificationTapsInput): void {
  /** Response identifiers already acted on, so one tap navigates once. */
  const handled = useRef<Set<string>>(new Set());
  /** A tap that arrived before the entitlement answer did. At most one is worth keeping. */
  const deferred = useRef<Notifications.NotificationResponse | null>(null);

  // `hasModule` is a `useCallback` whose identity changes whenever entitlements
  // change. Held in a ref so the subscription below is not torn down and
  // re-subscribed on every one of those — a listener that re-registers mid-tap
  // is a tap that lands nowhere.
  const gate = useRef(hasModule);
  gate.current = hasModule;
  const categoryGate = useRef(hasCategoryModule);
  categoryGate.current = hasCategoryModule;

  useEffect(() => {
    if (!enabled) return;
    // Push was removed from Expo Go on SDK 53+, so the whole module is inert
    // there — matching `usePushRegistration`'s own guard rather than letting
    // this throw on a developer's machine.
    if (Constants.appOwnership === 'expo') return;

    const act = (response: Notifications.NotificationResponse) => {
      const id = response.notification.request.identifier;
      if (handled.current.has(id)) return;

      // `push.service.ts` sends `data: { link, kind, priority }` with every
      // message on both transports, and sends EMPTY STRINGS rather than omitting
      // the keys — so these are read as "absent" when blank, not trusted as
      // paths. Typed off the payload rather than cast: `data` is
      // `Record<string, unknown>` and anything non-string here is a malformed
      // send, not something to navigate on.
      const data = response.notification.request.content.data as Record<string, unknown> | null;
      const link = typeof data?.link === 'string' && data.link ? data.link : undefined;
      const kind = typeof data?.kind === 'string' && data.kind ? data.kind : undefined;

      const dest = notificationDestination({ link, kind });

      if (!ready) {
        // Held, not guessed. The effect re-runs when `ready` flips.
        deferred.current = response;
        return;
      }
      handled.current.add(id);

      if (!dest) {
        // Nothing specific to open — the inbox is still better than the screen
        // that happened to be on top, because it contains the message.
        router.push('/notifications');
        return;
      }
      if (dest.requires && !gate.current(dest.requires)) {
        router.push('/notifications');
        return;
      }
      if (dest.requiresCategory && !(categoryGate.current?.(dest.requiresCategory) ?? false)) {
        router.push('/notifications');
        return;
      }
      router.push(dest.href);
    };

    // A tap that was parked waiting for the entitlement answer.
    if (ready && deferred.current) {
      const held = deferred.current;
      deferred.current = null;
      act(held);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(act);

    /**
     * The tap that launched the app.
     *
     * `void`-ed rather than awaited: this is an effect body, and the answer is
     * either a response or `null` within a frame or two. A rejection here is not
     * worth failing the whole signed-in shell for — the partner simply lands on
     * Today, which is where they used to land every time.
     */
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) act(response);
      })
      .catch((error: unknown) => console.warn('[push] could not read the launch tap:', error));

    return () => subscription.remove();
  }, [enabled, ready]);
}
