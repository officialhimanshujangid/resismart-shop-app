/**
 * The hand-copied stopgap itself — see the header on `types.ts` for why this
 * file exists and who owns closing the gap. Kept separate from `types.ts` so
 * the day `ORDER_STATUSES`/`OrderVerb` land in `api-contract.generated.ts`,
 * deleting this one file and repointing three imports is the whole migration.
 *
 * Source of truth for every value below:
 *   backend/src/models/order.model.ts        → ORDER_STATUSES, ORDER_DELIVERY_MODES, ORDER_PAYMENT_MODES
 *   backend/src/services/order-transitions.ts → ORDER_VERBS, ORDER_VERB_LABELS
 */

/** = `ORDER_STATUSES` in `order.model.ts`. */
export const ORDER_STATUSES = [
  'PLACED', 'ACCEPTED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED',
  'INVOICED', 'PAID', 'REJECTED', 'CANCELLED', 'RETURNED',
] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

/** = `ORDER_DELIVERY_MODES` in `order.model.ts`. */
export const ORDER_DELIVERY_MODES = ['PICKUP', 'DELIVERY'] as const;
export type OrderDeliveryMode = typeof ORDER_DELIVERY_MODES[number];

/** = `ORDER_PAYMENT_MODES` in `order.model.ts`. */
export const ORDER_PAYMENT_MODES = ['COD', 'ONLINE'] as const;
export type OrderPaymentMode = typeof ORDER_PAYMENT_MODES[number];

/** = `ORDER_VERBS` in `order-transitions.ts`. */
export const ORDER_VERBS = [
  'accept', 'reject', 'pack', 'dispatch', 'deliver', 'cancel', 'markReturned', 'invoice', 'pay',
] as const;
export type OrderVerb = typeof ORDER_VERBS[number];

/**
 * WHAT EACH VERB'S BUTTON SAYS — a catalogue key per verb, mirroring
 * `ORDER_VERB_LABELS` in `order-transitions.ts` ("the server names its own
 * actions").
 *
 * The KEYS are `ORDER_VERBS` above, which is the WIRE value: the verb is POSTed
 * to `POST /orders/:id/:verb` and is what `allowedVerbs` comes back as. Those
 * literals never move. Only the labels are translated — the same split
 * `features/billing/types.ts` is the worked example of.
 */
export const ORDER_VERB_LABEL_KEYS: Record<OrderVerb, string> = {
  accept: 'orders.verb.accept',
  reject: 'orders.verb.reject',
  pack: 'orders.verb.pack',
  dispatch: 'orders.verb.dispatch',
  deliver: 'orders.verb.deliver',
  cancel: 'orders.verb.cancel',
  markReturned: 'orders.verb.markReturned',
  invoice: 'orders.verb.invoice',
  pay: 'orders.verb.pay',
};

/**
 * Human status text for a status chip — a catalogue key per status. Not on the
 * backend (it writes sentences per-case instead); this is this app's own
 * vocabulary. `ORDER_STATUSES` above stays the wire value: it is what the server
 * sends, what `toneFor` switches on, and what a filter posts back.
 */
export const ORDER_STATUS_LABEL_KEYS: Record<OrderStatus, string> = {
  PLACED: 'orders.status.PLACED',
  ACCEPTED: 'orders.status.ACCEPTED',
  PACKED: 'orders.status.PACKED',
  OUT_FOR_DELIVERY: 'orders.status.OUT_FOR_DELIVERY',
  DELIVERED: 'orders.status.DELIVERED',
  INVOICED: 'orders.status.INVOICED',
  PAID: 'orders.status.PAID',
  REJECTED: 'orders.status.REJECTED',
  CANCELLED: 'orders.status.CANCELLED',
  RETURNED: 'orders.status.RETURNED',
};
