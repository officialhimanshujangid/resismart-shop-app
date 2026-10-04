import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useQueryClient, QueryKey } from '@tanstack/react-query';
import { openEventStream, SseEvent } from '../lib/sse';
import { qk } from '../lib/queryKeys';
import { clearSession, endsSession, refreshSession } from '../api/axios';

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
/** The nine P2 kinds (CONTRACT-partner-P2 §13). */
const P2_KINDS: ReadonlySet<string> = new Set([
  'PARTNER_NEAR_EXPIRY', 'SUBSCRIPTION_BILL', 'SUBSCRIPTION_PAUSE', 'APPOINTMENT_REMINDER', 'APPOINTMENT_SERIES',
  'PACKAGE_UPDATE', 'JOB_QUOTE', 'JOB_QUOTE_DECISION', 'JOB_GATE_PASS',
]);

function keysForKind(kind: string | undefined): QueryKey[] {
  const keys: QueryKey[] = [qk.notifications(), qk.today()];
  if (!kind) return keys;

  if (kind.startsWith('PARTNER_BOOKING') || kind.startsWith('BOOKING')) keys.push(qk.bookings.all());
  if (kind.startsWith('PARTNER_ORDER') || kind.startsWith('ORDER')) keys.push(qk.orders.all());
  if (kind.startsWith('PARTNER_BOOST')) keys.push(qk.promotion(), qk.entitlements());
  // P1: a low-stock alert refreshes the reorder list and the stock home tiles.
  if (kind.startsWith('PARTNER_LOW_STOCK')) keys.push(qk.stock.all());
  if (kind.startsWith('PARTNER_KHATA')) keys.push(qk.parties.all());
  // P4: a rent bill / reminder / lease alert refreshes 'My shop rent' and the Today card.
  if (kind === 'RENT' || kind === 'LEASE') keys.push(qk.rent.all());
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
  // P2 business-type modules: every P2 screen keys under ['p2', …].
  if (P2_KINDS.has(kind)) keys.push(['p2']);
  if (kind === 'APPOINTMENT_REMINDER' || kind.startsWith('JOB_')) keys.push(qk.bookings.all());
  // Commerce (CONTRACT-commerce §12.1): the four new kinds. WALLET moves a
  // customer's balance; PARTNER_OFFER is a sent offer message (the weekly
  // meter); BACK_IN_STOCK changes the "waiting for stock" demand;
  // DELIVERY_ASSIGNED is an order given to a rider.
  if (kind === 'WALLET') keys.push(['commerce', 'wallet'], ['commerce', 'wallets']);
  if (kind === 'PARTNER_OFFER') keys.push(['commerce', 'broadcasts']);
  if (kind === 'BACK_IN_STOCK') keys.push(['commerce', 'insights']);
  if (kind === 'DELIVERY_ASSIGNED') keys.push(qk.orders.all(), ['commerce', 'myDeliveries']);

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
 *
 * `scopeKey` is the active business (partner id). The server binds a stream to
 * the scope of the token it was opened with, so switching business must close
 * the old stream and open a new one — otherwise frames keep coming for the shop
 * that was left and never for the one now open.
 */
export function useLiveEvents(enabled: boolean, scopeKey?: string | null): LiveEventsState {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

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
        /**
         * The access token expired mid-stream, and the stream picks the new one
         * up on its next attempt — so all this has to do is cause a refresh.
         *
         * It used to do that by firing `GET /notifications/config` purely to
         * provoke the 401 interceptor: a whole authenticated round trip whose
         * answer was thrown away, and a SECOND source of 401s in an app that ran
         * one refresh per 401. `refreshSession` is the same shared promise the
         * interceptor now awaits, so a stream drop that coincides with a screen's
         * requests joins their refresh instead of racing it.
         *
         * A failure here is judged by the same rule as anywhere else: a revoked
         * token ends the session, a dropped connection does not.
         */
        void refreshSession().catch((e) => {
          if (endsSession(e)) void clearSession();
        });
      },
    });

    return () => {
      connection.close();
      setConnected(false);
    };
  }, [enabled, scopeKey, queryClient]);

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
