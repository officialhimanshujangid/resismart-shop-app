import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';

import { store } from '../../lib/store';
import { newIdempotencyKey } from '../../lib/idempotency';
import { apiErrorCode, apiErrorMessage, apiErrorParams } from '../../api/axios';
import { useIsOnline } from '../../hooks/useIsOnline';
import { stockApi } from './api';
import {
  CountQueueState, EMPTY_QUEUE, QueuedScan, batchDone, batchEntries, dropRefused, enqueueScan, takeBatch, unsentUnits,
} from './countQueue';

const keyFor = (countId: string) => `resismart.stockcount.queue.${countId}`;

/**
 * The count-by-scan queue, on disk and on the wire (see `countQueue.ts` for the
 * rules). Scans are written to AsyncStorage before they are sent, so a killed
 * app or a dead basement loses nothing; they are flushed whenever the phone is
 * online, one batch (≤200) at a time, oldest first.
 */
export function useCountQueue(countId: string, onFlushed?: (countedLineCount: number) => void) {
  const online = useIsOnline();
  const [state, setState] = useState<CountQueueState>(EMPTY_QUEUE);
  const [loaded, setLoaded] = useState(false);
  const [flushing, setFlushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dropped, setDropped] = useState<QueuedScan[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  const busy = useRef(false);
  /** Set by a hard refusal; auto-send waits for a new scan or a Retry tap. */
  const halted = useRef(false);
  const onFlushedRef = useRef(onFlushed);
  onFlushedRef.current = onFlushed;

  useEffect(() => {
    let alive = true;
    void store.getJson<CountQueueState>(keyFor(countId)).then((saved) => {
      if (!alive) return;
      if (saved && Array.isArray(saved.pending)) setState(saved);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [countId]);

  const commit = useCallback((next: CountQueueState) => {
    stateRef.current = next;
    setState(next);
    void store.setJson(keyFor(countId), next);
  }, [countId]);

  const flush = useCallback(async () => {
    if (busy.current || !loaded) return;
    busy.current = true;
    setFlushing(true);
    try {
      for (let guard = 0; guard < 50; guard += 1) {
        let s = takeBatch(stateRef.current, newIdempotencyKey('count'));
        if (!s.inFlight) break;
        commit(s);
        try {
          const res = await stockApi.putEntries(countId, batchEntries(s), s.inFlight!.key);
          s = batchDone(stateRef.current);
          commit(s);
          setError(null);
          onFlushedRef.current?.(res.countedLineCount);
        } catch (e) {
          if (axios.isAxiosError(e) && !e.response) {
            // No answer — keep the batch AND its key for the next try.
            break;
          }
          const code = apiErrorCode(e);
          const { state: next, dropped: gone } = dropRefused(stateRef.current, code, apiErrorParams(e));
          if (gone.length) {
            commit(next);
            setDropped((d) => [...d, ...gone]);
            setError(apiErrorMessage(e));
            continue;
          }
          // Any other refusal (count no longer counting, no permission): stop
          // and say so; the scans stay on the phone.
          commit({ ...stateRef.current, pending: [...(stateRef.current.inFlight?.scans ?? []), ...stateRef.current.pending], inFlight: null });
          halted.current = true;
          setError(apiErrorMessage(e));
          break;
        }
      }
    } finally {
      busy.current = false;
      setFlushing(false);
    }
  }, [commit, countId, loaded]);

  const add = useCallback((scan: QueuedScan) => {
    halted.current = false;
    commit(enqueueScan(stateRef.current, scan));
  }, [commit]);

  // Send whenever there is something to send and a network to send it on.
  useEffect(() => {
    if (online && loaded && !halted.current && (state.pending.length || state.inFlight)) void flush();
  }, [online, loaded, state.pending.length, state.inFlight, flush]);

  return {
    add,
    flush: () => { halted.current = false; return flush(); },
    unsent: unsentUnits(state),
    pending: state.pending,
    flushing,
    error,
    dropped,
    clearDropped: () => setDropped([]),
    online,
  };
}
