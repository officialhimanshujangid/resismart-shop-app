import type { CountEntry } from './api';

/**
 * The offline scan queue for count-by-scan (screen S11) — PURE, so it is
 * tested directly. Persistence and the network live in `useCountQueue.ts`.
 *
 * Every scan is ADD mode, one unit (`countedQty: 1, mode: 'ADD'`): two scans of
 * the same tin are two units. Scans of the same product (or the same unknown
 * barcode) are merged into one ADD entry while they wait, so a basement with no
 * signal still sends one line per product when the network comes back.
 *
 * A batch that has been SENT keeps its idempotency key until the server has
 * answered: resending it after a dropped connection is the same request, and
 * the server replays the stored answer instead of counting twice. New scans
 * never join a batch that is in flight — they queue behind it.
 */

export interface QueuedScan {
  productId?: string;
  barcode?: string;
  /** What the partner saw (product name or the raw code) — for the list and for dropping a refused one. */
  label: string;
  qty: number;
}

export interface CountQueueState {
  pending: QueuedScan[];
  /** The batch on the wire (or waiting to be re-sent under the same key). */
  inFlight: { key: string; scans: QueuedScan[] } | null;
}

export const EMPTY_QUEUE: CountQueueState = { pending: [], inFlight: null };
export const MAX_BATCH = 200;

const sameThing = (a: QueuedScan, b: QueuedScan) =>
  (a.productId && b.productId ? a.productId === b.productId : false)
  || (!a.productId && !b.productId && !!a.barcode && a.barcode === b.barcode);

/** Add `qty` units of one scanned thing (merged with a waiting scan of the same thing). */
export function enqueueScan(state: CountQueueState, scan: QueuedScan): CountQueueState {
  const i = state.pending.findIndex((p) => sameThing(p, scan));
  if (i < 0) return { ...state, pending: [...state.pending, scan] };
  const pending = [...state.pending];
  pending[i] = { ...pending[i], qty: pending[i].qty + scan.qty };
  return { ...state, pending };
}

/** Move up to 200 waiting scans into a batch under `key` — unless one is already in flight. */
export function takeBatch(state: CountQueueState, key: string): CountQueueState {
  if (state.inFlight || state.pending.length === 0) return state;
  return {
    pending: state.pending.slice(MAX_BATCH),
    inFlight: { key, scans: state.pending.slice(0, MAX_BATCH) },
  };
}

/** The request body for the batch in flight. */
export function batchEntries(state: CountQueueState): CountEntry[] {
  return (state.inFlight?.scans ?? []).map((s) =>
    (s.productId
      ? { productId: s.productId, countedQty: s.qty, mode: 'ADD' as const }
      : { barcode: s.barcode, countedQty: s.qty, mode: 'ADD' as const }));
}

/** The server took the batch. */
export function batchDone(state: CountQueueState): CountQueueState {
  return { ...state, inFlight: null };
}

/**
 * The server refused ONE thing in the batch (404 STOCK_COUNT_BARCODE_UNKNOWN
 * {barcode} or STOCK_COUNT_PRODUCT_NOT_IN_SCOPE {productName}). That scan is
 * dropped and the rest go back to the front of the queue to be re-sent under a
 * NEW key (it is a different request now). Returns what was dropped.
 */
export function dropRefused(
  state: CountQueueState,
  code: string | undefined,
  params: Record<string, unknown> | undefined,
): { state: CountQueueState; dropped: QueuedScan[] } {
  const scans = state.inFlight?.scans ?? [];
  let isRefused: (s: QueuedScan) => boolean = () => false;
  if (code === 'STOCK_COUNT_BARCODE_UNKNOWN' && params?.barcode !== undefined) {
    const code0 = String(params.barcode);
    isRefused = (s) => !s.productId && s.barcode === code0;
  } else if (code === 'STOCK_COUNT_PRODUCT_NOT_IN_SCOPE' && params?.productName !== undefined) {
    const name = String(params.productName);
    isRefused = (s) => s.label === name;
  }
  const dropped = scans.filter(isRefused);
  const kept = scans.filter((s) => !isRefused(s));
  return { state: { pending: [...kept, ...state.pending], inFlight: null }, dropped };
}

/** Units waiting to reach the server (in flight included). */
export function unsentUnits(state: CountQueueState): number {
  return [...(state.inFlight?.scans ?? []), ...state.pending].reduce((s, x) => s + x.qty, 0);
}
