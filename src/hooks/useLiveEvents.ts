import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient, QueryKey } from '@tanstack/react-query';
import { openEventStream, SseEvent } from '../lib/sse';
import { qk } from '../lib/queryKeys';
import { apiClient } from '../api/axios';

/**
 * Live updates: a new booking lands on the Today screen without a pull-to-refresh.
 *
 * The backend already publishes over SSE (`services/sse.service.ts`), so the
 * cost here was a client — see `lib/sse.ts` for why that is sixty lines of
 * XMLHttpRequest and not a dependency. Cheap enough to wire, so it is wired.
 *
 * The contract with the rest of the app: **an event is a hint, never data**.
 * Every frame is turned into a react-query invalidation and the screen refetches
 * through the normal API, which is authenticated, scoped and paginated. Nothing
 * is inserted into a list straight from a frame. A dropped or duplicated event
 * therefore costs a stale screen until the next refetch, not a wrong one — and
 * pull-to-refresh remains the fallback on every list.
 */

/** The payload of a `notification` frame — see `notification.service.ts`. */
interface NotificationFrame {
  _id?: string;
  kind?: string;
  title?: string;
  body?: string;
  link?: string;
}

/**
 * Notification kind → the caches it makes stale.
 *
 * Matched by PREFIX rather than by an exhaustive list of kinds. The backend
 * declares `kind` as a free string and new ones are added by whichever service
 * needs them, so an exact-match table would silently stop refreshing the day
 * somebody adds `PARTNER_ORDER_RETURNED` — and the symptom, a list that is one
 * item behind, reads as a caching bug rather than a missing table row.
 */
function keysForKind(kind: string | undefined): QueryKey[] {
  const keys: QueryKey[] = [qk.notifications(), qk.today()];
  if (!kind) return keys;

  if (kind.startsWith('PARTNER_BOOKING') || kind.startsWith('BOOKING')) keys.push(qk.bookings.all());
  if (kind.startsWith('PARTNER_ORDER') || kind.startsWith('ORDER')) keys.push(qk.orders.all());
  if (kind.startsWith('PARTNER_BOOST')) keys.push(qk.promotion(), qk.entitlements());
  // Verified / suspended / reinstated all change what this partner may do at
  // all, so the gate itself has to be re-asked — otherwise a partner who has
  // just been approved keeps seeing the one-tab holding screen until they
  // restart the app.
  if (
    kind === 'PARTNER_VERIFIED' ||
    kind === 'PARTNER_SUSPENDED' ||
    kind === 'PARTNER_REINSTATED' ||
    kind === 'PARTNER_REJECTED'
  ) {
    keys.push(qk.entitlements(), qk.onboarding.status(), qk.usage());
  }
  if (kind.startsWith('BILL') || kind.startsWith('PAYMENT')) keys.push(qk.billing.all());

  return keys;
}

export interface LiveEventsState {
  /** The stream is open. A screen can hide its "reconnecting" hint. */
  connected: boolean;
}

/**
 * Opened once, at the app shell, and NOT per screen.
 *
 * One connection per device is the whole design — `sse.service.ts` holds an open
 * response per client in process memory, so a hook mounted on five tabs would
 * hold five of them for one partner and five heartbeats every 25 seconds.
 */
export function useLiveEvents(enabled: boolean): LiveEventsState {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);
  const refreshing = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return;
    }

    const connection = openEventStream({
      onOpen: () => setConnected(true),
      onEvent: (event: SseEvent) => {
        // `ready` is the server saying hello, not news.
        if (event.event === 'ready') return;
        const frame = (event.data ?? {}) as NotificationFrame;
        for (const key of keysForKind(frame.kind)) {
          void queryClient.invalidateQueries({ queryKey: key });
        }
      },
      onUnauthorized: () => {
        setConnected(false);
        // The access token expired mid-stream. Any request through `apiClient`
        // runs the refresh interceptor, so one cheap authenticated call renews
        // the session and the stream picks the new token up on its next attempt.
        // Guarded so a burst of 401s cannot start a refresh per frame.
        if (refreshing.current) return;
        refreshing.current = true;
        apiClient
          .get('/notifications/config')
          .catch(() => undefined)
          .finally(() => {
            refreshing.current = false;
          });
      },
    });

    return () => {
      connection.close();
      setConnected(false);
    };
  }, [enabled, queryClient]);

  /**
   * Coming back from the background is the case pull-to-refresh was invented
   * for, and the one users never think to do. The OS suspends the socket while
   * the app is away, so whatever happened in between arrived nowhere: refetch
   * everything active on the way back in rather than trusting the stream to have
   * caught up.
   */
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') {
        void queryClient.invalidateQueries({ type: 'active' });
      }
    });
    return () => sub.remove();
  }, [enabled, queryClient]);

  return { connected };
}
