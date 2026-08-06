import { useQuery } from '@tanstack/react-query';
import { PartnerOrder } from './types';
import { documentsApi, documentStatusGroup } from '../billing/documents.api';

/**
 * "Show the action only when an ISSUED order-sourced invoice exists" (M5) —
 * and, while we are already looking, how much of each line has already come
 * back, so the return sheet's steppers can cap at what is actually left.
 *
 * There is no server endpoint for either question. `GET /partners/me/orders`
 * exposes no verb for `returnItems` (it is not in `ORDER_VERBS` —
 * `backend-mirror.ts`'s header explains why), and `GET /partners/me/documents`
 * takes no `sourceType`/`sourceId` filter (`documents.api.ts#DocumentListFilters`
 * — confirmed against `partner-document.controller.ts#list`, which only
 * accepts `type,status,partyId,from,to,q,page,limit`). The backend's OWN gate
 * (`order.controller.ts`'s `billsForOrder`, and `recordOrderReturn`'s
 * already-returned sum in `order-billing.service.ts`) both query
 * `PartnerDocument` directly by `sourceType`/`sourceId` — a query this app has
 * no route to run itself.
 *
 * So this fetches the two relevant document types (issued tax invoices,
 * every non-cancelled credit note) and filters client-side by matching
 * `sourceType === 'ORDER' && sourceId === order.id` — the same brute-force
 * approach `openBillFor` in `(tabs)/orders.tsx` already accepts for the
 * create-side of this same gap. `limit: 100` on each list bounds this to one
 * page of the partner's own recent documents; a shop with more than 100 live
 * invoices or credit notes since this order shipped could miss a match. That
 * ceiling is a real, known limitation of doing this without a backend filter
 * — not a bug in the filtering logic itself.
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
        documentsApi.list({ type: 'TAX_INVOICE', status: documentStatusGroup.ISSUED, limit: 100 }),
        documentsApi.list({ type: 'CREDIT_NOTE', limit: 100 }),
      ]);
      const invoiceFound = invoices.data.some((d) => d.sourceType === 'ORDER' && d.sourceId === orderId);
      const returnedByItem = new Map<string, number>();
      for (const note of notes.data) {
        if (note.sourceType !== 'ORDER' || note.sourceId !== orderId || note.status === 'CANCELLED') continue;
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
