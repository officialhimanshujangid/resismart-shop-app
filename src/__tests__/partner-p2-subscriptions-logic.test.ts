/**
 * Partner P2 subscriptions — the pure rules: the offline delivery-mark queue
 * (merge per day, last mark wins, ≤500 per request, the key kept until the
 * server answers, a refused op dropped) and the sheet / form helpers.
 */
import {
  EMPTY_MARK_QUEUE, MarkQueueState, allPendingFor, enqueueAll, enqueueMark, opBody, opDone, opPartlyRefused, opRefused,
  pendingMarksFor, reviveQueue, takeOp, unqueueMark, unsentCount,
} from '../features/subscriptions/markQueue';
import {
  allPresent, attendanceEntries, billRunSummary, buildCreateBody, clampDay, defaultBillPeriod, draftToLines,
  lineSummary, markMinDay, monthGrid, nextLineKey, notDeliveredAction, overlayRows, qtyChanges, rangeProblem,
  sheetCounts, tapAction, buildReviseBody, buildEditBody, editDraftOf, initialOrder, moveItem,
} from '../features/subscriptions/logic';
import type { SheetRow, Subscription } from '../features/subscriptions/types';

const D = '2026-10-01';

describe('markQueue', () => {
  it('merges marks for the same day into one op; the last mark for a customer wins', () => {
    let s = enqueueMark(EMPTY_MARK_QUEUE, D, { subscriptionId: 's1', status: 'DELIVERED' });
    s = enqueueMark(s, D, { subscriptionId: 's2', status: 'DELIVERED' });
    s = enqueueMark(s, D, { subscriptionId: 's1', status: 'NOT_DELIVERED' });
    expect(s.pending).toHaveLength(1);
    expect(s.pending[0]).toEqual({
      kind: 'MARK', day: D,
      entries: [{ subscriptionId: 's1', status: 'NOT_DELIVERED' }, { subscriptionId: 's2', status: 'DELIVERED' }],
    });
    // another day is another op
    s = enqueueMark(s, '2026-09-30', { subscriptionId: 's1', status: 'DELIVERED' });
    expect(s.pending).toHaveLength(2);
    expect(unsentCount(s)).toBe(3);
  });

  it('never adds to the op on the wire — new marks queue behind it', () => {
    let s = enqueueMark(EMPTY_MARK_QUEUE, D, { subscriptionId: 's1', status: 'DELIVERED' });
    s = takeOp(s, 'k1');
    s = enqueueMark(s, D, { subscriptionId: 's2', status: 'DELIVERED' });
    expect(s.inFlight?.op).toEqual({ kind: 'MARK', day: D, entries: [{ subscriptionId: 's1', status: 'DELIVERED' }] });
    expect(s.pending).toEqual([{ kind: 'MARK', day: D, entries: [{ subscriptionId: 's2', status: 'DELIVERED' }] }]);
    // taking again while one is in flight changes nothing
    expect(takeOp(s, 'k2')).toBe(s);
  });

  it('sends at most 500 entries per request, the rest stay first in line', () => {
    let s: MarkQueueState = EMPTY_MARK_QUEUE;
    for (let i = 0; i < 620; i += 1) s = enqueueMark(s, D, { subscriptionId: `s${i}`, status: 'DELIVERED' });
    s = takeOp(s, 'k1');
    const body = opBody(s.inFlight!.op) as { entries: unknown[] };
    expect(body.entries).toHaveLength(500);
    expect(s.pending[0].kind === 'MARK' && s.pending[0].entries).toHaveLength(120);
    s = takeOp(opDone(s), 'k2');
    expect((opBody(s.inFlight!.op) as { entries: unknown[] }).entries).toHaveLength(120);
  });

  it('keeps the op AND its key when there was no answer (nothing is called; the state stays)', () => {
    let s = enqueueMark(EMPTY_MARK_QUEUE, D, { subscriptionId: 's1', status: 'DELIVERED' });
    s = takeOp(s, 'key-1');
    // the hook does nothing on a network failure: the next flush takes the same op under the same key
    const again = takeOp(s, 'key-2');
    expect(again.inFlight?.key).toBe('key-1');
    const revived = reviveQueue(JSON.parse(JSON.stringify(again)));
    expect(revived.inFlight?.key).toBe('key-1');
  });

  it('drops a refused op with the server sentence and carries on; other refusals put it back', () => {
    let s = enqueueMark(EMPTY_MARK_QUEUE, '2026-09-01', { subscriptionId: 's1', status: 'DELIVERED' });
    s = enqueueAll(s, D, 'r1');
    s = takeOp(s, 'k1');
    const refused = opRefused(s, 'DELIVERY_DAY_OUT_OF_RANGE', 'Too old');
    expect(refused.dropped).toBe(true);
    expect(refused.state.inFlight).toBeNull();
    expect(refused.state.refused).toEqual([{ op: { kind: 'MARK', day: '2026-09-01', entries: [{ subscriptionId: 's1', status: 'DELIVERED' }] }, code: 'DELIVERY_DAY_OUT_OF_RANGE', message: 'Too old' }]);
    expect(refused.state.pending).toEqual([{ kind: 'ALL', day: D, routeId: 'r1' }]);

    const s2 = takeOp(refused.state, 'k2');
    const halted = opRefused(s2, 'ACCESS_DENIED', 'No');
    expect(halted.dropped).toBe(false);
    expect(halted.state.inFlight).toBeNull();
    expect(halted.state.pending).toEqual([{ kind: 'ALL', day: D, routeId: 'r1' }]);
  });

  it('a mark still on the phone can be taken back; one on the wire cannot', () => {
    let s = enqueueMark(EMPTY_MARK_QUEUE, D, { subscriptionId: 's1', status: 'NOT_DELIVERED' });
    expect(pendingMarksFor(s, D).get('s1')).toEqual({ status: 'NOT_DELIVERED', qty: undefined, local: true });
    expect(unqueueMark(s, D, 's1').pending).toEqual([]);
    s = takeOp(s, 'k');
    expect(unqueueMark(s, D, 's1')).toBe(s);
    expect(pendingMarksFor(s, D).get('s1')?.local).toBe(false);
  });

  it('All delivered is queued once per route and day', () => {
    let s = enqueueAll(EMPTY_MARK_QUEUE, D, 'r1');
    s = enqueueAll(s, D, 'r1');
    expect(s.pending).toHaveLength(1);
    expect(opBody(s.pending[0])).toEqual({ day: D, routeId: 'r1' });
    expect(allPendingFor(s, D, 'r1')).toBe(true);
    expect(allPendingFor(s, D, undefined)).toBe(false);
  });

  it('reads garbage from disk as an empty queue', () => {
    expect(reviveQueue('nope')).toEqual(EMPTY_MARK_QUEUE);
    expect(reviveQueue({ pending: [{ kind: 'X' }], inFlight: { key: 1 } })).toEqual(EMPTY_MARK_QUEUE);
  });
});

const row = (id: string, state: SheetRow['state'], over: Partial<SheetRow> = {}): SheetRow => ({
  subscriptionId: id, code: `SUB-${id}`, customerName: `C ${id}`, lines: [{ lineKey: 'L1', itemName: 'Milk', qty: 1, unit: 'L' }], state, ...over,
});

describe('delivery sheet rules', () => {
  it('lays pending marks over the rows and counts them', () => {
    const pending = new Map([['a', { status: 'DELIVERED' as const, local: true }]]);
    const v = overlayRows([row('a', 'DUE'), row('b', 'DUE'), row('c', 'PAUSED'), row('d', 'NOT_DELIVERED')], pending, false);
    expect(v.map((x) => [x.state, x.unsent])).toEqual([['DELIVERED', true], ['DUE', false], ['PAUSED', false], ['NOT_DELIVERED', false]]);
    expect(sheetCounts(v)).toEqual({ due: 1, delivered: 1, notDelivered: 1, paused: 1 });
    // "All delivered" waiting: only unmarked DUE rows show delivered
    const all = overlayRows([row('a', 'DUE'), row('d', 'NOT_DELIVERED')], new Map(), true);
    expect(all.map((x) => x.state)).toEqual(['DELIVERED', 'NOT_DELIVERED']);
  });

  it('one tap marks a DUE row; Not delivered toggles and undoes', () => {
    const [due] = overlayRows([row('a', 'DUE')], new Map(), false);
    expect(tapAction(due)).toBe('DELIVERED');
    expect(notDeliveredAction(due)).toEqual({ kind: 'MARK', status: 'NOT_DELIVERED' });
    const [localNd] = overlayRows([row('a', 'DUE')], new Map([['a', { status: 'NOT_DELIVERED' as const, local: true }]]), false);
    expect(notDeliveredAction(localNd)).toEqual({ kind: 'UNQUEUE' });
    const [serverNd] = overlayRows([row('a', 'NOT_DELIVERED')], new Map(), false);
    expect(tapAction(serverNd)).toBe('EXPAND');
    expect(notDeliveredAction(serverNd)).toEqual({ kind: 'MARK', status: 'DELIVERED' });
  });

  it('sends quantities only when one changed, then every line', () => {
    const lines = [{ lineKey: 'L1', itemName: 'Milk', qty: 1, unit: 'L' }, { lineKey: 'L2', itemName: 'Curd', qty: 1, unit: 'pc' }];
    expect(qtyChanges(lines, { L1: 1 })).toBeUndefined();
    expect(qtyChanges(lines, { L1: 2 })).toEqual([{ lineKey: 'L1', qty: 2 }, { lineKey: 'L2', qty: 1 }]);
    expect(lineSummary(lines)).toBe('1 L Milk · 1 pc Curd');
  });

  it('keeps the day inside the marking window', () => {
    const min = markMinDay(D, 7);
    expect(min).toBe('2026-09-24');
    expect(clampDay('2026-10-05', min, D)).toBe(D);
    expect(clampDay('2026-09-01', min, D)).toBe(min);
    expect(clampDay('junk', min, D)).toBe(D);
    expect(clampDay('2026-09-28', min, D)).toBe('2026-09-28');
  });
});

describe('forms and months', () => {
  it('builds the create body with short line keys and rates in paise', () => {
    expect(nextLineKey([{ lineKey: 'L1' }, { lineKey: 'L2' }])).toBe('L3');
    const r = buildCreateBody({
      partyId: 'p1', planId: null, kind: 'DAIRY', title: ' Morning milk ',
      lines: [{ lineKey: 'L1', itemName: 'Milk', unit: 'L', qty: '1', rate: '56.50' }],
      schedule: { pattern: 'WEEKDAYS', weekdays: [5, 1, 3] }, billing: { mode: 'PER_DELIVERY', fee: '' },
      startDate: D, routeId: 'r1', routeSeq: '4', notes: '',
    });
    expect(r.problem).toBeNull();
    expect(r.body).toEqual({
      partyId: 'p1', kind: 'DAIRY', title: 'Morning milk',
      lines: [{ lineKey: 'L1', itemName: 'Milk', unit: 'L', qty: 1, ratePaise: 5650, taxRatePercent: 0 }],
      schedule: { pattern: 'WEEKDAYS', weekdays: [1, 3, 5] }, billing: { mode: 'PER_DELIVERY', timing: 'ARREARS' },
      startDate: D, routeId: 'r1', routeSeq: 4,
    });
    expect(buildCreateBody({
      partyId: null, planId: null, kind: 'DAIRY', title: 'x', lines: [], schedule: { pattern: 'DAILY', weekdays: [] },
      billing: { mode: 'PER_DELIVERY', fee: '' }, startDate: D, routeId: null, routeSeq: '', notes: '',
    }).problem).toBe('CUSTOMER');
    expect(draftToLines([{ lineKey: 'L1', itemName: 'Milk', unit: '', qty: '1', rate: '1' }]).problem).toBe('UNIT');
  });

  it('pause ranges, month grids, bill periods and summaries', () => {
    expect(rangeProblem('2026-10-05', '2026-10-04', 60)).toBe('ORDER');
    expect(rangeProblem('2026-10-01', '2026-10-10', 5)).toBe('TOO_LONG');
    expect(rangeProblem('2026-10-01', '2026-10-01', 5)).toBeNull();
    const weeks = monthGrid('2026-10'); // 1 Oct 2026 is a Thursday
    expect(weeks[0].slice(0, 4)).toEqual([null, null, null, null]);
    expect(weeks[0][4]).toBe('2026-10-01');
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(defaultBillPeriod('2026-01-15')).toBe('2025-12');
    expect(billRunSummary([
      { subscriptionId: 'a', status: 'ISSUED' }, { subscriptionId: 'b', status: 'ISSUED' }, { subscriptionId: 'c', status: 'SKIPPED' },
    ])).toEqual({ ISSUED: 2, SKIPPED: 1 });
  });

  it('attendance: All present fills class days; only changes are saved', () => {
    const rows = [
      { subscriptionId: 'a', code: 'A', customerName: 'A', classDay: true },
      { subscriptionId: 'b', code: 'B', customerName: 'B', classDay: false },
      { subscriptionId: 'c', code: 'C', customerName: 'C', classDay: true, status: 'PRESENT' as const },
    ];
    const chosen = allPresent(rows, {});
    expect(chosen).toEqual({ a: 'PRESENT', c: 'PRESENT' });
    expect(attendanceEntries(rows, chosen)).toEqual([{ subscriptionId: 'a', status: 'PRESENT' }]);
  });
});

describe('per-entry mark answers', () => {
  const inFlight = () => {
    let s = enqueueMark(EMPTY_MARK_QUEUE, D, { subscriptionId: 's1', status: 'DELIVERED' });
    s = enqueueMark(s, D, { subscriptionId: 's2', status: 'NOT_DELIVERED' });
    s = enqueueMark(s, D, { subscriptionId: 's3', status: 'DELIVERED' });
    return takeOp(s, 'k1');
  };

  it('drops only the refused entries (by key, else by index); the rest count as sent', () => {
    const r = opPartlyRefused(inFlight(), [
      { key: 's2', index: 1, code: 'SUBSCRIPTION_NOT_FOUND', message: 'gone' },
      { index: 2, code: 'DELIVERY_NOT_SCHEDULED', message: 'no delivery' },
    ]);
    expect(r.state.inFlight).toBeNull();
    expect(r.state.pending).toEqual([]);
    expect(r.dropped).toEqual([
      { op: { kind: 'MARK', day: D, entries: [{ subscriptionId: 's2', status: 'NOT_DELIVERED' }] }, code: 'SUBSCRIPTION_NOT_FOUND', message: 'gone' },
      { op: { kind: 'MARK', day: D, entries: [{ subscriptionId: 's3', status: 'DELIVERED' }] }, code: 'DELIVERY_NOT_SCHEDULED', message: 'no delivery' },
    ]);
    expect(r.state.refused).toEqual(r.dropped);
    expect(pendingMarksFor(r.state, D).size).toBe(0);
  });

  it('an old {saved} answer (no list) is simply done; a duplicate refusal is recorded once', () => {
    const done = opPartlyRefused(inFlight(), []);
    expect(done.state.inFlight).toBeNull();
    expect(done.state.refused).toEqual([]);
    const twice = opPartlyRefused(inFlight(), [
      { key: 's1', index: 0, code: 'X', message: 'a' }, { key: 's1', index: 0, code: 'X', message: 'a' },
    ]);
    expect(twice.dropped).toHaveLength(1);
  });

  it('new marks queued behind the op survive a partial refusal', () => {
    const s = enqueueMark(inFlight(), D, { subscriptionId: 's9', status: 'DELIVERED' });
    const r = opPartlyRefused(s, [{ key: 's1', code: 'X', message: 'a' }]);
    expect(r.state.pending).toEqual([{ kind: 'MARK', day: D, entries: [{ subscriptionId: 's9', status: 'DELIVERED' }] }]);
  });
});

describe('change / edit / walking order', () => {
  const rev = {
    effectiveFrom: '2026-09-01',
    lines: [{ lineKey: 'L1', itemName: 'Milk', unit: 'L', qty: 1, ratePaise: 5600, taxRatePercent: 5, productId: 'prod1' }],
    schedule: { pattern: 'ALTERNATE' as const, anchorDate: '2026-09-01' },
    billing: { mode: 'PER_DELIVERY' as const, timing: 'ARREARS' as const },
  };
  const drafts = {
    lines: [{ lineKey: 'L1', itemName: 'Milk', unit: 'L', qty: '1', rate: '56.00' }],
    schedule: { pattern: 'ALTERNATE' as const, weekdays: [] },
    billing: { mode: 'PER_DELIVERY' as const, fee: '' },
  };

  it('revise sends only the changed part and keeps hidden line fields', () => {
    expect(buildReviseBody(rev, { effectiveFrom: D, ...drafts }).problem).toBe('NOTHING');
    const r = buildReviseBody(rev, { effectiveFrom: D, ...drafts, lines: [{ ...drafts.lines[0], qty: '2' }] });
    expect(r.body).toEqual({
      effectiveFrom: D,
      lines: [{ productId: 'prod1', lineKey: 'L1', itemName: 'Milk', unit: 'L', qty: 2, ratePaise: 5600, taxRatePercent: 5 }],
    });
    const f = buildReviseBody(rev, { effectiveFrom: D, ...drafts, billing: { mode: 'FIXED_MONTHLY', fee: '800' } });
    expect(f.body).toEqual({ effectiveFrom: D, billing: { mode: 'FIXED_MONTHLY', monthlyFeePaise: 80000, timing: 'ARREARS' } });
    expect(buildReviseBody(rev, { effectiveFrom: '', ...drafts }).problem).toBe('START');
  });

  it('edit sends only the changed fields, null to go back to the shop setting', () => {
    const sub = {
      _id: 'x', code: 'SUB-1', partyId: 'p', customerName: 'A', kind: 'DAIRY', title: 'Milk', status: 'ACTIVE',
      startDate: '2026-09-01', revisions: [], routeId: 'r1', routeSeq: 3, billDay: 5, autoIssue: true,
    } as Subscription;
    const d = editDraftOf(sub);
    expect(d).toEqual({ title: 'Milk', routeId: 'r1', routeSeq: '3', billDay: '5', autoIssue: 'YES', notes: '' });
    expect(buildEditBody(sub, d).problem).toBe('NOTHING');
    expect(buildEditBody(sub, { ...d, billDay: '', autoIssue: 'DEFAULT', routeId: null }).body)
      .toEqual({ billDay: null, autoIssue: null, routeId: null });
    expect(buildEditBody(sub, { ...d, routeSeq: '7', title: ' Morning milk ' }).body).toEqual({ routeSeq: 7, title: 'Morning milk' });
    expect(buildEditBody(sub, { ...d, billDay: '30' }).problem).toBe('BILL_DAY');
  });

  it('walking order: routeSeq first, then today\'s sheet, then code; ▲▼ move one place', () => {
    const rows = [{ id: 'a', code: 'SUB-3' }, { id: 'b', code: 'SUB-1', routeSeq: 5 }, { id: 'c', code: 'SUB-2' }, { id: 'd', code: 'SUB-0' }];
    expect(initialOrder(rows, ['c', 'a'])).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
  });
});
