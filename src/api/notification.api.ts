import type { Href } from 'expo-router';

import { apiClient, ApiEnvelope, unwrap } from './axios';
import { PartnerModule } from '../types/api-contract.generated';
import type { P2Module } from '../features/p2/modules';

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
 * A `?id=` in the link is KEPT and passed on as the screen's own `id` param,
 * so a tap opens the item, not just its list: Bookings shows that booking at
 * the top with its actions, Orders opens its detail sheet, Promotion and
 * Reviews mark that row. Screens that are one page (verification, invoice
 * settings, plan) take no id. See `idFromLink`.
 */
export interface NotificationDestination {
  href: Href;
  /** The gate-2 module this destination sits behind, when it sits behind one. */
  requires?: PartnerModule;
  /**
   * P2: the business-type module the destination sits behind. A pharmacy alert
   * kept in the inbox after Pharmacy was switched off must land on the inbox,
   * not on a screen whose layout would send the partner back to Today.
   */
  requiresCategory?: P2Module;
}

/** `/dashboard/partner/<area>/<id>` → the `<id>` (id-shaped only), else undefined. */
function pathId(path: string, base: string): string | undefined {
  if (!path.startsWith(`${base}/`)) return undefined;
  const rest = path.slice(base.length + 1);
  return /^[A-Za-z0-9_-]{1,64}$/.test(rest) ? rest : undefined;
}

/**
 * P2 (CONTRACT-partner-P2 §13): the links and kinds the business-type modules
 * send a partner. Links first (they name the item), kinds as the fallback.
 * Every destination carries its base module AND its category module.
 */
export function p2Destination(frame: { link?: string | null; kind?: string | null }): NotificationDestination | undefined {
  const link = frame.link ?? '';
  const path = link.split('?')[0];
  if (path === '/dashboard/partner/pharmacy/near-expiry') {
    return { href: '/pharmacy/near-expiry' as Href, requires: 'CATALOG', requiresCategory: 'PHARMACY' };
  }
  if (path === '/dashboard/partner/pharmacy' || path.startsWith('/dashboard/partner/pharmacy/')) {
    return { href: '/pharmacy' as Href, requires: 'CATALOG', requiresCategory: 'PHARMACY' };
  }
  if (path === '/dashboard/partner/subscriptions/bills') {
    const period = paramFromLink(link, 'period');
    const status = paramFromLink(link, 'status');
    const q = [period ? `period=${encodeURIComponent(period)}` : '', status ? `status=${encodeURIComponent(status)}` : '']
      .filter(Boolean).join('&');
    return { href: `/subscriptions/bills${q ? `?${q}` : ''}` as Href, requires: 'INVOICING', requiresCategory: 'SUBSCRIPTIONS' };
  }
  const subId = pathId(path, '/dashboard/partner/subscriptions');
  if (subId) return { href: `/subscriptions/${subId}` as Href, requires: 'INVOICING', requiresCategory: 'SUBSCRIPTIONS' };
  if (path === '/dashboard/partner/subscriptions' || path.startsWith('/dashboard/partner/subscriptions/')) {
    return { href: '/subscriptions' as Href, requires: 'INVOICING', requiresCategory: 'SUBSCRIPTIONS' };
  }
  const seriesId = pathId(path, '/dashboard/partner/appointments/series');
  if (seriesId) return { href: `/appointments/series/${seriesId}` as Href, requires: 'BOOKINGS', requiresCategory: 'APPOINTMENTS' };
  if (path === '/dashboard/partner/appointments' || path.startsWith('/dashboard/partner/appointments/')) {
    return { href: '/appointments' as Href, requires: 'BOOKINGS', requiresCategory: 'APPOINTMENTS' };
  }
  const jobId = pathId(path, '/dashboard/partner/jobs');
  if (jobId) return { href: `/jobs/${jobId}` as Href, requires: 'BOOKINGS', requiresCategory: 'JOBS' };
  if (path === '/dashboard/partner/jobs' || path.startsWith('/dashboard/partner/jobs/')) return { href: '/jobs' as Href, requires: 'BOOKINGS', requiresCategory: 'JOBS' };

  // A link we know that is NOT a P2 page (bookings, orders…) is left to the main table.
  if (path) return undefined;

  switch (frame.kind ?? '') {
    case 'PARTNER_NEAR_EXPIRY':
      return { href: '/pharmacy/near-expiry' as Href, requires: 'CATALOG', requiresCategory: 'PHARMACY' };
    case 'SUBSCRIPTION_PAUSE':
      return { href: '/subscriptions' as Href, requires: 'INVOICING', requiresCategory: 'SUBSCRIPTIONS' };
    case 'SUBSCRIPTION_BILL':
      return { href: '/subscriptions/bills' as Href, requires: 'INVOICING', requiresCategory: 'SUBSCRIPTIONS' };
    case 'APPOINTMENT_REMINDER':
      return { href: '/appointments' as Href, requires: 'BOOKINGS', requiresCategory: 'APPOINTMENTS' };
    case 'APPOINTMENT_SERIES':
      return { href: '/appointments/series' as Href, requires: 'BOOKINGS', requiresCategory: 'APPOINTMENTS' };
    case 'PACKAGE_UPDATE':
      return { href: '/appointments/packages' as Href, requires: 'BOOKINGS', requiresCategory: 'APPOINTMENTS' };
    case 'JOB_QUOTE':
    case 'JOB_QUOTE_DECISION':
    case 'JOB_GATE_PASS':
      return { href: '/jobs' as Href, requires: 'BOOKINGS', requiresCategory: 'JOBS' };
    default:
      return undefined;
  }
}

/**
 * The `id` in a notification link (`/dashboard/partner/orders?id=<id>`), or
 * `undefined`. Only an id-shaped value (letters, digits, `-`, `_`) is kept —
 * this lands in a route param, and a malformed send is not something to pass on.
 */
export function idFromLink(link: string | null | undefined): string | undefined {
  return paramFromLink(link, 'id');
}

/** The same id-shaped rule for another query key (`?open=` on the rent links). */
export function paramFromLink(link: string | null | undefined, name: string): string | undefined {
  const query = (link ?? '').split('?')[1];
  if (!query) return undefined;
  for (const part of query.split('&')) {
    const [k, v] = part.split('=');
    if (k !== name || !v) continue;
    let value: string;
    try { value = decodeURIComponent(v); } catch { return undefined; }
    return /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : undefined;
  }
  return undefined;
}

/** `base?id=<id>` when there is an id, else `base`. */
const withId = (base: string, id: string | undefined): Href =>
  (id ? `${base}?id=${encodeURIComponent(id)}` : base) as Href;

export function notificationDestination(frame: {
  link?: string | null;
  kind?: string | null;
}): NotificationDestination | undefined {
  // P2 business-type modules first: their links and kinds share no prefix with
  // the table below, and each one carries its category gate.
  const p2 = p2Destination(frame);
  if (p2) return p2;

  // The link wins when there is one — it is what the sender meant, and it is
  // more specific than the kind.
  const path = (frame.link ?? '').split('?')[0];
  const id = idFromLink(frame.link);
  switch (path) {
    case '/dashboard/partner/bookings':
      return { href: withId('/(app)/(tabs)/bookings', id), requires: 'BOOKINGS' };
    case '/dashboard/partner/orders':
      return { href: withId('/(app)/(tabs)/orders', id), requires: 'ORDERS' };
    case '/dashboard/partner/promotion':
      return { href: withId('/promotion', id) };
    /**
     * No `requires` on these three, and that is not an omission.
     *
     * `requires` exists for the tab routes `(tabs)/_layout.tsx` DELETES with
     * `Tabs.Protected` — pushing at one of those when the module is off is a
     * navigation to a route that is not registered. These are plain stack
     * routes that are always registered; their own layouts
     * (`settings/_layout.tsx`, `reviews/_layout.tsx`) redirect a person who may
     * not read them, which is a screen deciding about itself rather than this
     * table guessing. `/promotion` above is written the same way for the same
     * reason.
     */
    case '/dashboard/partner/settings/invoice':
      // `PARTNER_BANK_DETAILS_CHANGED` — HIGH, and its body asks the partner to
      // change the details back if it was not them. It is the one notification
      // in this app where having nothing to tap is itself the failure.
      return { href: '/settings/invoice' };
    case '/dashboard/partner/reviews':
      // `PARTNER_REVIEW`. The reply window is the message: one reply, editable
      // for 24 hours, and this notification is what starts the clock — so it
      // has to land on the screen with the reply box, not on the inbox.
      return { href: withId('/reviews', id) };
    case '/dashboard/partner/verification':
      // Already reached the right screen via the kind chain below, which is
      // exactly what `partner.controller.ts` says it relied on. Written out
      // anyway: the kinds carrying this link are four unrelated verdicts, and
      // the next one added would not be covered by anything.
      return { href: '/settings/verification' };
    case '/dashboard/partner/team':
      // `PARTNER_OWNERSHIP` (CONTRACT-partner-P0 §8): handover started/completed,
      // co-owner joined, invitation declined. `owners/_layout.tsx` sends a
      // non-owner back out, the same self-deciding rule as the routes above.
      return { href: '/owners' };
    /**
     * P1 (CONTRACT-partner-P1 §6, screen S13): the low-stock push and its
     * 09:30 digest link the web reorder page. The app's reorder list is a
     * stack route behind `stock/_layout.tsx`, which refuses a person without
     * stock access itself; `requires: 'CATALOG'` sends a tap to the inbox when
     * the catalogue module is off.
     */
    case '/dashboard/partner/reorder':
    case '/dashboard/partner/stock/reorder':
      return { href: '/stock/reorder', requires: 'CATALOG' };
    case '/dashboard/partner/khata':
      return { href: '/khata', requires: 'INVOICING' };
    /**
     * P4 (CONTRACT-partner-P4 §10.8): rent bills, reminders and lease alerts
     * (kinds RENT / LEASE) link the web "my rent" page, `?open=<billId>` for one
     * bill (`partnerRentBillPath`). No `requires`: `rent/_layout.tsx` decides
     * for itself who may look, like the stack routes above.
     */
    case '/dashboard/partner/society-rent': {
      const bill = paramFromLink(frame.link, 'open');
      return { href: bill ? (`/rent/${encodeURIComponent(bill)}` as Href) : '/rent' };
    }
    case '/dashboard/billing':
      // Ours is the PLAN screen, not the partner's own invoicing tab: every
      // sender of this link is the subscription lifecycle (`cron.service.ts`).
      return { href: '/settings/plan' };
    default:
      break;
  }

  const kind = frame.kind ?? '';
  if (!kind) return undefined;
  // P1: before the ORDER/INVOICE prefixes below, which none of these share.
  if (kind.startsWith('PARTNER_LOW_STOCK')) return { href: '/stock/reorder', requires: 'CATALOG' };
  if (kind.startsWith('PARTNER_KHATA')) return { href: '/khata', requires: 'INVOICING' };
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
  // P4: exact kinds — `RENT_PAID_NOTE` goes to the society office, never a shop.
  if (kind === 'RENT' || kind === 'LEASE') return { href: '/rent' };
  if (kind.startsWith('PARTNER_REVIEW')) return { href: '/reviews' };
  /**
   * A prefix, not the one kind the server sends today. `PARTNER_BANK_DETAILS_`
   * is a family of security notices about the same settings screen — the next
   * member of it must not be the one that silently draws no Open button, which
   * is the whole argument the header makes for matching `kind` by prefix.
   * Placed after `PARTNER_INVOICE`/`PARTNER_PAYMENT` only for readability;
   * nothing here can shadow anything above it.
   */
  if (kind.startsWith('PARTNER_BANK_DETAILS')) return { href: '/settings/invoice' };
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
