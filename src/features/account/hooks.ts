import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { accountApi } from '../../api/account.api';
import { clearSession } from '../../api/axios';
import { useAuth } from '../../context/AuthContext';

/**
 * The two steps of deleting one's own account. See `api/account.api.ts`.
 *
 * Mutations with no cache to invalidate: nothing on screen is keyed off either
 * answer, and after the second one there is no session left to refetch with.
 */

/** Send (or re-send) the deletion code. */
export function useRequestAccountDeletion() {
  return useMutation({
    mutationFn: () => accountApi.requestDeletion(),
  });
}

/**
 * Confirm with the code, then sign out on this device.
 *
 * The existing `logout`, not a second teardown: it is the one place that clears
 * Google's cached account, the push token, the keychain, the query cache and the
 * cached business list, and a copy of it here is how the two come to disagree.
 *
 * It now runs against a server that has already revoked every session, so its
 * one network call — unregistering the push device — answers 401. That is safe:
 * the call is bounded and its failure swallowed inside `logout`, and the refresh
 * it provokes is refused too, which the interceptor turns into `clearSession()`
 * and the session-expired handler. Both paths end signed out. The `catch` is the
 * last resort should `logout` itself throw: `clearSession()` WITH notify, so
 * `AuthProvider` still drops to the login screen rather than leaving a deleted
 * account's screens mounted.
 */
export function useConfirmAccountDeletion() {
  const { logout } = useAuth();
  return useMutation({
    // M01 audit: `alsoOtherLogins` when the person ticked it (a bare code still works).
    mutationFn: (v: string | { code: string; alsoOtherLogins?: boolean }) =>
      typeof v === 'string' ? accountApi.confirmDeletion(v) : accountApi.confirmDeletion(v.code, !!v.alsoOtherLogins),
    onSuccess: async () => {
      try {
        await logout();
      } catch {
        await clearSession();
      }
    },
  });
}

// >>> M01 audit — "Your places" on the delete screen (parity with the web profile page).
const PLACES_KEY = ['account', 'places'] as const;

/** Every society/flat/business this person is linked to. */
export function useMyPlaces() {
  return useQuery({ queryKey: PLACES_KEY, queryFn: () => accountApi.places() });
}

/** Leave one society or flat; the list is replaced with the server's answer. */
export function useLeavePlace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { societyId: string; flatId?: string }) => accountApi.leave(body),
    onSuccess: (res) => {
      queryClient.setQueryData(PLACES_KEY, (old: { otherLogins?: number } | undefined) => ({
        places: res.places,
        otherLogins: old?.otherLogins ?? 0,
      }));
    },
  });
}
// <<< M01 audit
