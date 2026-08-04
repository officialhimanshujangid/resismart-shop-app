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

/** = `ORDER_VERB_LABELS` in `order-transitions.ts` — "the server names its own actions". */
export const ORDER_VERB_LABELS: Record<OrderVerb, string> = {
  accept: 'Accept the order',
  reject: 'Cannot take this',
  pack: 'Packed and ready',
  dispatch: 'Sent out for delivery',
  deliver: 'Handed over',
  cancel: 'Cancel the order',
  markReturned: 'Came back to us',
  invoice: 'Raise the invoice',
  pay: 'Mark paid',
};

/** Human status text for a status chip. Not on the backend (it writes sentences per-case instead); this is this screen's own vocabulary. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PLACED: 'New',
  ACCEPTED: 'Accepted',
  PACKED: 'Packed',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  INVOICED: 'Invoiced',
  PAID: 'Paid',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  RETURNED: 'Returned',
};
