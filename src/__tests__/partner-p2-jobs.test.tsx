/**
 * P2 JOBS screens with the api mocked (CONTRACT-partner-P2 §10, backend
 * `routes/job.routes.ts`):
 *  - the list renders and a stage chip sends `stage`; New quote → Pick a booking → quote screen;
 *  - the detail's gate card: ACTIVE shows the code big, anything else shows no code;
 *  - quote on the phone: a catalogue part → Send quote posts `{lines, validDays}` with a key;
 *  - Raise the bill posts to /:id/invoice and says how far above the quote it is;
 *  - Close job needs a reason; JOBS_QUOTE denied hides Send quote;
 *  - JOB_QUOTE_NOT_ALLOWED_NOW reads in Hindi with its {stage}.
 */
import React from 'react';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import JobsListScreen from '../../app/(app)/jobs/index';
import JobDetailScreen from '../../app/(app)/jobs/[id]';
import JobQuoteScreen from '../../app/(app)/jobs/quote';
import BookingsTabScreen from '../../app/(app)/(tabs)/bookings';
import { callsTo, fail, mockApi, setRoutes } from './setup/mockApi';
import { router, setParams } from './setup/mockRouter';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const mockPerms: { deny: Set<string>; modules: string[] } = { deny: new Set(), modules: ['JOBS'] };
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    can: (m: string) => !mockPerms.deny.has(m),
    hasModule: () => true,
    ready: true,
    entitlements: { isAdmin: true, categoryModules: mockPerms.modules },
    roleLimits: {},
  }),
}));

beforeEach(() => { mockPerms.deny = new Set(); mockPerms.modules = ['JOBS']; });

const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(String(v)), s);

// ───────────────────────────────────────────────────────── fixtures
const row = {
  id: 'j1', code: 'JOB-0007', stage: 'QUOTED', customerName: 'Ravi S', flatLabel: 'B-402', serviceName: 'Tap repair',
  lastQuote: { number: 'QT/26-27/0003', totalPaise: 100000, status: 'SENT' },
  nextVisit: { bookingId: 'b1', slotStart: '2030-01-10T05:00:00.000Z', status: 'ACCEPTED' },
  gateStatus: 'NONE',
};

const booking = {
  id: 'b1', code: 'BK-0101', status: 'ACCEPTED', slotStart: '2030-01-10T05:00:00.000Z', slotEnd: '2030-01-10T06:00:00.000Z',
  serviceSnapshot: { name: 'Tap repair', pricePaise: 0, priceType: 'QUOTE', durationMin: 60 },
  customer: { name: 'Ravi S', contactMasked: false, flatLabel: 'B-402' },
  allowedVerbs: [], timeline: [],
};

const detail = (over: Record<string, unknown> = {}) => ({
  job: {
    id: 'j1', code: 'JOB-0007', stage: 'QUOTED', serviceName: 'Tap repair', customerName: 'Ravi S', flatLabel: 'B-402',
    partyId: 'p9', primaryBookingId: 'b1', bookingIds: ['b1'], ...((over.job as object) ?? {}),
  },
  visits: [booking],
  quotes: [{
    id: 'q1', documentId: 'd1', number: 'QT/26-27/0003', totalPaise: 100000, validUntil: '2030-01-15T00:00:00.000Z',
    status: 'SENT', sentAt: '2030-01-08T00:00:00.000Z', sentByName: 'Owner',
    lines: [{ itemName: 'Tap washer', qty: 1, unit: 'PCS', ratePaise: 100000, discountPaise: 0, taxInclusive: true, taxRatePercent: 0, cessRatePercent: 0, taxablePaise: 100000, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, cessPaise: 0, totalPaise: 100000 }],
  }],
  gate: { status: 'NONE', consent: false },
  ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== 'job')),
});

const business = { success: true, data: { state: 'Maharashtra', isGstRegistered: true } };

// ───────────────────────────────────────────────────────── list
describe('Jobs list', () => {
  it('renders the rows and a stage chip sends `stage`', async () => {
    setRoutes({ 'GET /partners/me/jobs': { success: true, data: [row], page: 1, limit: 100, total: 1 } });
    await paper(<JobsListScreen />);
    await waitFor(() => expect(screen.getByText('JOB-0007')).toBeTruthy());
    expect(screen.getByText('Ravi S · B-402')).toBeTruthy();
    expect(screen.getByText(`QT/26-27/0003 · ₹1,000.00 · ${en.p2.jobs.quoteStatus.SENT}`)).toBeTruthy();
    expect(callsTo('GET', '/partners/me/jobs')[0].params).not.toHaveProperty('stage');

    await fireEvent.press(screen.getByLabelText(en.p2.jobs.filter.QUOTED));
    await waitFor(() => expect(callsTo('GET', '/partners/me/jobs').some((c) => (c.params as { stage?: string }).stage === 'QUOTED')).toBe(true));
  });

  it('New quote → Pick a booking → the quote screen for that booking', async () => {
    setRoutes({
      'GET /partners/me/jobs': { success: true, data: [], page: 1, limit: 100, total: 0 },
      'GET /partners/me/bookings': { success: true, data: [booking], page: 1, limit: 100, total: 1 },
    });
    await paper(<JobsListScreen />);
    await fireEvent.press(screen.getByTestId('jobs-new-quote'));
    await waitFor(() => expect(screen.getByTestId('job-pick-b1')).toBeTruthy());
    expect((callsTo('GET', '/partners/me/bookings')[0].params as { status: string }).status).toBe('ACCEPTED,SCHEDULED,RESCHEDULED,IN_PROGRESS');
    await fireEvent.press(screen.getByTestId('job-pick-b1'));
    expect(router.push).toHaveBeenCalledWith('/jobs/quote?bookingId=b1');
  });

  it('a role without JOBS_QUOTE gets no New quote', async () => {
    mockPerms.deny = new Set(['JOBS_QUOTE']);
    setRoutes({ 'GET /partners/me/jobs': { success: true, data: [row], page: 1, limit: 100, total: 1 } });
    await paper(<JobsListScreen />);
    await waitFor(() => expect(screen.getByText('JOB-0007')).toBeTruthy());
    expect(screen.queryByTestId('jobs-new-quote')).toBeNull();
  });
});

// ───────────────────────────────────────────────────────── detail
describe('Job detail', () => {
  it('an ACTIVE gate pass shows the code big, with the window and the name', async () => {
    setParams({ id: 'j1' });
    setRoutes({
      'GET /partners/me/jobs/j1': {
        success: true,
        data: detail({
          job: { stage: 'APPROVED' },
          gate: { status: 'ACTIVE', consent: true, code: '482913', validFrom: '2030-01-10T04:30:00.000Z', validTo: '2030-01-10T07:00:00.000Z', visitorName: 'Suresh' },
        }),
      },
    });
    await paper(<JobDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('job-gate-code')).toBeTruthy());
    expect(screen.getByTestId('job-gate-code')).toHaveTextContent('482913');
    expect(screen.getByText(en.p2.jobs.gate.active)).toBeTruthy();
    expect(screen.getByText(fill(en.p2.jobs.gate.visitor, { name: 'Suresh' }))).toBeTruthy();
    expect(screen.getByTestId('job-gate-refresh')).toBeTruthy();
  });

  it('a gate that is not ACTIVE shows a sentence and never a code', async () => {
    setParams({ id: 'j1' });
    setRoutes({
      'GET /partners/me/jobs/j1': { success: true, data: detail({ gate: { status: 'NOT_AVAILABLE', consent: false, reason: 'Not a visit to a society flat', code: '999999' } }) },
    });
    await paper(<JobDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('job-gate-card')).toBeTruthy());
    expect(screen.queryByTestId('job-gate-code')).toBeNull();
    expect(screen.queryByText('999999')).toBeNull();
    expect(screen.getByText(en.p2.jobs.gate.notAvailable)).toBeTruthy();
    expect(screen.getByText(fill(en.p2.jobs.gate.reason, { reason: 'Not a visit to a society flat' }))).toBeTruthy();
  });

  it('Send quote opens the quote screen prefilled from this job; hidden without JOBS_QUOTE', async () => {
    setParams({ id: 'j1' });
    setRoutes({ 'GET /partners/me/jobs/j1': { success: true, data: detail() } });
    await paper(<JobDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('job-send-quote')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('job-send-quote'));
    expect(router.push).toHaveBeenCalledWith('/jobs/quote?bookingId=b1&jobId=j1');
  });

  it('Send quote is hidden without JOBS_QUOTE', async () => {
    setParams({ id: 'j1' });
    setRoutes({ 'GET /partners/me/jobs/j1': { success: true, data: detail() } });
    mockPerms.deny = new Set(['JOBS_QUOTE']);
    await paper(<JobDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('job-add-visit')).toBeTruthy());
    expect(screen.queryByTestId('job-send-quote')).toBeNull();
  });

  it('Raise the bill posts to /:id/invoice and says how much it is above the quote', async () => {
    setParams({ id: 'j1' });
    setRoutes({
      'GET /partners/me/jobs/j1': { success: true, data: detail({ job: { stage: 'COMPLETED' } }) },
      'GET /partners/me/settings/business': business,
      'POST /partners/me/jobs/j1/invoice': {
        success: true,
        data: {
          job: { id: 'j1', stage: 'INVOICED' },
          document: { _id: 'd9', number: 'INV/26-27/0042', totals: { grandPaise: 125000 } },
          aboveQuotePaise: 25000,
        },
      },
    });
    await paper(<JobDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('job-raise-bill')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('job-raise-bill'));
    await fireEvent.press(screen.getByTestId('job-bill-save'));
    await waitFor(() => expect(callsTo('POST', '/partners/me/jobs/j1/invoice')).toHaveLength(1));
    expect(callsTo('POST', '/partners/me/jobs/j1/invoice')[0].body).toEqual({});
    const config = mockApi.post.mock.calls.find((c) => c[0] === '/partners/me/jobs/j1/invoice')?.[2] as { headers?: Record<string, string> };
    expect(config?.headers?.['Idempotency-Key']).toMatch(/^job-invoice-/);
    await waitFor(() => expect(screen.getByText(fill(en.p2.jobs.bill.aboveQuote, { amount: '₹250.00' }))).toBeTruthy());
    await fireEvent.press(screen.getByTestId('job-bill-view'));
    expect(router.push).toHaveBeenCalledWith('/(app)/billing/d9');
  });

  it('Close job needs a reason before it posts', async () => {
    setParams({ id: 'j1' });
    setRoutes({
      'GET /partners/me/jobs/j1': { success: true, data: detail() },
      'POST /partners/me/jobs/j1/close': { success: true, data: { job: { id: 'j1', stage: 'CLOSED' } } },
    });
    await paper(<JobDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('job-close')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('job-close'));
    const confirm = () => {
      const all = screen.getAllByRole('button', { name: en.p2.jobs.actions.close });
      return all[all.length - 1];
    };
    await fireEvent.press(confirm());
    expect(callsTo('POST', '/partners/me/jobs/j1/close')).toHaveLength(0);
    await fireEvent.changeText(screen.getAllByTestId('text-input-outlined')[0], 'Customer fixed it');
    await fireEvent.press(confirm());
    await waitFor(() => expect(callsTo('POST', '/partners/me/jobs/j1/close')).toHaveLength(1));
    expect(callsTo('POST', '/partners/me/jobs/j1/close')[0].body).toEqual({ reason: 'Customer fixed it' });
  });
});

// ───────────────────────────────────────────────────────── quote on the phone
const product = {
  _id: 'p1', name: 'Tap washer', unit: 'PCS', hsnCode: '8481', sellPaise: 5000, taxRatePercent: 18, taxInclusive: true,
};

describe('Quote on the phone', () => {
  const addWasher = async () => {
    await waitFor(() => expect(screen.getByTestId('job-catalogue-search')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('job-catalogue-search'), 'washer');
    const addLabel = fill(en.p2.jobs.quote.addPart, { item: 'Tap washer' });
    await waitFor(() => expect(screen.getByLabelText(addLabel)).toBeTruthy());
    await fireEvent.press(screen.getByLabelText(addLabel));
    await waitFor(() => expect(screen.getByTestId('job-line-0')).toBeTruthy());
  };

  it('a catalogue part → Send quote posts {lines, validDays} to the booking with a key, then opens the job', async () => {
    setParams({ bookingId: 'b1' });
    setRoutes({
      'GET /partners/me/bookings/b1': { success: true, data: booking },
      'GET /partners/me/settings/business': business,
      'GET /partners/me/products': { data: [product] },
      'POST /partners/me/jobs/by-booking/b1/quotes': {
        success: true, data: { job: { id: 'j1', stage: 'QUOTED' }, gate: { status: 'NONE', consent: false }, quote: { _id: 'd1', number: 'QT/26-27/0004' } },
      },
    });
    await paper(<JobQuoteScreen />);
    await addWasher();
    await fireEvent.press(screen.getByTestId('job-quote-send'));
    await waitFor(() => expect(callsTo('POST', '/partners/me/jobs/by-booking/b1/quotes')).toHaveLength(1));
    expect(callsTo('POST', '/partners/me/jobs/by-booking/b1/quotes')[0].body).toEqual({
      lines: [{
        itemId: 'p1', itemName: 'Tap washer', hsn: '8481', unit: 'PCS', qty: 1, ratePaise: 5000,
        discountPaise: 0, taxRatePercent: 18, taxInclusive: true,
      }],
      validDays: 7,
    });
    const config = mockApi.post.mock.calls.find((c) => c[0] === '/partners/me/jobs/by-booking/b1/quotes')?.[2] as { headers?: Record<string, string> };
    expect(config?.headers?.['Idempotency-Key']).toMatch(/^job-quote-/);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/jobs/j1'));
  });

  it('JOB_QUOTE_NOT_ALLOWED_NOW reads in Hindi with its {stage}', async () => {
    setParams({ bookingId: 'b1' });
    setRoutes({
      'GET /partners/me/bookings/b1': { success: true, data: booking },
      'GET /partners/me/settings/business': business,
      'GET /partners/me/products': { data: [product] },
      'POST /partners/me/jobs/by-booking/b1/quotes': fail(409, { code: 'JOB_QUOTE_NOT_ALLOWED_NOW', params: { stage: 'approved' } }),
    });
    await paper(<JobQuoteScreen />, 'hi');
    await waitFor(() => expect(screen.getByTestId('job-catalogue-search')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('job-catalogue-search'), 'washer');
    const addLabel = fill(hi.p2.jobs.quote.addPart, { item: 'Tap washer' });
    await waitFor(() => expect(screen.getByLabelText(addLabel)).toBeTruthy());
    await fireEvent.press(screen.getByLabelText(addLabel));
    await fireEvent.press(screen.getByTestId('job-quote-send'));
    await waitFor(() => expect(screen.getByText(fill(hi.errors.JOB_QUOTE_NOT_ALLOWED_NOW, { stage: 'मंज़ूर' }))).toBeTruthy());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('a role without JOBS_QUOTE cannot send a quote', async () => {
    mockPerms.deny = new Set(['JOBS_QUOTE']);
    setParams({ bookingId: 'b1' });
    await paper(<JobQuoteScreen />);
    expect(screen.getByText(en.p2.jobs.quote.denied)).toBeTruthy();
    expect(screen.queryByTestId('job-quote-send')).toBeNull();
  });
});

// ───────────────────────────────────────────────────────── Bookings tab door
describe('Send quote on the Bookings tab', () => {
  const routes = () => setRoutes({
    'GET /partners/me/bookings': { success: true, data: [{ ...booking, pricing: { basePaise: 0, visitChargePaise: 0, advancePaise: 0, totalPaise: 0 }, payment: { mode: 'CASH', status: 'PENDING' }, mode: 'AT_CUSTOMER' }], page: 1, limit: 20, total: 1 },
    'GET /partners/me/settings/business': business,
  });

  it('Jobs on: an open booking shows Send quote and opens the quote screen', async () => {
    routes();
    await paper(<BookingsTabScreen />);
    await waitFor(() => expect(screen.getByTestId('booking-send-quote-b1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('booking-send-quote-b1'));
    expect(router.push).toHaveBeenCalledWith('/jobs/quote?bookingId=b1');
  });

  it('Jobs off: no Send quote', async () => {
    mockPerms.modules = [];
    routes();
    await paper(<BookingsTabScreen />);
    await waitFor(() => expect(screen.getByText('Tap repair')).toBeTruthy());
    expect(screen.queryByTestId('booking-send-quote-b1')).toBeNull();
  });

  it('Jobs on but no JOBS_QUOTE: no Send quote', async () => {
    mockPerms.deny = new Set(['JOBS_QUOTE']);
    routes();
    await paper(<BookingsTabScreen />);
    await waitFor(() => expect(screen.getByText('Tap repair')).toBeTruthy());
    expect(screen.queryByTestId('booking-send-quote-b1')).toBeNull();
  });
});
