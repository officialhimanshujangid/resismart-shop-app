/**
 * P2 PHARMACY screens with the api mocked (CONTRACT-partner-P2 §7, backend
 * `routes/pharmacy.routes.ts`):
 *  - the hub lists batches; a status chip sends `status`;
 *  - near expiry → Write off → Confirm (3 taps) posts `{qty, reasonCode:'EXPIRY'}` with a key;
 *  - PHARMACY_MANAGE denied hides Write off;
 *  - BATCH_PICK_SHORT reads in Hindi with its params;
 *  - BatchPickSheet: expired rows disabled, "Automatic" picks null, a short batch warns;
 *  - the pure rules: rxProblem / rxBody / needsRx / expiryLabel / parseExpiryMonth / buckets / split / correction.
 */
import React from 'react';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import PharmacyHomeScreen from '../../app/(app)/pharmacy/index';
import NearExpiryScreen from '../../app/(app)/pharmacy/near-expiry';
import RxRegisterScreen from '../../app/(app)/pharmacy/rx-register';
import { BatchPickSheet } from '../features/pharmacy/components/BatchPickSheet';
import {
  EMPTY_RX, bucketOfRow, correctionBody, correctionDraftOf, expiryLabel, groupByBucket, isScheduleX, needsRx,
  parseExpiryMonth, rxBody, rxProblem, splitBody, splitProblem,
} from '../features/pharmacy/logic';
import type { BatchRow } from '../features/pharmacy/types';
import { callsTo, fail, mockApi, setRoutes } from './setup/mockApi';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const mockPerms: { deny: Set<string> } = { deny: new Set() };
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    can: (m: string) => !mockPerms.deny.has(m),
    hasModule: () => true,
    ready: true,
    entitlements: { isAdmin: true, categoryModules: ['PHARMACY'] },
    roleLimits: {},
  }),
}));

jest.mock('expo-file-system', () => {
  class File { uri = 'file:///cache/prescription-register.csv'; write = jest.fn(); constructor(..._a: unknown[]) {} }
  return { File, Paths: { cache: 'cache' } };
});
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));

beforeEach(() => { mockPerms.deny = new Set(); });

const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(String(v)), s);

// ───────────────────────────────────────────────────────── fixtures
const batch = (over: Partial<BatchRow> = {}): BatchRow => ({
  id: 'b1', productId: 'p1', productName: 'Paracetamol 500 strip', batchNo: 'PX123',
  expiryDate: '2030-01-31T18:29:59.999Z', qtyOnHand: 10, status: 'NEAR_EXPIRY', daysToExpiry: 12, ...over,
});
const expired = batch({ id: 'e1', batchNo: 'OLD9', expiryDate: '2026-08-31T18:29:59.999Z', status: 'EXPIRED', daysToExpiry: -30, qtyOnHand: 10 });

const NEAR = 'GET /partners/me/pharmacy/near-expiry';
const WRITE_OFF = '/partners/me/pharmacy/batches/e1/write-off';

// ───────────────────────────────────────────────────────── hub
describe('Pharmacy hub', () => {
  it('lists the batches and a status chip sends `status`', async () => {
    setRoutes({
      [NEAR]: { success: true, data: { buckets: [{ label: '≤30', count: 1, qty: 10 }], rows: [batch()] } },
      'GET /partners/me/pharmacy/batches': { success: true, data: [batch()], page: 1, limit: 30, total: 1 },
    });
    await paper(<PharmacyHomeScreen />);
    await waitFor(() => expect(screen.getByText('Paracetamol 500 strip')).toBeTruthy());
    expect(screen.getByTestId('batch-b1')).toHaveTextContent(/PX123/);
    expect(screen.getByTestId('batch-b1')).toHaveTextContent(/01\/2030/);
    expect((callsTo('GET', '/partners/me/pharmacy/batches')[0].params as Record<string, unknown>).status).toBeUndefined();

    await fireEvent.press(screen.getByText(en.p2.pharmacy.hub.filter.EXPIRED));
    await waitFor(() => expect(
      callsTo('GET', '/partners/me/pharmacy/batches').some((c) => (c.params as Record<string, unknown>)?.status === 'EXPIRED'),
    ).toBe(true));
  });
});

// ───────────────────────────────────────────────────────── near expiry
describe('Near expiry', () => {
  const near = { success: true, data: { buckets: [{ label: 'EXPIRED', count: 1, qty: 10 }, { label: '≤30', count: 1, qty: 10 }], rows: [expired, batch()] } };

  it('open → Write off → Confirm posts the whole batch as EXPIRY with an idempotency key', async () => {
    setRoutes({
      [NEAR]: near,
      [`POST ${WRITE_OFF}`]: { success: true, data: { batch: { ...expired, qtyOnHand: 0, status: 'EMPTY' }, movement: { productId: 'p1', qty: -10, balanceAfter: 10, type: 'ADJUSTMENT' } } },
    });
    await paper(<NearExpiryScreen />);
    await waitFor(() => expect(screen.getByTestId('writeoff-e1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('writeoff-e1'));
    await fireEvent.press(screen.getByTestId('writeoff-confirm'));
    await waitFor(() => expect(callsTo('POST', WRITE_OFF)).toHaveLength(1));
    expect(callsTo('POST', WRITE_OFF)[0].body).toEqual({ qty: 10, reasonCode: 'EXPIRY' });
    const post = mockApi.post.mock.calls.find((c) => c[0] === WRITE_OFF) as unknown as [string, unknown, { headers?: Record<string, string> }];
    expect(post[2]?.headers?.['Idempotency-Key']).toMatch(/^pharmacy-writeoff-/);
  });

  it('groups rows under the server buckets', async () => {
    setRoutes({ [NEAR]: near });
    await paper(<NearExpiryScreen />);
    await waitFor(() => expect(screen.getByTestId('near-e1')).toBeTruthy());
    expect(screen.getAllByText(fill(en.p2.pharmacy.bucket.within, { days: 30 })).length).toBeGreaterThan(0);
  });

  it('without PHARMACY_MANAGE there is no Write off', async () => {
    mockPerms.deny = new Set(['PHARMACY_MANAGE']);
    setRoutes({ [NEAR]: near });
    await paper(<NearExpiryScreen />);
    await waitFor(() => expect(screen.getByTestId('near-e1')).toBeTruthy());
    expect(screen.queryByTestId('writeoff-e1')).toBeNull();
    expect(screen.queryByText(en.p2.pharmacy.writeOff.action)).toBeNull();
  });

  it('BATCH_PICK_SHORT reads in Hindi', async () => {
    const params = { batchNo: 'OLD9', available: '4', needed: '10' };
    setRoutes({ [NEAR]: near, [`POST ${WRITE_OFF}`]: fail(409, { code: 'BATCH_PICK_SHORT', params }) });
    await paper(<NearExpiryScreen />, 'hi');
    await waitFor(() => expect(screen.getByTestId('writeoff-e1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('writeoff-e1'));
    await fireEvent.press(screen.getByTestId('writeoff-confirm'));
    await waitFor(() => expect(screen.getByTestId('writeoff-error')).toHaveTextContent(fill(hi.errors.BATCH_PICK_SHORT, params)));
  });
});

// ───────────────────────────────────────────────────────── register export
describe('Prescription register export', () => {
  const RX = '/partners/me/pharmacy/rx-register';
  const listPage = { success: true, data: [], page: 1, limit: 30, total: 0 };

  it('Excel/CSV asks for format=csv with the current filters and opens the share sheet', async () => {
    setRoutes({ [`GET ${RX}`]: listPage });
    await paper(<RxRegisterScreen />);
    await waitFor(() => expect(screen.getByTestId('rx-export-csv')).toBeTruthy());
    await fireEvent.press(screen.getByText(en.p2.pharmacy.register.status.CANCELLED));
    await fireEvent.press(screen.getByTestId('rx-export-csv'));
    const sharing = jest.requireMock('expo-sharing') as { shareAsync: jest.Mock };
    await waitFor(() => expect(sharing.shareAsync).toHaveBeenCalled());
    const exp = callsTo('GET', RX).find((c) => (c.params as Record<string, unknown>)?.format === 'csv');
    expect(exp?.params).toEqual({ status: 'CANCELLED', format: 'csv' });
    const get = mockApi.get.mock.calls.find((c) => (c[1] as { params?: { format?: string } })?.params?.format === 'csv') as unknown as [string, { responseType?: string }];
    expect(get[1].responseType).toBe('arraybuffer');
  });

  it('a failed PDF export says so on the screen', async () => {
    setRoutes({ [`GET ${RX}`]: (c: { params?: unknown }) => ((c.params as { format?: string })?.format === 'pdf' ? fail(500, {}) : listPage) });
    await paper(<RxRegisterScreen />);
    await waitFor(() => expect(screen.getByTestId('rx-export-pdf')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('rx-export-pdf'));
    await waitFor(() => expect(screen.getByTestId('rx-export-error')).toBeTruthy());
    expect(screen.getByTestId('rx-export-pdf')).not.toBeDisabled();
  });
});

// ───────────────────────────────────────────────────────── batch pick
describe('BatchPickSheet', () => {
  it('expired rows cannot be picked; Automatic picks null; a short batch warns but can be picked', async () => {
    const onPick = jest.fn();
    const ok = batch({ id: 'b2', batchNo: 'NEW1', qtyOnHand: 3, status: 'OK', daysToExpiry: 200 });
    setRoutes({
      'GET /partners/me/pharmacy/products/p1/batches': {
        success: true,
        data: { product: { id: 'p1', name: 'Paracetamol 500 strip', stockQty: 13, unit: 'STRIP', batchTracking: true }, unbatchedQty: 0, batches: [ok, expired] },
      },
    });
    await paper(<BatchPickSheet visible productId="p1" productName="Paracetamol 500 strip" qty={5} onPick={onPick} onDismiss={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('batch-pick-e1')).toBeTruthy());
    expect(screen.getByTestId('batch-pick-e1')).toBeDisabled();
    expect(screen.getByText(en.p2.pharmacy.pick.expiredReason)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('batch-pick-e1'));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByText(fill(en.p2.pharmacy.pick.short, { qty: 3 }))).toBeTruthy();

    await fireEvent.press(screen.getByTestId('batch-pick-auto'));
    expect(onPick).toHaveBeenLastCalledWith(null);
    await fireEvent.press(screen.getByTestId('batch-pick-b2'));
    expect(onPick).toHaveBeenLastCalledWith({ batchId: 'b2', batchNo: 'NEW1', expiryDate: ok.expiryDate });
  });
});

// ───────────────────────────────────────────────────────── pure rules
describe('pharmacy logic', () => {
  it('rxProblem names the missing name', () => {
    expect(rxProblem(EMPTY_RX)).toBe('p2.pharmacy.rx.needPatient');
    expect(rxProblem({ patientName: 'Meena', doctorName: ' D ' })).toBe('p2.pharmacy.rx.needDoctor');
    expect(rxProblem({ patientName: 'Meena', doctorName: 'Dr Rao' })).toBeNull();
  });

  it('rxBody trims, drops empty optionals, and sends the date at IST midnight', () => {
    expect(rxBody({
      patientName: ' Meena ', patientPhone: '  ', doctorName: 'Dr Rao', doctorRegNo: ' MH-123 ', rxNo: '', rxDate: '2026-09-30',
    })).toEqual({ patientName: 'Meena', doctorName: 'Dr Rao', doctorRegNo: 'MH-123', rxDate: '2026-09-30T00:00:00+05:30' });
    expect(rxBody({ patientName: 'A B', doctorName: 'C D', rxDate: 'soon' })).toEqual({ patientName: 'A B', doctorName: 'C D' });
  });

  it('needsRx follows the business settings; X is its own case', () => {
    expect(needsRx('H', ['H', 'H1'])).toBe(true);
    expect(needsRx('H1', ['H1'])).toBe(true);
    expect(needsRx('H', ['H1'])).toBe(false);
    expect(needsRx('X', ['H', 'H1'])).toBe(false);
    expect(needsRx(undefined, ['H'])).toBe(false);
    expect(isScheduleX('X')).toBe(true);
    expect(isScheduleX('H')).toBe(false);
  });

  it('expiryLabel reads the month in IST', () => {
    expect(expiryLabel('2027-03-31T18:29:59.999Z')).toBe('03/2027');
    expect(expiryLabel('2027-03-31T18:30:00.000Z')).toBe('04/2027');
    expect(expiryLabel('nonsense')).toBe('');
  });

  it('parseExpiryMonth accepts the ways a strip prints it', () => {
    expect(parseExpiryMonth('2027-03')).toBe('2027-03');
    expect(parseExpiryMonth('03/2027')).toBe('2027-03');
    expect(parseExpiryMonth('3/27')).toBe('2027-03');
    expect(parseExpiryMonth('13/2027')).toBeNull();
    expect(parseExpiryMonth('')).toBeNull();
  });

  it('rows fall in the server buckets the way the server counts them', () => {
    const labels = ['EXPIRED', '≤7', '≤30', '≤90'];
    expect(bucketOfRow(-1, labels)).toBe('EXPIRED');
    expect(bucketOfRow(0, labels)).toBe('≤7');
    expect(bucketOfRow(8, labels)).toBe('≤30');
    expect(bucketOfRow(90, labels)).toBe('≤90');
    expect(bucketOfRow(91, labels)).toBeNull();
    expect(groupByBucket([expired, batch()], labels).map((g) => g.label)).toEqual(['EXPIRED', '≤30']);
  });

  it('a split may not label more than the unbatched stock', () => {
    const rows = [{ batchNo: 'a1', expiry: '03/2027', mrp: '12.50', qty: '6' }, { batchNo: 'A2', expiry: '2027-06', mrp: '', qty: '5' }];
    expect(splitProblem(rows, 10)).toEqual({ key: 'p2.pharmacy.split.problem.tooMuch', params: { sum: '11', max: '10' } });
    expect(splitProblem(rows, 11)).toBeNull();
    expect(splitProblem([{ ...rows[0], expiry: '2027' }], 10)).toEqual({ key: 'p2.pharmacy.split.problem.expiry', params: { row: 1 } });
    expect(splitBody(rows)).toEqual([
      { batchNo: 'A1', expiryDate: '2027-03', mrpPaise: 1250, qty: 6 },
      { batchNo: 'A2', expiryDate: '2027-06', qty: 5 },
    ]);
  });

  it('a correction sends only what changed, needs a reason, and clears with null', () => {
    const b = batch({ mrpPaise: 5000, mfgDate: '2025-01-09T18:30:00.000Z' });
    const d = correctionDraftOf(b);
    expect(d).toEqual({ mrp: '50.00', mfgDay: '2025-01-10', expiry: '2030-01', note: '' });
    expect(correctionBody(b, d)).toEqual({ problem: { key: 'p2.pharmacy.correct.nothing' } });
    expect(correctionBody(b, { ...d, expiry: '04/2030' })).toEqual({ problem: { key: 'p2.pharmacy.correct.needNote' } });
    expect(correctionBody(b, { ...d, expiry: '04/2030', mrp: '', note: 'Strip reprint' })).toEqual({
      body: { note: 'Strip reprint', mrpPaise: null, expiryDate: '2030-04' },
    });
  });
});
