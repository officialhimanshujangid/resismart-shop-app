import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { ordersApi, KnownOrderVerb } from './api';
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
