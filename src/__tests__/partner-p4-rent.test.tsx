/**
 * Partner P4 — the shop's "My shop rent" (CONTRACT-partner-P4 §10.8, §12 S),
 * checked against the BUILT backend routes (`partner-society-rent.routes.ts`):
 *  - the pure rules (who may look / tell, the Today card, the "I have paid" form);
 *  - notification links `/dashboard/partner/society-rent?open=<id>` and kinds RENT / LEASE;
 *  - the rent list (lease card, totals, bills, filter, `?open=`), empty state, Hindi;
 *  - a bill: UPI pay link, masked account, share text, PDF, "I have paid" (body,
 *    idempotency key, RENT_PAID_NOTE_LIMIT sentence), staff without manage;
 *  - the Today card and the More row (only with a lease).
 */
import React from 'react';
import { Alert, Linking, Share } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import MyRentScreen from '../../app/(app)/rent/index';
import RentBillScreen from '../../app/(app)/rent/[id]';
import MoreScreen from '../../app/(app)/(tabs)/more';
import { RentTodayCard } from '../features/rent/components/RentTodayCard';
import {
  hasLease, isBillId, paidFormErrors, periodText, rentAccess, rentDueCard, rupeesInput,
} from '../features/rent/logic';
import type { PartnerRentBill, PartnerRentList } from '../features/rent/types';
import { notificationDestination } from '../api/notification.api';
import { themeColors } from '../constants/colors';
import { formatI18nDate } from '../i18n';
import { formatPaise } from '../lib/money';
import { callsTo, fail, mockApi, setRoutes } from './setup/mockApi';
import { router, setParams } from './setup/mockRouter';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

// ── permissions, switchable per test
const mockPerms: { allow: Set<string> | null } = { allow: null };
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    can: (m: string) => mockPerms.allow === null || mockPerms.allow.has(m),
    hasModule: () => true,
    ready: true,
    entitlements: { isAdmin: mockPerms.allow === null, awaitingRole: false },
    menu: [],
    roleLimits: {},
  }),
}));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Ravi', phone: '9812345678' },
    profile: { role: 'PARTNER_ADMIN', tenantType: 'PARTNER', tenantId: 'p1', tenantName: 'Sharma Medicals' },
    logout: jest.fn(), availableContexts: [], switchToContext: jest.fn(),
  }),
}));
jest.mock('expo-file-system', () => {
  class Directory { exists = true; create = jest.fn(); constructor(..._a: unknown[]) {} }
  class File { uri = 'file:///cache/society-rent/RENT-1.pdf'; create = jest.fn(); write = jest.fn(); constructor(..._a: unknown[]) {} }
  return { Directory, File, Paths: { cache: 'cache' } };
});
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));

const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(String(v)), s);
const tEn = (k: string) => k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], en) as string;

const BASE = '/partners/me/society-rent';
const B1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const B2 = 'aaaaaaaaaaaaaaaaaaaaaaa2';

const bill = (over: Partial<PartnerRentBill> = {}): PartnerRentBill => ({
  id: B1, invoiceNumber: 'RENT/2026-27/0007', kind: 'RENT', leaseId: 'l1',
  periodLabel: { en: 'Oct 2026', hi: 'अक्टूबर 2026' },
  invoiceDate: '2026-10-01T00:00:00.000Z', dueDate: '2026-10-05T00:00:00.000Z',
  totalPaise: 3540000, gstPaise: 540000, outstandingPaise: 3540000, status: 'ISSUED', reverseCharge: false, overdueDays: 0,
  ...over,
});
const list = (over: Partial<PartnerRentList> = {}): PartnerRentList => ({
  leases: [{
    leaseId: 'l1', number: 'LSE-0003', societyName: 'Green Park', unitLabel: 'Shop G-2', status: 'ACTIVE',
    startDate: '2026-04-01', endDate: '2029-03-31', monthlyRentPaise: 3000000, frequency: 'MONTHLY', dueDay: 5, depositHeldPaise: 9000000,
  }],
  bills: [bill()],
  totals: { duePaise: 3540000, overduePaise: 0 },
  page: 1, pageSize: 50, total: 1,
  ...over,
});
const detail = (over: object = {}) => ({
  bill: bill(),
  lease: { leaseId: 'l1', number: 'LSE-0003', unitLabel: 'Shop G-2', societyName: 'Green Park' },
  payTo: {
    payeeName: 'Green Park CHS', upiVpa: 'greenpark@upi',
    bank: { bankName: 'HDFC Bank', accountName: 'Green Park CHS', accountNumberMasked: 'XXXXXX4321', ifsc: 'HDFC0001234' },
  },
  upi: { uri: 'upi://pay?pa=greenpark@upi&am=35400.00&tn=RENT/2026-27/0007', qrPayload: 'upi://pay?pa=greenpark@upi', amountPaise: 3540000 },
  shareText: 'Green Park: Oct 2026 for Shop G-2, bill RENT/2026-27/0007. ₹35,400.00 due by 2026-10-05.',
  ...over,
});

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockPerms.allow = null;
});

// ───────────────────────────────────────────────────────────── pure rules
describe('rent rules', () => {
  it('who may look / tell: the route\'s own guards, proprietor always', () => {
    const can = (allowed: string[] | null) => (m: string) => allowed === null || allowed.includes(m);
    expect(rentAccess(can(null))).toEqual({ canView: true, canNote: true });
    expect(rentAccess(can(['INVOICING_VIEW']))).toEqual({ canView: true, canNote: false });
    expect(rentAccess(can(['ACCOUNTS']))).toEqual({ canView: true, canNote: false });
    expect(rentAccess(can(['EXPENSES_VIEW', 'EXPENSES_MANAGE']))).toEqual({ canView: true, canNote: true });
    expect(rentAccess(can(['BOOKINGS_VIEW']))).toEqual({ canView: false, canNote: false });
  });

  it('the Today card: nothing without a lease or a due; earliest open bill; one bill opens it', () => {
    expect(rentDueCard(undefined)).toBeNull();
    expect(hasLease(list({ leases: [] }))).toBe(false);
    expect(rentDueCard(list({ leases: [], totals: { duePaise: 100, overduePaise: 0 } }))).toBeNull();
    expect(rentDueCard(list({ bills: [], totals: { duePaise: 0, overduePaise: 0 }, total: 0 }))).toBeNull();
    expect(rentDueCard(list())).toEqual({ duePaise: 3540000, overduePaise: 0, dueDate: '2026-10-05T00:00:00.000Z', overdue: false, onlyBillId: B1 });
    const two = rentDueCard(list({
      bills: [bill(), bill({ id: B2, dueDate: '2026-09-05T00:00:00.000Z', status: 'OVERDUE', overdueDays: 26 })],
      totals: { duePaise: 7080000, overduePaise: 3540000 }, total: 2,
    }));
    expect(two).toMatchObject({ dueDate: '2026-09-05T00:00:00.000Z', overdue: true, onlyBillId: undefined });
  });

  it('"I have paid" form = partnerRentPaidSchema: amount ≥ 1 paisa, reference 3–80, no future day', () => {
    expect(paidFormErrors({ amount: '35400', reference: 'UTR123456', paidOn: '2026-10-01' }, '2026-10-01')).toBeNull();
    expect(paidFormErrors({ amount: '0', reference: 'ab', paidOn: '2026-10-02' }, '2026-10-01')).toEqual({
      amount: 'rent.paid.amountInvalid', reference: 'rent.paid.referenceInvalid', paidOn: 'rent.paid.dateInvalid',
    });
    expect(paidFormErrors({ amount: '1', reference: 'x'.repeat(81), paidOn: '' }, '2026-10-01')).toEqual({ reference: 'rent.paid.referenceInvalid' });
    expect(rupeesInput(3540000)).toBe('35400');
    expect(rupeesInput(3540050)).toBe('35400.50');
    expect(rupeesInput(0)).toBe('');
    expect(periodText(bill(), 'hi')).toBe('अक्टूबर 2026');
    expect(periodText(bill(), 'en')).toBe('Oct 2026');
    expect(isBillId(B1)).toBe(true);
    expect(isBillId('../x')).toBe(false);
  });

  it('notification links and kinds land on My shop rent', () => {
    expect(notificationDestination({ link: `/dashboard/partner/society-rent?open=${B1}`, kind: 'RENT' })).toEqual({ href: `/rent/${B1}` });
    expect(notificationDestination({ link: '/dashboard/partner/society-rent', kind: 'LEASE' })).toEqual({ href: '/rent' });
    expect(notificationDestination({ link: '/dashboard/partner/society-rent?open=../../x' })).toEqual({ href: '/rent' });
    expect(notificationDestination({ kind: 'RENT' })).toEqual({ href: '/rent' });
    expect(notificationDestination({ kind: 'LEASE' })).toEqual({ href: '/rent' });
    // The society office's note kind never routes a shop anywhere.
    expect(notificationDestination({ kind: 'RENT_PAID_NOTE' })).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────── the list
describe('My shop rent — list', () => {
  it('lease card, totals and bills; asks for OPEN bills', async () => {
    setRoutes({ [`GET ${BASE}`]: { success: true, data: list() } });
    await paper(<MyRentScreen />);
    await waitFor(() => expect(screen.getByText(fill(en.rent.unitAt, { unit: 'Shop G-2', society: 'Green Park' }))).toBeTruthy());
    expect(screen.getByText(fill(en.rent.leaseNumber, { number: 'LSE-0003' }))).toBeTruthy();
    expect(screen.getByText(en.rent.leaseStatus.ACTIVE)).toBeTruthy();
    expect(screen.getByText(formatPaise(3000000))).toBeTruthy();
    expect(screen.getByText(fill(en.rent.dueDayMonthly, { day: 5 }))).toBeTruthy();
    expect(screen.getByText(formatPaise(9000000))).toBeTruthy();
    expect(screen.getAllByText(formatPaise(3540000)).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(fill(en.rent.kind.RENTFor, { period: 'Oct 2026' }))).toBeTruthy();
    expect(callsTo('GET', BASE)[0].params).toEqual({ status: 'OPEN', pageSize: 50 });

    await fireEvent.press(screen.getByTestId(`rent-bill-${B1}`));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/rent/[id]', params: { id: B1 } });
  });

  it('the Paid filter asks the server for PAID', async () => {
    setRoutes({ [`GET ${BASE}`]: (c: { params?: { status?: string } }) => ({ success: true, data: list(c.params?.status === 'PAID' ? { bills: [bill({ status: 'PAID', outstandingPaise: 0 })] } : {}) }) });
    await paper(<MyRentScreen />);
    await waitFor(() => expect(screen.getByText(en.rent.filter.PAID)).toBeTruthy());
    await fireEvent.press(screen.getByText(en.rent.filter.PAID));
    await waitFor(() => expect(callsTo('GET', BASE).some((c) => (c.params as { status: string }).status === 'PAID')).toBe(true));
    await waitFor(() => expect(screen.getAllByText(en.rent.billStatus.PAID).length).toBeGreaterThanOrEqual(2));
  });

  it('?open=<billId> from a notification opens that bill', async () => {
    setParams({ open: B2 });
    setRoutes({ [`GET ${BASE}`]: { success: true, data: list() } });
    await paper(<MyRentScreen />);
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/rent/[id]', params: { id: B2 } }));
  });

  it('no lease → the empty state', async () => {
    setRoutes({ [`GET ${BASE}`]: { success: true, data: list({ leases: [], bills: [], totals: { duePaise: 0, overduePaise: 0 }, total: 0 }) } });
    await paper(<MyRentScreen />);
    await waitFor(() => expect(screen.getByText(en.rent.noLeaseTitle)).toBeTruthy());
  });

  it('Hindi: the whole screen reads Hindi, period from the server\'s hi label', async () => {
    setRoutes({ [`GET ${BASE}`]: { success: true, data: list({ bills: [bill({ status: 'OVERDUE', overdueDays: 3 })] }) } });
    await paper(<MyRentScreen />, 'hi');
    // Wait for the DATA, not the header (the title is drawn while loading).
    await waitFor(() => expect(screen.getByText(fill(hi.rent.kind.RENTFor, { period: 'अक्टूबर 2026' }))).toBeTruthy());
    expect(screen.getByText(hi.rent.title)).toBeTruthy();
    expect(screen.getByText(fill(hi.rent.overdueDays_other, { count: 3 }))).toBeTruthy();
    expect(screen.getByText(hi.rent.leaseStatus.ACTIVE)).toBeTruthy();
    expect(screen.queryByText(en.rent.dueNow)).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────── one bill
describe('My shop rent — a bill', () => {
  beforeEach(() => setParams({ id: B1 }));

  it('UPI pay link, masked account, share text and PDF', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    setRoutes({ [`GET ${BASE}/${B1}`]: { success: true, data: detail() } });
    mockApi.get.mockClear();
    await paper(<RentBillScreen />);
    await waitFor(() => expect(screen.getAllByText('Green Park CHS').length).toBe(2));
    expect(screen.getByText('greenpark@upi')).toBeTruthy();
    expect(screen.getByText('XXXXXX4321')).toBeTruthy();
    expect(screen.getByText(en.rent.bill.maskedNote)).toBeTruthy();
    expect(screen.getByText(formatI18nDate('2026-10-05T00:00:00.000Z', tEn))).toBeTruthy();

    await fireEvent.press(screen.getByTestId('rent-pay-upi'));
    expect(open).toHaveBeenCalledWith(detail().upi.uri);

    await fireEvent.press(screen.getByTestId('rent-share'));
    expect(share).toHaveBeenCalledWith({ message: detail().shareText });

    setRoutes({ [`GET ${BASE}/${B1}`]: { success: true, data: detail() }, [`GET ${BASE}/${B1}/pdf`]: new ArrayBuffer(4) });
    await fireEvent.press(screen.getByTestId('rent-pdf'));
    const sharing = jest.requireMock('expo-sharing') as { shareAsync: jest.Mock };
    await waitFor(() => expect(sharing.shareAsync).toHaveBeenCalled());
    expect(callsTo('GET', `${BASE}/${B1}/pdf`)).toHaveLength(1);
  });

  it('"I have paid": sends the schema\'s body with one idempotency key, then says the society was told', async () => {
    setRoutes({ [`GET ${BASE}/${B1}`]: { success: true, data: detail() }, [`POST ${BASE}/${B1}/i-have-paid`]: { success: true, data: { noted: true } } });
    await paper(<RentBillScreen />);
    await waitFor(() => expect(screen.getByTestId('rent-i-have-paid')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('rent-i-have-paid'));
    await waitFor(() => expect(screen.getByTestId('rent-paid-amount')).toBeTruthy());
    expect(screen.getByDisplayValue('35400')).toBeTruthy();

    // Too-short reference → nothing sent.
    await fireEvent.changeText(screen.getByTestId('rent-paid-reference'), 'ab');
    await fireEvent.press(screen.getByTestId('rent-paid-send'));
    expect(screen.getByText(en.rent.paid.referenceInvalid)).toBeTruthy();
    expect(callsTo('POST', `${BASE}/${B1}/i-have-paid`)).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId('rent-paid-reference'), 'UTR 4455 6677');
    await fireEvent.press(screen.getByText(en.rent.paid.modes.BANK_TRANSFER));
    await fireEvent.press(screen.getByTestId('rent-paid-send'));
    await waitFor(() => expect(callsTo('POST', `${BASE}/${B1}/i-have-paid`)).toHaveLength(1));
    const body = callsTo('POST', `${BASE}/${B1}/i-have-paid`)[0].body as Record<string, unknown>;
    expect(body).toMatchObject({ amountPaise: 3540000, reference: 'UTR 4455 6677', mode: 'BANK_TRANSFER' });
    expect(body.paidOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(body).sort()).toEqual(['amountPaise', 'mode', 'paidOn', 'reference']);
    const config = mockApi.post.mock.calls[mockApi.post.mock.calls.length - 1][2] as { headers: Record<string, string> };
    expect(config.headers['Idempotency-Key']).toMatch(/^rent-paid-/);
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(en.rent.paid.doneTitle, en.rent.paid.doneBody));
  });

  it('three notes today → the RENT_PAID_NOTE_LIMIT sentence, in Hindi too', async () => {
    setRoutes({
      [`GET ${BASE}/${B1}`]: { success: true, data: detail() },
      [`POST ${BASE}/${B1}/i-have-paid`]: fail(429, { code: 'RENT_PAID_NOTE_LIMIT', error: 'server English' }),
    });
    await paper(<RentBillScreen />, 'hi');
    await waitFor(() => expect(screen.getByTestId('rent-i-have-paid')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('rent-i-have-paid'));
    await fireEvent.changeText(screen.getByTestId('rent-paid-reference'), 'UTR998877');
    await fireEvent.press(screen.getByTestId('rent-paid-send'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(hi.rent.paid.failedTitle, hi.errors.RENT_PAID_NOTE_LIMIT));
  });

  it('a bill that is not this shop\'s → the RENT_BILL_NOT_FOUND sentence', async () => {
    setRoutes({ [`GET ${BASE}/${B1}`]: fail(404, { code: 'RENT_BILL_NOT_FOUND', error: 'x' }) });
    await paper(<RentBillScreen />);
    await waitFor(() => expect(screen.getByText(en.errors.RENT_BILL_NOT_FOUND)).toBeTruthy());
  });

  it('staff who may look but not tell: no "I have paid", a pointer to the owner instead', async () => {
    mockPerms.allow = new Set(['INVOICING_VIEW']);
    setRoutes({ [`GET ${BASE}/${B1}`]: { success: true, data: detail() } });
    await paper(<RentBillScreen />);
    await waitFor(() => expect(screen.getByText(en.rent.bill.askOwner)).toBeTruthy());
    expect(screen.queryByTestId('rent-i-have-paid')).toBeNull();
  });

  it('a paid bill: no pay block, no "I have paid"', async () => {
    setRoutes({ [`GET ${BASE}/${B1}`]: { success: true, data: detail({ bill: bill({ status: 'PAID', outstandingPaise: 0 }), upi: undefined }) } });
    await paper(<RentBillScreen />);
    await waitFor(() => expect(screen.getByText(en.rent.billStatus.PAID)).toBeTruthy());
    expect(screen.queryByTestId('rent-pay-upi')).toBeNull();
    expect(screen.queryByTestId('rent-i-have-paid')).toBeNull();
    expect(screen.getByTestId('rent-pdf')).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────── entry points
describe('entry points', () => {
  it('Today card: "Rent ₹35,400.00 due 5 Oct 2026" and a tap opens the one bill', async () => {
    await paper(<RentTodayCard c={themeColors(false)} list={list()} />);
    const date = formatI18nDate('2026-10-05T00:00:00.000Z', tEn);
    expect(screen.getByText(fill(en.rent.today.titleDue, { amount: formatPaise(3540000), date }))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('rent-today-card'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/rent/[id]', params: { id: B1 } });
  });

  it('Today card: nothing due → nothing drawn', async () => {
    await paper(<RentTodayCard c={themeColors(false)} list={list({ totals: { duePaise: 0, overduePaise: 0 } })} />);
    expect(screen.queryByTestId('rent-today-card')).toBeNull();
  });

  it('More shows "My shop rent" only when the list has a lease', async () => {
    setRoutes({ [`GET ${BASE}`]: { success: true, data: list() } });
    await paper(<MoreScreen />);
    await waitFor(() => expect(screen.getByText(en.more.rows.rent)).toBeTruthy());
    await act(async () => { await fireEvent.press(screen.getByText(en.more.rows.rent)); });
    expect(router.push).toHaveBeenCalledWith('/rent');
  });

  it('More without a lease: no row', async () => {
    setRoutes({ [`GET ${BASE}`]: { success: true, data: list({ leases: [], bills: [], totals: { duePaise: 0, overduePaise: 0 }, total: 0 }) } });
    await paper(<MoreScreen />);
    await waitFor(() => expect(callsTo('GET', BASE)).toHaveLength(1));
    await waitFor(() => expect(screen.getByText(en.more.signOut)).toBeTruthy());
    expect(screen.queryByText(en.more.rows.rent)).toBeNull();
  });

  it('More for a role that may not see money: the rent list is never asked', async () => {
    mockPerms.allow = new Set(['BOOKINGS_VIEW']);
    await paper(<MoreScreen />);
    await waitFor(() => expect(screen.getByText(en.more.signOut)).toBeTruthy());
    expect(callsTo('GET', BASE)).toHaveLength(0);
  });
});
