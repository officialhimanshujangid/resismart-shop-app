/**
 * Partner P2 subscriptions + tuition screens with the api mocked (CONTRACT-partner-P2 §8):
 *  - the delivery round: one tap marks delivered, "Not delivered", "All delivered"
 *    after a confirm, marks kept on the phone while offline and sent when the
 *    signal is back, a refused op read in Hindi;
 *  - attendance: All present → Save sends the day's entries;
 *  - monthly bills: Make the bills sends the month;
 *  - the hub: a delivery boy with only DELIVERIES_MARK sees his door and no list.
 */
import React from 'react';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';

import DeliveriesScreen from '../../app/(app)/subscriptions/deliveries';
import AttendanceScreen from '../../app/(app)/subscriptions/attendance';
import BillsScreen from '../../app/(app)/subscriptions/bills';
import SubscriptionsHub from '../../app/(app)/subscriptions/index';
import SubscriptionDetailScreen from '../../app/(app)/subscriptions/[id]';
import RoutesScreen from '../../app/(app)/subscriptions/routes';
import { callsTo, fail, setRoutes } from './setup/mockApi';
import { setParams } from './setup/mockRouter';
import { renderScreen } from './setup/harness';
import { istToday } from '../features/p2/dates';
import { markQueueKey } from '../features/subscriptions/useMarkQueue';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const mockPerms: { deny: Set<string> } = { deny: new Set() };
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    can: (m: string) => !mockPerms.deny.has(m),
    hasModule: () => true,
    ready: true,
    entitlements: { isAdmin: true, categoryModules: ['SUBSCRIPTIONS'] },
    roleLimits: {},
  }),
}));

// The signed-in business (the delivery queue is kept per business).
const mockAuth: { profile: { tenantId: string } | null } = { profile: { tenantId: 'biz1' } };
jest.mock('../context/AuthContext', () => ({
  ...jest.requireActual('../context/AuthContext'),
  useAuth: () => mockAuth,
}));
const QKEY = 'resismart.submarks.queue.biz1';

const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(String(v)), s);
const pressAlertButton = async (label: string) => {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const buttons = calls[calls.length - 1][2] as { text: string; onPress?: () => void }[];
  await act(async () => { buttons.find((b) => b.text === label)!.onPress!(); });
};

const S = en.p2.subscriptions;
const BASE = '/partners/me/subscriptions';

beforeEach(async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockPerms.deny = new Set();
  mockAuth.profile = { tenantId: 'biz1' };
  await AsyncStorage.clear();
});

// ─────────────────────────────────────────────────────── the delivery round
const sheet = (day: string) => ({
  success: true,
  data: {
    day,
    rows: [
      { subscriptionId: 's1', code: 'SUB-0001', customerName: 'Asha Rao', flatLabel: 'A-101',
        lines: [{ lineKey: 'L1', itemName: 'Milk', qty: 1, unit: 'L' }], state: 'DUE' },
      { subscriptionId: 's2', code: 'SUB-0002', customerName: 'Vikram Shah', flatLabel: 'A-102',
        lines: [{ lineKey: 'L1', itemName: 'Milk', qty: 2, unit: 'L' }], state: 'PAUSED', pausedBy: 'CUSTOMER' },
    ],
    loadingList: [{ itemName: 'Milk', unit: 'L', qty: 1 }],
  },
});
const deliveryRoutes = (markAnswer: unknown = { success: true, data: { saved: 1 } }) => {
  setRoutes({
    [`GET ${BASE}/routes`]: { success: true, data: [{ _id: 'r1', kind: 'ROUTE', name: 'Tower A', isActive: true }] },
    [`GET ${BASE}/deliveries`]: sheet(istToday()),
    [`POST ${BASE}/deliveries/mark`]: markAnswer,
    [`POST ${BASE}/deliveries/mark-all`]: { success: true, data: { saved: 1 } },
  });
};

describe('Delivery round', () => {
  it('one tap on a due row sends it as delivered', async () => {
    setParams({ routeId: 'r1' });
    deliveryRoutes();
    await paper(<DeliveriesScreen />);
    await waitFor(() => expect(screen.getByTestId('delivery-row-s1')).toBeTruthy());
    expect(screen.getByText('A-101')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('delivery-row-s1'));
    await waitFor(() => expect(callsTo('POST', `${BASE}/deliveries/mark`)).toHaveLength(1));
    expect(callsTo('POST', `${BASE}/deliveries/mark`)[0].body).toEqual({
      day: istToday(), entries: [{ subscriptionId: 's1', status: 'DELIVERED' }],
    });
    expect(callsTo('GET', `${BASE}/deliveries`)[0].params).toEqual({ day: istToday(), routeId: 'r1' });
  });

  it('"Not delivered" sends NOT_DELIVERED', async () => {
    deliveryRoutes();
    await paper(<DeliveriesScreen />);
    await waitFor(() => expect(screen.getByTestId('not-delivered-s1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('not-delivered-s1'));
    await waitFor(() => expect(callsTo('POST', `${BASE}/deliveries/mark`)).toHaveLength(1));
    expect(callsTo('POST', `${BASE}/deliveries/mark`)[0].body).toEqual({
      day: istToday(), entries: [{ subscriptionId: 's1', status: 'NOT_DELIVERED' }],
    });
  });

  it('a paused row is marked only by "Delivered anyway"', async () => {
    deliveryRoutes();
    await paper(<DeliveriesScreen />);
    await waitFor(() => expect(screen.getByTestId('delivered-anyway-s2')).toBeTruthy());
    expect(screen.queryByTestId('not-delivered-s2')).toBeNull();
    await fireEvent.press(screen.getByTestId('delivery-row-s2'));
    expect(callsTo('POST', `${BASE}/deliveries/mark`)).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('delivered-anyway-s2'));
    await waitFor(() => expect(callsTo('POST', `${BASE}/deliveries/mark`)).toHaveLength(1));
    expect(callsTo('POST', `${BASE}/deliveries/mark`)[0].body).toEqual({
      day: istToday(), entries: [{ subscriptionId: 's2', status: 'DELIVERED' }],
    });
  });

  it('"All delivered" for the route is sent after the confirm', async () => {
    setParams({ routeId: 'r1' });
    deliveryRoutes();
    await paper(<DeliveriesScreen />);
    await waitFor(() => expect(screen.getByTestId('all-delivered')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('all-delivered'));
    expect(callsTo('POST', `${BASE}/deliveries/mark-all`)).toHaveLength(0);
    await pressAlertButton(S.deliveries.allDelivered);
    await waitFor(() => expect(callsTo('POST', `${BASE}/deliveries/mark-all`)).toHaveLength(1));
    expect(callsTo('POST', `${BASE}/deliveries/mark-all`)[0].body).toEqual({ day: istToday(), routeId: 'r1' });
  });

  it('without a route there is no "All delivered"', async () => {
    deliveryRoutes();
    await paper(<DeliveriesScreen />);
    await waitFor(() => expect(screen.getByTestId('delivery-row-s1')).toBeTruthy());
    expect(screen.queryByTestId('all-delivered')).toBeNull();
  });

  it('offline, the mark stays on the phone and is sent when the signal is back', async () => {
    deliveryRoutes();
    await paper(<DeliveriesScreen />);
    await waitFor(() => expect(screen.getByTestId('delivery-row-s1')).toBeTruthy());
    await act(async () => { onlineManager.setOnline(false); });
    await fireEvent.press(screen.getByTestId('delivery-row-s1'));
    await waitFor(() => expect(screen.getByTestId('marks-waiting')).toBeTruthy());
    expect(screen.getByTestId('delivery-state-s1')).toHaveTextContent(`${S.state.DELIVERED} ⏳`);
    expect(callsTo('POST', `${BASE}/deliveries/mark`)).toHaveLength(0);
    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem(QKEY)) ?? '{}');
      expect(saved.pending).toEqual([{ kind: 'MARK', day: istToday(), entries: [{ subscriptionId: 's1', status: 'DELIVERED' }] }]);
    });
    await act(async () => { onlineManager.setOnline(true); });
    await waitFor(() => expect(callsTo('POST', `${BASE}/deliveries/mark`)).toHaveLength(1));
  });

  it('a refused mark is dropped and its reason reads in Hindi', async () => {
    deliveryRoutes(fail(409, { code: 'DELIVERY_DAY_OUT_OF_RANGE', params: { days: '7' } }));
    await paper(<DeliveriesScreen />, 'hi');
    await waitFor(() => expect(screen.getByTestId('delivery-row-s1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('delivery-row-s1'));
    await waitFor(() => expect(screen.getByTestId('mark-refused')).toHaveTextContent(fill(hi.errors.DELIVERY_DAY_OUT_OF_RANGE, { days: 7 }), { exact: false }));
    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem(QKEY)) ?? '{}');
      expect(saved.pending).toEqual([]);
      expect(saved.inFlight).toBeNull();
      expect(saved.refused).toHaveLength(1);
    });
  });

  it('a per-entry answer drops only the refused home, named, and keeps the rest as sent', async () => {
    deliveryRoutes({
      success: true,
      data: {
        saved: 1,
        applied: [{ index: 1, key: 's2', status: 'DELIVERED' }],
        refused: [{ index: 0, key: 's1', code: 'SUBSCRIPTION_PERIOD_BILLED', message: 'billed', params: { period: '2026-09', number: 'INV/26-27/0009' } }],
      },
    });
    await paper(<DeliveriesScreen />);
    await waitFor(() => expect(screen.getByTestId('delivery-row-s1')).toBeTruthy());
    await act(async () => { onlineManager.setOnline(false); });
    await fireEvent.press(screen.getByTestId('delivery-row-s1'));
    await fireEvent.press(screen.getByTestId('delivered-anyway-s2'));
    await act(async () => { onlineManager.setOnline(true); });
    await waitFor(() => expect(callsTo('POST', `${BASE}/deliveries/mark`)).toHaveLength(1));
    expect(callsTo('POST', `${BASE}/deliveries/mark`)[0].body).toEqual({
      day: istToday(),
      entries: [{ subscriptionId: 's1', status: 'DELIVERED' }, { subscriptionId: 's2', status: 'DELIVERED' }],
    });
    const sentence = fill(en.errors.SUBSCRIPTION_PERIOD_BILLED, { period: '2026-09', number: 'INV/26-27/0009' });
    await waitFor(() => expect(screen.getByTestId('mark-refused')).toHaveTextContent(`A-101: ${sentence}`, { exact: false }));
    expect(screen.getAllByTestId('mark-refused')).toHaveLength(1);
    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem(QKEY)) ?? '{}');
      expect(saved.pending).toEqual([]);
      expect(saved.inFlight).toBeNull();
      expect(saved.refused).toEqual([{
        op: { kind: 'MARK', day: istToday(), entries: [{ subscriptionId: 's1', status: 'DELIVERED' }] },
        code: 'SUBSCRIPTION_PERIOD_BILLED', message: sentence,
      }]);
    });
  });

  it('every entry refused (409 with data.refused): each is recorded with its own sentence', async () => {
    deliveryRoutes(fail(409, {
      code: 'DELIVERY_NOT_SCHEDULED', params: { day: '2026-10-01' },
      data: { saved: 0, applied: [], refused: [{ index: 0, key: 's1', code: 'DELIVERY_NOT_SCHEDULED', message: 'x', params: { day: '2026-10-01' } }] },
    }));
    await paper(<DeliveriesScreen />, 'hi');
    await waitFor(() => expect(screen.getByTestId('delivery-row-s1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('delivery-row-s1'));
    await waitFor(() => expect(screen.getByTestId('mark-refused'))
      .toHaveTextContent(fill(hi.errors.DELIVERY_NOT_SCHEDULED, { day: '2026-10-01' }), { exact: false }));
    expect(screen.queryByTestId('mark-queue-error')).toBeNull();
  });

  it('keeps the queue per business, and the old key when the business is not known', async () => {
    deliveryRoutes();
    await paper(<DeliveriesScreen />);
    await waitFor(() => expect(screen.getByTestId('delivery-row-s1')).toBeTruthy());
    await act(async () => { onlineManager.setOnline(false); });
    await fireEvent.press(screen.getByTestId('delivery-row-s1'));
    await waitFor(async () => expect(await AsyncStorage.getItem(QKEY)).toContain('"s1"'));
    expect(await AsyncStorage.getItem('resismart.submarks.queue')).toBeNull();
    expect(markQueueKey('biz2')).toBe('resismart.submarks.queue.biz2');
    expect(markQueueKey(undefined)).toBe('resismart.submarks.queue');
    // Let the queued mark go out inside THIS test, not into the next one's call log.
    await act(async () => { onlineManager.setOnline(true); });
    await waitFor(() => expect(callsTo('POST', `${BASE}/deliveries/mark`)).toHaveLength(1));
  });

  it('a person who may only view sees the round but cannot mark it', async () => {
    mockPerms.deny = new Set(['DELIVERIES_MARK']);
    deliveryRoutes();
    await paper(<DeliveriesScreen />);
    await waitFor(() => expect(screen.getByTestId('delivery-row-s1')).toBeTruthy());
    expect(screen.getByText(S.deliveries.viewOnly)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('delivery-row-s1'));
    expect(callsTo('POST', `${BASE}/deliveries/mark`)).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────── attendance
describe('Attendance', () => {
  it('All present, then Save sends the class days only', async () => {
    setRoutes({
      [`GET ${BASE}/routes`]: { success: true, data: [] },
      [`GET ${BASE}/attendance`]: {
        success: true,
        data: {
          day: istToday(),
          rows: [
            { subscriptionId: 't1', code: 'SUB-0010', customerName: 'Riya', classDay: true },
            { subscriptionId: 't2', code: 'SUB-0011', customerName: 'Kabir', classDay: false },
            { subscriptionId: 't3', code: 'SUB-0012', customerName: 'Meera', classDay: true },
          ],
        },
      },
      [`POST ${BASE}/attendance/mark`]: { success: true, data: { saved: 2 } },
    });
    await paper(<AttendanceScreen />);
    await waitFor(() => expect(screen.getByTestId('all-present')).toBeTruthy());
    expect(screen.getByTestId('att-t2-PRESENT')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('all-present'));
    await fireEvent.press(screen.getByTestId('att-t3-LEAVE'));
    await fireEvent.press(screen.getByTestId('attendance-save'));
    await waitFor(() => expect(callsTo('POST', `${BASE}/attendance/mark`)).toHaveLength(1));
    expect(callsTo('POST', `${BASE}/attendance/mark`)[0].body).toEqual({
      day: istToday(),
      entries: [{ subscriptionId: 't1', status: 'PRESENT' }, { subscriptionId: 't3', status: 'LEAVE' }],
    });
  });

  it('a day that is not a class day is said in Hindi', async () => {
    setRoutes({
      [`GET ${BASE}/routes`]: { success: true, data: [] },
      [`GET ${BASE}/attendance`]: {
        success: true,
        data: { day: istToday(), rows: [{ subscriptionId: 't1', code: 'SUB-0010', customerName: 'Riya', classDay: true }] },
      },
      [`POST ${BASE}/attendance/mark`]: fail(409, { code: 'ATTENDANCE_NOT_A_CLASS_DAY' }),
    });
    await paper(<AttendanceScreen />, 'hi');
    await waitFor(() => expect(screen.getByTestId('att-t1-ABSENT')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('att-t1-ABSENT'));
    await fireEvent.press(screen.getByTestId('attendance-save'));
    await waitFor(() => expect(screen.getByTestId('attendance-error')).toHaveTextContent(hi.errors.ATTENDANCE_NOT_A_CLASS_DAY));
  });
});

// ─────────────────────────────────────────────────────────── bills
describe('Monthly bills', () => {
  it('"Make the bills" sends the month after the confirm and shows the result', async () => {
    setParams({ period: '2026-09' });
    setRoutes({
      [`GET ${BASE}/bills`]: { success: true, data: [
        { id: 'b1', subscriptionId: 's1', code: 'SUB-0001', customerName: 'Asha Rao', period: '2026-09', status: 'FAILED', errorCode: 'PLAN_LIMIT_REACHED', attempts: 1 },
      ] },
      [`POST ${BASE}/bills/run`]: { success: true, data: { results: [
        { subscriptionId: 's1', status: 'ISSUED', number: 'INV/26-27/0009' },
        { subscriptionId: 's2', status: 'SKIPPED', code: 'SUBSCRIPTION_BILL_NOTHING_TO_BILL' },
      ] } },
      [`POST ${BASE}/bills/b1/retry`]: { success: true, data: { results: [{ subscriptionId: 's1', status: 'ISSUED', number: 'INV/26-27/0010' }] } },
    });
    await paper(<BillsScreen />);
    await waitFor(() => expect(screen.getByTestId('bill-b1')).toBeTruthy());
    expect(callsTo('GET', `${BASE}/bills`)[0].params).toEqual({ period: '2026-09' });
    await fireEvent.press(screen.getByTestId('bills-run'));
    await pressAlertButton(S.bills.run);
    await waitFor(() => expect(callsTo('POST', `${BASE}/bills/run`)).toHaveLength(1));
    expect(callsTo('POST', `${BASE}/bills/run`)[0].body).toEqual({ period: '2026-09' });
    await waitFor(() => expect(screen.getByTestId('bills-summary')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('bill-retry-b1'));
    await waitFor(() => expect(callsTo('POST', `${BASE}/bills/b1/retry`)).toHaveLength(1));
  });

  it('without INVOICING_MANAGE there is no "Make the bills"', async () => {
    mockPerms.deny = new Set(['INVOICING_MANAGE']);
    setRoutes({ [`GET ${BASE}/bills`]: { success: true, data: [] } });
    await paper(<BillsScreen />);
    await waitFor(() => expect(screen.getByText(S.bills.empty)).toBeTruthy());
    expect(screen.queryByTestId('bills-run')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────── the hub
describe('Subscriptions hub', () => {
  it('a delivery boy with only DELIVERIES_MARK sees his door and no subscription list', async () => {
    mockPerms.deny = new Set(['SUBSCRIPTIONS_VIEW', 'SUBSCRIPTIONS_MANAGE', 'ATTENDANCE_MARK']);
    await paper(<SubscriptionsHub />);
    expect(screen.getByTestId('door-deliveries')).toBeTruthy();
    expect(screen.queryByTestId('door-attendance')).toBeNull();
    expect(screen.queryByTestId('sub-new')).toBeNull();
    expect(screen.queryByTestId('sub-search')).toBeNull();
    expect(callsTo('GET', BASE)).toHaveLength(0);
  });

  it('a manager sees the list with today\'s state and the month so far', async () => {
    setRoutes({
      [`GET ${BASE}`]: {
        success: true,
        data: [{ id: 's1', code: 'SUB-0001', customerName: 'Asha Rao', flatLabel: 'A-101', title: 'Morning milk', kind: 'DAIRY',
          status: 'ACTIVE', routeName: 'Tower A', todayState: 'DUE', monthToDate: { deliveries: 3, amountPaise: 16800 } }],
        page: 1, limit: 100, total: 1,
      },
    });
    await paper(<SubscriptionsHub />);
    await waitFor(() => expect(screen.getByTestId('sub-row-s1')).toBeTruthy());
    expect(screen.getByTestId('sub-new')).toBeTruthy();
    expect(screen.getByText(S.state.DUE)).toBeTruthy();
    expect(callsTo('GET', BASE)[0].params).toEqual({ status: 'ACTIVE', limit: 100 });
  });
});

// ─────────────────────────────────────────────── change / edit a subscription
const detail = {
  success: true,
  data: {
    subscription: {
      _id: 'sub1', code: 'SUB-0001', partyId: 'p1', customerName: 'Asha Rao', flatLabel: 'A-101', kind: 'DAIRY',
      title: 'Morning milk', status: 'ACTIVE', startDate: '2026-09-01',
      revisions: [{
        effectiveFrom: '2026-09-01',
        lines: [{ lineKey: 'L1', itemName: 'Milk', unit: 'L', qty: 1, ratePaise: 5600, taxRatePercent: 0 }],
        schedule: { pattern: 'DAILY' }, billing: { mode: 'PER_DELIVERY', timing: 'ARREARS' },
      }],
    },
    month: { period: istToday().slice(0, 7), days: [], lines: [], amountPaise: 0, deliveredDays: 0 },
    pauses: [],
    bills: [],
  },
};

describe('Change and edit a subscription', () => {
  it('"Change" sends only what changed, from the chosen day', async () => {
    setParams({ id: 'sub1' });
    setRoutes({
      [`GET ${BASE}/sub1`]: detail,
      [`GET ${BASE}/routes`]: { success: true, data: [] },
      [`POST ${BASE}/sub1/revise`]: { success: true, data: detail.data.subscription },
    });
    await paper(<SubscriptionDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('sub-revise')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('sub-revise'));
    await fireEvent.press(screen.getByLabelText(S.schedule.ALTERNATE));
    await fireEvent.press(screen.getByTestId('revise-save'));
    await waitFor(() => expect(callsTo('POST', `${BASE}/sub1/revise`)).toHaveLength(1));
    expect(callsTo('POST', `${BASE}/sub1/revise`)[0].body).toEqual({ effectiveFrom: istToday(), schedule: { pattern: 'ALTERNATE' } });
  });

  it('a change inside a billed month is refused with the month and the bill', async () => {
    setParams({ id: 'sub1' });
    setRoutes({
      [`GET ${BASE}/sub1`]: detail,
      [`GET ${BASE}/routes`]: { success: true, data: [] },
      [`POST ${BASE}/sub1/revise`]: fail(409, { code: 'SUBSCRIPTION_PERIOD_BILLED', params: { period: '2026-09', number: 'INV/26-27/0009' } }),
    });
    await paper(<SubscriptionDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('sub-revise')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('sub-revise'));
    await fireEvent.press(screen.getByLabelText(S.schedule.ALTERNATE));
    await fireEvent.press(screen.getByTestId('revise-save'));
    await waitFor(() => expect(screen.getByTestId('revise-error'))
      .toHaveTextContent(fill(en.errors.SUBSCRIPTION_PERIOD_BILLED, { period: '2026-09', number: 'INV/26-27/0009' }), { exact: false }));
  });

  it('"Edit" sends only the changed fields (auto-issue off)', async () => {
    setParams({ id: 'sub1' });
    setRoutes({
      [`GET ${BASE}/sub1`]: detail,
      [`GET ${BASE}/routes`]: { success: true, data: [] },
      [`PUT ${BASE}/sub1`]: { success: true, data: detail.data.subscription },
    });
    await paper(<SubscriptionDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('sub-edit')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('sub-edit'));
    await fireEvent.press(screen.getByLabelText(S.edit.auto.NO));
    await fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(callsTo('PUT', `${BASE}/sub1`)).toHaveLength(1));
    expect(callsTo('PUT', `${BASE}/sub1`)[0].body).toEqual({ autoIssue: false });
  });

  it('without SUBSCRIPTIONS_MANAGE there is no Change or Edit', async () => {
    mockPerms.deny = new Set(['SUBSCRIPTIONS_MANAGE']);
    setParams({ id: 'sub1' });
    setRoutes({ [`GET ${BASE}/sub1`]: detail, [`GET ${BASE}/routes`]: { success: true, data: [] } });
    await paper(<SubscriptionDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('sub-header')).toBeTruthy());
    expect(screen.queryByTestId('sub-revise')).toBeNull();
    expect(screen.queryByTestId('sub-edit')).toBeNull();
  });
});

// ─────────────────────────────────────────────────────── walking order
describe('Route walking order', () => {
  it('reads the route stops in walking order, moves a home and saves', async () => {
    setRoutes({
      [`GET ${BASE}/routes`]: { success: true, data: [{ _id: 'r1', kind: 'ROUTE', name: 'Tower A', isActive: true }] },
      [`GET ${BASE}/routes/r1/stops`]: { success: true, data: { route: { id: 'r1' }, stops: [
        { subscriptionId: 's2', code: 'SUB-0002', customerName: 'C s2', flatLabel: 'A-102', order: 0 },
        { subscriptionId: 's1', code: 'SUB-0001', customerName: 'C s1', flatLabel: 'A-101', order: 1 },
      ] } },
      [`PUT ${BASE}/routes/r1/order`]: { success: true, data: { updated: 2 } },
    });
    await paper(<RoutesScreen />);
    await waitFor(() => expect(screen.getByTestId('route-order-r1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('route-order-r1'));
    await waitFor(() => expect(screen.getByTestId('order-down-s2')).toBeTruthy());
    expect(callsTo('GET', BASE)).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('order-down-s2'));
    await fireEvent.press(screen.getByTestId('route-order-save'));
    await waitFor(() => expect(callsTo('PUT', `${BASE}/routes/r1/order`)).toHaveLength(1));
    expect(callsTo('PUT', `${BASE}/routes/r1/order`)[0].body).toEqual({ subscriptionIds: ['s1', 's2'] });
  });

  it("an older server without /stops (404): starts from today's delivery order, moves a home with ▼ and saves the whole order", async () => {
    const row = (id: string, code: string, flatLabel: string) => ({
      id, code, customerName: `C ${id}`, flatLabel, title: 'Milk', kind: 'DAIRY', status: 'ACTIVE', todayState: 'DUE',
      monthToDate: { deliveries: 0, amountPaise: 0 },
    });
    setRoutes({
      [`GET ${BASE}/routes`]: { success: true, data: [{ _id: 'r1', kind: 'ROUTE', name: 'Tower A', isActive: true }] },
      [`GET ${BASE}`]: { success: true, data: [row('s1', 'SUB-0001', 'A-101'), row('s2', 'SUB-0002', 'A-102')], page: 1, limit: 200, total: 2 },
      [`GET ${BASE}/deliveries`]: { success: true, data: { day: istToday(), rows: [{ subscriptionId: 's2' }, { subscriptionId: 's1' }], loadingList: [] } },
      [`GET ${BASE}/routes/r1/stops`]: fail(404, { success: false, message: 'Not found' }),
      [`PUT ${BASE}/routes/r1/order`]: { success: true, data: { updated: 2 } },
    });
    await paper(<RoutesScreen />);
    await waitFor(() => expect(screen.getByTestId('route-order-r1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('route-order-r1'));
    await waitFor(() => expect(screen.getByTestId('order-down-s2')).toBeTruthy());
    expect(callsTo('GET', BASE)[0].params).toEqual({ routeId: 'r1', status: 'ACTIVE', limit: 200 });
    await fireEvent.press(screen.getByTestId('order-down-s2'));
    await fireEvent.press(screen.getByTestId('route-order-save'));
    await waitFor(() => expect(callsTo('PUT', `${BASE}/routes/r1/order`)).toHaveLength(1));
    expect(callsTo('PUT', `${BASE}/routes/r1/order`)[0].body).toEqual({ subscriptionIds: ['s1', 's2'] });
  });
});
