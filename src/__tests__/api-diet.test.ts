/**
 * API-DIET (Owner 11-04) — the real `apiClient` (the global setup swaps it for the
 * route mock), answered at the adapter: identical GETs share one request, a write
 * empties that memo, GETs of the same moment go as ONE `POST /batch`, and a batch
 * item that is not OK is asked again on its own.
 */
import { STORAGE_KEYS } from '../constants/app';
import { storage } from '../utils/storage';

const real = jest.requireActual('../api/axios') as typeof import('../api/axios');
const { apiClient, clearGetMemo } = real;

type Cfg = { method?: string; url?: string; data?: string };
const ok = (config: Cfg, data: unknown) => ({ data, status: 200, statusText: 'OK', headers: {}, config, request: {} });

const savedAdapter = apiClient.defaults.adapter;
let adapter: jest.Mock;
/** `answer(config)` → the body for a 200; `/batch` answers with `batch(paths)`. */
const answerWith = (answer: (c: Cfg) => unknown, batch?: (paths: string[]) => Array<{ status: number; body: unknown }>) => {
  adapter = jest.fn(async (config: Cfg) => {
    if (config.url === '/batch') {
      const paths = (JSON.parse(config.data || '{}').requests || []).map((r: { path: string }) => r.path);
      return ok(config, { responses: batch ? batch(paths) : paths.map((p: string) => ({ status: 200, body: { path: p } })) });
    }
    return ok(config, answer(config));
  });
  apiClient.defaults.adapter = adapter as never;
};
const calls = () => adapter.mock.calls.map((c) => `${String(c[0].method).toUpperCase()} ${c[0].url}`);

beforeEach(async () => {
  clearGetMemo();
  await storage.set(STORAGE_KEYS.ACCESS_TOKEN, 't1');
});
afterAll(() => { apiClient.defaults.adapter = savedAdapter; });

describe('API-DIET — shop apiClient', () => {
  it('two identical GETs → one request, one answer', async () => {
    answerWith((c) => ({ url: c.url }));
    const [a, b] = await Promise.all([apiClient.get('/partner/me'), apiClient.get('/partner/me')]);
    expect(calls()).toEqual(['GET /partner/me']);
    expect(a.data).toEqual({ url: '/partner/me' });
    expect(b.data).toEqual(a.data);
  });

  it('a write empties the memo — the next GET asks again', async () => {
    answerWith(() => ({ n: 1 }));
    await apiClient.get('/partner/me');
    await apiClient.post('/partner/invoices', {});
    await apiClient.get('/partner/me');
    expect(calls()).toEqual(['GET /partner/me', 'POST /partner/invoices', 'GET /partner/me']);
  });

  it('two different GETs in one tick → ONE POST /batch, each gets its own answer', async () => {
    answerWith(() => ({ alone: true }));
    const [a, b] = await Promise.all([apiClient.get('/partner/me'), apiClient.get('/partner/orders', { params: { x: 1 } })]);
    expect(calls()).toEqual(['POST /batch']);
    expect(JSON.parse(adapter.mock.calls[0][0].data)).toEqual({ requests: [{ path: '/partner/me' }, { path: '/partner/orders?x=1' }] });
    expect(a.data).toEqual({ path: '/partner/me' });
    expect(b.data).toEqual({ path: '/partner/orders?x=1' });
  });

  it('a batch item that is not OK is asked again on its own (the normal path)', async () => {
    answerWith((c) => ({ alone: c.url }), (paths) => [{ status: 200, body: { path: paths[0] } }, { status: 500, body: { error: 'x' } }]);
    const [a, b] = await Promise.all([apiClient.get('/partner/me'), apiClient.get('/partner/today')]);
    expect(calls()).toEqual(['POST /batch', 'GET /partner/today']);
    expect(a.data).toEqual({ path: '/partner/me' });
    expect(b.data).toEqual({ alone: '/partner/today' });
  });

  it('no access token → no batch (each GET alone)', async () => {
    await storage.delete(STORAGE_KEYS.ACCESS_TOKEN);
    answerWith((c) => ({ alone: c.url }));
    await Promise.all([apiClient.get('/partner/me'), apiClient.get('/partner/today')]);
    expect(calls().sort()).toEqual(['GET /partner/me', 'GET /partner/today']);
  });
});

describe('API-DIET — expired token inside a batch (QA 11-05)', () => {
  it('all items 401 → ONE asked alone (refresh), the rest re-batched once', async () => {
    let round = 0;
    answerWith((c) => ({ alone: c.url }), (paths) => {
      round += 1;
      return paths.map((p) => (round === 1 ? { status: 401, body: { error: 'expired' } } : { status: 200, body: { path: p } }));
    });
    const [a, b, c] = await Promise.all([apiClient.get('/one'), apiClient.get('/two'), apiClient.get('/three')]);
    expect(calls()).toEqual(['POST /batch', 'GET /one', 'POST /batch']);
    expect(JSON.parse(adapter.mock.calls[2][0].data)).toEqual({ requests: [{ path: '/two' }, { path: '/three' }] });
    expect(a.data).toEqual({ alone: '/one' });
    expect(b.data).toEqual({ path: '/two' });
    expect(c.data).toEqual({ path: '/three' });
  });

  it('a 401 in the re-batch is not re-batched again — asked alone', async () => {
    answerWith((c) => ({ alone: c.url }), (paths) => paths.map(() => ({ status: 401, body: {} })));
    const res = await Promise.all([apiClient.get('/one'), apiClient.get('/two'), apiClient.get('/three')]);
    expect(calls()).toEqual(['POST /batch', 'GET /one', 'POST /batch', 'GET /two', 'GET /three']);
    expect(res.map((r) => r.data)).toEqual([{ alone: '/one' }, { alone: '/two' }, { alone: '/three' }]);
  });
});
