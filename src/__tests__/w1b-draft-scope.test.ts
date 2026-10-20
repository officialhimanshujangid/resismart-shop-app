/**
 * W1B (C1, Owner context-isolation policy 10-20) — offline invoice drafts belong to
 * ONE business + ONE person. Switch business A → B: none of A's drafts is listed in
 * B, and none is ever uploaded with B's token. Signed out: nothing is listed. Back in
 * A: A's draft is still there (never thrown away) and syncs into A.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEVICE_KEYS } from '../constants/app';

const mockCreate = jest.fn();
const mockIssue = jest.fn();
jest.mock('../features/billing/documents.api', () => ({
  documentsApi: {
    create: (...a: unknown[]) => mockCreate(...a),
    issue: (...a: unknown[]) => mockIssue(...a),
  },
}));

type Store = typeof import('../features/billing/draftStore').draftStore;
const A = { partnerId: 'biz-A', userId: 'u1' };
const B = { partnerId: 'biz-B', userId: 'u1' };
const input = (name: string) => ({
  type: 'INVOICE', partySnapshot: { name }, lines: [{ description: 'x', qty: 1, ratePaise: 100 }],
}) as never;

type Disk = { setItem: (k: string, v: string) => Promise<void> };
function freshStore(seed?: (disk: Disk) => void): Store {
  let s: Store | null = null;
  jest.isolateModules(() => {
    // The SAME (isolated) AsyncStorage the store will read.
    const m = require('@react-native-async-storage/async-storage');
    seed?.((m.default ?? m) as Disk);
    s = require('../features/billing/draftStore').draftStore;
  });
  return s as unknown as Store;
}
const flush = () => new Promise((r) => setTimeout(r, 0));
async function loaded(store: Store) {
  store.ensureInitialized();
  for (let i = 0; i < 20 && !store.getSnapshot().loaded; i++) await flush();
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockCreate.mockReset().mockImplementation(async () => ({ _id: 'srv-1' }));
  mockIssue.mockReset().mockImplementation(async () => ({ document: { _id: 'doc-1', number: 'INV-1' }, warnings: [] }));
});

describe('W1B C1 — drafts per business + person', () => {
  it('switch A → B: A\'s draft is not listed in B and never uploaded with B; back in A it syncs', async () => {
    const store = freshStore();
    mockCreate.mockImplementation(async () => { throw Object.assign(new Error('offline'), { isAxiosError: true }); });
    store.setScope(A);
    await loaded(store);
    const d = await store.addDraft(input('Customer of A'));
    expect(d.partnerId).toBe('biz-A');
    expect(d.userId).toBe('u1');
    expect(store.getSnapshot().drafts.map((x) => x.id)).toEqual([d.id]);

    // Switch to B.
    store.setScope(null);
    store.setScope(B);
    await flush();
    expect(store.getSnapshot().drafts).toEqual([]);
    mockCreate.mockClear();
    await store.syncPending();
    expect(mockCreate).not.toHaveBeenCalled();
    expect(await store.retryDraft(d.id)).toBeUndefined();
    await store.discardDraft(d.id); // cannot discard another business's draft
    // Signed out: nothing listed.
    store.setScope(null);
    expect(store.getSnapshot().drafts).toEqual([]);

    // Back in A: still there, and it syncs into A.
    mockCreate.mockImplementation(async () => ({ _id: 'srv-1' }));
    store.setScope(A);
    await flush();
    expect(store.getSnapshot().drafts.map((x) => x.id)).toEqual([d.id]);
    await store.syncPending();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().drafts[0].status).toBe('SYNCED');
  });

  it('another person signed in to the same business sees none of the first person\'s drafts', async () => {
    const store = freshStore();
    mockCreate.mockImplementation(async () => { throw Object.assign(new Error('offline'), { isAxiosError: true }); });
    store.setScope(A);
    await loaded(store);
    await store.addDraft(input('Mine'));
    store.setScope({ partnerId: 'biz-A', userId: 'u2' });
    expect(store.getSnapshot().drafts).toEqual([]);
  });

  it('a pre-W1B draft (no business on it) joins only a person\'s ONLY business; with two it stays parked', async () => {
    const legacy = { id: 'old-1', idempotencyKey: 'old-1', createdAt: '2026-01-01', type: 'INVOICE', partySnapshot: { name: 'Old' }, lines: [], status: 'FAILED' };
    const seedLegacy = (disk: Disk) => { void disk.setItem(DEVICE_KEYS.INVOICE_DRAFTS, JSON.stringify([legacy])); };
    const two = freshStore(seedLegacy);
    two.setScope(A, { onlyBusiness: false });
    await loaded(two);
    expect(two.getSnapshot().drafts).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();

    const one = freshStore(seedLegacy);
    one.setScope(null);
    await loaded(one);
    one.setScope(A, { onlyBusiness: true });
    await flush();
    expect(one.getSnapshot().drafts.map((x) => [x.id, x.partnerId])).toEqual([['old-1', 'biz-A']]);
  });

  it('userIdFromToken reads the access token\'s own userId', () => {
    const { userIdFromToken } = require('../context/AuthContext');
    const payload = Buffer.from(JSON.stringify({ userId: 'u-42' })).toString('base64').replace(/=+$/, '');
    expect(userIdFromToken(`h.${payload}.s`)).toBe('u-42');
    expect(userIdFromToken('junk')).toBe('');
    expect(userIdFromToken(null)).toBe('');
  });
});
