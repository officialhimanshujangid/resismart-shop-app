/**
 * Commerce C1/C2 in the shop app — the "Online orders" half of Online shop
 * settings and the Today "Pause orders" card, checked against the BUILT
 * backend (`routes/commerce-storefront.routes.ts`, `validators/commerce.validator.ts`):
 *  - a storefront switch sends ONLY `{ storefront: { acceptOrdersWhenClosed } }`;
 *  - the delivery fee Save sends only the changed keys, tower rows included;
 *    FIXED_RATE brings the rate and SAC fields; the slot week sends only `slots.weekly`;
 *  - pause: the sheet posts `{ paused, forMinutes, note }`; Resume posts `{ paused: false }`;
 *  - share: the link, Share link, and the poster PDF through the share sheet;
 *  - the Today card is not drawn for a role that may not pause;
 *  - Hindi: no raw `commerce.` key.
 */
import React from 'react';
import { Share } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import CommerceSettingsScreen from '../../app/(app)/commerce/settings';
import { PauseOrdersCard } from '../features/commerce/components/PauseOrdersCard';
import {
  clockText, feeRowsClash, isPausedNow, minutesLeftToday, normaliseWeek, pauseBodyOf, slotWeekProblems, taxPercentIn,
} from '../features/commerce/storefrontApi';
import type { CommerceSettingsPayload } from '../features/commerce/types';
import { themeColors } from '../constants/colors';
import { callsTo, setRoutes } from './setup/mockApi';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

// ── who is looking: proprietor by default; `allow` narrows `can()` per test
const mockEnt: {
  isAdmin: boolean; permissions: Record<string, string>; features: string[]; allow: Set<string> | null; modules: string[] | null;
} = {
  isAdmin: true, permissions: {}, features: [], allow: null, modules: null,
};
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    can: (m: string) => mockEnt.allow === null || mockEnt.allow.has(m),
    hasModule: (m: string) => mockEnt.modules === null || mockEnt.modules.includes(m),
    ready: true,
    entitlements: {
      isAdmin: mockEnt.isAdmin, permissions: mockEnt.permissions, commerceFeatures: mockEnt.features, awaitingRole: false,
    },
    menu: [],
    roleLimits: {},
  }),
}));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { name: 'Ravi', phone: '9812345678' },
    profile: { role: 'PARTNER_ADMIN', tenantType: 'PARTNER', tenantId: 'p1', tenantName: 'Sharma Kirana' },
    logout: jest.fn(), availableContexts: [], switchToContext: jest.fn(),
  }),
}));
jest.mock('react-native-modal-datetime-picker', () => () => null);
jest.mock('expo-file-system', () => {
  class Directory { exists = true; create = jest.fn(); constructor(..._a: unknown[]) {} }
  class File { uri = 'file:///cache/commerce/shop-poster-en.pdf'; create = jest.fn(); write = jest.fn(); constructor(..._a: unknown[]) {} }
  return { Directory, File, Paths: { cache: 'cache' } };
});
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));

const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
const tr = (cat: unknown, path: string): string => {
  const v = path.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown> | undefined)?.[p], cat);
  if (typeof v !== 'string') throw new Error(`missing catalogue key ${path}`);
  return v;
};
const E = (path: string) => tr(en, path);
const H = (path: string) => tr(hi, path);
/** Any raw `commerce.` key on screen (the tree holds portals, so it is searched by text, not stringified). */
const rendered = () => screen.queryAllByText(/commerce\./).map(() => 'commerce.').join(' ');

const SETTINGS = '/partners/me/commerce/settings';
const PAUSE = '/partners/me/commerce/pause';
const SHARE = '/partners/me/commerce/share';
const SOC = 'aaaaaaaaaaaaaaaaaaaaaaa1';

const payload = (over: {
  storefront?: Record<string, unknown>; delivery?: Record<string, unknown>; share?: Record<string, unknown>; features?: string[];
} = {}): CommerceSettingsPayload => ({
  settings: {
    storefront: { acceptOrdersWhenClosed: true, ordersPaused: false, minOrderPaise: 0, ...over.storefront },
    delivery: {
      feeEnabled: true, feeMode: 'FLAT', flatFeePaise: 1000, societyFees: [], towerFees: [], freeAbovePaise: 0,
      taxMode: 'PRINCIPAL_SUPPLY', fixedTaxRatePercent: 18, sac: '996813', slotsEnabled: false,
      slots: { weekly: [], cutoffMin: 30, advanceDays: 2 }, ...over.delivery,
    },
    fulfilment: {
      partialAcceptEnabled: false, substitutionEnabled: false, deliveryStaffEnabled: false, proofMode: 'NONE',
      reserveStockAtPlace: false, autoCancelPlacedAfterHours: 0,
    },
    share: { enabled: false, ...over.share },
    offers: { enabled: false, couponsEnabled: false, maxOffersPerOrder: 2, allowAtCounter: true },
    catalog: { variantsEnabled: false, bundlesEnabled: false },
    wallet: { enabled: false, refundToCreditDefault: false, allowAtCounter: true },
    loyalty: { enabled: false, pointsPer100Rupees: 1, pointValuePaise: 100, minRedeemPoints: 0, maxRedeemPercent: 20, expiryDays: 365, earnAtCounter: true },
    referral: { enabled: false, referrerPoints: 0, refereePoints: 0, minQualifyingOrderPaise: 0 },
    growth: { broadcastEnabled: false, maxBroadcastsPerWeek: 2, backInStockEnabled: false },
    counter: { holdEnabled: false, quickKeys: [], splitTenderEnabled: false },
  },
  features: (over.features ?? ['DELIVERY_FEE']) as CommerceSettingsPayload['features'],
  explicit: { acceptOrdersWhenClosed: null },
  openNow: true,
  timezone: 'Asia/Kolkata',
} as CommerceSettingsPayload);

/** `GET /partners/me/commerce/delivery-areas` — the places the fee tables may name, with their towers. */
const areas = {
  success: true,
  data: [{ societyId: SOC, name: 'Green Park', towers: ['A Wing', 'B Wing'], sources: ['HOME'] }],
};

beforeEach(() => {
  mockEnt.isAdmin = true;
  mockEnt.permissions = {};
  mockEnt.features = [];
  mockEnt.allow = null;
  mockEnt.modules = null;
});

describe('a counter-only shop (INVOICING, no ORDERS)', () => {
  it('opens the counter, points, store credit and offers sections — no online-orders cards, no delivery areas asked', async () => {
    mockEnt.modules = ['INVOICING'];
    setRoutes({ [`GET ${SETTINGS}`]: { success: true, data: payload() }, [`PUT ${SETTINGS}`]: { success: true, data: payload() } });
    await paper(<CommerceSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-fold-counter')).toBeTruthy());
    expect(screen.getByTestId('settings-fold-wallet')).toBeTruthy();
    expect(screen.getByTestId('settings-fold-loyalty')).toBeTruthy();
    expect(screen.queryByTestId('settings-fold-storefront')).toBeNull();
    expect(screen.queryByTestId('settings-fold-deliveryFee')).toBeNull();
    expect(screen.queryByTestId('settings-fold-growth')).toBeNull();
    expect(screen.queryByTestId('settings-fold-catalog')).toBeNull();
    expect(screen.queryByTestId('settings-fold-offers')).toBeNull();
    expect(callsTo('GET', '/partners/me/commerce/delivery-areas')).toHaveLength(0);
    await fireEvent.press(screen.getByTestId('settings-fold-counter'));
    await fireEvent.press(screen.getByTestId('settings-switch-counter-holdEnabled'));
    await waitFor(() => expect(callsTo('PUT', SETTINGS)[0].body).toEqual({ counter: { holdEnabled: true } }));
  });
});

// ───────────────────────────────────────────────────────────── pure rules
describe('storefront rules', () => {
  it('pause body, timed pause, today\'s minutes', () => {
    expect(pauseBodyOf('60', '  Back after lunch ')).toEqual({ paused: true, forMinutes: 60, note: 'Back after lunch' });
    expect(pauseBodyOf('untilResume', '')).toEqual({ paused: true });
    const late = new Date(2026, 9, 2, 23, 58);
    expect(minutesLeftToday(late)).toBe(15);
    expect(minutesLeftToday(new Date(2026, 9, 2, 18, 0))).toBe(360);
    const now = new Date(2026, 9, 2, 12, 0);
    expect(isPausedNow({ ordersPaused: true }, now)).toBe(true);
    expect(isPausedNow({ ordersPaused: true, pausedUntil: new Date(2026, 9, 2, 11, 0).toISOString() }, now)).toBe(false);
    expect(isPausedNow({ ordersPaused: false }, now)).toBe(false);
    const tEn = (k: string, o?: Record<string, unknown>) => {
      const s = tr(en, k);
      return Object.entries(o ?? {}).reduce((acc, [key, v]) => acc.split(`{{${key}}}`).join(String(v)), s);
    };
    expect(clockText(new Date(2026, 9, 2, 18, 30).toISOString(), tEn, now)).toBe('6:30 PM');
  });

  it('fee rows, tax rate, slot week', () => {
    expect(feeRowsClash([{ societyId: SOC }, { societyId: SOC }], [])).toBe(true);
    expect(feeRowsClash([], [{ societyId: SOC, blockName: 'A' }, { societyId: SOC, blockName: ' a ' }])).toBe(true);
    expect(feeRowsClash([{ societyId: SOC }], [{ societyId: SOC, blockName: 'A' }])).toBe(false);
    expect(taxPercentIn('18')).toBe(18);
    expect(taxPercentIn('12.5')).toBe(12.5);
    expect(taxPercentIn('41')).toBeNull();
    const week = normaliseWeek([{ day: 1, isOpen: true, windows: [{ from: '10:00', to: '09:00' }], slotMin: 60, capacityPerSlot: 5 }]);
    expect(week).toHaveLength(7);
    expect(slotWeekProblems(week)).toEqual([1]);
  });
});

// ───────────────────────────────────────────────────────────── settings
describe('Online shop settings — online orders', () => {
  it('a storefront switch sends ONLY { storefront: { acceptOrdersWhenClosed: false } }', async () => {
    setRoutes({ [`GET ${SETTINGS}`]: { success: true, data: payload() }, [`PUT ${SETTINGS}`]: { success: true, data: payload() } });
    await paper(<CommerceSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-switch-storefront-acceptOrdersWhenClosed')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('settings-switch-storefront-acceptOrdersWhenClosed'));
    await waitFor(() => expect(callsTo('PUT', SETTINGS)).toHaveLength(1));
    expect(callsTo('PUT', SETTINGS)[0].body).toEqual({ storefront: { acceptOrdersWhenClosed: false } });
  });

  it('delivery fee Save sends only the changed keys, tower rows included', async () => {
    setRoutes({
      [`GET ${SETTINGS}`]: { success: true, data: payload() },
      [`PUT ${SETTINGS}`]: { success: true, data: payload() },
      'GET /partners/me/commerce/delivery-areas': areas,
    });
    await paper(<CommerceSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-fold-deliveryFee')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('settings-fold-deliveryFee'));
    await fireEvent.press(screen.getByText(E('commerce.storefront.fee.modes.PER_TOWER')));
    await waitFor(() => expect(screen.getByTestId('delivery-add-tower')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('delivery-add-tower'));
    expect(screen.getAllByText('Green Park').length).toBeGreaterThanOrEqual(1);
    // The society's towers from delivery-areas are one tap each.
    await waitFor(() => expect(screen.getByTestId('tower-pick-0')).toBeTruthy());
    await fireEvent.press(screen.getByText('A Wing'));
    expect(screen.getByTestId('tower-block-0').props.value).toBe('A Wing');
    await fireEvent.changeText(screen.getByTestId('tower-fee-0'), '20');
    await fireEvent.press(screen.getByTestId('settings-save-deliveryFee'));
    await waitFor(() => expect(callsTo('PUT', SETTINGS)).toHaveLength(1));
    expect(callsTo('PUT', SETTINGS)[0].body).toEqual({
      delivery: { feeMode: 'PER_TOWER', towerFees: [{ societyId: SOC, blockName: 'A Wing', feePaise: 2000 }] },
    });
  });

  it('FIXED_RATE shows the rate and the SAC; Save sends the mode and the new rate', async () => {
    setRoutes({ [`GET ${SETTINGS}`]: { success: true, data: payload() }, [`PUT ${SETTINGS}`]: { success: true, data: payload() } });
    await paper(<CommerceSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-fold-deliveryFee')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('settings-fold-deliveryFee'));
    expect(screen.queryByTestId('delivery-rate')).toBeNull();
    expect(screen.getByText(E('commerce.storefront.fee.taxHint.PRINCIPAL_SUPPLY'))).toBeTruthy();
    await fireEvent.press(screen.getByText(E('commerce.storefront.fee.taxModes.FIXED_RATE')));
    expect(screen.getByTestId('delivery-rate')).toBeTruthy();
    expect(screen.getByTestId('delivery-sac')).toBeTruthy();
    expect(screen.getByDisplayValue('996813')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('delivery-rate'), '12');
    await fireEvent.press(screen.getByTestId('settings-save-deliveryFee'));
    await waitFor(() => expect(callsTo('PUT', SETTINGS)).toHaveLength(1));
    expect(callsTo('PUT', SETTINGS)[0].body).toEqual({ delivery: { taxMode: 'FIXED_RATE', fixedTaxRatePercent: 12 } });
  });

  it('the slot week: opening Monday sends only slots.weekly (seven days)', async () => {
    setRoutes({ [`GET ${SETTINGS}`]: { success: true, data: payload() }, [`PUT ${SETTINGS}`]: { success: true, data: payload() } });
    await paper(<CommerceSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-fold-deliverySlots')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('settings-fold-deliverySlots'));
    await fireEvent.press(screen.getByText(E('common.daysLong.1')));
    await fireEvent.press(screen.getByTestId('settings-save-deliverySlots'));
    await waitFor(() => expect(callsTo('PUT', SETTINGS)).toHaveLength(1));
    const body = callsTo('PUT', SETTINGS)[0].body as { delivery: { slots: { weekly: Array<{ day: number; isOpen: boolean }> } } };
    expect(Object.keys(body.delivery)).toEqual(['slots']);
    expect(Object.keys(body.delivery.slots)).toEqual(['weekly']);
    expect(body.delivery.slots.weekly).toHaveLength(7);
    expect(body.delivery.slots.weekly[1]).toMatchObject({ day: 1, isOpen: true, windows: [{ from: '09:00', to: '21:00' }] });
  });

  it('share card: the link, Share link, and the poster through the share sheet', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    setRoutes({
      [`GET ${SETTINGS}`]: { success: true, data: payload({ share: { enabled: true }, features: ['SHARE'] }) },
      [`GET ${SHARE}`]: { success: true, data: { storeUrl: 'https://resismart.in/p/sharma-kirana', qrPngDataUrl: 'data:image/png;base64,AAAA' } },
      [`GET ${SHARE}/poster.pdf`]: new ArrayBuffer(4),
    });
    await paper(<CommerceSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-fold-share')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('settings-fold-share'));
    await waitFor(() => expect(screen.getByText('https://resismart.in/p/sharma-kirana')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('share-link-button'));
    expect((share.mock.calls[0][0] as { message: string }).message).toContain('https://resismart.in/p/sharma-kirana');
    await fireEvent.press(screen.getByTestId('share-poster-en'));
    const sharing = jest.requireMock('expo-sharing') as { shareAsync: jest.Mock };
    await waitFor(() => expect(sharing.shareAsync).toHaveBeenCalled());
    expect(callsTo('GET', `${SHARE}/poster.pdf`)[0].params).toEqual({ lang: 'en' });
  });
});

// ───────────────────────────────────────────────────────────── pause
describe('Pause orders', () => {
  it('Today card: the sheet posts { paused: true, forMinutes: 60, note }, then shows paused', async () => {
    let server = payload();
    setRoutes({
      [`GET ${SETTINGS}`]: () => ({ success: true, data: server }),
      [`POST ${PAUSE}`]: () => {
        const until = new Date(Date.now() + 60 * 60_000).toISOString();
        server = payload({ storefront: { ordersPaused: true, pausedUntil: until, pauseNote: 'Back after lunch' } });
        return { success: true, data: { storefront: { ...server.settings.storefront as object, pausedNow: true } } };
      },
    });
    await paper(<PauseOrdersCard c={themeColors(false)} />);
    await waitFor(() => expect(screen.getByTestId('pause-open')).toBeTruthy());
    expect(screen.getByText(E('commerce.storefront.pause.openTitle'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pause-open'));
    await waitFor(() => expect(screen.getByTestId('pause-confirm')).toBeTruthy());
    await fireEvent.press(screen.getByText(E('commerce.storefront.pause.choice.60')));
    await fireEvent.changeText(screen.getByTestId('pause-note'), 'Back after lunch');
    await fireEvent.press(screen.getByTestId('pause-confirm'));
    await waitFor(() => expect(callsTo('POST', PAUSE)).toHaveLength(1));
    expect(callsTo('POST', PAUSE)[0].body).toEqual({ paused: true, forMinutes: 60, note: 'Back after lunch' });
    await waitFor(() => expect(screen.getByTestId('pause-resume')).toBeTruthy());
    expect(screen.getByText(E('commerce.storefront.pause.pausedTitle'))).toBeTruthy();
  });

  it('paused: one tap Resume posts { paused: false }', async () => {
    setRoutes({
      [`GET ${SETTINGS}`]: { success: true, data: payload({ storefront: { ordersPaused: true } }) },
      [`POST ${PAUSE}`]: { success: true, data: { storefront: { acceptOrdersWhenClosed: true, ordersPaused: false, minOrderPaise: 0, pausedNow: false } } },
    });
    await paper(<PauseOrdersCard c={themeColors(false)} />);
    await waitFor(() => expect(screen.getByTestId('pause-resume')).toBeTruthy());
    expect(screen.getByText(E('commerce.storefront.pause.untilResume'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('pause-resume'));
    await waitFor(() => expect(callsTo('POST', PAUSE)).toHaveLength(1));
    expect(callsTo('POST', PAUSE)[0].body).toEqual({ paused: false });
  });

  it('Today card is not drawn for a role that may not pause, and nothing is asked', async () => {
    mockEnt.isAdmin = false;
    mockEnt.allow = new Set(['ORDERS_VIEW']);
    setRoutes({ [`GET ${SETTINGS}`]: { success: true, data: payload() } });
    await paper(<PauseOrdersCard c={themeColors(false)} />);
    expect(screen.queryByTestId('pause-orders-card')).toBeNull();
    expect(callsTo('GET', SETTINGS)).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────── Hindi
describe('Hindi', () => {
  it('online-orders cards and the Today card read Hindi with no raw commerce. keys', async () => {
    setRoutes({
      [`GET ${SETTINGS}`]: { success: true, data: payload({ share: { enabled: true }, features: ['SHARE', 'DELIVERY_FEE'], delivery: { feeMode: 'PER_TOWER' } }) },
      [`GET ${SHARE}`]: { success: true, data: { storeUrl: 'https://resismart.in/p/sharma-kirana', qrPngDataUrl: 'data:image/png;base64,AAAA' } },
      'GET /partners/me/commerce/delivery-areas': areas,
    });
    const page = await paper(<CommerceSettingsScreen />, 'hi');
    await waitFor(() => expect(screen.getByTestId('settings-fold-share')).toBeTruthy());
    for (const fold of ['settings-fold-deliveryFee', 'settings-fold-deliverySlots', 'settings-fold-fulfilment', 'settings-fold-share']) {
      await fireEvent.press(screen.getByTestId(fold));
    }
    await waitFor(() => expect(screen.getByText('https://resismart.in/p/sharma-kirana')).toBeTruthy());
    expect(screen.getByText(H('commerce.storefront.groupOnline'))).toBeTruthy();
    expect(screen.getByText(H('commerce.storefront.fee.byTower'))).toBeTruthy();
    expect(screen.getByText(H('commerce.storefront.fulfil.proof.OTP_OR_PHOTO'))).toBeTruthy();
    expect(rendered()).not.toMatch(/commerce\./);
    await page.unmount();

    await paper(<PauseOrdersCard c={themeColors(false)} />, 'hi');
    await waitFor(() => expect(screen.getByTestId('pause-open')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('pause-open'));
    await waitFor(() => expect(screen.getByText(H('commerce.storefront.pause.choice.untilResume'))).toBeTruthy());
    expect(rendered()).not.toMatch(/commerce\./);
  });
});
