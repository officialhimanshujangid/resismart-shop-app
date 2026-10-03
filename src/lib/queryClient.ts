import { QueryClient, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
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
/**
 * Teach react-query what "offline" means on a phone.
 *
 * Its default detector listens for the browser's `online`/`offline` window
 * events, which React Native does not have — so without this the library
 * believes the device is permanently online. Two things follow from that
 * belief, and both are wrong on a shop's connection: `refetchOnReconnect`
 * below never fires, because as far as the library is concerned nothing ever
 * reconnected; and every query mounted in a basement is dispatched into a dead
 * radio and burns its retries before showing an error.
 *
 * `isInternetReachable` is `null` until the platform has decided, so an
 * undecided answer falls back to `isConnected` rather than reading as offline —
 * the same rule `features/billing/draftStore.ts` already applies to its own
 * sync trigger, kept identical on purpose so the two cannot disagree about
 * whether the phone is on the network.
 */
// >>> WEB-UI In a browser NetInfo's reachability probe is a cross-origin fetch the
// browser blocks, so it reported "offline" while the network was fine. On web,
// react-query keeps its own window online/offline events. Phones unchanged.
if (Platform.OS !== 'web') {
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => {
      const reachable = state.isInternetReachable;
      setOnline(reachable === null ? state.isConnected !== false : reachable);
    }),
  );
}
// <<< WEB-UI

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
      /**
       * Mutations still FIRE while `onlineManager` says we are offline, and
       * fail the way they always have.
       *
       * Pausing is right for a query — nobody is waiting on a list — but a
       * mutation is a button the partner just pressed. Under the default
       * `'online'` mode, accepting a booking with no signal would neither
       * succeed nor fail: it would sit paused with `isPending` true, so the
       * button spins with no error and no way to tell that nothing was sent,
       * until the network happens to return. A fast, honest "No connection" is
       * the behaviour every screen here is already written against.
       */
      networkMode: 'offlineFirst',
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
