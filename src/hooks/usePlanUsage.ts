import { useQuery } from '@tanstack/react-query';
import { partnerApi, PartnerUsageRow } from '../api/partner.api';
import { qk } from '../lib/queryKeys';

/**
 * "42 of 50 products", read BEFORE the create button is drawn.
 *
 * The rule this exists to enforce (PARTNERS_PLAN §12.9): never a 402 after the
 * form. A partner who fills in a product, photographs it, and is then told they
 * have run out of room has done all the work for nothing, and the message
 * arrives at the moment it is most annoying. The meter goes next to the button.
 */

export interface CapacityView {
  /** The plan does not sell this at all. Offer the upgrade, do not draw a meter. */
  included: boolean;
  used: number;
  /** `null` means unlimited. */
  limit: number | null;
  /** True when one more would be refused. Always false while the answer is loading. */
  atLimit: boolean;
  /** 0–1, or `null` when unlimited or not sold — a progress bar has nothing to show. */
  fraction: number | null;
  /** The model behind this capability is not built yet; say "coming soon", not "0 of 30". */
  comingSoon: boolean;
  /** The server's own noun, e.g. "products", "bookings this month". */
  noun: string;
}

const UNKNOWN: CapacityView = {
  included: false,
  used: 0,
  limit: 0,
  // NOT `true`. An unknown answer must not disable the create button — the
  // server is the boundary and will refuse if it has to, whereas a button
  // disabled by a failed meter blocks a partner who is well inside their plan
  // and gives them nothing to act on.
  atLimit: false,
  fraction: null,
  comingSoon: false,
  noun: '',
};

export function capacityOf(rows: PartnerUsageRow[] | undefined, key: string): CapacityView {
  const row = rows?.find((r) => r.key === key);
  if (!row) return UNKNOWN;

  const limit = row.limit;
  const unlimited = limit === null;
  return {
    included: row.included,
    used: row.used,
    limit,
    atLimit: row.included && !unlimited && typeof limit === 'number' && row.used >= limit,
    fraction: unlimited || !row.included || !limit ? null : Math.min(1, row.used / limit),
    comingSoon: Boolean(row.wiredIn),
    noun: row.noun,
  };
}

export function usePlanUsage() {
  const query = useQuery({
    queryKey: qk.usage(),
    queryFn: () => partnerApi.usage(),
    // One count per capability server-side, so this is the most expensive read
    // in the app. Two minutes is short enough that a meter next to a button is
    // never badly wrong and long enough that opening four screens is one call.
    staleTime: 120_000,
  });

  return {
    rows: query.data?.usage,
    planName: query.data?.planName,
    isFreeTier: query.data?.isFreeTier,
    loading: query.isPending,
    /** `capacity('max_products')` → what to draw next to the create button. */
    capacity: (key: string): CapacityView => capacityOf(query.data?.usage, key),
    refresh: query.refetch,
  };
}
