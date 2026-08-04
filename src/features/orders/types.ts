/**
 * Order shapes, mirrored from the backend rather than imported from
 * `api-contract.generated.ts` — and that needs a word, because the house rule
 * is "never hand-write a union that file already carries".
 *
 * It does not carry these. `backend/src/scripts/generate-api-types.ts` lists
 * `ORDER_STATUSES` / `BOOKING_STATUSES` under a comment reading "PENDING — add
 * as each phase lands... until an entry is here, clients have no
 * compiler-checked knowledge of that value set" — written when the contract
 * generator was built, before P5 (the retail vertical) landed. Nobody has
 * added the entry since. That is a real gap, reported below, not a licence to
 * duplicate `PRODUCT_UNITS` or `PartnerModule` — those two in this file ARE
 * imported from the generated contract, because the contract already carries
 * them.
 *
 * NOT MINE TO FIX: `generate-api-types.ts`'s `CONTRACT` array lives in
 * `backend/src/scripts/`, and running it rewrites
 * `frontend/src/types/api-contract.generated.ts` and
 * `mobile-society/src/types/api-contract.generated.ts` as well as this app's
 * copy — three repos outside this agent's scope, worked in by other agents
 * right now. The fix is one entry each for `ORDER_STATUSES` (from
 * `order.model.ts`) and `OrderVerb`/`ORDER_VERB_LABELS` (from
 * `order-transitions.ts`), then `npm run types:generate`, then this file
 * shrinks to the two interfaces at the bottom.
 *
 * Every value below is copied character-for-character from the backend source
 * named on each line, so drift is at least a diffable comment away from being
 * caught, which is the best a hand-copy can do until the generator closes the
 * gap.
 */
import { OrderDeliveryMode, OrderPaymentMode, OrderStatus, OrderVerb } from './backend-mirror';

export type { OrderStatus, OrderDeliveryMode, OrderPaymentMode, OrderVerb } from './backend-mirror';

/** `IOrderItem` in `order.model.ts` — the frozen line-item snapshot, never re-read from the live product. */
export interface OrderItem {
  productId: string;
  snapshot: {
    name: string;
    sku?: string;
    hsnCode?: string;
    unit: string;
    ratePaise: number;
    taxRatePercent: number;
    taxInclusive: boolean;
    mrpPaise?: number;
  };
  qty: number;
  discountPaise: number;
  linePaise: number;
}

/** `PartnerOrderTimelineEntry` in `order.service.ts` — already masked server-side; render as-is. */
export interface OrderTimelineEntry {
  status: OrderStatus;
  at: string;
  byName?: string;
  note?: string;
}

/** `PartnerOrderEndedView` in `order.service.ts`. */
export interface OrderEnded {
  by: 'CUSTOMER' | 'PARTNER' | 'SYSTEM';
  byName?: string;
  reason?: string;
  at: string;
}

/** `PartnerOrderCustomerView` in `order.service.ts` — the contact-masking contract (PARTNERS_PLAN §2 rule 6). */
export interface OrderCustomerView {
  name: string;
  societyName?: string;
  contactMasked: boolean;
  phone?: string;
  flatLabel?: string;
  deliveryAddress?: {
    line1: string; line2?: string; city?: string; state?: string; pincode?: string; landmark?: string;
  };
  maskNote?: string;
}

/**
 * `PartnerOrderView` — the ONE shape every partner-facing order endpoint
 * returns (`order.service.ts#buildPartnerView`). `allowedVerbs` is read
 * verbatim and never re-derived client-side: see `KNOWN_ORDER_VERBS` in
 * `api.ts` for why one entry in it — `cancel` — is filtered out before it
 * reaches a button.
 */
export interface PartnerOrder {
  id: string;
  code: string;
  status: OrderStatus;
  deliveryMode: OrderDeliveryMode;
  slotPreference?: string;
  note?: string;
  items: OrderItem[];
  amounts: {
    subPaise: number;
    taxPaise: number;
    deliveryPaise: number;
    discountPaise: number;
    totalPaise: number;
  };
  payment: { mode: OrderPaymentMode; status: string; paidAt?: string };
  timeline: OrderTimelineEntry[];
  ended?: OrderEnded;
  allowedVerbs: OrderVerb[];
  customer: OrderCustomerView;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderListFilters {
  /** One status, or several comma-separated — matches `orderQuerySchema`. */
  status?: string;
  from?: string;
  to?: string;
  code?: string;
  page?: number;
  limit?: number;
}
