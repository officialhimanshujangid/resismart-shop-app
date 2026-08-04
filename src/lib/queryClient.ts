import { QueryClient } from '@tanstack/react-query';
import axios from 'axios';

/**
 * ONE approach to server state for the whole app: `@tanstack/react-query`.
 *
 * Chosen because `mobile-society` already runs it (v5), and the two apps are
 * maintained by one person — a second pattern here would mean every cache,
 * retry and invalidation question has two answers, and the one nobody is
 * looking at is the one that rots. Nothing in this app should hold server data
 * in `useState` + `useEffect`; if a screen needs data, it needs a query key.
 */

/**
 * A 4xx is the server saying "no". Retrying it burns the partner's data plan and
 * delays the error message they need to see, and on 401 it fights the refresh
 * interceptor in `api/axios.ts`, which has already retried once. Only network
 * failures and 5xx are worth trying again — which, on a shop's connection, is
 * most of what actually goes wrong.
 */
const retryPolicy = (failureCount: number, error: unknown): boolean => {
  if (failureCount >= 2) return false;
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) return false;
  }
  return true;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: retryPolicy,
      // A counter screen is read while something is happening at the counter, so
      // 30s-stale data is fine to paint immediately and refresh behind. Anything
      // that must be to-the-second (a slot's availability) overrides this on its
      // own query rather than lowering it for everything.
      staleTime: 30_000,
      // React Native has no window focus; refetching on it does nothing here and
      // makes the intent unclear. Freshness comes from SSE (`lib/sse.ts`), from
      // reconnect, and from pull-to-refresh.
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      // Never automatic. A create that is retried without an idempotency key is
      // how one tap becomes two invoices — see `withIdempotency` in api/axios.ts.
      retry: false,
    },
  },
});

/**
 * Drop everything cached for the previous session.
 *
 * Called on sign-in, sign-out and every context switch. Without it a partner who
 * switches from one of their businesses to another sees the first one's bookings,
 * customers and takings until each query happens to refetch — cross-tenant data
 * on screen, which is the single failure this project's gate 6 exists to prevent.
 * `clear()` rather than `invalidateQueries()`: invalidation leaves the stale data
 * mounted while it refetches, and that stale data belongs to a different business.
 */
export function resetQueryCache(): void {
  queryClient.clear();
}
