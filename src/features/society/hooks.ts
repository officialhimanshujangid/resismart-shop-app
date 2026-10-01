import { useQuery } from '@tanstack/react-query';

import { qk } from '../../lib/queryKeys';
import { reachApi } from './api';

/**
 * The business's reach, origin and home society (`GET /partners/me/reach`).
 *
 * Read by Today (banner), More and Settings (the row only a SOCIETY partner
 * sees), Promotion (boost refused while SOCIETY_ONLY) and the reach screen —
 * one cache entry for all of them. A server without the route (404) or any
 * failure simply means "not a society partner as far as the UI knows": no
 * banner, no row. Nothing is guessed from other fields.
 */
export function useMyReach(enabled = true) {
  return useQuery({
    queryKey: qk.partner.reach(),
    queryFn: reachApi.get,
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}
