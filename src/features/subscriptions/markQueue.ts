import { MAX_MARK_ENTRIES, MarkEntry, MarkStatus } from './types';

/**
 * The offline delivery-mark queue (the delivery boy's round) — PURE, so it is
 * tested directly. Persistence and the network live in `useMarkQueue.ts`. The
 * pattern is the stock count-by-scan queue (`features/stock/countQueue.ts`).
 *
 *  - Two kinds of op: `MARK` (one day's marks) and `ALL` ("All delivered" for a
 *    route on a day).
 *  - Marks for the same day are MERGED into the waiting MARK op of that day; the
 *    last mark for a customer wins (the server also keeps only the last one in a
 *    batch). Merging across an ALL op changes nothing: "All delivered" never
 *    overwrites a mark, and a later mark overwrites what it wrote — the day ends
 *    the same either way.
 *  - Oldest op first, ONE op on the wire at a time, at most 500 entries in it.
 *  - The op on the wire keeps its Idempotency-Key until the server answers: no
 *    answer → the same op, the same key, next time (the server replays instead
 *    of marking twice). New marks never join an op in flight — they queue behind.
 *  - A refusal that is about THAT op (the day is out of range, the month is
 *    billed, not a delivery day, a subscription gone) drops it and records it
 *    with the server's sentence; the next op goes on. Any other refusal (403 …)
 *    halts: the op goes back to the front of the queue, to be sent again later
 *    under a NEW key (the answer was a refusal, so nothing was stored for it).
 */

export type MarkOp =
  | { kind: 'MARK'; day: string; entries: MarkEntry[] }
  | { kind: 'ALL'; day: string; routeId: string };

export interface RefusedOp { op: MarkOp; code?: string; message: string }

export interface MarkQueueState {
  /** Oldest first. */
  pending: MarkOp[];
  /** The op on the wire (or waiting to be re-sent under the same key). */
  inFlight: { key: string; op: MarkOp } | null;
  /** Ops the server refused and that were dropped (newest last, ≤ 20 kept). */
  refused: RefusedOp[];
}

export const EMPTY_MARK_QUEUE: MarkQueueState = { pending: [], inFlight: null, refused: [] };

/** Refusals that are about the op itself: drop it, say so, carry on. */
export const DROP_CODES: ReadonlySet<string> = new Set([
  'DELIVERY_DAY_OUT_OF_RANGE', 'SUBSCRIPTION_PERIOD_BILLED', 'DELIVERY_NOT_SCHEDULED', 'SUBSCRIPTION_NOT_FOUND',
  'SUBSCRIPTION_ROUTE_NOT_FOUND',
]);

const MAX_REFUSED = 20;

/** A state read back from disk, made safe (garbage → empty). */
export function reviveQueue(raw: unknown): MarkQueueState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<MarkQueueState>;
  const isOp = (o: unknown): o is MarkOp => !!o && typeof o === 'object'
    && typeof (o as MarkOp).day === 'string'
    && (((o as MarkOp).kind === 'MARK' && Array.isArray((o as { entries?: unknown }).entries))
      || ((o as MarkOp).kind === 'ALL' && typeof (o as { routeId?: unknown }).routeId === 'string'));
  const inFlight = r.inFlight && typeof r.inFlight.key === 'string' && isOp(r.inFlight.op) ? r.inFlight : null;
  return {
    pending: Array.isArray(r.pending) ? r.pending.filter(isOp) : [],
    inFlight,
    refused: Array.isArray(r.refused) ? r.refused.filter((x) => x && isOp(x.op)).slice(-MAX_REFUSED) : [],
  };
}

/** Queue one mark for a day (merged into that day's waiting MARK op, last one wins). */
export function enqueueMark(state: MarkQueueState, day: string, entry: MarkEntry): MarkQueueState {
  const i = state.pending.findIndex((o) => o.kind === 'MARK' && o.day === day);
  if (i < 0) return { ...state, pending: [...state.pending, { kind: 'MARK', day, entries: [entry] }] };
  const op = state.pending[i] as Extract<MarkOp, { kind: 'MARK' }>;
  const j = op.entries.findIndex((e) => e.subscriptionId === entry.subscriptionId);
  const entries = j < 0 ? [...op.entries, entry] : op.entries.map((e, k) => (k === j ? entry : e));
  const pending = [...state.pending];
  pending[i] = { ...op, entries };
  return { ...state, pending };
}

/** Queue "All delivered" for a route on a day (once — a second tap adds nothing). */
export function enqueueAll(state: MarkQueueState, day: string, routeId: string): MarkQueueState {
  if (state.pending.some((o) => o.kind === 'ALL' && o.day === day && o.routeId === routeId)) return state;
  return { ...state, pending: [...state.pending, { kind: 'ALL', day, routeId }] };
}

/**
 * Take back a mark that has NOT left the phone (the row goes back to what the
 * server said). A mark already on the wire cannot be taken back — returns the
 * state unchanged; the caller then sends a new mark instead.
 */
export function unqueueMark(state: MarkQueueState, day: string, subscriptionId: string): MarkQueueState {
  let changed = false;
  const pending: MarkOp[] = [];
  for (const o of state.pending) {
    if (o.kind === 'MARK' && o.day === day && o.entries.some((e) => e.subscriptionId === subscriptionId)) {
      changed = true;
      const entries = o.entries.filter((e) => e.subscriptionId !== subscriptionId);
      if (entries.length) pending.push({ ...o, entries });
    } else pending.push(o);
  }
  return changed ? { ...state, pending } : state;
}

/** Move the oldest waiting op onto the wire under `key` (≤500 entries) — unless one is already there. */
export function takeOp(state: MarkQueueState, key: string): MarkQueueState {
  if (state.inFlight || state.pending.length === 0) return state;
  const [first, ...rest] = state.pending;
  if (first.kind === 'MARK' && first.entries.length > MAX_MARK_ENTRIES) {
    return {
      ...state,
      inFlight: { key, op: { ...first, entries: first.entries.slice(0, MAX_MARK_ENTRIES) } },
      pending: [{ ...first, entries: first.entries.slice(MAX_MARK_ENTRIES) }, ...rest],
    };
  }
  return { ...state, inFlight: { key, op: first }, pending: rest };
}

/** The server took the op on the wire. */
export function opDone(state: MarkQueueState): MarkQueueState {
  return { ...state, inFlight: null };
}

/**
 * The server refused the op on the wire. A DROP_CODES refusal drops it and
 * records it (`dropped: true`); anything else puts it back at the front of the
 * queue (`dropped: false`) — the caller halts.
 */
export function opRefused(
  state: MarkQueueState, code: string | undefined, message: string,
): { state: MarkQueueState; dropped: boolean } {
  const op = state.inFlight?.op;
  if (!op) return { state, dropped: false };
  if (code && DROP_CODES.has(code)) {
    return {
      state: { ...state, inFlight: null, refused: [...state.refused, { op, code, message }].slice(-MAX_REFUSED) },
      dropped: true,
    };
  }
  return { state: { ...state, inFlight: null, pending: [op, ...state.pending] }, dropped: false };
}

/** A refused entry as the server lists it, with the sentence already worded for the reader. */
export interface EntryRefusal { key?: string; index?: number; code?: string; message: string }

/**
 * The server answered the MARK op on the wire with some entries refused
 * (`refused[]`, per entry). The op is done: its other entries were saved. Each
 * refused entry is recorded (with its sentence) as its own refused op — only
 * those are dropped. Matched by `key` (the subscriptionId), else by `index`.
 * An empty list is simply `opDone`.
 */
export function opPartlyRefused(
  state: MarkQueueState, refusals: readonly EntryRefusal[],
): { state: MarkQueueState; dropped: RefusedOp[] } {
  const op = state.inFlight?.op;
  if (!op || op.kind !== 'MARK' || refusals.length === 0) return { state: opDone(state), dropped: [] };
  const dropped: RefusedOp[] = [];
  const seen = new Set<string>();
  for (const r of refusals) {
    const entry = (r.key ? op.entries.find((e) => e.subscriptionId === r.key) : undefined)
      ?? (typeof r.index === 'number' ? op.entries[r.index] : undefined);
    if (!entry || seen.has(entry.subscriptionId)) continue;
    seen.add(entry.subscriptionId);
    dropped.push({ op: { kind: 'MARK', day: op.day, entries: [entry] }, code: r.code, message: r.message });
  }
  return {
    state: { ...state, inFlight: null, refused: [...state.refused, ...dropped].slice(-MAX_REFUSED) },
    dropped,
  };
}

export function clearRefused(state: MarkQueueState): MarkQueueState {
  return state.refused.length ? { ...state, refused: [] } : state;
}

/** The request body of the op on the wire. */
export function opBody(op: MarkOp): { day: string; entries: MarkEntry[] } | { day: string; routeId: string } {
  return op.kind === 'MARK' ? { day: op.day, entries: op.entries } : { day: op.day, routeId: op.routeId };
}

/** Marks not yet confirmed by the server (in flight included; an ALL op counts 1). */
export function unsentCount(state: MarkQueueState): number {
  const n = (o: MarkOp) => (o.kind === 'MARK' ? o.entries.length : 1);
  return (state.inFlight ? n(state.inFlight.op) : 0) + state.pending.reduce((s, o) => s + n(o), 0);
}

export interface PendingMark {
  status: MarkStatus;
  qty?: { lineKey: string; qty: number }[];
  /** Still only on the phone (not on the wire): it can be taken back. */
  local: boolean;
}

/** What the phone holds for `day`, per subscription (the later mark wins). */
export function pendingMarksFor(state: MarkQueueState, day: string): Map<string, PendingMark> {
  const out = new Map<string, PendingMark>();
  const take = (op: MarkOp | undefined, local: boolean) => {
    if (!op || op.kind !== 'MARK' || op.day !== day) return;
    for (const e of op.entries) out.set(e.subscriptionId, { status: e.status, qty: e.qty, local });
  };
  take(state.inFlight?.op, false);
  for (const o of state.pending) take(o, true);
  return out;
}

/** Is "All delivered" waiting (or on the wire) for this route on this day? */
export function allPendingFor(state: MarkQueueState, day: string, routeId: string | undefined): boolean {
  if (!routeId) return false;
  const hit = (o: MarkOp | undefined) => !!o && o.kind === 'ALL' && o.day === day && o.routeId === routeId;
  return hit(state.inFlight?.op) || state.pending.some(hit);
}
