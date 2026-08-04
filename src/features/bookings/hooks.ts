import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bookingApi, bookingVerbCall, listAssignableStaff } from './booking.api';
import { BookingVerb, PartnerBookingListFilters } from './booking.types';
import { qk } from '../../../src/lib/queryKeys';
import { apiErrorMessage } from '../../../src/api/axios';

/**
 * The partner's booking list, paginated by the server.
 *
 * Keyed through `qk.bookings.list(filters)` so two screens asking for different
 * filters (Today's "just today", the Bookings tab's status tabs) get separate
 * cache entries rather than one screen's page silently overwriting the other's.
 * `useLiveEvents` invalidates `qk.bookings.all()` on any booking SSE frame, which
 * covers every filtered variant because react-query matches by key PREFIX.
 */
export function useBookingsList(filters: PartnerBookingListFilters) {
  return useQuery({
    queryKey: qk.bookings.list(filters as Record<string, string | number | undefined>),
    queryFn: () => bookingApi.list(filters),
    staleTime: 15_000,
  });
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: qk.bookings.detail(id ?? ''),
    queryFn: () => bookingApi.get(id as string),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

/**
 * Staff eligible for assignment. A 403 here means this viewer's role does not
 * hold `STAFF READ` — a real, unremarkable case for somebody who only manages
 * bookings — so it fails to an EMPTY list rather than surfacing a scary error;
 * the assign sheet reads `staffUnavailable` and explains it in one line instead.
 */
export function useAssignableStaff(enabled: boolean) {
  return useQuery({
    queryKey: qk.staff(),
    queryFn: listAssignableStaff,
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * One mutation for every verb in `BookingVerb`, dispatched through
 * `bookingVerbCall` — see that file for why a lookup rather than a switch.
 *
 * Every success invalidates `qk.bookings.all()` (every filtered list, every
 * detail — a booking that moved status belongs in a different tab of the
 * Bookings screen a second later, not after a manual pull) and `qk.today()`
 * (the Today timeline and its sale total read the same rows).
 */
export function useBookingAction() {
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (args: { id: string; verb: BookingVerb; body?: Record<string, unknown> }) => {
      setPendingId(args.id);
      return bookingVerbCall[args.verb](args.id, args.body ?? {});
    },
    onSettled: () => {
      setPendingId(null);
      void queryClient.invalidateQueries({ queryKey: qk.bookings.all() });
      void queryClient.invalidateQueries({ queryKey: qk.today() });
    },
  });

  const act = useCallback(
    (id: string, verb: BookingVerb, body?: Record<string, unknown>) =>
      mutation.mutateAsync({ id, verb, body }),
    [mutation],
  );

  return {
    act,
    /** The one booking currently mid-request, so a list can disable just that row. */
    pendingId,
    isPending: mutation.isPending,
    error: mutation.error ? apiErrorMessage(mutation.error) : null,
  };
}
