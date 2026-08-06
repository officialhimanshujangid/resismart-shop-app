import { apiClient, ApiEnvelope, unwrap, withIdempotency } from '../../api/axios';
import { OrderListFilters, PartnerOrder } from './types';
import { OrderVerb } from './backend-mirror';
import { PartnerDocumentRecord } from '../billing/types';

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
 * The verbs THIS app can call, as a literal tuple (`as const`) rather than a
 * widened `OrderVerb[]` — that is what lets `KnownOrderVerb` below be checked
 * member-by-member against `OrderVerb`, and `ENDPOINT_FOR`'s `Record` catch a
 * missing or extra key at compile time instead of at a shop's counter. With
 * `invoice` and `pay` added below this now covers all nine of `ORDER_VERBS`.
 *
 * `cancel` (B4): `order-transitions.ts` lists it as legal for a `PARTNER`
 * actor at `PLACED`/`ACCEPTED` — its `who` array is `['CUSTOMER', 'PARTNER']`
 * — and `order.routes.ts` now has the matching partner route,
 * `POST /partners/me/orders/:id/cancel` (`orderReasonSchema` — the reason is
 * REQUIRED, same as `reject`, because a shop cancelling on a waiting customer
 * with no sentence after it is the message that becomes a phone call to the
 * society office). This entry used to be missing, which meant the table told
 * this app's own boards to draw "Cancel the order" and the button 404ed —
 * exactly the bug this file's own header warns against ("the server offers
 * the verb; the client filters it out").
 *
 * `invoice`/`pay` (`order.routes.ts:103-104`, mirroring the booking close-out
 * `POST /:id/invoice` + `/mark-paid`) used to be absent for the reason `cancel`
 * used to be: the retail endpoints did not exist yet. They do now, and the
 * same "the server offers the verb; the client filters it out" bug applied —
 * a DELIVERED order could reach INVOICED/PAID in `order-transitions.ts` and
 * never on this screen. Neither takes a reason; the "no bill raised yet" 409
 * is handled at the call site (`(tabs)/orders.tsx#openBillFor`), the same way
 * bookings hands that refusal off to the Billing screen.
 */
export const KNOWN_ORDER_VERBS = ['accept', 'reject', 'pack', 'dispatch', 'deliver', 'markReturned', 'cancel', 'invoice', 'pay'] as const;
export type KnownOrderVerb = typeof KNOWN_ORDER_VERBS[number];

/** `allowedVerbs` from the server, narrowed to the ones this app has a route for. Order preserved. */
export function filterKnownVerbs(verbs: OrderVerb[]): KnownOrderVerb[] {
  const known = new Set<string>(KNOWN_ORDER_VERBS);
  return verbs.filter((v): v is KnownOrderVerb => known.has(v));
}

/** `reject` / `markReturned` / `cancel` — what the customer reads; reason is required (min 3 chars, matches `orderReasonSchema`). */
const REASON_VERBS = new Set<KnownOrderVerb>(['reject', 'markReturned', 'cancel']);

export function verbNeedsReason(verb: KnownOrderVerb): boolean {
  return REASON_VERBS.has(verb);
}

/** Most verbs are one segment; `markReturned` renames to `/return`, `invoice`/`pay` are their own name. */
const ENDPOINT_FOR: Record<KnownOrderVerb, string> = {
  accept: 'accept',
  reject: 'reject',
  pack: 'pack',
  dispatch: 'dispatch',
  deliver: 'deliver',
  markReturned: 'return',
  cancel: 'cancel',
  invoice: 'invoice',
  pay: 'pay',
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

  /**
   * Partial (or full-by-line) return — M5. NOT one of `ORDER_VERBS`: the
   * backend route (`order.routes.ts`, `POST /:id/return-items`) is a
   * freestanding endpoint outside the transition machine, so it is never in
   * `allowedVerbs` and never runs through `filterKnownVerbs`/`transition`
   * above. `itemId` is the order line's `productId` — the order line itself
   * carries no id of its own (`order.validator.ts#returnItemsSchema`).
   *
   * `idempotencyKey` is minted by the CALLER once per return decision, same
   * rule as `documentsApi.create` — the route requires an `Idempotency-Key`
   * header (`idempotent('order.return')` middleware), so a retry on a flaky
   * connection must resend the SAME key, not mint a fresh one.
   *
   * The 409 refusals here (no ISSUED order-sourced invoice yet; returning
   * more than remains) carry NO machine-readable `code` — unlike `invoice`'s
   * `NO_BILL_RAISED` — only a status 409 and a ready-to-show sentence
   * (`order-billing.service.ts`). Callers show it via `apiErrorMessage`,
   * they do not branch on `apiErrorCode`.
   */
  returnItems: (id: string, payload: OrderReturnPayload, idempotencyKey: string) =>
    apiClient
      .post<ApiEnvelope<OrderReturnResult>>(
        `/partners/me/orders/${id}/return-items`,
        payload,
        withIdempotency(idempotencyKey),
      )
      .then((r) => unwrap(r.data)),
};

export interface OrderReturnLine {
  /** = `OrderItem.productId` for the line being returned. */
  itemId: string;
  qty: number;
}

export interface OrderReturnPayload {
  lines: OrderReturnLine[];
  /** Required, 3–300 chars — matches `returnItemsSchema`. */
  reason: string;
}

/** `{ order, creditNote }` — `order.controller.ts#returnItems`'s success body. */
export interface OrderReturnResult {
  order: PartnerOrder;
  creditNote: PartnerDocumentRecord;
}
