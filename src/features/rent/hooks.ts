import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { qk } from '../../lib/queryKeys';
import { rentApi } from './api';
import type { RentListStatus, RentPaidBody } from './types';

/**
 * The rent list (`GET /partners/me/society-rent`). Today, More and the rent
 * screen share the `OPEN` entry. `enabled` is the permission answer: a person
 * who may not look is never sent to a 403. Any failure means "no rent as far as
 * the UI knows" for the card and the row — nothing is guessed.
 */
export function useMyRent(enabled: boolean, status: RentListStatus = 'OPEN') {
  return useQuery({
    queryKey: qk.rent.list(status),
    queryFn: () => rentApi.list({ status, pageSize: 50 }),
    enabled,
    staleTime: 60_000,
  });
}

export function useRentBill(id: string | undefined) {
  return useQuery({
    queryKey: qk.rent.detail(id ?? ''),
    queryFn: () => rentApi.detail(id!),
    enabled: !!id,
  });
}

export function useIHavePaid(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (v: { body: RentPaidBody; key: string }) => rentApi.iHavePaid(id, v.body, v.key),
    // A 409 RENT_NOTHING_DUE means the office already recorded it: refresh either way.
    onSettled: () => { void client.invalidateQueries({ queryKey: qk.rent.all() }); },
  });
}
