/**
 * Commerce C4 (store credit & points) and C5 (send offer, insights) screens,
 * against the BUILT routes: `/partners/me/wallet/**`, `/partners/me/broadcasts/**`,
 * `/partners/me/commerce-insights/**`, and the return-to-store-credit choice.
 */
import React from 'react';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';

import WalletListScreen from '../../app/(app)/commerce/wallet/index';
import WalletDetailScreen from '../../app/(app)/commerce/wallet/[partyId]';
import BroadcastsScreen from '../../app/(app)/commerce/broadcasts/index';
import ComposeBroadcastScreen from '../../app/(app)/commerce/broadcasts/compose';
import InsightsScreen from '../../app/(app)/commerce/insights';
import { callsTo, fail, setRoutes } from './setup/mockApi';
import { router, setParams } from './setup/mockRouter';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';

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
}));
jest.mock('expo-file-system', () => {
  class Directory { exists = true; create = jest.fn(); constructor(..._a: unknown[]) {} }
  class File { uri = 'file:///cache/commerce/x.pdf'; create = jest.fn(); write = jest.fn(); constructor(..._a: unknown[]) {} }
  return { Directory, File, Paths: { cache: 'cache' } };
});
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock('react-native-modal-datetime-picker', () => () => null);

const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
const ERR = en.errors as Record<string, string>;
type Cat = Record<string, Record<string, unknown>>;
const C = (en as unknown as { commerce: Cat }).commerce;
const W = C.wallet as Record<string, string>;
const B = C.broadcasts as Record<string, string>;
const I = C.insights as Record<string, string>;
const noRawKeys = () => expect(screen.queryByText(/commerce\.[a-z]/)).toBeNull();

/** MP-1 (c2): Send now asks first ("Send this offer now?") — press the non-cancel button of the last Alert. */
const confirmLastAlert = async (title?: string) => {
  const calls = (Alert.alert as unknown as jest.Mock).mock.calls;
  const last = calls[calls.length - 1] as [string, string, Array<{ text: string; style?: string; onPress?: () => void }>];
  if (title) expect(last[0]).toBe(title);
  await act(async () => { last[2].find((b) => b.style !== 'cancel')?.onPress?.(); });
};

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockEnt.features = ['WALLET', 'LOYALTY', 'BROADCAST', 'OFFERS'];
  mockEnt.admin = true;
  mockEnt.perms = {};
});

const wallet = {
  partyId: 'p1', name: 'Asha', creditPaise: 50000, points: 120, usablePoints: 100,
  expiring: [{ expiresAt: '2026-10-20T00:00:00.000Z', points: 20 }], referralCode: 'AB7KQ9XZ', referrals: { rewarded: 1, pending: 2 },
};

describe('store credit & points (C4)', () => {
  it('lists customers holding credit / points; search sends q', async () => {
    setRoutes({
      'GET /partners/me/wallet': { success: true, data: [{ partyId: 'p1', name: 'Asha', creditPaise: 50000, points: 120 }], page: 1, limit: 50, total: 1 },
    });
    await paper(<WalletListScreen />);
    await waitFor(() => expect(screen.getByText('Asha')).toBeTruthy());
    expect(screen.getByText('₹500.00')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('wallet-search'), 'as');
    await waitFor(() => expect(callsTo('GET', '/partners/me/wallet').some((c) => (c.params as { q?: string }).q === 'as')).toBe(true));
    await fireEvent.press(screen.getByTestId('wallet-row-p1'));
    expect(router.push).toHaveBeenCalledWith('/commerce/wallet/p1');
  });

  it('a role without WALLET_VIEW is told so and nothing is fetched', async () => {
    mockEnt.admin = false;
    await paper(<WalletListScreen />);
    expect(screen.getByTestId('no-access')).toBeTruthy();
    expect(callsTo('GET', '/partners/me/wallet')).toHaveLength(0);
  });

  it('Add credit: posts the top-up, shows the receipt, shares the PDF', async () => {
    setParams({ partyId: 'p1' });
    setRoutes({
      'GET /partners/me/wallet/p1': { success: true, data: wallet },
      'GET /partners/me/wallet/p1/statement': { success: true, data: [], page: 1, limit: 50, total: 0 },
      'POST /partners/me/wallet/p1/topup': {
        success: true,
        data: { receiptNo: 'SC-261002-AB12CD', amountPaise: 20000, paymentId: 'pay1', creditPaymentId: 'pay2', creditPaise: 70000, entryId: 'e1', duplicate: false, receiptUrl: '/x' },
      },
      'GET /partners/me/wallet/p1/receipts/pay1.pdf': new ArrayBuffer(4),
    });
    await paper(<WalletDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('wallet-credit')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('wallet-topup'));
    await fireEvent.changeText(screen.getByTestId('wallet-amount'), '200');
    await fireEvent.press(screen.getByTestId('wallet-money-save'));
    await waitFor(() => expect(screen.getByTestId('wallet-money-done')).toBeTruthy());
    expect(callsTo('POST', '/partners/me/wallet/p1/topup')[0].body).toEqual({ amountPaise: 20000, mode: 'CASH' });
    await fireEvent.press(screen.getByTestId('wallet-share-receipt'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
  });

  it('Adjust: removing points posts a negative amount with the reason; a refusal reads as our sentence', async () => {
    setParams({ partyId: 'p1' });
    setRoutes({
      'GET /partners/me/wallet/p1': { success: true, data: wallet },
      'GET /partners/me/wallet/p1/statement': { success: true, data: [], page: 1, limit: 50, total: 0 },
      'POST /partners/me/wallet/p1/adjust': fail(409, { code: 'POINTS_SHORT', params: { points: '100' }, error: 'x' }),
    });
    await paper(<WalletDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('wallet-adjust')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('wallet-adjust'));
    // "Points" is also the balance tile and the statement tab: the sheet's chip is the last one drawn.
    const pointsChips = screen.getAllByLabelText(W.points);
    await fireEvent.press(pointsChips[pointsChips.length - 1]);
    await fireEvent.press(screen.getByText(W.remove));
    await fireEvent.changeText(screen.getByTestId('wallet-adjust-amount'), '500');
    await fireEvent.changeText(screen.getByTestId('wallet-adjust-reason'), 'Entered twice');
    await fireEvent.press(screen.getByTestId('wallet-adjust-save'));
    // MP-1 (b): our sentence, then the number the refusal carries (web marketplaceErrors.extra.pointsBalance).
    await waitFor(() => expect(screen.getByTestId('wallet-adjust-error').props.children)
      .toBe(`${ERR.POINTS_SHORT} ${en.common.apiError.extra.pointsBalance.replace('{{value}}', '100')}`));
    expect(callsTo('POST', '/partners/me/wallet/p1/adjust')[0].body).toEqual({ bucket: 'POINTS', amount: -500, reason: 'Entered twice' });
  });

  it('the statement names each entry; Hindi has no raw keys', async () => {
    setParams({ partyId: 'p1' });
    setRoutes({
      'GET /partners/me/wallet/p1': { success: true, data: wallet },
      'GET /partners/me/wallet/p1/statement': {
        success: true,
        data: [
          { id: 'e1', bucket: 'CREDIT', type: 'CREDIT_ADJUST', kind: 'TOPUP', amount: 20000, balanceAfter: 50000, sourceRef: 'SC-1', createdAt: '2026-10-01T10:00:00Z', createdByName: 'Ravi' },
          { id: 'e2', bucket: 'POINTS', type: 'POINTS_EARN', amount: 12, balanceAfter: 120, sourceRef: 'ORD-1', createdAt: '2026-10-01T11:00:00Z' },
        ],
        page: 1, limit: 50, total: 2,
      },
    });
    await paper(<WalletDetailScreen />, 'hi');
    await waitFor(() => expect(screen.getByTestId('entry-e1')).toBeTruthy());
    noRawKeys();
  });
});

describe('send offer (C5)', () => {
  const list = (over: object = {}) => ({
    success: true,
    data: [
      { id: 'b1', title: 'Diwali sale', body: '10% off', segment: {}, status: 'DRAFT' },
      { id: 'b2', title: 'Fresh mangoes', body: 'In today', segment: {}, status: 'SENT', audienceCount: 40, sentAt: '2026-10-01T10:00:00Z' },
    ],
    page: 1, limit: 50, total: 2, weekly: { used: 1, max: 2 }, ...over,
  });

  it('shows the weekly meter and sends a draft', async () => {
    setRoutes({
      'GET /partners/me/broadcasts': list(),
      'POST /partners/me/broadcasts/b1/send': { success: true, data: { id: 'b1', title: 'Diwali sale', body: '', segment: {}, status: 'SENT', audienceCount: 12 } },
    });
    await paper(<BroadcastsScreen />);
    await waitFor(() => expect(screen.getByTestId('broadcast-weekly').props.children).toBe(B.weekly.replace('{{used}}', '1').replace('{{max}}', '2')));
    await fireEvent.press(screen.getByTestId('broadcast-send-b1'));
    expect(callsTo('POST', '/partners/me/broadcasts/b1/send')).toHaveLength(0);
    await confirmLastAlert(B.confirmSendTitle);
    await waitFor(() => expect(callsTo('POST', '/partners/me/broadcasts/b1/send')).toHaveLength(1));
  });

  it('compose: title + message + Send now saves then sends, with only the chosen segment', async () => {
    setRoutes({
      'GET /partners/me/broadcasts': list({ data: [] }),
      'GET /partners/me/offers': { success: true, data: [], page: 1, limit: 50, total: 0 },
      'POST /partners/me/broadcasts/audience': { success: true, data: { count: 25, suppressed: { optedOut: 2, muted: 1, tooSoon: 0 } } },
      'POST /partners/me/broadcasts': { success: true, data: { id: 'b9', title: 'Hi', body: 'Hello', segment: {}, status: 'DRAFT' } },
      'POST /partners/me/broadcasts/b9/send': { success: true, data: { id: 'b9', title: 'Hi', body: 'Hello', segment: {}, status: 'SENT', audienceCount: 25 } },
    });
    await paper(<ComposeBroadcastScreen />);
    await waitFor(() => expect(callsTo('POST', '/partners/me/broadcasts/audience').length).toBeGreaterThan(0), { timeout: 3000 });
    await fireEvent.changeText(screen.getByTestId('broadcast-title'), 'Hi');
    await fireEvent.changeText(screen.getByTestId('broadcast-body'), 'Hello');
    await fireEvent.press(screen.getByText((B.tier as unknown as Record<string, string>).VIP));
    await waitFor(() => expect(callsTo('POST', '/partners/me/broadcasts/audience').some((c) => JSON.stringify(c.body).includes('VIP'))).toBe(true), { timeout: 3000 });
    await fireEvent.press(screen.getByTestId('broadcast-send'));
    expect(callsTo('POST', '/partners/me/broadcasts')).toHaveLength(0);
    await confirmLastAlert(B.confirmSendTitle);
    await waitFor(() => expect(callsTo('POST', '/partners/me/broadcasts/b9/send')).toHaveLength(1));
    expect(callsTo('POST', '/partners/me/broadcasts')[0].body).toEqual({
      title: 'Hi', body: 'Hello', segment: { spendTiers: ['VIP'], spendWindowDays: 90 },
    });
    expect(router.back).toHaveBeenCalled();
  });

  it('the weekly limit refusal reads as our sentence', async () => {
    setRoutes({
      'GET /partners/me/broadcasts': list({ data: [] }),
      'POST /partners/me/broadcasts/audience': { success: true, data: { count: 5, suppressed: { optedOut: 0, muted: 0, tooSoon: 0 } } },
      'POST /partners/me/broadcasts': { success: true, data: { id: 'b9', title: 'Hi', body: 'Hello', segment: {}, status: 'DRAFT' } },
      'POST /partners/me/broadcasts/b9/send': fail(429, { code: 'BROADCAST_WEEKLY_LIMIT', params: { nextAllowedAt: '2026-10-05T00:00:00Z' } }),
    });
    await paper(<ComposeBroadcastScreen />);
    await fireEvent.changeText(screen.getByTestId('broadcast-title'), 'Hi');
    await fireEvent.changeText(screen.getByTestId('broadcast-body'), 'Hello');
    await waitFor(() => expect(callsTo('POST', '/partners/me/broadcasts/audience').length).toBeGreaterThan(0), { timeout: 3000 });
    await fireEvent.press(screen.getByTestId('broadcast-send'));
    await confirmLastAlert(B.confirmSendTitle);
    await waitFor(() => expect(screen.getByTestId('broadcast-error').props.children).toBe(ERR.BROADCAST_WEEKLY_LIMIT));
  });

  it('a missing title is said on the screen and nothing is sent', async () => {
    setRoutes({ 'GET /partners/me/broadcasts': list({ data: [] }) });
    await paper(<ComposeBroadcastScreen />);
    await fireEvent.press(screen.getByTestId('broadcast-send'));
    await waitFor(() => expect(screen.getByTestId('broadcast-error').props.children).toBe((B.err as unknown as Record<string, string>).title));
    expect(callsTo('POST', '/partners/me/broadcasts')).toHaveLength(0);
  });

  // ── MP-1 (c1): the server REPLACES the whole segment on an edit, so the app must send back what it does not show.
  it('editing a message made on the web keeps its society limit, towers and every other web-set field', async () => {
    const webSegment = {
      societyIds: ['64b000000000000000000001', '64b000000000000000000002'],
      blockNames: ['A', 'Tower 7'],
      tags: ['veg'],
      spendTiers: ['LOYAL'],
      spendWindowDays: 60,
      lastOrderOlderThanDays: 45,
      hasOrdered: true,
    };
    setParams({ id: 'b1' });
    setRoutes({
      'GET /partners/me/broadcasts': list({ data: [{ id: 'b1', title: 'Diwali sale', body: '10% off', segment: webSegment, status: 'DRAFT' }] }),
      'POST /partners/me/broadcasts/audience': { success: true, data: { count: 7, suppressed: { optedOut: 0, muted: 0, tooSoon: 0 } } },
      'PUT /partners/me/broadcasts/b1': { success: true, data: { id: 'b1', title: 'Diwali sale!', body: '10% off', segment: webSegment, status: 'DRAFT' } },
    });
    await paper(<ComposeBroadcastScreen />);
    await waitFor(() => expect(screen.getByTestId('broadcast-title').props.value).toBe('Diwali sale'));
    expect(screen.getByTestId('broadcast-blocks').props.value).toBe('A, Tower 7');
    expect(screen.getByTestId('broadcast-societies-kept').props.children)
      .toBe((B as unknown as Record<string, string>).societiesKept_other.replace('{{count}}', '2'));
    await fireEvent.changeText(screen.getByTestId('broadcast-title'), 'Diwali sale!');
    await fireEvent.press(screen.getByTestId('broadcast-save-draft'));
    await waitFor(() => expect(callsTo('PUT', '/partners/me/broadcasts/b1')).toHaveLength(1));
    const sent = callsTo('PUT', '/partners/me/broadcasts/b1')[0].body as { title: string; segment: unknown };
    expect(sent.title).toBe('Diwali sale!');
    expect(sent.segment).toEqual(webSegment);
    // the live count is asked with the web fields too
    await waitFor(() => expect(callsTo('POST', '/partners/me/broadcasts/audience').some((c) => JSON.stringify(c.body).includes('64b000000000000000000001'))).toBe(true), { timeout: 3000 });
    setParams({});
  });

  it('a tower typed in the app goes out as blockNames', async () => {
    setRoutes({
      'GET /partners/me/broadcasts': list({ data: [] }),
      'POST /partners/me/broadcasts/audience': { success: true, data: { count: 3, suppressed: { optedOut: 0, muted: 0, tooSoon: 0 } } },
      'POST /partners/me/broadcasts': { success: true, data: { id: 'b9', title: 'Hi', body: 'Hello', segment: {}, status: 'DRAFT' } },
    });
    await paper(<ComposeBroadcastScreen />);
    await fireEvent.changeText(screen.getByTestId('broadcast-title'), 'Hi');
    await fireEvent.changeText(screen.getByTestId('broadcast-body'), 'Hello');
    await fireEvent.changeText(screen.getByTestId('broadcast-blocks'), ' A , B, A ');
    await fireEvent.press(screen.getByTestId('broadcast-save-draft'));
    await waitFor(() => expect(callsTo('POST', '/partners/me/broadcasts')).toHaveLength(1));
    expect(callsTo('POST', '/partners/me/broadcasts')[0].body).toEqual({ title: 'Hi', body: 'Hello', segment: { blockNames: ['A', 'B'] } });
  });

  // ── MP-1 (c2): "What they see" + a confirm before Send now (web broadcasts.preview.* / confirm.*).
  it('shows what customers see, and Send now asks first — Cancel sends nothing', async () => {
    setRoutes({
      'GET /partners/me/broadcasts': list({ data: [] }),
      'POST /partners/me/broadcasts/audience': { success: true, data: { count: 25, suppressed: { optedOut: 0, muted: 0, tooSoon: 0 } } },
    });
    await paper(<ComposeBroadcastScreen />);
    const P = B as unknown as Record<string, string>;
    expect(screen.getByText(P.previewLabel)).toBeTruthy();
    expect(screen.getByTestId('broadcast-preview-title').props.children).toBe(P.previewTitle.replace('{{title}}', P.previewTitlePlaceholder));
    await fireEvent.changeText(screen.getByTestId('broadcast-title'), 'Diwali sale');
    await fireEvent.changeText(screen.getByTestId('broadcast-body'), '10% off today');
    expect(screen.getByTestId('broadcast-preview-title').props.children).toBe('Offer: Diwali sale');
    expect(screen.getByTestId('broadcast-preview-body').props.children).toBe(`10% off today — from ${P.previewShop}`);
    await waitFor(() => expect(callsTo('POST', '/partners/me/broadcasts/audience').length).toBeGreaterThan(0), { timeout: 3000 });
    await waitFor(() => expect(screen.getByText(P.willGet_other.replace('{{count}}', '25'))).toBeTruthy());
    await fireEvent.press(screen.getByTestId('broadcast-send'));
    const calls = (Alert.alert as unknown as jest.Mock).mock.calls;
    const [title, body, buttons] = calls[calls.length - 1] as [string, string, Array<{ text: string; style?: string; onPress?: () => void }>];
    expect(title).toBe('Send this offer now?');
    expect(body).toBe(P.confirmSendBody_other.replace('{{count}}', '25'));
    await act(async () => { buttons.find((b) => b.style === 'cancel')?.onPress?.(); });
    expect(callsTo('POST', '/partners/me/broadcasts')).toHaveLength(0);
  });
});

describe('shop insights (C5)', () => {
  it('overview tiles and the folded busy-hours map', async () => {
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ orders: 0, salesPaise: 0 })));
    grid[6][18].orders = 4;
    setRoutes({
      'GET /partners/me/commerce-insights/overview': {
        success: true,
        data: { orders: 10, bills: 5, revenuePaise: 300000, aovPaise: 20000, basket: { linesPerOrder: 2, unitsPerOrder: 3 }, discountGivenPaise: 0, deliveryFeesPaise: 0, pointsRedeemedPaise: 0, storeCreditUsedPaise: 0 },
      },
      'GET /partners/me/commerce-insights/heatmap': { success: true, data: { grid, timezone: 'Asia/Kolkata' } },
    });
    await paper(<InsightsScreen />);
    await waitFor(() => expect(screen.getByText('₹200.00')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('insight-busiest')).toBeTruthy());
    expect(callsTo('GET', '/partners/me/commerce-insights/overview')[0].params).toMatchObject({ from: expect.any(String), to: expect.any(String) });
    // Top customers is a separate tab, fetched only when opened.
    expect(callsTo('GET', '/partners/me/commerce-insights/top-customers')).toHaveLength(0);
    await fireEvent.press(screen.getByText(I.tabCustomers));
    await waitFor(() => expect(callsTo('GET', '/partners/me/commerce-insights/top-customers')).toHaveLength(1));
  });

  it('Hindi has no raw keys', async () => {
    setRoutes({});
    await paper(<InsightsScreen />, 'hi');
    noRawKeys();
  });
});
