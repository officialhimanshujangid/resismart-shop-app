/**
 * APPOINTMENTS screens with the api mocked (CONTRACT-partner-P2 §9, S):
 *  - the day diary per person: sections, time off, "Free all day";
 *  - Book now: customer → service → Now → the POST body (+05:30 instant) and
 *    an Idempotency-Key; a BOOKING_SLOT_TAKEN refusal reads in Hindi;
 *  - time off: the overlap warning → "Save anyway" resends with confirmOverlaps;
 *  - a repeating appointment body (weekdays, count XOR endDate);
 *  - Sell package body + the bill link;
 *  - no BOOKINGS_MANAGE → no Book now.
 */
import React from 'react';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import AppointmentsCalendarScreen from '../../app/(app)/appointments/index';
import BookNowScreen from '../../app/(app)/appointments/new';
import TimeOffScreen from '../../app/(app)/appointments/time-off';
import SeriesNewScreen from '../../app/(app)/appointments/series/new';
import PackagesScreen from '../../app/(app)/appointments/packages';
import { istToday } from '../features/p2/dates';
import { callsTo, fail, mockApi, setRoutes } from './setup/mockApi';
import { router, setParams } from './setup/mockRouter';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const mockPerms: { deny: Set<string> } = { deny: new Set() };
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    can: (m: string) => !mockPerms.deny.has(m),
    hasModule: () => true,
    ready: true,
    entitlements: { isAdmin: true, categoryModules: ['APPOINTMENTS'] },
    roleLimits: {},
  }),
}));

type Dict = { [k: string]: string | Dict };
/** A catalogue string by dotted path (the P2 payload is merged into en/hi by the lead). */
const tx = (cat: unknown, path: string, vars: Record<string, string | number> = {}): string => {
  const raw = path.split('.').reduce<unknown>((o, k) => (o as Dict | undefined)?.[k], cat);
  return Object.entries(vars).reduce((s, [k, v]) => s.split(`{{${k}}}`).join(String(v)), String(raw));
};
const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
const BASE = '/partners/me/appointments';

/** Only Date is faked: the grid's "Now" is 10:40 IST on Thursday 1 Oct 2026. */
const NOW = new Date('2026-10-01T05:10:00.000Z');
const fakeDateOnly = () => jest.useFakeTimers({
  now: NOW,
  doNotFake: [
    'nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
    'hrtime', 'performance',
  ],
});

const open = (day: number) => ({ day, isOpen: true, windows: [{ from: '09:00', to: '18:00' }], slotMin: 30, capacityPerSlot: 1 });
const AVAILABILITY = {
  _id: 'av1', staffId: null, timezone: 'Asia/Kolkata', weekly: [0, 1, 2, 3, 4, 5, 6].map(open), breaks: [],
  blackoutDates: [], advanceBookingDays: 30, cutoffMin: 30, isActive: true,
};
const STAFF = [{ id: 's1', name: 'Asha', canTakeBookings: true }, { id: 's2', name: 'Ravi', canTakeBookings: true }];
const calendarFor = (day: string) => ({
  success: true,
  data: {
    timezone: 'Asia/Kolkata',
    staff: STAFF,
    days: [{
      day,
      byStaff: [
        { staffId: null, bookings: [], timeOff: [] },
        {
          staffId: 's1',
          bookings: [{
            id: 'b1', code: 'BK-1', slotStart: `${day}T10:00:00+05:30`, slotEnd: `${day}T10:30:00+05:30`,
            occupiesUntil: `${day}T10:30:00+05:30`, status: 'ACCEPTED', serviceName: 'Haircut', customerName: 'Meera', seriesId: 'se1',
          }],
          timeOff: [{ id: 'o1', from: `${day}T14:00:00+05:30`, to: `${day}T18:00:00+05:30`, reason: 'Doctor' }],
        },
        { staffId: 's2', bookings: [], timeOff: [] },
      ],
    }],
  },
});
const SERVICES = { success: true, data: [{ _id: 'sv1', name: 'Haircut', durationMin: 30, modes: ['AT_PARTNER'], isActive: true, pricePaise: 20000, priceType: 'FIXED', advancePaise: 0, visitChargePaise: 0, sortOrder: 0 }] };
const PARTIES = { success: true, data: [{ _id: 'pa1', name: 'Meera Shah', phone: '9876543210', kind: 'CUSTOMER', outstandingPaise: 0, isWalkIn: false, isActive: true }] };
const commonRoutes = (day = istToday()) => ({
  [`GET ${BASE}/calendar`]: calendarFor(day),
  'GET /partners/me/services': SERVICES,
  'GET /partners/me/availability/one': { success: true, data: AVAILABILITY },
  'GET /partners/me/parties': PARTIES,
  [`GET ${BASE}/customers/pa1/summary`]: { success: true, data: { visits: 4, noShows: 1, upcoming: 0, activePackages: [] } },
});
const pickCustomer = async (lang: 'en' | 'hi' = 'en') => {
  await fireEvent.changeText(screen.getByPlaceholderText(tx(lang === 'en' ? en : hi, 'p2.common.searchCustomer')), 'Mee');
  await waitFor(() => expect(screen.getByText('Meera Shah')).toBeTruthy());
  await fireEvent.press(screen.getByText('Meera Shah'));
};

beforeEach(() => { mockPerms.deny = new Set(); setParams({}); });
afterEach(() => { jest.useRealTimers(); });

describe('Appointments — the day diary', () => {
  it('draws a section per person with bookings and time off, and "Free all day" for an empty one', async () => {
    setRoutes(commonRoutes());
    await paper(<AppointmentsCalendarScreen />);
    await waitFor(() => expect(screen.getByText('Meera')).toBeTruthy());
    expect(screen.getByTestId('appt-section-s1')).toBeTruthy();
    expect(screen.getByText('10:00–10:30')).toBeTruthy();
    expect(screen.getByText(tx(en, 'p2.appointments.cal.timeOffReason', { from: '14:00', to: '18:00', reason: 'Doctor' }))).toBeTruthy();
    expect(screen.getByTestId('appt-section-s2')).toBeTruthy();
    expect(screen.getByText(tx(en, 'p2.appointments.cal.freeAllDay'))).toBeTruthy();
    // An empty "Not assigned" is not drawn at all.
    expect(screen.queryByTestId('appt-section-none')).toBeNull();
    expect(callsTo('GET', `${BASE}/calendar`)[0].params).toEqual({ from: istToday(), to: istToday() });

    await fireEvent.press(screen.getByTestId('appt-booking-b1'));
    expect(router.push).toHaveBeenCalledWith('/(app)/(tabs)/bookings?id=b1');
  });

  it('Book now carries the chosen person', async () => {
    setRoutes(commonRoutes());
    await paper(<AppointmentsCalendarScreen />);
    await waitFor(() => expect(screen.getByText('Meera')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Ravi'));
    await fireEvent.press(screen.getByTestId('appt-book-now'));
    expect(router.push).toHaveBeenCalledWith(`/appointments/new?day=${istToday()}&staffId=s2`);
  });

  it('without BOOKINGS_MANAGE there is no Book now', async () => {
    setRoutes(commonRoutes());
    mockPerms.deny.add('BOOKINGS_MANAGE');
    await paper(<AppointmentsCalendarScreen />);
    await waitFor(() => expect(screen.getByText('Meera')).toBeTruthy());
    expect(screen.queryByTestId('appt-book-now')).toBeNull();
  });
});

describe('Book now (walk-in)', () => {
  it('customer → service → Now → Book now sends the IST instant with an Idempotency-Key', async () => {
    fakeDateOnly();
    setRoutes({ ...commonRoutes('2026-10-01'), [`POST ${BASE}/bookings`]: { success: true, data: { _id: 'b9' } } });
    await paper(<BookNowScreen />);
    await pickCustomer();
    await waitFor(() => expect(screen.getByTestId('appt-customer-summary')).toBeTruthy());
    await fireEvent.press(screen.getByText('Haircut'));
    await waitFor(() => expect(screen.getByTestId('appt-now')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('appt-now'));
    await fireEvent.press(screen.getByTestId('appt-save'));

    await waitFor(() => expect(callsTo('POST', `${BASE}/bookings`)).toHaveLength(1));
    expect(callsTo('POST', `${BASE}/bookings`)[0].body).toEqual({
      partyId: 'pa1', serviceId: 'sv1', slotStart: '2026-10-01T10:30:00+05:30', mode: 'AT_PARTNER', notifyCustomer: true,
    });
    const config = mockApi.post.mock.calls[mockApi.post.mock.calls.length - 1][2] as { headers: Record<string, string> };
    expect(config.headers['Idempotency-Key']).toMatch(/^appt-book-/);
  });

  it('BOOKING_SLOT_TAKEN reads in Hindi, and a retry of the same booking reuses the key', async () => {
    fakeDateOnly();
    setRoutes({ ...commonRoutes('2026-10-01'), [`POST ${BASE}/bookings`]: fail(409, { code: 'BOOKING_SLOT_TAKEN' }) });
    await paper(<BookNowScreen />, 'hi');
    await pickCustomer('hi');
    await fireEvent.press(screen.getByText('Haircut'));
    await waitFor(() => expect(screen.getByTestId('appt-now')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('appt-now'));
    await fireEvent.press(screen.getByTestId('appt-save'));
    await waitFor(() => expect(screen.getByText(hi.errors.BOOKING_SLOT_TAKEN)).toBeTruthy());

    await fireEvent.press(screen.getByTestId('appt-save'));
    await waitFor(() => expect(callsTo('POST', `${BASE}/bookings`)).toHaveLength(2));
    const keys = mockApi.post.mock.calls.slice(-2).map((c) => (c[2] as { headers: Record<string, string> }).headers['Idempotency-Key']);
    expect(keys[0]).toBe(keys[1]);
  });
});

describe('Book now — package choice', () => {
  it('offers only the packages that cover the chosen service (serviceIds), and sends the chosen one', async () => {
    fakeDateOnly();
    const pkgLabel = (name: string) => tx(en, 'p2.appointments.new.usePackage_other', { name, count: 3 });
    setRoutes({
      ...commonRoutes('2026-10-01'),
      [`GET ${BASE}/customers/pa1/summary`]: {
        success: true,
        data: {
          visits: 4, noShows: 0, upcoming: 0,
          activePackages: [
            { id: 'pp1', name: 'Haircut x5', remaining: 3, expiresAt: '2026-12-01T00:00:00.000Z', serviceIds: ['sv1'] },
            { id: 'pp2', name: 'Facial x5', remaining: 3, expiresAt: '2026-12-01T00:00:00.000Z', serviceIds: ['sv2'] },
          ],
        },
      },
      [`POST ${BASE}/bookings`]: { success: true, data: { _id: 'b9' } },
    });
    await paper(<BookNowScreen />);
    await pickCustomer();
    await waitFor(() => expect(screen.getByLabelText(pkgLabel('Facial x5'))).toBeTruthy());
    await fireEvent.press(screen.getByText('Haircut'));
    expect(screen.queryByLabelText(pkgLabel('Facial x5'))).toBeNull();
    await fireEvent.press(screen.getByLabelText(pkgLabel('Haircut x5')));
    await waitFor(() => expect(screen.getByTestId('appt-now')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('appt-now'));
    await fireEvent.press(screen.getByTestId('appt-save'));
    await waitFor(() => expect(callsTo('POST', `${BASE}/bookings`)).toHaveLength(1));
    expect(callsTo('POST', `${BASE}/bookings`)[0].body).toMatchObject({ serviceId: 'sv1', packagePurchaseId: 'pp1' });
  });
});

describe('Time off', () => {
  it('bookings in the way → the count sentence → Save anyway resends with confirmOverlaps', async () => {
    setRoutes({
      ...commonRoutes(),
      [`GET ${BASE}/time-off`]: { success: true, data: [] },
      [`POST ${BASE}/time-off`]: (call: { body?: unknown }) => ((call.body as { confirmOverlaps?: boolean }).confirmOverlaps
        ? { success: true, data: { id: 'o9', staffId: 's1', from: '', to: '', createdByName: 'Owner', createdAt: '' } }
        : fail(409, { code: 'STAFF_TIME_OFF_OVERLAPS_BOOKINGS', params: { count: '2' } })),
    });
    await paper(<TimeOffScreen />);
    await waitFor(() => expect(screen.getByText(tx(en, 'p2.appointments.timeOff.empty'))).toBeTruthy());
    await fireEvent.press(screen.getByTestId('timeoff-add'));
    await waitFor(() => expect(screen.getByLabelText('Asha')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Asha'));
    await fireEvent.changeText(screen.getByTestId('timeoff-reason'), 'Doctor');
    await fireEvent.press(screen.getByTestId('timeoff-save'));
    await waitFor(() => expect(screen.getByText(tx(en, 'errors.STAFF_TIME_OFF_OVERLAPS_BOOKINGS', { count: 2 }))).toBeTruthy());
    const firstBody = callsTo('POST', `${BASE}/time-off`)[0].body as Record<string, unknown>;
    expect(firstBody).toEqual({
      staffId: 's1', from: `${istToday()}T10:00:00+05:30`, to: `${istToday()}T18:00:00+05:30`, reason: 'Doctor',
    });

    await fireEvent.press(screen.getByTestId('timeoff-save-anyway'));
    await waitFor(() => expect(callsTo('POST', `${BASE}/time-off`)).toHaveLength(2));
    expect(callsTo('POST', `${BASE}/time-off`)[1].body).toEqual({ ...firstBody, confirmOverlaps: true });
  });
});

describe('Repeating appointment', () => {
  it('sends the weekdays sorted and a count (no endDate), then lists what was skipped', async () => {
    fakeDateOnly();
    setRoutes({
      ...commonRoutes('2026-10-01'),
      [`POST ${BASE}/series`]: {
        success: true,
        data: {
          series: { id: 'se1', code: 'SER-0001' },
          created: ['b1', 'b2'],
          skipped: [{ date: '2026-10-05', reason: 'Somebody just took that slot.' }],
        },
      },
    });
    await paper(<SeriesNewScreen />);
    await pickCustomer();
    await fireEvent.press(screen.getByText('Haircut'));
    await fireEvent.press(screen.getByLabelText(en.common.days['4']));
    await fireEvent.press(screen.getByLabelText(en.common.days['1']));
    await waitFor(() => expect(screen.getByLabelText('10:00')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('10:00'));
    await fireEvent.press(screen.getByTestId('series-save'));

    await waitFor(() => expect(callsTo('POST', `${BASE}/series`)).toHaveLength(1));
    const body = callsTo('POST', `${BASE}/series`)[0].body as Record<string, unknown>;
    expect(body).toEqual({
      partyId: 'pa1', serviceId: 'sv1', mode: 'AT_PARTNER',
      rule: { freq: 'WEEKLY', interval: 1, weekdays: [1, 4], time: '10:00' },
      startDate: '2026-10-01', count: 8,
    });
    expect('endDate' in body).toBe(false);
    const config = mockApi.post.mock.calls[mockApi.post.mock.calls.length - 1][2] as { headers: Record<string, string> };
    expect(config.headers['Idempotency-Key']).toMatch(/^appt-series-/);
    await waitFor(() => expect(screen.getByText(tx(en, 'p2.appointments.series.created_other', { count: 2 }))).toBeTruthy());
    expect(screen.getByText(/Somebody just took that slot\./)).toBeTruthy();
  });
});

describe('Sell package', () => {
  it('sends the customer + issue, shows the bill number and opens the bill', async () => {
    setRoutes({
      ...commonRoutes(),
      [`GET ${BASE}/packages`]: { success: true, data: [{ id: 'pk1', name: 'Facial x5', serviceIds: ['sv1'], sessions: 5, pricePaise: 250000, validityDays: 90, taxRatePercent: 18, isActive: true, createdAt: '', updatedAt: '' }] },
      [`POST ${BASE}/packages/pk1/sell`]: {
        success: true,
        data: { purchase: { id: 'pp1', documentId: 'd1' }, document: { _id: 'd1', number: 'INV/26-27/0042', status: 'ISSUED' } },
      },
    });
    await paper(<PackagesScreen />);
    await waitFor(() => expect(screen.getByTestId('package-sell-pk1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('package-sell-pk1'));
    await pickCustomer();
    await fireEvent.press(screen.getByTestId('sell-confirm'));

    await waitFor(() => expect(callsTo('POST', `${BASE}/packages/pk1/sell`)).toHaveLength(1));
    expect(callsTo('POST', `${BASE}/packages/pk1/sell`)[0].body).toEqual({ partyId: 'pa1', issue: true });
    const config = mockApi.post.mock.calls[mockApi.post.mock.calls.length - 1][2] as { headers: Record<string, string> };
    expect(config.headers['Idempotency-Key']).toMatch(/^appt-pkg-sell-/);
    await waitFor(() => expect(screen.getByText(tx(en, 'p2.appointments.packages.sold', { number: 'INV/26-27/0042' }))).toBeTruthy());
    await fireEvent.press(screen.getByTestId('sell-view-bill'));
    expect(router.push).toHaveBeenCalledWith('/(app)/billing/d1');
  });

  it('no INVOICING_MANAGE → no Sell package', async () => {
    mockPerms.deny.add('INVOICING_MANAGE');
    setRoutes({
      ...commonRoutes(),
      [`GET ${BASE}/packages`]: { success: true, data: [{ id: 'pk1', name: 'Facial x5', serviceIds: ['sv1'], sessions: 5, pricePaise: 250000, validityDays: 90, taxRatePercent: 18, isActive: true, createdAt: '', updatedAt: '' }] },
    });
    await paper(<PackagesScreen />);
    await waitFor(() => expect(screen.getByText('Facial x5')).toBeTruthy());
    expect(screen.queryByTestId('package-sell-pk1')).toBeNull();
  });
});
