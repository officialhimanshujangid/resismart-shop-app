import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { todayOrdersApi, todayProductsApi } from './today.api';
import { bookingApi } from '../bookings/booking.api';
import { LIVE_STATUSES, todayCivilDate } from '../bookings/format';
import { qk } from '../../lib/queryKeys';

/**
 * Today's bookings: everything with a slot today, live-first.
 *
 * Keyed under `qk.today()` (not `qk.bookings.list(...)`) so it shares the exact
 * cache entry `useLiveEvents` invalidates on a booking OR order SSE frame —
 * see that hook's `keysForKind`. A key built from the filters, as
 * `useBookingsList` uses for the Bookings tab, would need its own entry in that
 * invalidation list and silently go stale the first time somebody forgot to add
 * it here too.
 */
export function useTodayBookings(enabled: boolean) {
  const today = todayCivilDate();
  return useQuery({
    queryKey: [...qk.today(), 'bookings'] as const,
    queryFn: () => bookingApi.list({ from: today, to: today, limit: 100 }),
    enabled,
    staleTime: 15_000,
  });
}

export function usePendingOrders(enabled: boolean) {
  return useQuery({
    queryKey: [...qk.today(), 'orders-pending'] as const,
    queryFn: todayOrdersApi.pending,
    enabled,
    staleTime: 15_000,
  });
}

function useTodayOrdersForSale(enabled: boolean) {
  const today = todayCivilDate();
  return useQuery({
    queryKey: [...qk.today(), 'orders-today'] as const,
    queryFn: () => todayOrdersApi.today(today),
    enabled,
    staleTime: 30_000,
  });
}

export function useLowStockProducts(enabled: boolean) {
  return useQuery({
    queryKey: [...qk.today(), 'low-stock'] as const,
    queryFn: todayProductsApi.lowStock,
    enabled,
    staleTime: 60_000,
  });
}

const SOLD_ORDER_STATUSES = new Set(['DELIVERED', 'INVOICED', 'PAID']);
const SOLD_BOOKING_STATUSES = new Set(['COMPLETED', 'INVOICED', 'PAID']);

export interface TodaySaleSummary {
  totalPaise: number;
  /** True when either source's page was cut off — the total is a floor, not exact. */
  maybeIncomplete: boolean;
  loading: boolean;
}

/**
 * Today's takings, summed client-side from what was already fetched for the
 * other two tiles — no separate request. See `today.api.ts`'s header for why
 * there is no dedicated endpoint this reads instead.
 */
export function useTodaySale(bookingsEnabled: boolean, ordersEnabled: boolean): TodaySaleSummary {
  const bookingsQuery = useTodayBookings(bookingsEnabled);
  const ordersQuery = useTodayOrdersForSale(ordersEnabled);

  return useMemo(() => {
    const bookingRows = bookingsQuery.data?.data ?? [];
    const orderRows = ordersQuery.data?.data ?? [];
    const bookingSale = bookingRows
      .filter((b) => SOLD_BOOKING_STATUSES.has(b.status))
      .reduce((sum, b) => sum + b.pricing.totalPaise, 0);
    const orderSale = orderRows
      .filter((o) => SOLD_ORDER_STATUSES.has(o.status))
      .reduce((sum, o) => sum + o.amounts.totalPaise, 0);

    const bookingsTruncated = (bookingsQuery.data?.total ?? 0) > bookingRows.length;
    const ordersTruncated = (ordersQuery.data?.total ?? 0) > orderRows.length;

    return {
      totalPaise: bookingSale + orderSale,
      maybeIncomplete: bookingsTruncated || ordersTruncated,
      loading: (bookingsEnabled && bookingsQuery.isLoading) || (ordersEnabled && ordersQuery.isLoading),
    };
  }, [bookingsQuery.data, bookingsQuery.isLoading, ordersQuery.data, ordersQuery.isLoading, bookingsEnabled, ordersEnabled]);
}

export { LIVE_STATUSES };
