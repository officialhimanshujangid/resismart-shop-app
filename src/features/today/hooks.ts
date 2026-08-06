import { useQuery } from '@tanstack/react-query';
import { todayOrdersApi, todayProductsApi } from './today.api';
import { analyticsApi } from '../../api/analytics.api';
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

export function useLowStockProducts(enabled: boolean) {
  return useQuery({
    queryKey: [...qk.today(), 'low-stock'] as const,
    queryFn: todayProductsApi.lowStock,
    enabled,
    staleTime: 60_000,
  });
}

/**
 * The Today board: today's sale, order count, pending decisions, low-stock
 * count and a 14-day sales sparkline, all computed server-side in one
 * aggregation (`partner-today.service.ts`) — replaces the client-side
 * `limit: 100` sum this hook used to do (`useTodaySale`/`useTodayOrdersForSale`,
 * removed). Not gated by module — see `analytics.api.ts`'s header and the
 * route file for why; the screen still gates individual TILES on
 * `showBookings`/`showOrders`/`showCatalog` so a partner never sees a number
 * about a module they cannot open.
 *
 * Keyed under `qk.today()` (`qk.analytics.today()`) for the same reason
 * `useTodayBookings` above is — so a pull-to-refresh and every relevant SSE
 * frame (`useLiveEvents`' `keysForKind`) refetch this board too.
 */
export function useTodayAnalytics(enabled: boolean) {
  return useQuery({
    queryKey: qk.analytics.today(),
    queryFn: analyticsApi.today,
    enabled,
    staleTime: 30_000,
  });
}

export { LIVE_STATUSES };
