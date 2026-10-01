import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { usePartnerEntitlements } from '../../hooks';
import { categoryModulesApi, p2Keys } from './api';
import { MODULE_SETTINGS_DEFAULTS, ModuleSettings, P2Module, categoryModulesOf } from './modules';

/**
 * "Does this business use pharmacy / subscriptions / appointments / jobs?"
 *
 * Read off the SAME entitlements answer every gate in this app reads (no extra
 * request), and read defensively: an entitlements payload without
 * `categoryModules` — an old server, a test double — means none, which is the
 * HARD RULE's direction (§0.1): nothing new appears for a business that never
 * opted in.
 */
export function useCategoryModules() {
  const ent = usePartnerEntitlements();
  const ready = ent.ready === true;
  const list = useMemo(() => (ready ? categoryModulesOf(ent.entitlements) : []), [ready, ent.entitlements]);
  const has = useCallback((m: P2Module) => list.includes(m), [list]);
  return { ready, modules: list, has };
}

/**
 * The module settings (near-expiry days, which schedules need a prescription,
 * the pause cutoff…). `GET /category-modules` needs SETTINGS READ; a person
 * without it (a counter clerk) gets the defaults, which is what the server holds
 * for every business that never changed them. The server decides again anyway.
 */
export function useModuleSettings(enabled = true): { settings: ModuleSettings; loading: boolean } {
  const { can, ready } = usePartnerEntitlements();
  const mayRead = ready && can('SETTINGS', 'READ');
  const q = useQuery({
    queryKey: p2Keys.modules(),
    queryFn: categoryModulesApi.get,
    enabled: enabled && mayRead,
    staleTime: 60_000,
  });
  return { settings: q.data?.settings ?? MODULE_SETTINGS_DEFAULTS, loading: enabled && mayRead && q.isPending };
}
