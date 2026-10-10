/**
 * M04-H — the shop app's Today (home) screen after the DS v1 redesign, with the
 * api mocked. Behaviour, not markup:
 *  - the proprietor's board: business name in the hero, today's sale, the one
 *    primary "New bill" (same gate and destination as the Shortcuts tile), the
 *    shortcut grid, pending orders and the low-stock card;
 *  - a failed bookings read is an ERROR with "Try again", never "Nothing on the
 *    diary today" (M04-H-01);
 *  - the "not found" banner speaks the reader's language — Hindi blocker
 *    sentences, not the server's English (M04-H-02);
 *  - a suspended business never reads "Society shop … approved" beside the
 *    suspension (M04-H-03), and sees no sales card;
 *  - light and dark both render.
 */
import React from 'react';
import * as RN from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import TodayScreen from '../../app/(app)/(tabs)/index';
import { formatPaise } from '../lib/money';
import { fail, setRoutes } from './setup/mockApi';
import { router } from './setup/mockRouter';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const mockAuth = {
  isAuthenticated: false,
  user: { name: 'Asha' },
  profile: { role: 'PARTNER_ADMIN', tenantType: 'PARTNER', tenantId: 'p9', contextId: 'partner:p9', tenantName: 'Sharma General' },
};
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }));

type Ent = {
  ready: boolean; failed: boolean; modules: string[];
  business?: { status: string; verificationStatus: string; onboardingStep: number; kind: string };
  visibility?: unknown;
};
const mockEnt: Ent = { ready: true, failed: false, modules: [] };
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    ready: mockEnt.ready,
    failed: mockEnt.failed,
    loading: !mockEnt.ready,
    can: () => mockEnt.ready,
    hasModule: (m: string) => mockEnt.ready && mockEnt.modules.includes(m),
    refresh: jest.fn(),
    entitlements: {
      isAdmin: true,
      permissions: {},
      commerceFeatures: [],
      business: mockEnt.business,
      visibility: mockEnt.visibility,
      awaitingRole: false,
    },
  }),
}));

const paper = (lang?: 'en' | 'hi') => renderScreen(<PaperProvider><TodayScreen /></PaperProvider>, { lang });

const board = {
  success: true,
  board: {
    range: { from: '2026-10-06', to: '2026-10-06', granularity: 'day', timezone: 'Asia/Kolkata' },
    kpis: [
      { key: 'today_sale', label: 'Today', value: 1248000, unit: 'PAISE', previous: 1050000, deltaPercent: 18.9, direction: 'UP', goodWhen: 'UP' },
      { key: 'today_orders', label: 'Orders', value: 6, unit: 'COUNT', previous: 4, deltaPercent: 50, direction: 'UP', goodWhen: 'UP' },
      { key: 'pending_decisions', label: 'Pending', value: 2, unit: 'COUNT', previous: null, deltaPercent: null, direction: null, goodWhen: 'DOWN' },
      { key: 'low_stock', label: 'Low', value: 3, unit: 'COUNT', previous: null, deltaPercent: null, direction: null, goodWhen: 'DOWN' },
    ],
    series: [{ key: 'sales', label: 'Sales', unit: 'PAISE', points: [{ t: '2026-10-05', v: 1050000 }, { t: '2026-10-06', v: 1248000 }] }],
    breakdowns: [],
    generatedAt: '2026-10-06T10:00:00.000Z',
  },
};
const approvedReach = {
  success: true,
  data: {
    origin: 'SOCIETY', reach: 'SOCIETY_ONLY', verificationStatus: 'UNSUBMITTED', canWiden: false, nearbyKm: 3,
    homeSociety: { id: 's1', name: 'Green Park' }, societyApproval: { status: 'APPROVED', approvedAt: '2026-09-01T00:00:00.000Z' },
  },
};
const fullDay = {
  'GET /analytics/partner/today': board,
  'GET /partners/me/bookings': { success: true, data: [], page: 1, limit: 100, total: 0 },
  'GET /partners/me/orders': {
    success: true, page: 1, limit: 100, total: 1,
    data: [{ id: 'o1', code: '#214', status: 'PLACED', amounts: { totalPaise: 64200 }, itemCount: 3, customer: { name: 'B-904' }, createdAt: '2026-10-06T09:00:00.000Z' }],
  },
  'GET /partners/me/products': { success: true, page: 1, limit: 100, total: 1, data: [{ _id: 'p1', name: 'Milk 500 ml', stockQty: 4 }] },
};

beforeEach(() => {
  jest.spyOn(RN.Alert, 'alert').mockImplementation(() => undefined);
  mockEnt.ready = true;
  mockEnt.failed = false;
  mockEnt.modules = ['BOOKINGS', 'ORDERS', 'INVOICING', 'CATALOG'];
  mockEnt.business = { status: 'ACTIVE', verificationStatus: 'VERIFIED', onboardingStep: 9, kind: 'SHOP' };
  mockEnt.visibility = { discoverable: true, transactable: true, blockers: [] };
});

describe('Today — the proprietor\'s board', () => {
  it('hero, today\'s sale, New bill, shortcuts, pending orders and low stock', async () => {
    setRoutes(fullDay);
    await paper();
    expect(screen.getByText('Sharma General')).toBeTruthy();
    expect(await screen.findByText(formatPaise(1248000))).toBeTruthy();
    expect(screen.getByTestId('today-sales-card')).toBeTruthy();
    expect(screen.getByTestId('today-shortcuts')).toBeTruthy();
    expect(await screen.findByText('#214')).toBeTruthy();
    expect(screen.getByText(formatPaise(64200))).toBeTruthy();
    expect(await screen.findByText('Milk 500 ml')).toBeTruthy();
    // The one primary action: same destination as the NEW_BILL shortcut tile.
    await fireEvent.press(screen.getByTestId('today-new-bill'));
    expect(router.push).toHaveBeenCalledWith('/billing/new');
    // An empty diary is the calm empty state.
    expect(await screen.findByTestId('today-bookings-empty')).toBeTruthy();
    expect(screen.getByText(en.today.noBookings)).toBeTruthy();
  });

  it('a failed bookings read shows the error and Try again — not "nothing on the diary"', async () => {
    setRoutes({ ...fullDay, 'GET /partners/me/bookings': fail(500, {}) });
    await paper();
    expect(await screen.findByTestId('today-bookings-error')).toBeTruthy();
    expect(screen.queryByText(en.today.noBookings)).toBeNull();
    expect(screen.getByText(en.common.tryAgain)).toBeTruthy();
  });

  it('draws in dark mode too', async () => {
    const spy = jest.spyOn(RN, 'useColorScheme').mockReturnValue('dark');
    setRoutes(fullDay);
    await paper();
    expect(await screen.findByText(formatPaise(1248000))).toBeTruthy();
    expect(screen.getByTestId('today-hero')).toBeTruthy();
    spy.mockRestore();
  });
});

describe('Today — banners', () => {
  it('not discoverable: the blocker sentence in Hindi, not the server\'s English', async () => {
    mockEnt.visibility = {
      discoverable: false,
      transactable: false,
      blockers: [{ code: 'NO_LOCATION', message: 'Your map pin is missing. SERVER ENGLISH.', blocksDiscovery: true }],
    };
    setRoutes(fullDay);
    await paper('hi');
    expect(await screen.findByText(hi.today.notFoundTitle)).toBeTruthy();
    expect(screen.getByText(new RegExp(hi.today.blocker.NO_LOCATION))).toBeTruthy();
    expect(screen.queryByText(/SERVER ENGLISH/)).toBeNull();
    // The fix button goes to this app's own screen for the first blocker.
    await fireEvent.press(screen.getByTestId('today-banner-action'));
    expect(router.push).toHaveBeenCalledWith('/settings/address');
    // A warning replaces the board.
    expect(screen.queryByTestId('today-sales-card')).toBeNull();
  });

  it('suspended: the suspension, no sales card, and no "approved by your society" beside it', async () => {
    mockEnt.business = { status: 'SUSPENDED', verificationStatus: 'VERIFIED', onboardingStep: 9, kind: 'SHOP' };
    setRoutes({ ...fullDay, 'GET /partners/me/reach': approvedReach });
    await paper();
    expect(await screen.findByText(en.today.suspendedTitle)).toBeTruthy();
    expect(screen.queryByTestId('today-sales-card')).toBeNull();
    await waitFor(() => expect(screen.queryByTestId('home-society-banner')).toBeNull());
  });

  it('an active society shop still sees its approved banner', async () => {
    setRoutes({ ...fullDay, 'GET /partners/me/reach': approvedReach });
    await paper();
    expect(await screen.findByTestId('home-society-banner')).toBeTruthy();
  });

  it('entitlements still loading: a skeleton, not an empty screen', async () => {
    mockEnt.ready = false;
    setRoutes(fullDay);
    await paper();
    expect(screen.getByTestId('today-loading')).toBeTruthy();
  });
});
