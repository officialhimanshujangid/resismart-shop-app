import { API_BASE_URL, STORAGE_KEYS } from '../constants/app';
import { storage } from '../utils/storage';

/**
 * A minimal Server-Sent Events client for React Native.
 *
 * React Native has no `EventSource`, and the browser one would be no use if it
 * did: `GET /notifications/stream` runs behind `authenticateJWT`, so the
 * connection has to carry an `Authorization` header, and the WHATWG EventSource
 * cannot set one. Putting the token in the query string instead is the usual
 * workaround and is not acceptable here — it would land in every proxy and
 * server access log.
 *
 * So this reads the stream off `XMLHttpRequest`, which React Native's networking
 * does implement and which exposes the body incrementally: at `readyState === 3`
 * the bytes received so far are in `responseText`, and the only work is to slice
 * off what has already been parsed. That is why there is no dependency here —
 * the whole client is the sixty lines below, and it can be deleted the day the
 * platform grows a real one.
 *
 * What it deliberately does NOT do: reorder, replay or de-duplicate. An SSE
 * frame is a hint that something changed, and every consumer reacts by
 * invalidating a react-query key and refetching from the API — the authority is
 * always the request, never the frame. A dropped frame therefore costs a stale
 * screen until the next refetch, not a wrong one.
 */

export interface SseEvent {
  /** The `event:` field. `message` when the server sent none. */
  event: string;
  /** The `data:` field, parsed if it was JSON, otherwise the raw string. */
  data: unknown;
}

export interface SseOptions {
  onEvent: (event: SseEvent) => void;
  /** Fired when the stream opens, so a screen can drop its "reconnecting" badge. */
  onOpen?: () => void;
  /**
   * The stream answered 401. The caller is expected to refresh the session (any
   * request through `apiClient` does it) and the stream reconnects afterwards
   * with whatever token is in SecureStore by then.
   */
  onUnauthorized?: () => void;
}

/** The server sends `retry: 5000`; this backs off from there rather than hammering. */
const BASE_RETRY_MS = 5_000;
const MAX_RETRY_MS = 60_000;

/**
 * XHR keeps the ENTIRE response body in `responseText` for the life of the
 * request, and this one never ends — a 25-second heartbeat is small, but over a
 * device left open for days it is unbounded growth for no reason. Recycling the
 * connection on a timer bounds it, and costs one reconnect an hour.
 */
const RECYCLE_MS = 30 * 60 * 1000;

const READY_STATE_LOADING = 3;
const READY_STATE_DONE = 4;

export interface SseConnection {
  close: () => void;
}

export function openEventStream(options: SseOptions): SseConnection {
  let xhr: XMLHttpRequest | null = null;
  let closed = false;
  let attempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let recycleTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (recycleTimer) { clearTimeout(recycleTimer); recycleTimer = null; }
  };

  const scheduleReconnect = () => {
    if (closed) return;
    attempt += 1;
    const delay = Math.min(BASE_RETRY_MS * 2 ** (attempt - 1), MAX_RETRY_MS);
    reconnectTimer = setTimeout(() => { void connect(); }, delay);
  };

  async function connect(): Promise<void> {
    if (closed) return;
    clearTimers();

    const token = await storage.get(STORAGE_KEYS.ACCESS_TOKEN);
    if (closed) return;
    if (!token) {
      // No session — there is nothing to subscribe to. Retried rather than
      // abandoned because this also happens for a moment during a token refresh.
      scheduleReconnect();
      return;
    }

    const request = new XMLHttpRequest();
    xhr = request;
    // How much of `responseText` has already been turned into events.
    let consumed = 0;
    let opened = false;

    request.open('GET', `${API_BASE_URL}/notifications/stream`);
    request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.setRequestHeader('Accept', 'text/event-stream');
    // Some proxies will happily gzip an event stream and then buffer it; the
    // server sets identity encoding for the same reason.
    request.setRequestHeader('Cache-Control', 'no-cache');

    request.onreadystatechange = () => {
      if (closed || request !== xhr) return;

      if (request.readyState === READY_STATE_LOADING || request.readyState === READY_STATE_DONE) {
        if (request.status === 401) {
          options.onUnauthorized?.();
          return; // the DONE branch below schedules the reconnect
        }
        if (!opened && request.status === 200) {
          opened = true;
          attempt = 0; // a successful open resets the backoff
          options.onOpen?.();
          recycleTimer = setTimeout(() => { void connect(); }, RECYCLE_MS);
        }

        const text = request.responseText ?? '';
        // Frames are separated by a blank line. Anything after the last blank
        // line is a partial frame still arriving and must stay in the buffer —
        // parsing it now would deliver half a JSON payload.
        const boundary = text.lastIndexOf('\n\n');
        if (boundary >= consumed) {
          const chunk = text.slice(consumed, boundary);
          consumed = boundary + 2;
          for (const frame of chunk.split('\n\n')) {
            const parsed = parseFrame(frame);
            if (parsed) options.onEvent(parsed);
          }
        }
      }

      if (request.readyState === READY_STATE_DONE) {
        scheduleReconnect();
      }
    };

    request.onerror = () => {
      if (closed || request !== xhr) return;
      scheduleReconnect();
    };

    request.send();
  }

  void connect();

  return {
    close() {
      closed = true;
      clearTimers();
      try { xhr?.abort(); } catch { /* already gone */ }
      xhr = null;
    },
  };
}

/**
 * One SSE frame → an event.
 *
 * Returns `null` for a comment-only frame, which is what the 25-second
 * heartbeat (`: ping`) is: delivering it as an event would make every consumer
 * refetch four times an hour for nothing.
 */
function parseFrame(frame: string): SseEvent | null {
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const sep = line.indexOf(':');
    const field = sep < 0 ? line : line.slice(0, sep);
    // The spec strips ONE leading space after the colon, and the server writes
    // `data: {...}` with that space — not stripping it makes every payload fail
    // to parse by exactly one character.
    const value = sep < 0 ? '' : line.slice(sep + 1).replace(/^ /, '');
    if (field === 'event') event = value;
    else if (field === 'data') dataLines.push(value);
  }

  if (!dataLines.length) return null;
  const raw = dataLines.join('\n');
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
}
