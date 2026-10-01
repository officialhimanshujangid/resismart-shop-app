/**
 * A routed stand-in for the one axios instance (`apiClient` in `src/api/axios`).
 * Copied from mobile-guard's harness.
 *
 * A test declares what the server answers with `setRoutes`; every request is
 * recorded in `calls` (with its `params`) so a test can assert on what the
 * screen SENT. A GET nobody declared answers
 * `undefined` — the "empty server" case every screen must survive. A write
 * nobody declared answers `{}`.
 */
export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Call = { method: Method; url: string; body?: unknown; params?: unknown };
type Answer = unknown | ((call: Call) => unknown);

let routes: [Method, string | RegExp, Answer][] = [];
export const calls: Call[] = [];

/** `{ 'GET /finance/resident/statement': {...}, 'POST /finance/society/meter-readings': {...} }`. */
export function setRoutes(table: Record<string, Answer>, regex: [Method, RegExp, Answer][] = []): void {
  routes = [
    ...Object.entries(table).map(([k, v]) => {
      const [m, ...rest] = k.split(' ');
      return [m as Method, rest.join(' '), v] as [Method, string, Answer];
    }),
    ...regex,
  ];
}

export function resetApi(): void {
  routes = [];
  calls.length = 0;
}

/** A thrown answer: `fail(403, { code: 'SAME_PERSON' })`. */
export class HttpFail {
  constructor(public status: number, public data?: unknown) {}
}
export const fail = (status: number, data?: unknown) => new HttpFail(status, data);

function answer(method: Method, url: string, body?: unknown, config?: { params?: unknown }): Promise<{ data: unknown; status: number }> {
  const path = url.split('?')[0];
  const call: Call = { method, url: path, body, params: config?.params };
  calls.push(call);
  const hit = routes.find(([m, p]) => m === method && (typeof p === 'string' ? p === path : p.test(path)));
  let data: unknown = hit ? hit[2] : method === 'GET' ? undefined : {};
  if (typeof data === 'function') data = (data as (c: Call) => unknown)(call);
  if (data instanceof HttpFail) {
    const err = Object.assign(new Error(`HTTP ${data.status}`), {
      isAxiosError: true, response: { status: data.status, data: data.data },
    });
    return Promise.reject(err);
  }
  return Promise.resolve({ data, status: 200 });
}

export const mockApi = {
  get: jest.fn((url: string, config?: { params?: unknown }) => answer('GET', url, undefined, config)),
  delete: jest.fn((url: string, config?: { params?: unknown }) => answer('DELETE', url, undefined, config)),
  post: jest.fn((url: string, body?: unknown, config?: { params?: unknown }) => answer('POST', url, body, config)),
  put: jest.fn((url: string, body?: unknown, config?: { params?: unknown }) => answer('PUT', url, body, config)),
  patch: jest.fn((url: string, body?: unknown, config?: { params?: unknown }) => answer('PATCH', url, body, config)),
  request: jest.fn((c: { method?: string; url: string; data?: unknown; params?: unknown }) =>
    answer(((c.method ?? 'get').toUpperCase()) as Method, c.url, c.data, c)),
  interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } },
  defaults: { headers: { common: {} } },
};

/** Requests matching a method and path (string equality or RegExp). */
export function callsTo(method: Method, path: string | RegExp): Call[] {
  return calls.filter((c) => c.method === method && (typeof path === 'string' ? c.url === path : path.test(c.url)));
}
