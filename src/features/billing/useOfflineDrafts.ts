import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { draftStore } from './draftStore';
import { AddDraftInput, InvoiceDraft } from './types';

/**
 * The screen-facing handle onto `draftStore` — see that file for why the
 * actual state and sync loop are a module singleton and not local to this
 * hook. Every billing screen that mounts this gets the SAME drafts array and
 * the SAME "is a sync in flight" flag.
 */
export interface UseOfflineDrafts {
  drafts: InvoiceDraft[];
  loaded: boolean;
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  addDraft: (input: AddDraftInput) => Promise<InvoiceDraft>;
  discardDraft: (id: string) => Promise<void>;
  retryDraft: (id: string) => Promise<InvoiceDraft | undefined>;
  syncPending: () => Promise<void>;
}

export function useOfflineDrafts(): UseOfflineDrafts {
  const queryClient = useQueryClient();
  const state = useSyncExternalStore(draftStore.subscribe, draftStore.getSnapshot);

  useEffect(() => {
    // Idempotent — see `ensureInitialized`. Whichever billing screen mounts
    // first is the one that actually starts the engine; every screen after
    // that just attaches to it.
    draftStore.setQueryClient(queryClient);
    draftStore.ensureInitialized();
  }, [queryClient]);

  const pendingCount = state.drafts.filter((d) => d.status !== 'SYNCED').length;

  return {
    drafts: state.drafts,
    loaded: state.loaded,
    online: state.online,
    syncing: state.syncing,
    pendingCount,
    addDraft: draftStore.addDraft,
    discardDraft: draftStore.discardDraft,
    retryDraft: draftStore.retryDraft,
    syncPending: draftStore.syncPending,
  };
}
