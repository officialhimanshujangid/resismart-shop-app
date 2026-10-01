import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

import { store } from '../../lib/store';
import { newIdempotencyKey } from '../../lib/idempotency';
import { apiErrorCode, apiErrorMessage } from '../../api/axios';
import i18n from '../../i18n';
import { useIsOnline } from '../../hooks/useIsOnline';
import { subscriptionsApi } from './api';
import type { MarkEntry, MarkRefusal } from './types';
import {
  EMPTY_MARK_QUEUE, EntryRefusal, MarkOp, MarkQueueState, clearRefused, enqueueAll, enqueueMark, opBody, opDone, opPartlyRefused,
  opRefused, reviveQueue, takeOp, unqueueMark, unsentCount,
} from './markQueue';

/** The old single-queue key — still used when the business is not known yet. */
export const MARK_QUEUE_KEY = 'resismart.submarks.queue';

/** One queue per business, so marks made for one shop can never be sent to another. */
export const markQueueKey = (partnerId?: string | null) => (partnerId ? `${MARK_QUEUE_KEY}.${partnerId}` : MARK_QUEUE_KEY);

/** A refused entry in the reader's words: our `errors.<code>` sentence with its params, else the server's. */
export function refusalText(r: Pick<MarkRefusal, 'code' | 'message' | 'params'>): string {
  const k = `errors.${r.code}`;
  return r.code && i18n.exists(k) ? String(i18n.t(k, r.params ?? {})) : (r.message || String(i18n.t('common.somethingWentWrong')));
}

const toEntryRefusals = (list: readonly MarkRefusal[]): EntryRefusal[] =>
  list.map((r) => ({ key: r.key, index: r.index, code: r.code, message: refusalText(r) }));

/** The per-entry list a refusal may carry (`data.refused` on the all-refused 409). */
function refusedIn(e: unknown): MarkRefusal[] | null {
  if (!axios.isAxiosError(e)) return null;
  const list = (e.response?.data as { data?: { refused?: unknown } } | undefined)?.data?.refused;
  return Array.isArray(list) && list.length ? (list as MarkRefusal[]) : null;
}

/**
 * The delivery-mark queue, on disk and on the wire (rules in `markQueue.ts`).
 * Every mark is written to AsyncStorage before it is sent, so a killed app or a
 * lane with no signal loses nothing; ops are flushed whenever the phone is
 * online, oldest first, one at a time.
 */
export function useMarkQueue(partnerId: string | null | undefined, onSent?: (op?: MarkOp) => void) {
  const storageKey = markQueueKey(partnerId);
  const keyRef = useRef(storageKey);
  const prevKey = useRef<string | null>(null);
  const online = useIsOnline();
  const [state, setState] = useState<MarkQueueState>(EMPTY_MARK_QUEUE);
  const [loaded, setLoaded] = useState(false);
  const [flushing, setFlushing] = useState(false);
  /** A hard refusal (403 …): the marks stay on the phone; sending waits for a new mark or "Send now". */
  const [error, setError] = useState<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const busy = useRef(false);
  const halted = useRef(false);
  const onSentRef = useRef(onSent);
  onSentRef.current = onSent;

  useEffect(() => {
    let alive = true;
    // Marks made before the business was known (fallback key) or before the disk
    // answered are carried into this queue; a switch to ANOTHER business starts empty.
    const carry = prevKey.current === null || prevKey.current === MARK_QUEUE_KEY;
    prevKey.current = storageKey;
    keyRef.current = storageKey;
    setLoaded(false);
    if (!carry) { stateRef.current = EMPTY_MARK_QUEUE; setState(EMPTY_MARK_QUEUE); }
    void store.getJson<unknown>(storageKey).then((saved) => {
      if (!alive) return;
      const now = stateRef.current;
      if (saved || now.pending.length || now.refused.length) {
        const disk = reviveQueue(saved);
        const merged: MarkQueueState = {
          inFlight: disk.inFlight,
          pending: [...disk.pending, ...now.pending],
          refused: [...disk.refused, ...now.refused],
        };
        stateRef.current = merged;
        setState(merged);
        void store.setJson(storageKey, merged);
      }
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [storageKey]);

  const commit = useCallback((next: MarkQueueState) => {
    stateRef.current = next;
    setState(next);
    void store.setJson(keyRef.current, next);
  }, []);

  const flush = useCallback(async () => {
    if (busy.current || !loaded) return;
    busy.current = true;
    setFlushing(true);
    try {
      for (let guard = 0; guard < 100; guard += 1) {
        const s = takeOp(stateRef.current, newIdempotencyKey('submark'));
        if (!s.inFlight) break;
        if (s !== stateRef.current) commit(s);
        const { op, key } = s.inFlight;
        try {
          const body = opBody(op);
          if (op.kind === 'MARK') {
            const res = await subscriptionsApi.mark(op.day, (body as { entries: MarkEntry[] }).entries, key);
            // Per-entry answer: the good entries are saved, only the refused ones are dropped.
            // An older server's {saved} has no list — the whole op is done.
            const refused = Array.isArray(res?.refused) ? res.refused : [];
            const r = opPartlyRefused(stateRef.current, toEntryRefusals(refused));
            commit(r.state);
            // Tell the screen only what was saved (a refused home must not show as delivered).
            const gone = new Set(r.dropped.flatMap((d) => (d.op.kind === 'MARK' ? d.op.entries.map((e) => e.subscriptionId) : [])));
            onSentRef.current?.({ ...op, entries: op.entries.filter((e) => !gone.has(e.subscriptionId)) });
          } else {
            await subscriptionsApi.markAll(op.day, op.routeId, key);
            commit(opDone(stateRef.current));
            onSentRef.current?.(op);
          }
          setError(null);
        } catch (e) {
          // No answer, or the first send still running on the server: keep the op
          // AND its key for the next try.
          if ((axios.isAxiosError(e) && !e.response) || apiErrorCode(e) === 'IDEMPOTENCY_IN_PROGRESS') break;
          const perEntry = op.kind === 'MARK' ? refusedIn(e) : null;
          if (perEntry) {
            // Every entry was refused, each with its own reason.
            commit(opPartlyRefused(stateRef.current, toEntryRefusals(perEntry)).state);
            onSentRef.current?.();
            continue;
          }
          const { state: next, dropped } = opRefused(stateRef.current, apiErrorCode(e), apiErrorMessage(e));
          commit(next);
          if (dropped) { onSentRef.current?.(); continue; }
          halted.current = true;
          setError(apiErrorMessage(e));
          break;
        }
      }
    } finally {
      busy.current = false;
      setFlushing(false);
    }
  }, [commit, loaded]);

  const mark = useCallback((day: string, entry: MarkEntry) => {
    halted.current = false;
    commit(enqueueMark(stateRef.current, day, entry));
  }, [commit]);

  const unmark = useCallback((day: string, subscriptionId: string) => {
    commit(unqueueMark(stateRef.current, day, subscriptionId));
  }, [commit]);

  const markAll = useCallback((day: string, routeId: string) => {
    halted.current = false;
    commit(enqueueAll(stateRef.current, day, routeId));
  }, [commit]);

  // Send whenever there is something to send and a network to send it on.
  useEffect(() => {
    if (online && loaded && !halted.current && (state.pending.length || state.inFlight)) void flush();
  }, [online, loaded, state.pending.length, state.inFlight, flush]);

  return {
    state,
    loaded,
    online,
    flushing,
    error,
    unsent: unsentCount(state),
    refused: state.refused,
    mark,
    unmark,
    markAll,
    sendNow: () => { halted.current = false; setError(null); return flush(); },
    clearRefused: () => commit(clearRefused(stateRef.current)),
  };
}
