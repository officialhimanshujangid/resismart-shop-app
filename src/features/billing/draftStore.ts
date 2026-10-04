import { AppState, AppStateStatus } from 'react-native';
import axios from 'axios';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient } from '@tanstack/react-query';

import { apiErrorCode, apiErrorMessage, apiErrorParams, isUpgradeRequired } from '../../api/axios';
import { newIdempotencyKey } from '../../lib/idempotency';
import { qk } from '../../lib/queryKeys';
import { documentsApi } from './documents.api';
import { loadDrafts, saveDrafts } from './offlineDrafts';
import { AddDraftInput, InvoiceDraft } from './types';

/**
 * The offline-draft engine: ONE in-memory copy of the draft queue, ONE sync
 * loop, ONE `NetInfo`/`AppState` subscription, for the whole app process.
 *
 * WHY A MODULE SINGLETON AND NOT A PLAIN HOOK
 * --------------------------------------------
 * The billing tab, the New Invoice screen and the Drafts screen (three
 * separate routes this agent owns, none nested under a layout the others
 * share) can all be mounted at once — `app/(app)/_layout.tsx` is a `Stack`,
 * so navigating Billing → New Invoice keeps Billing mounted underneath. A
 * plain `useState`-based hook would give each mounted screen its OWN copy of
 * the draft list and its OWN "am I already syncing" flag. Two screens racing
 * to sync the same `PENDING` draft would both read `serverDraftId: undefined`
 * and both call `documentsApi.create` — which is exactly the duplicate-invoice
 * bug this whole feature exists to prevent, self-inflicted by the client
 * instead of the network. A module-level store read via `useSyncExternalStore`
 * (see `useOfflineDrafts.ts`) gives every screen the same array and the same
 * `syncing` flag, so only one sync attempt per draft is ever in flight no
 * matter how many billing screens are on the stack.
 */

let drafts: InvoiceDraft[] = [];
let loaded = false;
let online = true;
let syncing = false;
let initialized = false;
let sharedQueryClient: QueryClient | null = null;

/**
 * Per-draft re-entrancy guard. `syncing` (above) only stops two SWEEPS
 * (`syncPending`) overlapping; it says nothing about a sweep and an
 * explicit, user-triggered `retryDraft(id)` (the Drafts screen's "Retry"
 * button, or `New Invoice` syncing the draft it just created) landing on the
 * SAME draft at the same moment. Without this, that overlap calls
 * `documentsApi.create` twice for one draft — the client-inflicted duplicate
 * this whole file exists to rule out. Checked and set synchronously at the
 * top of `syncDraft`, so there is no `await` between the check and the claim.
 */
const inFlight = new Set<string>();

const listeners = new Set<() => void>();

/**
 * `useSyncExternalStore` requires `getSnapshot()` to return a STABLE
 * reference when nothing has changed — a fresh object literal on every call
 * reads as "changed" on every render and either warns or loops. So the
 * snapshot is a cached object, replaced only inside `emit()`, i.e. only when
 * something in the four fields it holds actually changed.
 */
let snapshot = { drafts, loaded, online, syncing };

function emit(): void {
  snapshot = { drafts, loaded, online, syncing };
  for (const listener of listeners) listener();
}

function setDrafts(next: InvoiceDraft[]): void {
  drafts = next;
  if (loaded) void saveDrafts(drafts);
  emit();
}

function patchDraft(id: string, patch: Partial<InvoiceDraft>): void {
  setDrafts(drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)));
}

/**
 * Reads the draft's current, merged state straight out of the module-level
 * array. Safe to call synchronously right after a `patchDraft` — unlike the
 * React-facing snapshot in `useOfflineDrafts`, `drafts` here is a plain
 * variable, not state behind a scheduled re-render, so there is no stale-
 * closure gap between "we just wrote it" and "we can read it back".
 */
function currentDraft(id: string, fallback: InvoiceDraft): InvoiceDraft {
  return drafts.find((d) => d.id === id) ?? fallback;
}

async function syncDraft(draft: InvoiceDraft): Promise<InvoiceDraft> {
  if (inFlight.has(draft.id)) return currentDraft(draft.id, draft);
  inFlight.add(draft.id);

  patchDraft(draft.id, { status: 'SYNCING', lastAttemptAt: new Date().toISOString() });

  try {
    let serverDraftId = draft.serverDraftId;
    if (!serverDraftId) {
      const created = await documentsApi.create(
        {
          type: draft.type,
          partyId: draft.partyId,
          partySnapshot: draft.partySnapshot,
          lines: draft.lines,
          notes: draft.notes,
          documentDate: draft.documentDate,
          dueDate: draft.dueDate,
          validUntil: draft.validUntil,
          goodsReturned: draft.goodsReturned,
          transportReason: draft.transportReason,
          transportReasonNote: draft.transportReasonNote,
          deliveryDate: draft.deliveryDate,
          // The draft's own source, not a hardcoded `MANUAL`. A bill started
          // from a job has to reach the server carrying that link, or
          // `POST /bookings/:id/invoice` can never find it and the job stays
          // uninvoiced forever. Falls back to MANUAL for a bill typed from
          // scratch, which is what it always was.
          sourceType: draft.sourceType ?? 'MANUAL',
          sourceId: draft.sourceId,
          // P1 purchase-bill fields: sent only when set, so a sales draft's body
          // is exactly what it was before P1.
          ...(draft.supplierInvoiceNo ? { supplierInvoiceNo: draft.supplierInvoiceNo } : {}),
          ...(draft.supplierInvoiceDate ? { supplierInvoiceDate: draft.supplierInvoiceDate } : {}),
          ...(draft.itcEligible !== undefined ? { itcEligible: draft.itcEligible } : {}),
          ...(draft.confirmDuplicateSupplierNo ? { confirmDuplicateSupplierNo: true } : {}),
          // P2 PHARMACY: only a Schedule H/H1 sale carries a prescription.
          ...(draft.rx ? { rx: draft.rx } : {}),
        },
        draft.idempotencyKey,
      );
      serverDraftId = created._id;
      // Written to disk NOW, before `issue` is attempted — see the file
      // header on the durability promise this makes and the one gap it does
      // not close.
      patchDraft(draft.id, { serverDraftId });
    }

    /**
     * DERIVED from the draft's own key, not minted here.
     *
     * `syncDraft` is the retry — it runs again on every reconnect, every
     * foreground and every "Retry" tap — so a `newIdempotencyKey()` on this line
     * would be a fresh key per attempt, which is the exact defeat
     * `src/lib/idempotency.ts` is written about. `draft.idempotencyKey` is
     * already persisted with the draft (`offlineDrafts.ts`), so deriving from it
     * gives a key that is stable across attempts AND across app launches, which
     * a `useRef` could not be — and this is the sync path that most often
     * resumes after the process was killed.
     *
     * The `-issue` suffix is load-bearing. The middleware refuses a key seen on
     * a different `route` with 422 (`idempotency.middleware.ts:168`), so the
     * create key cannot simply be sent again here.
     */
    /**
     * An override is a DIFFERENT request (its body names the override), so it
     * rides a different derived key: re-using `-issue` with a new body would be
     * refused as a key reused for another request.
     */
    const override = currentDraft(draft.id, draft).overrideCreditLimit === true;
    // MP1-COMPLETE — P2: the draft's own `refundTo` (fixed when it was queued), so every
    // retry sends the same body under the same derived key.
    const refundTo = currentDraft(draft.id, draft).refundTo;
    const { document, warnings } = await documentsApi.issue(
      serverDraftId,
      `${draft.idempotencyKey}-issue${override ? '-override' : ''}`,
      override || refundTo
        ? { ...(override ? { overrideCreditLimit: true } : {}), ...(refundTo ? { refundTo } : {}) }
        : undefined,
    );
    patchDraft(draft.id, {
      status: 'SYNCED',
      syncedDocumentId: document._id,
      syncedNumber: document.number,
      lastError: undefined,
      lastErrorCode: undefined,
      lastErrorParams: undefined,
      issueWarnings: warnings,
    });
    if (sharedQueryClient) {
      void sharedQueryClient.invalidateQueries({ queryKey: qk.billing.all() });
      void sharedQueryClient.invalidateQueries({ queryKey: qk.usage() });
      void sharedQueryClient.invalidateQueries({ queryKey: qk.today() });
    }
  } catch (e: unknown) {
    if (isUpgradeRequired(e)) {
      // >>> X2F — bills are no longer limited by any plan (one-factor plans,
      // 2026-10-04); the only plan refusal left is the catalogue-items limit
      // (`messageKey: CATALOG_ITEMS_LIMIT`). Keep its code + params so the text
      // is the coded en/hi sentence (`apiErrorMessage`), never the server's.
      patchDraft(draft.id, {
        status: 'BLOCKED_UPGRADE',
        lastError: apiErrorMessage(e),
        lastErrorCode: apiErrorCode(e),
        lastErrorParams: apiErrorParams(e),
      });
      // <<< X2F
      return currentDraft(draft.id, draft);
    }
    // No response at all — timeout, dropped mid-request, or still offline —
    // is not the server saying no. Left PENDING so the next reconnect retries
    // silently; a FAILED here would show a shop owner a red error for a bill
    // nobody has actually rejected.
    const isNetworkError = axios.isAxiosError(e) && !e.response;
    if (isNetworkError) {
      patchDraft(draft.id, { status: 'PENDING', lastError: undefined });
      return currentDraft(draft.id, draft);
    }
    patchDraft(draft.id, {
      status: 'FAILED',
      lastError: apiErrorMessage(e),
      // Kept so New Invoice can offer the one next step a code has (confirm a
      // duplicate supplier bill, override a credit limit) — P1 §4.4.
      lastErrorCode: apiErrorCode(e),
      lastErrorParams: apiErrorParams(e),
    });
    return currentDraft(draft.id, draft);
  } finally {
    inFlight.delete(draft.id);
  }
  return currentDraft(draft.id, draft);
}

async function syncPending(): Promise<void> {
  if (!online || syncing) return;
  syncing = true;
  emit();
  try {
    const pending = drafts.filter((d) => d.status === 'PENDING' || d.status === 'FAILED');
    for (const draft of pending) {
      // Sequential, not parallel: each `create` charges one unit of
      // `max_invoices_month`. Two of these firing at once, one unit under the
      // ceiling, could both read "still room" and both get created.
      // eslint-disable-next-line no-await-in-loop
      await syncDraft(draft);
    }
  } finally {
    syncing = false;
    emit();
  }
}

/**
 * Wires the singleton up exactly once per app process. Safe to call from
 * every mounted screen's `useEffect` — the flag makes every call after the
 * first a no-op, which is what lets three independent screens share one
 * engine with no coordination between them.
 */
function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;

  void loadDrafts().then((stored) => {
    drafts = stored;
    loaded = true;
    emit();
    void syncPending();
  });

  NetInfo.addEventListener((state) => {
    const reachable = state.isInternetReachable;
    const nowOnline = reachable === null ? state.isConnected !== false : reachable;
    const wasOffline = !online;
    online = nowOnline;
    emit();
    if (wasOffline && nowOnline) void syncPending();
  });

  // The OS suspends everything while backgrounded; a reconnect that happened
  // while the partner was in WhatsApp is only discovered on the way back in.
  AppState.addEventListener('change', (next: AppStateStatus) => {
    if (next === 'active') void syncPending();
  });
}

/** Set once, from the hook, so the sync loop can invalidate the same cache the screens read. */
function setQueryClient(client: QueryClient): void {
  sharedQueryClient = client;
}

async function addDraft(input: AddDraftInput): Promise<InvoiceDraft> {
  // Minted HERE — the moment the partner decided to bill this — and never
  // again for this draft. See `src/lib/idempotency.ts`.
  const idempotencyKey = newIdempotencyKey('inv');
  const draft: InvoiceDraft = {
    id: idempotencyKey,
    idempotencyKey,
    createdAt: new Date().toISOString(),
    type: input.type,
    partyId: input.partyId,
    partySnapshot: input.partySnapshot,
    lines: input.lines,
    notes: input.notes,
    documentDate: input.documentDate,
    dueDate: input.dueDate,
    validUntil: input.validUntil,
    goodsReturned: input.goodsReturned,
    transportReason: input.transportReason,
    transportReasonNote: input.transportReasonNote,
    deliveryDate: input.deliveryDate,
    // Carried onto the draft so it survives being queued offline: a bill raised
    // in a basement and synced an hour later must still come back attached to
    // the job it was raised for.
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    supplierInvoiceNo: input.supplierInvoiceNo,
    supplierInvoiceDate: input.supplierInvoiceDate,
    itcEligible: input.itcEligible,
    ...(input.rx ? { rx: input.rx } : {}),
    // MP1-COMPLETE — P2: only on a credit note / sales return the screen asked about.
    ...(input.refundTo ? { refundTo: input.refundTo } : {}),
    status: 'PENDING',
  };
  setDrafts([draft, ...drafts]);
  return draft;
}

/**
 * The partner confirmed "yes, it really is a different bill" after a 409
 * PURCHASE_BILL_DUPLICATE_SUPPLIER_NO. That refusal came from `create`, so no
 * server draft exists yet; the confirmed request has a different body and so
 * takes a FRESH create key (the old key's request was refused, not stored as a
 * success). `id` stays, so the Drafts screen keeps one row.
 */
async function confirmDuplicateAndRetry(id: string): Promise<InvoiceDraft | undefined> {
  const draft = drafts.find((d) => d.id === id);
  if (!draft) return undefined;
  patchDraft(id, {
    confirmDuplicateSupplierNo: true,
    idempotencyKey: draft.serverDraftId ? draft.idempotencyKey : newIdempotencyKey('inv'),
    status: 'PENDING',
  });
  return syncDraft(currentDraft(id, draft));
}

/** Re-issue past a BLOCK credit limit — offered only when the role may (`mayOverrideCredit`). */
async function overrideCreditAndRetry(id: string): Promise<InvoiceDraft | undefined> {
  const draft = drafts.find((d) => d.id === id);
  if (!draft) return undefined;
  patchDraft(id, { overrideCreditLimit: true, status: 'PENDING' });
  return syncDraft(currentDraft(id, draft));
}

async function discardDraft(id: string): Promise<void> {
  setDrafts(drafts.filter((d) => d.id !== id));
}

async function retryDraft(id: string): Promise<InvoiceDraft | undefined> {
  const draft = drafts.find((d) => d.id === id);
  if (!draft) return undefined;
  return syncDraft(draft);
}

export const draftStore = {
  ensureInitialized,
  setQueryClient,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => snapshot,
  addDraft,
  discardDraft,
  retryDraft,
  confirmDuplicateAndRetry,
  overrideCreditAndRetry,
  syncPending,
};
