/**
 * The slices of Orders and Catalogue the Today screen reads.
 *
 * Deliberately narrow and deliberately read-only — this vertical owns Today and
 * Bookings, not Orders or Catalogue (`app/(app)/(tabs)/orders.tsx`,
 * `more.tsx` → catalogue), so it does not build out the full order/product API
 * surface those screens will want to own and shape themselves. Same reasoning
 * as `booking.types.ts`: `api-contract.generated.ts` does not carry `OrderStatus`
 * either, so it is hand-copied from `backend/src/models/order.model.ts` rather
 * than invented.
 */

export const ORDER_STATUSES = [
  'PLACED', 'ACCEPTED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED',
  'INVOICED', 'PAID', 'REJECTED', 'CANCELLED', 'RETURNED',
] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

/** Only the fields the Today tiles need — `PartnerOrderView` carries far more. */
export interface TodayOrderRow {
  id: string;
  code: string;
  status: OrderStatus;
  amounts: { totalPaise: number };
  itemCount: number;
  customer: { name: string };
  createdAt: string;
}

export interface TodayProductRow {
  _id: string;
  name: string;
  stockQty: number;
  lowStockAt?: number;
}

export interface PagedRows<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
}
