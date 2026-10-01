import { useQuery } from '@tanstack/react-query';
import { PartnerOrder } from './types';
import { documentsApi, documentStatusGroup } from '../billing/documents.api';

/**
 * "Show the action only when an ISSUED order-sourced invoice exists" (M5) —
 * and, while we are already looking, how much of each line has already come
 * back, so the return sheet's steppers can cap at what is actually left.
 *
 * One question to the server: `GET /partners/me/documents?sourceType=ORDER&
 * sourceId=<orderId>` — every document raised FROM this order, served by the
 * `{partnerId, sourceType, sourceId}` index. That is exactly the set the
 * backend's own return gate reads (`recordOrderReturn` in
 * `order-billing.service.ts` sums non-cancelled CREDIT_NOTEs with
 * `sourceType: 'ORDER', sourceId: order._id`, and looks for the order's
 * TAX_INVOICE the same way), so the app and the server count the same notes.
 * It replaced a scan of the 100 newest invoices and credit notes, which could
 * miss an older order's bill in a busy shop.
 */
export interface OrderReturnEligibility {
  /** An ISSUED/PARTIALLY_PAID/PAID TAX_INVOICE sourced from this order exists. */
  invoiceFound: boolean;
  /** `productId` → total qty already credited back across every non-cancelled credit note sourced from this order. */
  returnedByItem: Map<string, number>;
}

const ELIGIBLE_STATUSES = new Set<PartnerOrder['status']>(['DELIVERED', 'INVOICED', 'PAID']);

export function orderReturnEligibilityKey(orderId: string | undefined) {
  return ['orders', 'return-eligibility', orderId ?? ''] as const;
}

export function useOrderReturnEligibility(order: PartnerOrder | null) {
  const eligibleStatus = Boolean(order) && ELIGIBLE_STATUSES.has(order!.status);
  return useQuery({
    queryKey: orderReturnEligibilityKey(order?.id),
    enabled: eligibleStatus,
    queryFn: async (): Promise<OrderReturnEligibility> => {
      const orderId = order!.id;
      const [invoices, notes] = await Promise.all([
        documentsApi.list({
          sourceType: 'ORDER', sourceId: orderId, type: 'TAX_INVOICE', status: documentStatusGroup.ISSUED, limit: 100,
        }),
        documentsApi.list({ sourceType: 'ORDER', sourceId: orderId, type: 'CREDIT_NOTE', limit: 100 }),
      ]);
      const invoiceFound = invoices.data.length > 0;
      const returnedByItem = new Map<string, number>();
      for (const note of notes.data) {
        if (note.status === 'CANCELLED') continue;
        for (const line of note.lines) {
          if (!line.itemId) continue;
          returnedByItem.set(line.itemId, (returnedByItem.get(line.itemId) ?? 0) + line.qty);
        }
      }
      return { invoiceFound, returnedByItem };
    },
  });
}

/** Ordered qty minus already-returned, clamped at 0 — what a line may still return. */
export function remainingQty(item: { qty: number; productId: string }, returnedByItem: Map<string, number>): number {
  return Math.max(0, item.qty - (returnedByItem.get(item.productId) ?? 0));
}

/** Whether ANY line on the order still has something left to return. */
export function hasReturnableItems(order: PartnerOrder, returnedByItem: Map<string, number>): boolean {
  return order.items.some((it) => remainingQty(it, returnedByItem) > 0);
}
