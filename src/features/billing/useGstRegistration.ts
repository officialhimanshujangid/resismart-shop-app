import { useQuery } from '@tanstack/react-query';

import { qk } from '../../lib/queryKeys';
import { settingsApi } from '../../api/settings.api';

/**
 * Whether the shop is registered under GST, per Business Settings — the same
 * query (`qk.businessSettings()`) `billing/new.tsx` already reads for its tax
 * preview, so the cache is shared rather than fetched twice.
 *
 * `undefined` while loading or on failure: callers pass it straight to
 * `documentTypeLabelKey`, which only renames a TAX_INVOICE to a bill of supply
 * on an explicit `false`.
 */
export function useIsGstRegistered(): boolean | undefined {
  const query = useQuery({
    queryKey: qk.businessSettings(),
    queryFn: settingsApi.business.get,
    staleTime: 5 * 60 * 1000,
  });
  return query.data?.isGstRegistered;
}
