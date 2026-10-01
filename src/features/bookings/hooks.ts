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
 * The clock on one job: how far over it is running, and what is behind it.
 *
 * Fetched only when something is actually asking — the extend sheet, while it is
 * open. It is a real query per booking, and firing one for every row of a
 * timeline would cost a request per card for an answer most cards do not use.
 *
 * `staleTime: 0` and a refetch on mount, unlike everything else in this file:
 * the whole value of this read is that "you have eleven minutes left" is true at
 * the moment it is read. A cached minute count is a wrong minute count, and a
 * partner deciding whether to ask for twenty more is exactly the person who must
 * not be shown one.
 */
export function useBookingOverrun(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.bookings.overrun(id ?? ''),
    queryFn: () => bookingApi.overrun(id as string),
    enabled: enabled && Boolean(id),
    staleTime: 0,
    refetchOnMount: 'always',
  });
}

/**
 * Staff eligible for assignment (`GET /partners/me/staff/assignable`). Gated on
 * the same `BOOKINGS_MANAGE: FULL` the assign verb needs, so anybody shown the
 * Assign button can load this list. A refusal is still explained in one line
 * by the sheet rather than as an alert.
 */
export function useAssignableStaff(enabled: boolean) {
  return useQuery({
    queryKey: qk.staffAssignable(),
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
