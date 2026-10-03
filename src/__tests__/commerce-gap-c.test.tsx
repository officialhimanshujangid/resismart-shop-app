/**
 * GAP-C (backend 2026-10-02) on the shop app, against the BUILT routes:
 *  - riders: `delivery.proofMode` on `/my-deliveries` rows decides whether the code / photo is asked (NONE = nothing);
 *  - wallet statement: TOPUP / TOPUP_REFUND rows open their receipt PDF by `paymentId`;
 *  - wallet: "Create referral code" (POST …/referral-code), only with REFERRAL on and WALLET_MANAGE FULL;
 *  - broadcasts: "Remove schedule" = PUT `{ scheduledAt: null }`; "Send now" on a timed draft clears the time on the same message;
 *  - counter quick keys bill straight from the key (price, tax rate, inclusive flag, HSN as `hsn`) — no product read;
 *  - label PDF: X-Labels-Count / X-Labels-Skipped are said on the sheet.
 */
import React from 'react';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';

import MyDeliveriesScreen from '../../app/(app)/commerce/deliveries';
import WalletDetailScreen from '../../app/(app)/commerce/wallet/[partyId]';
import BroadcastsScreen from '../../app/(app)/commerce/broadcasts/index';
import ComposeBroadcastScreen from '../../app/(app)/commerce/broadcasts/compose';
import NewInvoiceScreen from '../../app/(app)/billing/new';
import { LabelsSheet } from '../features/commerce/components/LabelsSheet';
import { QuickKeysGrid } from '../features/commerce/components/QuickKeysGrid';
import { labelCountsOf, quickKeyProduct, statementReceiptOf } from '../features/commerce/logic';
import { needsProof, proofNeededKey } from '../features/commerce/fulfilmentLogic';
import type { PartnerOrder } from '../features/orders/types';
import { callsTo, calls, fail, mockApi, setRoutes } from './setup/mockApi';
import { setParams } from './setup/mockRouter';
import { renderScreen } from './setup/harness';
import { themeColors } from '../constants/colors';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const mockEnt: { features: string[]; admin: boolean; perms: Record<string, string> } = { features: [], admin: true, perms: {} };
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    can: () => mockEnt.admin,
    hasModule: () => true,
    ready: true,
    entitlements: { isAdmin: mockEnt.admin, permissions: mockEnt.perms, commerceFeatures: mockEnt.features },
    roleLimits: {},
    menu: [],
  }),
  usePlanUsage: () => ({
    capacity: () => ({ included: false, used: 0, limit: null, atLimit: false, fraction: null, comingSoon: false }),
  }),
}));
jest.mock('expo-file-system', () => {
  class Directory { exists = true; create = jest.fn(); constructor(..._a: unknown[]) {} }
  class File { uri = 'file:///cache/commerce/x.pdf'; create = jest.fn(); write = jest.fn(); constructor(..._a: unknown[]) {} }
  return { Directory, File, Paths: { cache: 'cache' } };
});
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-image-picker', () => ({ launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })) }));
jest.mock('react-native-modal-datetime-picker', () => () => null);
jest.mock('../features/scanner', () => ({ BarcodeScannerView: () => null }));

const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
type Cat = Record<string, Record<string, unknown>>;
const C = (en as unknown as { commerce: Cat }).commerce;
const HC = (hi as unknown as { commerce: Cat }).commerce;
const F = C.fulfilment as Record<string, unknown>;
const W = C.wallet as Record<string, string>;
const B = C.broadcasts as Record<string, string>;
const ERR = en.errors as Record<string, string>;
const noRawKeys = () => expect(screen.queryByText(/commerce\.[a-z]/)).toBeNull();

const order = (over: Partial<PartnerOrder> = {}): PartnerOrder => ({
  id: 'o1', code: 'ORD-0001', status: 'OUT_FOR_DELIVERY', deliveryMode: 'DELIVERY',
  items: [{ productId: 'p1', snapshot: { name: 'Rice', unit: 'KG', ratePaise: 5000, taxRatePercent: 0, taxInclusive: true }, qty: 2, discountPaise: 0, linePaise: 10000 }],
  amounts: { subPaise: 10000, taxPaise: 0, deliveryPaise: 0, discountPaise: 0, totalPaise: 10000 },
  payment: { mode: 'COD', status: 'PENDING' }, timeline: [], allowedVerbs: ['deliver'],
  customer: { name: 'Asha', contactMasked: false, flatLabel: 'A-101', societyName: 'Green Park' },
  itemCount: 1, createdAt: '', updatedAt: '', ...over,
} as PartnerOrder);

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockEnt.features = [];
  mockEnt.admin = true;
  mockEnt.perms = {};
});

// ═══════════════════════════════════════════════════════════════ pure helpers

describe('GAP-C helpers', () => {
  it('proof needed: one line per mode, nothing for NONE or no rule', () => {
    expect(proofNeededKey('OTP')).toBe('commerce.fulfilment.proofNeeded.OTP');
    expect(proofNeededKey('PHOTO')).toBe('commerce.fulfilment.proofNeeded.PHOTO');
    expect(proofNeededKey('OTP_OR_PHOTO')).toBe('commerce.fulfilment.proofNeeded.OTP_OR_PHOTO');
    expect(proofNeededKey('NONE')).toBeNull();
    expect(proofNeededKey(undefined)).toBeNull();
    expect(needsProof('NONE', { deliveryMode: 'DELIVERY', status: 'OUT_FOR_DELIVERY' })).toBe(false);
    expect(needsProof('OTP', { deliveryMode: 'PICKUP', status: 'OUT_FOR_DELIVERY' })).toBe(false);
  });

  it('a statement row has a receipt only for a top-up / pay-back that names its payment', () => {
    expect(statementReceiptOf({ kind: 'TOPUP', paymentId: 'pay1' })).toBe('pay1');
    expect(statementReceiptOf({ kind: 'TOPUP_REFUND', paymentId: 'pay2' })).toBe('pay2');
    expect(statementReceiptOf({ kind: 'TOPUP' })).toBeUndefined();
    expect(statementReceiptOf({ kind: 'TOPUP_CANCEL', paymentId: 'pay3' })).toBeUndefined();
    expect(statementReceiptOf({ paymentId: 'pay4' })).toBeUndefined();
  });

  it('label counts come off the headers (plain map or AxiosHeaders-like), else null', () => {
    expect(labelCountsOf({ 'x-labels-count': '12', 'x-labels-skipped': '2' })).toEqual({ labels: 12, skipped: 2 });
    expect(labelCountsOf({ get: (k: string) => ({ 'x-labels-count': '3' } as Record<string, string>)[k] })).toEqual({ labels: 3, skipped: 0 });
    expect(labelCountsOf({})).toBeNull();
    expect(labelCountsOf(undefined)).toBeNull();
    expect(labelCountsOf({ 'x-labels-count': 'abc' })).toBeNull();
  });

  it('a quick key bills from its own facts; an older key (no tax facts) asks for a read', () => {
    expect(quickKeyProduct({ productId: 'p1', name: 'Rice', unit: 'KG', sellPaise: 5000, taxRatePercent: 5, taxInclusive: false, hsnCode: '1006', mrpPaise: 6000 } as never))
      .toEqual({ _id: 'p1', name: 'Rice', unit: 'KG', sellPaise: 5000, taxRatePercent: 5, taxInclusive: false, hsnCode: '1006' });
    expect(quickKeyProduct({ productId: 'p1', name: 'Rice', unit: 'KG', sellPaise: 5000, taxRatePercent: 0, taxInclusive: true }))
      .toEqual({ _id: 'p1', name: 'Rice', unit: 'KG', sellPaise: 5000, taxRatePercent: 0, taxInclusive: true });
    expect(quickKeyProduct({ productId: 'p1', name: 'Rice', unit: 'KG', sellPaise: 5000 })).toBeNull();
  });

  it('every new string is in English and Hindi', () => {
    const pn = F.proofNeeded as Record<string, string>;
    const hpn = (HC.fulfilment as Record<string, unknown>).proofNeeded as Record<string, string>;
    expect(Object.keys(hpn).sort()).toEqual(Object.keys(pn).sort());
    for (const k of ['receipt', 'receiptFailed', 'referralNoCode', 'makeReferralCode', 'referralMade']) {
      expect((HC.wallet as Record<string, string>)[k]).toBeTruthy();
      expect(W[k]).toBeTruthy();
    }
    for (const k of ['unschedule', 'unscheduleTitle', 'unscheduleBody', 'unscheduledToast', 'unscheduleFailed']) {
      expect((HC.broadcasts as Record<string, string>)[k]).toBeTruthy();
      expect(B[k]).toBeTruthy();
    }
    for (const k of ['doneCount_one', 'doneCount_other', 'doneSkipped_one', 'doneSkipped_other', 'printAgain']) {
      expect((HC.labels as Record<string, string>)[k]).toBeTruthy();
      expect((C.labels as Record<string, string>)[k]).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════ riders (GAP-C-3)

describe('My deliveries: proof from delivery.proofMode', () => {
  beforeEach(() => {
    mockEnt.admin = false;
    mockEnt.perms = { ORDER_DELIVERIES: 'FULL' };
    mockEnt.features = ['DELIVERY_STAFF', 'DELIVERY_PROOF'];
  });

  it('OTP: the card says the code is needed and Delivered opens the code pad — no blind deliver first', async () => {
    setRoutes({
      'GET /partners/me/orders/my-deliveries': { success: true, data: [order({ delivery: { staffName: 'Raju', proofMode: 'OTP' } })], page: 1, limit: 50, total: 1 },
    });
    await paper(<MyDeliveriesScreen />);
    await waitFor(() => expect(screen.getByTestId('proof-needed-o1')).toBeTruthy());
    expect(screen.getByText((F.proofNeeded as Record<string, string>).OTP)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('deliver-o1'));
    await waitFor(() => expect(screen.getByTestId('proof-sheet')).toBeTruthy());
    expect(screen.getByTestId('otp-boxes')).toBeTruthy();
    // OTP only: no photo choice offered up front.
    expect(screen.queryByTestId('proof-photo')).toBeNull();
    expect(callsTo('POST', '/partners/me/orders/o1/deliver')).toHaveLength(0);
  });

  it('PHOTO: the sheet goes straight to the camera step', async () => {
    setRoutes({
      'GET /partners/me/orders/my-deliveries': { success: true, data: [order({ delivery: { proofMode: 'PHOTO' } })], page: 1, limit: 50, total: 1 },
    });
    await paper(<MyDeliveriesScreen />);
    await waitFor(() => expect(screen.getByTestId('deliver-o1')).toBeTruthy());
    expect(screen.getByText((F.proofNeeded as Record<string, string>).PHOTO)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('deliver-o1'));
    await waitFor(() => expect(screen.getByTestId('proof-photo')).toBeTruthy());
    expect(screen.queryByTestId('otp-boxes')).toBeNull();
  });

  it('NONE: nothing is said and Delivered delivers at once', async () => {
    setRoutes({
      'GET /partners/me/orders/my-deliveries': { success: true, data: [order({ delivery: { proofMode: 'NONE' } })], page: 1, limit: 50, total: 1 },
      'POST /partners/me/orders/o1/deliver': { success: true, data: order({ status: 'DELIVERED', allowedVerbs: [] }) },
    });
    await paper(<MyDeliveriesScreen />);
    await waitFor(() => expect(screen.getByTestId('deliver-o1')).toBeTruthy());
    expect(screen.queryByTestId('proof-needed-o1')).toBeNull();
    await fireEvent.press(screen.getByTestId('deliver-o1'));
    await waitFor(() => expect(callsTo('POST', '/partners/me/orders/o1/deliver')).toHaveLength(1));
    expect(callsTo('POST', '/partners/me/orders/o1/deliver')[0].body).toEqual({});
    expect(screen.queryByTestId('proof-sheet')).toBeNull();
  });

  it('a packed order says what hand-over will need, before it leaves', async () => {
    setRoutes({
      'GET /partners/me/orders/my-deliveries': {
        success: true, data: [order({ status: 'PACKED', allowedVerbs: ['dispatch'], delivery: { proofMode: 'OTP_OR_PHOTO' } })], page: 1, limit: 50, total: 1,
      },
    });
    await paper(<MyDeliveriesScreen />, 'hi');
    await waitFor(() => expect(screen.getByTestId('proof-needed-o1')).toBeTruthy());
    expect(screen.getByText(((HC.fulfilment as Record<string, unknown>).proofNeeded as Record<string, string>).OTP_OR_PHOTO)).toBeTruthy();
    noRawKeys();
  });

  it('the rule changed since the list loaded: DELIVERY_PROOF_REQUIRED still opens the proof sheet', async () => {
    setRoutes({
      'GET /partners/me/orders/my-deliveries': { success: true, data: [order({ delivery: { proofMode: 'NONE' } })], page: 1, limit: 50, total: 1 },
      'POST /partners/me/orders/o1/deliver': fail(409, { code: 'DELIVERY_PROOF_REQUIRED' }),
    });
    await paper(<MyDeliveriesScreen />);
    await waitFor(() => expect(screen.getByTestId('deliver-o1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('deliver-o1'));
    await waitFor(() => expect(screen.getByTestId('proof-sheet')).toBeTruthy());
  });
});

// ═══════════════════════════════════════════════════════════════ wallet (GAP-C-5, GAP-C-6c)

const wallet = (over: object = {}) => ({
  partyId: 'p1', name: 'Asha', creditPaise: 50000, points: 120, usablePoints: 120,
  expiring: [], referrals: { rewarded: 0, pending: 0 }, ...over,
});
const statementRows = [
  { id: 'e1', bucket: 'CREDIT', type: 'CREDIT_ADJUST', kind: 'TOPUP', amount: 20000, balanceAfter: 50000, sourceRef: 'SC-261002-AB12CD', paymentId: 'pay1', createdAt: '2026-10-01T10:00:00Z' },
  { id: 'e2', bucket: 'CREDIT', type: 'CREDIT_ADJUST', kind: 'TOPUP_REFUND', amount: -5000, balanceAfter: 45000, sourceRef: 'SC-261002-ZZ99', paymentId: 'pay2', createdAt: '2026-10-01T11:00:00Z' },
  { id: 'e3', bucket: 'CREDIT', type: 'CREDIT_SPEND', amount: -1000, balanceAfter: 44000, sourceRef: 'INV-1', createdAt: '2026-10-01T12:00:00Z' },
];

describe('wallet statement receipts', () => {
  beforeEach(() => { mockEnt.features = ['WALLET']; });

  it('TOPUP / TOPUP_REFUND rows get Receipt; it opens that payment\'s receipt PDF', async () => {
    setParams({ partyId: 'p1' });
    setRoutes({
      'GET /partners/me/wallet/p1': { success: true, data: wallet() },
      'GET /partners/me/wallet/p1/statement': { success: true, data: statementRows, page: 1, limit: 50, total: 3 },
      'GET /partners/me/wallet/p1/receipts/pay2.pdf': new ArrayBuffer(4),
    });
    await paper(<WalletDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('entry-e1')).toBeTruthy());
    expect(screen.getByTestId('entry-receipt-e1')).toBeTruthy();
    expect(screen.getByTestId('entry-receipt-e2')).toBeTruthy();
    expect(screen.queryByTestId('entry-receipt-e3')).toBeNull();
    await fireEvent.press(screen.getByTestId('entry-receipt-e2'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    expect(callsTo('GET', '/partners/me/wallet/p1/receipts/pay2.pdf')).toHaveLength(1);
  });

  it('a receipt that cannot be read says the server\'s sentence', async () => {
    setParams({ partyId: 'p1' });
    setRoutes({
      'GET /partners/me/wallet/p1': { success: true, data: wallet() },
      'GET /partners/me/wallet/p1/statement': { success: true, data: statementRows.slice(0, 1), page: 1, limit: 50, total: 1 },
      'GET /partners/me/wallet/p1/receipts/pay1.pdf': fail(404, { error: 'That receipt was not found.' }),
    });
    await paper(<WalletDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('entry-receipt-e1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('entry-receipt-e1'));
    await waitFor(() => expect(screen.getByText('That receipt was not found.')).toBeTruthy());
  });
});

describe('wallet referral code', () => {
  it('no code + REFERRAL on + manager: Create referral code posts and the code shows', async () => {
    mockEnt.features = ['WALLET', 'REFERRAL'];
    setParams({ partyId: 'p1' });
    let made = false;
    setRoutes({
      'GET /partners/me/wallet/p1': () => ({ success: true, data: wallet(made ? { referralCode: 'AB7KQ9XZ' } : {}) }),
      'GET /partners/me/wallet/p1/statement': { success: true, data: [], page: 1, limit: 50, total: 0 },
      'POST /partners/me/wallet/p1/referral-code': () => {
        made = true;
        return { success: true, data: { partyId: 'p1', referralCode: 'AB7KQ9XZ', referrals: { rewarded: 0, pending: 0 } } };
      },
    });
    await paper(<WalletDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('wallet-referral-none')).toBeTruthy());
    expect(screen.getByText(W.referralNoCode)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('wallet-make-referral'));
    await waitFor(() => expect(callsTo('POST', '/partners/me/wallet/p1/referral-code')).toHaveLength(1));
    await waitFor(() => expect(screen.getByText('AB7KQ9XZ')).toBeTruthy());
    expect(screen.queryByTestId('wallet-make-referral')).toBeNull();
  });

  it('409 COMMERCE_FEATURE_OFF is said in the server-coded sentence', async () => {
    mockEnt.features = ['WALLET', 'REFERRAL'];
    setParams({ partyId: 'p1' });
    setRoutes({
      'GET /partners/me/wallet/p1': { success: true, data: wallet() },
      'GET /partners/me/wallet/p1/statement': { success: true, data: [], page: 1, limit: 50, total: 0 },
      'POST /partners/me/wallet/p1/referral-code': fail(409, { code: 'COMMERCE_FEATURE_OFF', params: { feature: 'REFERRAL' }, error: 'Referral is switched off.' }),
    });
    await paper(<WalletDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('wallet-make-referral')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('wallet-make-referral'));
    await waitFor(() => expect(screen.getByTestId('wallet-referral-error')).toBeTruthy());
    expect(screen.getByTestId('wallet-referral-error').props.children).toBe(ERR.COMMERCE_FEATURE_OFF);
  });

  it('no button without WALLET_MANAGE FULL', async () => {
    mockEnt.features = ['WALLET', 'REFERRAL'];
    mockEnt.admin = false;
    mockEnt.perms = { WALLET_VIEW: 'READ' };
    setParams({ partyId: 'p1' });
    setRoutes({
      'GET /partners/me/wallet/p1': { success: true, data: wallet() },
      'GET /partners/me/wallet/p1/statement': { success: true, data: [], page: 1, limit: 50, total: 0 },
    });
    await paper(<WalletDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('wallet-referral-none')).toBeTruthy());
    expect(screen.queryByTestId('wallet-make-referral')).toBeNull();
  });

  it('no referral card at all with referral off', async () => {
    mockEnt.features = ['WALLET'];
    setParams({ partyId: 'p1' });
    setRoutes({
      'GET /partners/me/wallet/p1': { success: true, data: wallet() },
      'GET /partners/me/wallet/p1/statement': { success: true, data: [], page: 1, limit: 50, total: 0 },
    });
    await paper(<WalletDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('wallet-credit')).toBeTruthy());
    expect(screen.queryByTestId('wallet-referral-none')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════ broadcasts (GAP-C-6a)

describe('broadcasts: Remove schedule', () => {
  beforeEach(() => { mockEnt.features = ['BROADCAST']; });
  const listOf = (rows: object[]) => ({ success: true, data: rows, page: 1, limit: 50, total: rows.length, weekly: { used: 1, max: 2 } });

  it('a scheduled message: Remove schedule asks, then PUTs scheduledAt: null and says it is a draft again', async () => {
    setRoutes({
      'GET /partners/me/broadcasts': listOf([
        { id: 'b1', title: 'Diwali sale', body: '10% off', segment: {}, status: 'SCHEDULED', scheduledAt: '2026-10-20T10:00:00Z' },
        { id: 'b2', title: 'Plain draft', body: 'x', segment: {}, status: 'DRAFT' },
      ]),
      'PUT /partners/me/broadcasts/b1': { success: true, data: { id: 'b1', title: 'Diwali sale', body: '10% off', segment: {}, status: 'DRAFT' } },
    });
    const alert = jest.spyOn(Alert, 'alert');
    await paper(<BroadcastsScreen />);
    await waitFor(() => expect(screen.getByTestId('broadcast-unschedule-b1')).toBeTruthy());
    expect(screen.queryByTestId('broadcast-unschedule-b2')).toBeNull();
    await fireEvent.press(screen.getByTestId('broadcast-unschedule-b1'));
    expect(alert).toHaveBeenCalled();
    const [title, , buttons] = alert.mock.calls[alert.mock.calls.length - 1] as [string, string, Array<{ text: string; onPress?: () => void }>];
    expect(title).toBe(B.unscheduleTitle);
    const go = buttons.find((b) => b.text === B.unschedule);
    go?.onPress?.();
    await waitFor(() => expect(callsTo('PUT', '/partners/me/broadcasts/b1')).toHaveLength(1));
    expect(callsTo('PUT', '/partners/me/broadcasts/b1')[0].body).toEqual({ scheduledAt: null });
    await waitFor(() => expect(screen.getByText(B.unscheduledToast.replace('{{title}}', 'Diwali sale'))).toBeTruthy());
  });

  it('a refusal (e.g. already sent) is said in our words', async () => {
    setRoutes({
      'GET /partners/me/broadcasts': listOf([{ id: 'b1', title: 'Diwali sale', body: '10% off', segment: {}, status: 'SCHEDULED', scheduledAt: '2026-10-20T10:00:00Z' }]),
      'PUT /partners/me/broadcasts/b1': fail(409, { code: 'BROADCAST_NOT_EDITABLE' }),
    });
    const alert = jest.spyOn(Alert, 'alert');
    await paper(<BroadcastsScreen />);
    await waitFor(() => expect(screen.getByTestId('broadcast-unschedule-b1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('broadcast-unschedule-b1'));
    const [, , buttons] = alert.mock.calls[alert.mock.calls.length - 1] as [string, string, Array<{ text: string; onPress?: () => void }>];
    buttons.find((b) => b.text === B.unschedule)?.onPress?.();
    await waitFor(() => expect(alert).toHaveBeenCalledWith(B.unscheduleFailed, ERR.BROADCAST_NOT_EDITABLE));
  });

  it('compose: Send now on a draft that holds a time clears it on the SAME message (no cancel, no new one)', async () => {
    setParams({ id: 'b1' });
    setRoutes({
      'GET /partners/me/broadcasts': listOf([{ id: 'b1', title: 'Diwali sale', body: '10% off', segment: {}, status: 'DRAFT', scheduledAt: '2026-10-20T10:00:00Z' }]),
      'POST /partners/me/broadcasts/audience': { success: true, data: { count: 5, suppressed: { optedOut: 0, muted: 0, tooSoon: 0 } } },
      'PUT /partners/me/broadcasts/b1': { success: true, data: { id: 'b1', title: 'Diwali sale', body: '10% off', segment: {}, status: 'DRAFT' } },
      'POST /partners/me/broadcasts/b1/send': { success: true, data: { id: 'b1', title: 'Diwali sale', body: '10% off', segment: {}, status: 'SENT', audienceCount: 5 } },
    });
    await paper(<ComposeBroadcastScreen />);
    await waitFor(() => expect(screen.getByTestId('broadcast-title').props.value).toBe('Diwali sale'));
    await fireEvent.press(screen.getByText(B.sendNow, { exact: true }));
    await waitFor(() => expect(callsTo('POST', '/partners/me/broadcasts/audience').length).toBeGreaterThan(0), { timeout: 3000 });
    await fireEvent.press(screen.getByTestId('broadcast-send'));
    // MP-1 (c2): Send now asks first ("Send this offer now?"); confirm it.
    const asked = (Alert.alert as unknown as jest.Mock).mock.calls;
    const [askTitle, , askButtons] = asked[asked.length - 1] as [string, string, Array<{ style?: string; onPress?: () => void }>];
    expect(askTitle).toBe((B as unknown as Record<string, string>).confirmSendTitle);
    await act(async () => { askButtons.find((b) => b.style !== 'cancel')?.onPress?.(); });
    await waitFor(() => expect(callsTo('POST', '/partners/me/broadcasts/b1/send')).toHaveLength(1));
    expect((callsTo('PUT', '/partners/me/broadcasts/b1')[0].body as { scheduledAt?: unknown }).scheduledAt).toBeNull();
    expect(callsTo('POST', '/partners/me/broadcasts')).toHaveLength(0);
    expect(callsTo('POST', '/partners/me/broadcasts/b1/cancel')).toHaveLength(0);
    setParams({});
  });
});

// ═══════════════════════════════════════════════════════════════ counter quick keys (GAP-C-6b)

describe('counter quick keys', () => {
  it('a tap bills from the key itself: no product read; tax rate, inclusive flag and HSN (as hsn) ride on the line', async () => {
    mockEnt.features = ['OFFERS', 'QUICK_KEYS'];
    setRoutes({
      'GET /partners/me/counter/quick-keys': {
        success: true,
        data: [{ productId: 'p1', name: 'Basmati 1kg', unit: 'PCS', sellPaise: 12000, mrpPaise: 13000, taxRatePercent: 5, taxInclusive: false, hsnCode: '1006' }],
      },
      'POST /partners/me/documents': { success: true, data: { _id: 'd1', type: 'TAX_INVOICE', status: 'DRAFT', lines: [], partySnapshot: { name: 'x' }, totals: { grandPaise: 12600 } } },
    });
    await paper(<NewInvoiceScreen />);
    await waitFor(() => expect(screen.getByTestId('quick-key-p1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('quick-key-p1'));
    await waitFor(() => expect(screen.getAllByText('Basmati 1kg').length).toBeGreaterThan(1));
    expect(callsTo('GET', '/partners/me/products/p1')).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('bill-primary'));
    await waitFor(() => expect(callsTo('POST', '/partners/me/documents')).toHaveLength(1));
    const line = (callsTo('POST', '/partners/me/documents')[0].body as { lines: Array<Record<string, unknown>> }).lines[0];
    expect(line).toMatchObject({ itemId: 'p1', itemName: 'Basmati 1kg', hsn: '1006', ratePaise: 12000, taxRatePercent: 5, taxInclusive: false, qty: 1 });
  });

  it('the tile shows the MRP struck through only when the key sells below it', async () => {
    const c = themeColors(false);
    await paper(
      <QuickKeysGrid
        c={c}
        onTap={jest.fn()}
        keys={[
          { productId: 'a', name: 'Milk', unit: 'PCS', sellPaise: 3000, mrpPaise: 3200 },
          { productId: 'b', name: 'Bread', unit: 'PCS', sellPaise: 4000, mrpPaise: 4000 },
        ]}
      />,
    );
    expect(screen.getByTestId('quick-key-mrp-a')).toBeTruthy();
    expect(screen.queryByTestId('quick-key-mrp-b')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════ label PDF (GAP-C-4)

describe('label sheet counts', () => {
  const answerWithHeaders = (headers: Record<string, string>) => {
    mockApi.post.mockImplementationOnce(async (url: string, body?: unknown) => {
      calls.push({ method: 'POST', url, body });
      return { data: new ArrayBuffer(4), status: 200, headers } as never;
    });
  };

  it('says how many labels were made and how many were left out', async () => {
    answerWithHeaders({ 'x-labels-count': '12', 'x-labels-skipped': '2' });
    const onDismiss = jest.fn();
    await paper(<LabelsSheet visible onDismiss={onDismiss} items={[{ productId: 'p1', name: 'T-shirt' }, { productId: 'p2', name: 'Cap' }]} />);
    await fireEvent.press(screen.getByTestId('labels-print'));
    await waitFor(() => expect(screen.getByTestId('labels-done')).toBeTruthy());
    expect(Sharing.shareAsync).toHaveBeenCalled();
    expect(screen.getByText('12 labels ready')).toBeTruthy();
    // MP-1 A5: web's words — a product with sizes is skipped too.
    expect(screen.getByTestId('labels-skipped').props.children).toBe('2 products skipped (no barcode, or they have sizes)');
    expect(onDismiss).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('labels-done-close'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('nothing skipped: no skipped line; Hindi reads cleanly', async () => {
    answerWithHeaders({ 'x-labels-count': '1', 'x-labels-skipped': '0' });
    await paper(<LabelsSheet visible onDismiss={jest.fn()} items={[{ productId: 'p1', name: 'T-shirt' }]} />, 'hi');
    await fireEvent.press(screen.getByTestId('labels-print'));
    await waitFor(() => expect(screen.getByTestId('labels-done')).toBeTruthy());
    expect(screen.queryByTestId('labels-skipped')).toBeNull();
    expect(screen.getByText('1 लेबल तैयार')).toBeTruthy();
    noRawKeys();
  });

  it('an answer without the headers closes the sheet as before', async () => {
    setRoutes({ 'POST /partners/me/products/labels': new ArrayBuffer(4) });
    const onDismiss = jest.fn();
    await paper(<LabelsSheet visible onDismiss={onDismiss} items={[{ productId: 'p1', name: 'T-shirt' }]} />);
    await fireEvent.press(screen.getByTestId('labels-print'));
    await waitFor(() => expect(onDismiss).toHaveBeenCalled());
    expect(screen.queryByTestId('labels-done')).toBeNull();
  });
});
