import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ordersApi, KnownOrderVerb, OrderReturnLine, OrderReturnResult } from './api';
import { OrderListFilters, PartnerOrder } from './types';
import { qk } from '../../lib/queryKeys';

export function useOrders(filters: OrderListFilters) {
  return useQuery({
    queryKey: qk.orders.list(filters as Record<string, string | number | undefined>),
    queryFn: () => ordersApi.list(filters),
    // Keeps the previous page's rows on screen while the next page or a filter
    // switch loads, so the list does not flash empty every time a chip is tapped.
    placeholderData: keepPreviousData,
  });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: qk.orders.detail(id ?? ''),
    queryFn: () => ordersApi.getOne(id as string),
    enabled: Boolean(id),
  });
}

export interface TransitionInput {
  id: string;
  verb: KnownOrderVerb;
  text?: string;
}

/**
 * One mutation for every order action. On success the updated order is written
 * straight into the detail cache (so a modal reading it updates immediately)
 * and the whole `orders` branch is invalidated — a status change can move a
 * row out of the currently-filtered list (e.g. `accept` on the "New" chip), so
 * a targeted `setQueryData` on the list is not enough; the list has to refetch.
 */
export function useOrderTransition() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, verb, text }: TransitionInput) => ordersApi.transition(id, verb, text),
    onSuccess: (updated: PartnerOrder) => {
      queryClient.setQueryData(qk.orders.detail(updated.id), updated);
      void queryClient.invalidateQueries({ queryKey: qk.orders.all() });
      // Today's "pending orders" count is built off the same data.
      void queryClient.invalidateQueries({ queryKey: qk.today() });
    },
  });
}

export interface OrderReturnInput {
  id: string;
  lines: OrderReturnLine[];
  reason: string;
  /**
   * Minted by the CALLER once per return decision (`newIdempotencyKey`) and
   * held for every retry of that same decision — never regenerated inside
   * this hook, which is exactly what would turn a retried tap into a second
   * credit note on a flaky connection.
   */
  idempotencyKey: string;
}

/**
 * M5 — record a partial (or full-by-line) return off a delivered/invoiced
 * order. On success the server hands back the RE-PRICED order (stock and
 * receivable already adjusted) plus the credit note it raised; both caches
 * are refreshed the same way `useOrderTransition` does it, and the
 * return-eligibility lookup (`useOrderReturnEligibility`) is invalidated so a
 * second return in the same session sees the updated already-returned sums —
 * this is what makes multiple partial returns on one order keep working
 * without a screen reload.
 */
export function useOrderReturnItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, lines, reason, idempotencyKey }: OrderReturnInput) =>
      ordersApi.returnItems(id, { lines, reason }, idempotencyKey),
    onSuccess: ({ order }: OrderReturnResult) => {
      queryClient.setQueryData(qk.orders.detail(order.id), order);
      void queryClient.invalidateQueries({ queryKey: qk.orders.all() });
      void queryClient.invalidateQueries({ queryKey: qk.today() });
      void queryClient.invalidateQueries({ queryKey: ['orders', 'return-eligibility', order.id] });
      void queryClient.invalidateQueries({ queryKey: qk.billing.documents() });
    },
  });
}
