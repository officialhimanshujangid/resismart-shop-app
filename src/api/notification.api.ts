import type { Href } from 'expo-router';

import { apiClient, ApiEnvelope, unwrap } from './axios';
import { PartnerModule } from '../types/api-contract.generated';

/**
 * A person's own notifications and their own devices.
 *
 * Deliberately ungated server-side: every handler scopes to `req.user`, so
 * there is no wider set a permission check could protect — it could only stop
 * somebody reading their own messages.
 */

export type DevicePlatform = 'WEB' | 'ANDROID' | 'IOS';

export interface NotificationRow {
  _id: string;
  kind: string;
  title: string;
  body?: string;
  link?: string;
  priority?: string;
  readAt?: string | null;
  createdAt: string;
}

/**
 * Where a notification actually leads IN THIS APP.
 *
 * `NotificationRow.link` and the SSE frame's `link` are WEB pathnames —
 * `/dashboard/partner/orders?id=…` — exactly like `PartnerVisibilityBlocker.href`
 * is, and for the same reason: they were written for the panel. Pushing one of
 * them at expo-router is a navigation to a screen that does not exist, so this
 * is the mobile answer to the same question, keyed off the stable half of the
 * payload. `blockerFix` in `partner.api.ts` is the pattern being copied.
 *
 * ── Two inputs, not one ───────────────────────────────────────────────────
 *
 * Most partner notifications carry NO link at all — `PARTNER_BOOKING_NEW`,
 * `PARTNER_VERIFIED`, `PARTNER_PLAN_EXPIRY` and the three boost kinds are all
 * sent without one. A mapper that read only `link` would therefore route
 * nothing for the majority of what a partner is actually woken up by, so `kind`
 * is the fallback and is matched by PREFIX for the same reason
 * `useLiveEvents.keysForKind` does: the backend declares `kind` as a free
 * string and a new `PARTNER_ORDER_RETURNED` must not silently stop routing.
 *
 * ── Why `requires` is here rather than a bare href ────────────────────────
 *
 * Three of the five tab routes are removed from the navigator entirely when the
 * module is off or unsold (`(tabs)/_layout.tsx` uses `Tabs.Protected`, which
 * deletes the route rather than disabling it). Pushing at a deleted route is a
 * navigation to a non-existent screen — which is exactly the class of bug the
 * `/promotion/index` spelling caused in `more.tsx`. So this returns the gate
 * along with the destination and the CALLER checks it against
 * `hasModule`, falling back to the notification list, which is never gated.
 *
 * A `?id=` in the link is deliberately dropped: this app has no booking- or
 * order-detail ROUTE (both are modals over their list), so there is nothing to
 * pass it to. Landing on the right list with the item at the top is the honest
 * approximation; inventing a detail route to receive the id is not this phase's
 * job. See the report.
 */
export interface NotificationDestination {
  href: Href;
  /** The gate-2 module this destination sits behind, when it sits behind one. */
  requires?: PartnerModule;
}

export function notificationDestination(frame: {
  link?: string | null;
  kind?: string | null;
}): NotificationDestination | undefined {
  // The link wins when there is one — it is what the sender meant, and it is
  // more specific than the kind.
  const path = (frame.link ?? '').split('?')[0];
  switch (path) {
    case '/dashboard/partner/bookings':
      return { href: '/(app)/(tabs)/bookings', requires: 'BOOKINGS' };
    case '/dashboard/partner/orders':
      return { href: '/(app)/(tabs)/orders', requires: 'ORDERS' };
    case '/dashboard/partner/promotion':
      return { href: '/promotion' };
    case '/dashboard/billing':
      // Ours is the PLAN screen, not the partner's own invoicing tab: every
      // sender of this link is the subscription lifecycle (`cron.service.ts`).
      return { href: '/settings/plan' };
    default:
      break;
  }

  const kind = frame.kind ?? '';
  if (!kind) return undefined;
  if (kind.startsWith('PARTNER_BOOKING') || kind.startsWith('BOOKING')) {
    return { href: '/(app)/(tabs)/bookings', requires: 'BOOKINGS' };
  }
  if (kind.startsWith('PARTNER_ORDER') || kind.startsWith('ORDER')) {
    return { href: '/(app)/(tabs)/orders', requires: 'ORDERS' };
  }
  if (kind.startsWith('PARTNER_BOOST')) return { href: '/promotion' };
  if (kind.startsWith('PARTNER_INVOICE') || kind.startsWith('PARTNER_PAYMENT')) {
    return { href: '/(app)/(tabs)/billing', requires: 'INVOICING' };
  }
  if (kind.startsWith('PARTNER_PLAN')) return { href: '/settings/plan' };
  /**
   * Verified / rejected / suspended / reinstated all land on Verification —
   * the screen that shows ResiSmart's decision and the reviewer's note, and the
   * only screen from which a rejected partner can act on it. The same
   * destination `blockerFix('NOT_VERIFIED')` gives, deliberately.
   */
  if (
    kind === 'PARTNER_VERIFIED' ||
    kind === 'PARTNER_REJECTED' ||
    kind === 'PARTNER_SUSPENDED' ||
    kind === 'PARTNER_REINSTATED'
  ) {
    return { href: '/settings/verification' };
  }
  return undefined;
}

export const notificationApi = {
  /**
   * The query parameter is `unread`, not `unreadOnly` — the controller reads
   * `req.query.unread === 'true'` and anything else is ignored, so the wrong
   * name silently returns the full list instead of erroring.
   */
  list: (params?: { unread?: boolean; limit?: number; before?: string }) =>
    apiClient
      .get<ApiEnvelope<{ items: NotificationRow[]; unread: number }>>('/notifications', { params })
      .then((r) => unwrap(r.data)),

  markRead: (ids: string[]) => apiClient.post('/notifications/read', { ids }).then((r) => r.data),

  /**
   * Register this device for push.
   *
   * Registered against the ACTIVE tenant — `push.service.ts` addresses tokens by
   * scope id, which in a partner session is the partner id. That is why
   * `usePushRegistration` re-registers on a context switch instead of assuming
   * one token per install: without it, a partner who switches to their second
   * business keeps receiving the first one's alerts and none of the second's.
   */
  registerDevice: (input: { platform: DevicePlatform; token: string; deviceLabel?: string }) =>
    apiClient.post('/notifications/devices', input).then((r) => r.data),

  unregisterDevice: (token: string) =>
    apiClient.delete('/notifications/devices', { data: { token } }).then((r) => r.data),
};
