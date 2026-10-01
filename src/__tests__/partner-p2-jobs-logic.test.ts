/**
 * P2 JOBS — the pure rules behind the Jobs screens (`src/features/jobs/logic.ts`):
 * which buttons a stage + a person get, which words the gate card says, which
 * bookings "Pick a booking" offers, and what a quote line looks like on the wire.
 */
import {
  clampValidDays, gateText, jobActions, mayQuote, pickableBookings, prefillFromQuotes, wireLines,
} from '../features/jobs/logic';
import type { JobStage } from '../features/jobs/types';
import type { PartnerBookingView } from '../features/bookings/booking.types';
import type { PartnerDocumentLine } from '../features/billing/types';

const all = () => true;
const without = (...keys: string[]) => (k: string) => !keys.includes(k);

describe('jobActions(stage, can)', () => {
  const cases: [JobStage, { sendQuote: boolean; addVisit: boolean; raiseBill: boolean; close: boolean }][] = [
    ['QUOTE_PENDING', { sendQuote: true, addVisit: true, raiseBill: false, close: true }],
    ['QUOTED', { sendQuote: true, addVisit: true, raiseBill: false, close: true }],
    ['DECLINED', { sendQuote: true, addVisit: false, raiseBill: false, close: true }],
    ['APPROVED', { sendQuote: false, addVisit: true, raiseBill: false, close: true }],
    ['IN_WORK', { sendQuote: false, addVisit: true, raiseBill: false, close: true }],
    ['COMPLETED', { sendQuote: false, addVisit: true, raiseBill: true, close: true }],
    ['INVOICED', { sendQuote: false, addVisit: false, raiseBill: false, close: true }],
    ['CLOSED', { sendQuote: false, addVisit: false, raiseBill: false, close: false }],
  ];
  it.each(cases)('%s with every permission', (stage, expected) => {
    expect(jobActions(stage, all)).toMatchObject(expected);
  });

  it('Send quote needs JOBS_QUOTE and INVOICING_MANAGE', () => {
    expect(jobActions('QUOTED', without('JOBS_QUOTE')).sendQuote).toBe(false);
    expect(jobActions('QUOTED', without('INVOICING_MANAGE')).sendQuote).toBe(false);
    expect(mayQuote(without('JOBS_QUOTE'))).toBe(false);
    expect(mayQuote(all)).toBe(true);
  });

  it('Add visit, Close job and Refresh gate pass need BOOKINGS_MANAGE; Raise the bill needs INVOICING_MANAGE', () => {
    const noManage = jobActions('COMPLETED', without('BOOKINGS_MANAGE'));
    expect(noManage).toMatchObject({ addVisit: false, close: false, refreshGate: false, raiseBill: true });
    expect(jobActions('COMPLETED', without('INVOICING_MANAGE')).raiseBill).toBe(false);
  });
});

describe('gateText(gate)', () => {
  it('ACTIVE with a code shows the code', () => {
    expect(gateText({ status: 'ACTIVE', consent: true, code: '482913' })).toEqual({ showCode: true, key: 'active', refreshable: true });
  });
  it('ACTIVE without a readable code says so and never draws digits', () => {
    expect(gateText({ status: 'ACTIVE', consent: true })).toMatchObject({ showCode: false, key: 'activeNoCode' });
    expect(gateText({ status: 'ACTIVE', consent: true, code: 'abc' }).showCode).toBe(false);
  });
  it('NONE depends on the consent', () => {
    expect(gateText({ status: 'NONE', consent: false })).toMatchObject({ key: 'none', refreshable: false, showCode: false });
    expect(gateText({ status: 'NONE', consent: true })).toMatchObject({ key: 'noneConsented', refreshable: true });
  });
  it('the other states are a sentence plus the server reason', () => {
    expect(gateText({ status: 'NOT_AVAILABLE', consent: false, reason: 'Not a visit to a society flat' }))
      .toEqual({ showCode: false, key: 'notAvailable', reason: 'Not a visit to a society flat', refreshable: false });
    expect(gateText({ status: 'FAILED', consent: true, reason: 'Gate is off' })).toMatchObject({ key: 'failed', reason: 'Gate is off', refreshable: true });
    expect(gateText({ status: 'REVOKED', consent: false })).toMatchObject({ key: 'revoked', refreshable: true });
    expect(gateText({ status: 'USED', consent: true, code: '111111' })).toMatchObject({ key: 'used', showCode: false });
  });
  it('an unknown or missing gate reads as none', () => {
    expect(gateText(undefined).key).toBe('none');
    expect(gateText({ status: 'WHAT' as never, consent: false }).key).toBe('none');
  });
});

describe('pickableBookings', () => {
  const b = (id: string, status: string, slotStart: string) => ({ id, status, slotStart } as unknown as PartnerBookingView);
  it('keeps open bookings from today on (and a running one), soonest first', () => {
    const rows = [
      b('late', 'ACCEPTED', '2026-10-03T06:00:00.000Z'),
      b('old', 'SCHEDULED', '2026-09-29T06:00:00.000Z'),
      b('running', 'IN_PROGRESS', '2026-09-30T06:00:00.000Z'),
      b('done', 'COMPLETED', '2026-10-02T06:00:00.000Z'),
      b('asked', 'REQUESTED', '2026-10-02T06:00:00.000Z'),
      b('soon', 'RESCHEDULED', '2026-10-01T04:00:00.000Z'),
    ];
    expect(pickableBookings(rows, '2026-10-01').map((r) => r.id)).toEqual(['running', 'soon', 'late']);
  });
});

describe('quote lines on the wire', () => {
  it('never carry the screen keys or tax figures', () => {
    const priced: PartnerDocumentLine = {
      itemId: 'p1', itemName: 'Tap washer', hsn: '8481', qty: 2, unit: 'PCS', ratePaise: 5000, discountPaise: 0,
      taxInclusive: true, taxRatePercent: 18, cessRatePercent: 0, taxablePaise: 8475, cgstPaise: 763, sgstPaise: 762,
      igstPaise: 0, cessPaise: 0, totalPaise: 10000,
    };
    const [line] = prefillFromQuotes([{ lines: [] }, { lines: [priced] }]);
    expect(line).toEqual({
      itemId: 'p1', itemName: 'Tap washer', hsn: '8481', qty: 2, unit: 'PCS', ratePaise: 5000, taxInclusive: true, taxRatePercent: 18,
    });
    expect(wireLines([{ ...line, key: 'k1', catalogRatePaise: 5000, description: undefined }])).toEqual([line]);
    expect(prefillFromQuotes(undefined)).toEqual([]);
  });
  it('validity days stay 1–30', () => {
    expect(clampValidDays(0)).toBe(1);
    expect(clampValidDays(45)).toBe(30);
    expect(clampValidDays(Number.NaN)).toBe(7);
    expect(clampValidDays(10)).toBe(10);
  });
});
