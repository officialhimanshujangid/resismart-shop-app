import { apiClient, ApiEnvelope, unwrap } from '../../api/axios';
import { OrderListFilters, PartnerOrder } from './types';
import { OrderVerb } from './backend-mirror';

/**
 * `/partners/me/orders/**` — see `order.routes.ts` and `order.controller.ts`.
 * Every response here is a `PartnerOrderView`, i.e. already contact-masked;
 * this file does not and must not attempt its own masking.
 */

export interface OrderListPage {
  data: PartnerOrder[];
  page: number;
  limit: number;
  total: number;
}

/**
 * The six verbs THIS app can call, as a literal tuple (`as const`) rather than
 * a widened `OrderVerb[]` — that is what lets `KnownOrderVerb` below be
 * exactly six members instead of all nine, and `endpointFor`'s `Record` catch
 * a missing or extra key at compile time instead of at a shop's counter.
 *
 * `order-transitions.ts` also lists `cancel` as legal for a `PARTNER` actor at
 * `PLACED`/`ACCEPTED` — its `who` array is `['CUSTOMER', 'PARTNER']` — so a
 * `PartnerOrderView.allowedVerbs` CAN contain `'cancel'` for an order this app
 * is looking at. `order.routes.ts`'s partner router exposes NO `/cancel`
 * action, only `/accept /reject /pack /dispatch /deliver /return` —
 * cancelling is resident-only (`residentOrderRouter.post('/:id/cancel', ...)`).
 * `invoice`/`pay` are likewise declared in the transition table for P6 and
 * have no P5 endpoint at all.
 *
 * NOT MINE — reported, not patched: either `order.routes.ts` should grow a
 * partner `/cancel` action, or `allowedOrderVerbs()` in `order-transitions.ts`
 * should stop offering `PARTNER` a verb the partner router cannot serve. Until
 * one of those lands, `filterKnownVerbs` below renders a button for every verb
 * this app CAN call and silently drops any other verb the server publishes,
 * rather than wiring up a button that 404s.
 */
export const KNOWN_ORDER_VERBS = ['accept', 'reject', 'pack', 'dispatch', 'deliver', 'markReturned'] as const;
export type KnownOrderVerb = typeof KNOWN_ORDER_VERBS[number];

/** `allowedVerbs` from the server, narrowed to the ones this app has a route for. Order preserved. */
export function filterKnownVerbs(verbs: OrderVerb[]): KnownOrderVerb[] {
  const known = new Set<string>(KNOWN_ORDER_VERBS);
  return verbs.filter((v): v is KnownOrderVerb => known.has(v));
}

/** `reject` / `markReturned` — what the customer reads; reason is required (min 3 chars, matches `orderReasonSchema`). */
const REASON_VERBS = new Set<KnownOrderVerb>(['reject', 'markReturned']);

export function verbNeedsReason(verb: KnownOrderVerb): boolean {
  return REASON_VERBS.has(verb);
}

/** `accept /pack /dispatch /deliver /return` are one segment; `markReturned` alone renames to `/return`. */
const ENDPOINT_FOR: Record<KnownOrderVerb, string> = {
  accept: 'accept',
  reject: 'reject',
  pack: 'pack',
  dispatch: 'dispatch',
  deliver: 'deliver',
  markReturned: 'return',
};

export const ordersApi = {
  list: (filters: OrderListFilters) =>
    apiClient
      .get<OrderListPage>('/partners/me/orders', {
        params: {
          status: filters.status,
          from: filters.from,
          to: filters.to,
          code: filters.code,
          page: filters.page ?? 1,
          limit: filters.limit ?? 25,
        },
      })
      .then((r) => r.data),

  getOne: (id: string) =>
    apiClient.get<ApiEnvelope<PartnerOrder>>(`/partners/me/orders/${id}`).then((r) => unwrap(r.data)),

  /**
   * One call for all six. `text` is sent as `reason` for the two verbs that
   * require one and as an optional `note` for the other four — passing the
   * field a verb's own schema does not declare is dropped server-side (zod
   * strips unknown keys), so this does not need to branch on it a second time.
   */
  transition: (id: string, verb: KnownOrderVerb, text?: string) => {
    const body = verbNeedsReason(verb) ? { reason: text } : text ? { note: text } : {};
    return apiClient
      .post<ApiEnvelope<PartnerOrder>>(`/partners/me/orders/${id}/${ENDPOINT_FOR[verb]}`, body)
      .then((r) => unwrap(r.data));
  },
};
