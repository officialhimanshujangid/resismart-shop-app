import { useQuery } from '@tanstack/react-query';

import { qk } from '../../lib/queryKeys';
import { settingsApi } from '../../api/settings.api';

/**
 * Whether the shop's SALES carry GST (registered and not composition), per Business Settings — the same
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
  const s = query.data;
  if (!s) return undefined;
  /**
   * P1 (CONTRACT-partner-P1 §0.1, §4.1): a COMPOSITION partner may not collect
   * GST, so for every SALES label in the app it reads exactly like an
   * unregistered shop — its tax invoice is a bill of supply and no GST is shown.
   * (Issued documents also carry the server's own `printAs`, which wins.)
   */
  if (s.registrationType === 'COMPOSITION') return false;
  return s.isGstRegistered;
}
