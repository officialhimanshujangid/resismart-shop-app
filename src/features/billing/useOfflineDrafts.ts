import { useSyncExternalStore } from 'react';

import { draftStore } from './draftStore';
import { AddDraftInput, InvoiceDraft } from './types';

/**
 * The screen-facing handle onto `draftStore` — see that file for why the
 * actual state and sync loop are a module singleton and not local to this
 * hook. Every screen that mounts this gets the SAME drafts array and the SAME
 * "is a sync in flight" flag.
 *
 * READ-ONLY as far as the engine is concerned: this hook no longer starts it.
 * `draftStore.ensureInitialized()` used to live here, which meant the queue
 * only came to life if a billing screen was opened — a partner who queued a
 * bill offline, closed the app, came back on a good connection and spent the
 * morning in Orders had an unsynced invoice that was neither visible nor
 * sending. Startup now happens once per process in `app/(app)/_layout.tsx`,
 * beside the push and SSE wiring, so the queue is running for a partner who
 * never opens Billing at all.
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
  /** P1: after a confirmed duplicate supplier bill number. */
  confirmDuplicateAndRetry: (id: string) => Promise<InvoiceDraft | undefined>;
  /** P1: bill past a BLOCK credit limit (only offered when the role may). */
  overrideCreditAndRetry: (id: string) => Promise<InvoiceDraft | undefined>;
  syncPending: () => Promise<void>;
}

export function useOfflineDrafts(): UseOfflineDrafts {
  const state = useSyncExternalStore(draftStore.subscribe, draftStore.getSnapshot);

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
    confirmDuplicateAndRetry: draftStore.confirmDuplicateAndRetry,
    overrideCreditAndRetry: draftStore.overrideCreditAndRetry,
    syncPending: draftStore.syncPending,
  };
}
