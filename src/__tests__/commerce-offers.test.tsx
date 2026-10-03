/**
 * Commerce C3 — Offers (list, editor, detail) and the C3–C6 Online shop
 * settings, checked against the BUILT backend routes
 * (`commerce-offer.routes.ts`, the C1 settings router):
 *  - the list: rows, benefit words, kind / state chips, filter, feature-off;
 *  - the editor: the POST body of a % off coupon, a field error, the edit PUT
 *    (no `kind`), a coded refusal (OFFER_CODE_TAKEN) in our words;
 *  - the detail: Pause posts `{ status: 'PAUSED' }`, Share coupon;
 *  - settings: one switch tap sends ONLY that key; a section Save sends only
 *    the changed numbers; a role without the section is read-only;
 *  - Hindi: no raw `commerce.` key anywhere on the four screens.
 */
import React from 'react';
import { Alert, Share } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import OffersScreen from '../../app/(app)/commerce/offers/index';
import OfferEditScreen from '../../app/(app)/commerce/offers/edit';
import OfferDetailScreen from '../../app/(app)/commerce/offers/[id]';
import CommerceSettingsScreen from '../../app/(app)/commerce/settings';
import { cleanCouponCode, makeCouponCode } from '../features/commerce/offersLogic';
import type { CommerceSettingsPayload, OfferDetail, OfferView } from '../features/commerce/types';
import { callsTo, fail, mockApi, setRoutes } from './setup/mockApi';
import { router, setParams } from './setup/mockRouter';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

// ── who is looking: proprietor by default, switchable per test
const mockEnt: { isAdmin: boolean; permissions: Record<string, string>; features: string[] } = {
  isAdmin: true, permissions: {}, features: ['OFFERS'],
};
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    can: () => true,
    hasModule: () => true,
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
    profile: { role: 'PARTNER_ADMIN', tenantType: 'PARTNER', tenantId: 'p1', tenantName: 'Sharma Medicals' },
    logout: jest.fn(), availableContexts: [], switchToContext: jest.fn(),
  }),
}));
jest.mock('react-native-modal-datetime-picker', () => () => null);

const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
/** A catalogue sentence by path (keys are merged into en/hi by the orchestrator). */
const tr = (cat: unknown, path: string): string => {
  const v = path.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown> | undefined)?.[p], cat);
  if (typeof v !== 'string') throw new Error(`missing catalogue key ${path}`);
  return v;
};
const E = (path: string) => tr(en, path);
const H = (path: string) => tr(hi, path);
const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(String(v)), s);

const BASE = '/partners/me/offers';
const SETTINGS = '/partners/me/commerce/settings';

const offer = (over: Partial<OfferView> = {}): OfferView => ({
  id: 'o1', name: 'Weekend 10% off', kind: 'AUTO',
  benefit: { type: 'PERCENT', percentBp: 1000 },
  conditions: {}, scope: { type: 'ORDER' }, channels: ['ONLINE', 'COUNTER'],
  limits: {}, stacking: { stackable: false, priority: 0 },
  status: 'ACTIVE', stats: { usedCount: 0, discountGivenPaise: 0 }, live: true,
  ...over,
});
const coupon = (over: Partial<OfferView> = {}): OfferView => offer({
  id: 'o2', name: 'Diwali coupon', kind: 'COUPON', code: 'DIWALI50',
  benefit: { type: 'FLAT', valuePaise: 5000 }, conditions: { minOrderPaise: 50000 },
  status: 'PAUSED', live: false, stats: { usedCount: 3, discountGivenPaise: 15000 },
  ...over,
});
const detail = (o: OfferView, recent: OfferDetail['recentRedemptions'] = []): OfferDetail => ({ ...o, recentRedemptions: recent });

const settingsPayload = (over: Partial<CommerceSettingsPayload['settings']['offers']> = {}): CommerceSettingsPayload => ({
  settings: {
    offers: { enabled: false, couponsEnabled: true, maxOffersPerOrder: 1, allowAtCounter: true, ...over },
    catalog: { variantsEnabled: false, bundlesEnabled: false },
    wallet: { enabled: false, refundToCreditDefault: false, allowAtCounter: true },
    loyalty: { enabled: false, pointsPer100Rupees: 1, pointValuePaise: 100, minRedeemPoints: 0, maxRedeemPercent: 50, expiryDays: 365, earnAtCounter: true },
    referral: { enabled: false, referrerPoints: 0, refereePoints: 0, minQualifyingOrderPaise: 0 },
    growth: { broadcastEnabled: false, maxBroadcastsPerWeek: 2, backInStockEnabled: false },
    counter: { holdEnabled: false, quickKeys: [], splitTenderEnabled: false },
  },
  features: ['OFFERS'],
});

/** Every bit of text and every label the screen drew. */
/** Any raw `commerce.` key on screen (the tree holds portals, so it is searched by text, not stringified). */
const rendered = () => screen.queryAllByText(/commerce\./).map(() => 'commerce.').join(' ');

beforeEach(() => {
  mockEnt.isAdmin = true;
  mockEnt.permissions = {};
  mockEnt.features = ['OFFERS'];
});

// ───────────────────────────────────────────────────────────── helpers
describe('offer helpers', () => {
  it('"Make a code" gives six easy characters; typing is cleaned to A–Z/0–9', () => {
    const code = makeCouponCode();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(code).not.toMatch(/[01OI]/);
    expect(cleanCouponCode('diwali-10 off!')).toBe('DIWALI10OFF');
    expect(cleanCouponCode('a'.repeat(30))).toHaveLength(16);
  });
});

// ───────────────────────────────────────────────────────────── list
describe('Offers — list', () => {
  it('rows with benefit words, kind and state chips; asks for running offers; a tap opens the offer', async () => {
    setRoutes({ [`GET ${BASE}`]: { success: true, data: [offer(), coupon()], page: 1, limit: 50, total: 2 } });
    await paper(<OffersScreen />);
    await waitFor(() => expect(screen.getByText('Weekend 10% off')).toBeTruthy());
    expect(screen.getByText('Diwali coupon')).toBeTruthy();
    expect(screen.getByText(fill(E('commerce.offers.benefit.percent'), { percent: 10 }))).toBeTruthy();
    expect(within(screen.getByTestId('offer-kind-o1')).getByText(E('commerce.offers.kind.AUTO'))).toBeTruthy();
    expect(within(screen.getByTestId('offer-kind-o2')).getByText('DIWALI50')).toBeTruthy();
    expect(within(screen.getByTestId('offer-state-o1')).getByText(E('commerce.offers.state.RUNNING'))).toBeTruthy();
    expect(within(screen.getByTestId('offer-state-o2')).getByText(E('commerce.offers.state.PAUSED'))).toBeTruthy();
    expect(screen.getByTestId('offers-create')).toBeTruthy();
    expect(callsTo('GET', BASE)[0].params).toMatchObject({ status: 'ACTIVE', limit: 50 });

    await fireEvent.press(screen.getByTestId('offer-row-o1'));
    expect(router.push).toHaveBeenCalledWith('/commerce/offers/o1');
    await fireEvent.press(screen.getByTestId('offers-create'));
    expect(router.push).toHaveBeenCalledWith('/commerce/offers/edit');
  });

  it('the Ended filter asks the server for ARCHIVED; an empty answer shows the empty state', async () => {
    setRoutes({ [`GET ${BASE}`]: { success: true, data: [], page: 1, limit: 50, total: 0 } });
    await paper(<OffersScreen />);
    await waitFor(() => expect(screen.getByText(E('commerce.offers.empty.ACTIVE'))).toBeTruthy());
    await fireEvent.press(screen.getByText(E('commerce.offers.filter.ARCHIVED')));
    await waitFor(() => expect(callsTo('GET', BASE).some((c) => (c.params as { status?: string }).status === 'ARCHIVED')).toBe(true));
    await waitFor(() => expect(screen.getByText(E('commerce.offers.empty.ARCHIVED'))).toBeTruthy());
  });

  it('feature off: the banner shows, the list still loads, no Create offer', async () => {
    mockEnt.features = [];
    setRoutes({ [`GET ${BASE}`]: { success: true, data: [offer()], page: 1, limit: 50, total: 1 } });
    await paper(<OffersScreen />);
    await waitFor(() => expect(screen.getByText('Weekend 10% off')).toBeTruthy());
    expect(screen.getByTestId('feature-off')).toBeTruthy();
    expect(screen.queryByTestId('offers-create')).toBeNull();
  });

  it('a role without OFFERS_VIEW: no access, nothing asked', async () => {
    mockEnt.isAdmin = false;
    await paper(<OffersScreen />);
    expect(screen.getByTestId('no-access')).toBeTruthy();
    expect(callsTo('GET', BASE)).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────── editor
describe('Offers — editor', () => {
  it('a % off coupon: POSTs the schema body with an upper-case code, both channels and one idempotency key', async () => {
    setParams({ kind: 'COUPON' });
    setRoutes({
      [`GET ${SETTINGS}`]: { success: true, data: settingsPayload({ enabled: true }) },
      [`POST ${BASE}`]: { success: true, data: offer({ id: 'new1', kind: 'COUPON', code: 'DIWALI10' }) },
    });
    await paper(<OfferEditScreen />);
    await waitFor(() => expect(screen.getByTestId('offer-name')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('offer-name'), 'Diwali 10%');
    await fireEvent.press(screen.getByTestId('offer-type-PERCENT'));
    await fireEvent.changeText(screen.getByTestId('offer-percent'), '10');
    await fireEvent.changeText(screen.getByTestId('offer-code'), 'diwali10');
    expect(screen.getByDisplayValue('DIWALI10')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('offer-save'));

    await waitFor(() => expect(callsTo('POST', BASE)).toHaveLength(1));
    const body = callsTo('POST', BASE)[0].body as Record<string, unknown>;
    expect(body).toMatchObject({
      name: 'Diwali 10%',
      kind: 'COUPON',
      code: 'DIWALI10',
      benefit: { type: 'PERCENT', percentBp: 1000 },
      scope: { type: 'ORDER' },
      channels: ['ONLINE', 'COUNTER'],
      stacking: { stackable: false, priority: 0 },
    });
    const config = mockApi.post.mock.calls[mockApi.post.mock.calls.length - 1][2] as { headers: Record<string, string> };
    expect(config.headers['Idempotency-Key']).toMatch(/^offer-/);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/commerce/offers/new1'));
  });

  it('no name → the field error, nothing sent', async () => {
    setRoutes({ [`GET ${SETTINGS}`]: { success: true, data: settingsPayload() } });
    await paper(<OfferEditScreen />);
    await waitFor(() => expect(screen.getByTestId('offer-save')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('offer-percent'), '10');
    await fireEvent.press(screen.getByTestId('offer-save'));
    await waitFor(() => expect(screen.getByText(E('commerce.offers.err.name'))).toBeTruthy());
    expect(callsTo('POST', BASE)).toHaveLength(0);
  });

  it('coupons switched off: only Automatic is offered', async () => {
    setParams({ kind: 'COUPON' });
    setRoutes({ [`GET ${SETTINGS}`]: { success: true, data: settingsPayload({ couponsEnabled: false }) } });
    await paper(<OfferEditScreen />);
    await waitFor(() => expect(screen.getByText(E('commerce.offers.edit.couponsOffHint'))).toBeTruthy());
    expect(screen.queryByTestId('offer-code')).toBeNull();
  });

  it('edit: PUTs the offer whole again WITHOUT kind, then opens it', async () => {
    setParams({ id: 'o1' });
    setRoutes({
      [`GET ${BASE}/o1`]: { success: true, data: detail(offer()) },
      [`PUT ${BASE}/o1`]: { success: true, data: offer({ name: 'Weekend 15% off' }) },
    });
    await paper(<OfferEditScreen />);
    await waitFor(() => expect(screen.getByDisplayValue('Weekend 10% off')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('offer-name'), 'Weekend 15% off');
    await fireEvent.changeText(screen.getByTestId('offer-percent'), '15');
    await fireEvent.press(screen.getByTestId('offer-save'));
    await waitFor(() => expect(callsTo('PUT', `${BASE}/o1`)).toHaveLength(1));
    const body = callsTo('PUT', `${BASE}/o1`)[0].body as Record<string, unknown>;
    expect(body).not.toHaveProperty('kind');
    expect(body).toMatchObject({ name: 'Weekend 15% off', benefit: { type: 'PERCENT', percentBp: 1500 } });
    expect(callsTo('POST', BASE)).toHaveLength(0);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/commerce/offers/o1'));
  });

  it('a used offer: the C-5 banner shows and the discount inputs are locked', async () => {
    setParams({ id: 'o2' });
    setRoutes({ [`GET ${BASE}/o2`]: { success: true, data: detail(coupon({ status: 'ACTIVE' })) } });
    await paper(<OfferEditScreen />);
    await waitFor(() => expect(screen.getByTestId('offer-locked')).toBeTruthy());
    expect(screen.queryByTestId('offer-make-code')).toBeNull();
    expect(screen.queryByTestId('offer-kind')).toBeNull();
  });

  it('OFFER_CODE_TAKEN → our sentence, the same as the backend\'s', async () => {
    const backend = 'Another offer already uses that code. Choose a different code.';
    setParams({ kind: 'COUPON' });
    setRoutes({
      [`GET ${SETTINGS}`]: { success: true, data: settingsPayload() },
      [`POST ${BASE}`]: fail(409, { code: 'OFFER_CODE_TAKEN', error: backend }),
    });
    await paper(<OfferEditScreen />);
    await waitFor(() => expect(screen.getByTestId('offer-name')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('offer-name'), 'Diwali');
    await fireEvent.changeText(screen.getByTestId('offer-percent'), '10');
    await fireEvent.changeText(screen.getByTestId('offer-code'), 'DIWALI10');
    await fireEvent.press(screen.getByTestId('offer-save'));
    await waitFor(() => expect(screen.getByText(E('errors.OFFER_CODE_TAKEN'))).toBeTruthy());
    expect(E('errors.OFFER_CODE_TAKEN')).toBe(backend);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('a role without OFFERS_MANAGE: no access', async () => {
    mockEnt.isAdmin = false;
    mockEnt.permissions = { OFFERS_VIEW: 'READ' };
    await paper(<OfferEditScreen />);
    expect(screen.getByTestId('no-access')).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────── detail
describe('Offers — detail', () => {
  beforeEach(() => setParams({ id: 'o1' }));

  it('Pause posts { status: PAUSED } to the status route', async () => {
    setRoutes({
      [`GET ${BASE}/o1`]: { success: true, data: detail(offer(), [
        { id: 'r1', sourceType: 'ORDER', sourceId: 's1', sourceRef: 'ORD-0042', partyName: 'Meena', discountPaise: 2500, status: 'APPLIED', createdAt: '2026-10-01T10:00:00.000Z' },
      ]) },
      [`POST ${BASE}/o1/status`]: { success: true, data: offer({ status: 'PAUSED', live: false }) },
    });
    await paper(<OfferDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('offer-pause')).toBeTruthy());
    expect(screen.getByText('ORD-0042 · Meena')).toBeTruthy();
    expect(screen.getByText(E('commerce.offers.detail.useStatus.APPLIED'))).toBeTruthy();
    expect(screen.queryByTestId('offer-resume')).toBeNull();
    await fireEvent.press(screen.getByTestId('offer-pause'));
    await waitFor(() => expect(callsTo('POST', `${BASE}/o1/status`)).toHaveLength(1));
    expect(callsTo('POST', `${BASE}/o1/status`)[0].body).toEqual({ status: 'PAUSED' });
  });

  it('a coupon: Share coupon sends the shop name, the offer and the code', async () => {
    setParams({ id: 'o2' });
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    setRoutes({ [`GET ${BASE}/o2`]: { success: true, data: detail(coupon()) } });
    await paper(<OfferDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('offer-share')).toBeTruthy());
    expect(screen.getByTestId('offer-resume')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('offer-share'));
    expect(share).toHaveBeenCalledTimes(1);
    const message = (share.mock.calls[0][0] as { message: string }).message;
    expect(message).toContain('Sharma Medicals');
    expect(message).toContain(fill(E('commerce.offers.share.code'), { code: 'DIWALI50' }));
  });

  it('Load more asks /redemptions page 1', async () => {
    const recent = Array.from({ length: 10 }, (_, i) => ({
      id: `r${i}`, sourceType: 'DOCUMENT' as const, sourceId: `d${i}`, sourceRef: `INV-${i}`, discountPaise: 100,
      status: 'APPLIED' as const, createdAt: '2026-10-01T10:00:00.000Z',
    }));
    setRoutes({
      [`GET ${BASE}/o1`]: { success: true, data: detail(offer({ stats: { usedCount: 12, discountGivenPaise: 1200 } }), recent) },
      [`GET ${BASE}/o1/redemptions`]: { success: true, data: recent.slice(0, 2), page: 1, limit: 25, total: 12 },
    });
    await paper(<OfferDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('offer-uses-more')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('offer-uses-more'));
    await waitFor(() => expect(callsTo('GET', `${BASE}/o1/redemptions`)).toHaveLength(1));
    expect(callsTo('GET', `${BASE}/o1/redemptions`)[0].params).toEqual({ page: 1, limit: 25 });
  });
});

// ───────────────────────────────────────────────────────────── settings
describe('Online shop settings (C3–C6)', () => {
  it('one switch tap sends ONLY that key of its section', async () => {
    setRoutes({
      [`GET ${SETTINGS}`]: { success: true, data: settingsPayload() },
      [`PUT ${SETTINGS}`]: { success: true, data: settingsPayload({ enabled: true }) },
    });
    await paper(<CommerceSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-fold-offers')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('settings-fold-offers'));
    await waitFor(() => expect(screen.getByTestId('settings-switch-offers-enabled')).toBeTruthy());
    expect(within(screen.getByTestId('settings-features')).getByText(E('commerce.settings.feature.OFFERS'))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('settings-switch-offers-enabled'));
    await waitFor(() => expect(callsTo('PUT', SETTINGS)).toHaveLength(1));
    expect(callsTo('PUT', SETTINGS)[0].body).toEqual({ offers: { enabled: true } });
    const config = mockApi.put.mock.calls[0][2] as { headers: Record<string, string> };
    expect(config.headers['Idempotency-Key']).toMatch(/^settings-/);
  });

  it('a section Save sends only the changed numbers', async () => {
    setRoutes({
      [`GET ${SETTINGS}`]: { success: true, data: settingsPayload() },
      [`PUT ${SETTINGS}`]: { success: true, data: settingsPayload({ maxOffersPerOrder: 3 }) },
    });
    await paper(<CommerceSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-fold-offers')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('settings-fold-offers'));
    await waitFor(() => expect(screen.getByTestId('settings-number-offers-maxOffersPerOrder')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('settings-number-offers-maxOffersPerOrder'), '3');
    await fireEvent.press(screen.getByTestId('settings-save-offers'));
    await waitFor(() => expect(callsTo('PUT', SETTINGS)).toHaveLength(1));
    expect(callsTo('PUT', SETTINGS)[0].body).toEqual({ offers: { maxOffersPerOrder: 3 } });
  });

  it('a refused switch goes back and says why', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setRoutes({
      [`GET ${SETTINGS}`]: { success: true, data: settingsPayload() },
      [`PUT ${SETTINGS}`]: fail(403, { code: 'COMMERCE_FEATURE_OFF', error: 'x' }),
    });
    await paper(<CommerceSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-fold-offers')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('settings-fold-offers'));
    await waitFor(() => expect(screen.getByTestId('settings-switch-offers-enabled')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('settings-switch-offers-enabled'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('settings-switch-offers-enabled').props.accessibilityState).toMatchObject({ checked: false }));
  });

  it('a role with STOREFRONT_MANAGE but not OFFERS_MANAGE: Offers is read-only', async () => {
    mockEnt.isAdmin = false;
    mockEnt.permissions = { STOREFRONT_MANAGE: 'FULL', OFFERS_VIEW: 'READ' };
    setRoutes({ [`GET ${SETTINGS}`]: { success: true, data: settingsPayload() } });
    await paper(<CommerceSettingsScreen />);
    await waitFor(() => expect(screen.getByTestId('settings-fold-offers')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('settings-fold-offers'));
    await waitFor(() => expect(screen.getByTestId('settings-readonly-offers')).toBeTruthy());
    expect(screen.queryByTestId('settings-readonly-catalog')).toBeNull();
    await fireEvent.press(screen.getByTestId('settings-switch-offers-enabled'));
    expect(callsTo('PUT', SETTINGS)).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────────────────── Hindi
describe('Hindi', () => {
  it('list, editor, detail and settings read Hindi with no raw commerce. keys', async () => {
    setRoutes({
      [`GET ${BASE}`]: { success: true, data: [offer(), coupon()], page: 1, limit: 50, total: 2 },
      [`GET ${BASE}/o2`]: { success: true, data: detail(coupon(), [
        { id: 'r1', sourceType: 'ORDER', sourceId: 's1', discountPaise: 5000, status: 'REVERSED', createdAt: '2026-10-01T10:00:00.000Z' },
      ]) },
      [`GET ${SETTINGS}`]: { success: true, data: settingsPayload() },
    });

    const list = await paper(<OffersScreen />, 'hi');
    await waitFor(() => expect(screen.getByText('Diwali coupon')).toBeTruthy());
    await fireEvent.press(screen.getByText(H('commerce.common.howItWorks')));
    expect(screen.getByText(H('commerce.help.offers'))).toBeTruthy();
    expect(screen.getByText(H('commerce.offers.create'))).toBeTruthy();
    expect(rendered()).not.toMatch(/commerce\./);
    await list.unmount();

    const editor = await paper(<OfferEditScreen />, 'hi');
    await waitFor(() => expect(screen.getByTestId('offer-save')).toBeTruthy());
    for (const fold of ['fold-who', 'fold-which', 'fold-where', 'fold-limits', 'fold-stacking']) await fireEvent.press(screen.getByTestId(fold));
    await fireEvent.press(screen.getByTestId('offer-save'));
    await waitFor(() => expect(screen.getByText(H('commerce.offers.err.name'))).toBeTruthy());
    expect(screen.getByText(H('commerce.offers.edit.titleNew'))).toBeTruthy();
    expect(rendered()).not.toMatch(/commerce\./);
    await editor.unmount();

    setParams({ id: 'o2' });
    const one = await paper(<OfferDetailScreen />, 'hi');
    await waitFor(() => expect(screen.getByText(H('commerce.offers.detail.share'))).toBeTruthy());
    expect(screen.getByText(H('commerce.offers.detail.useStatus.REVERSED'))).toBeTruthy();
    expect(rendered()).not.toMatch(/commerce\./);
    await one.unmount();

    await paper(<CommerceSettingsScreen />, 'hi');
    await waitFor(() => expect(screen.getByTestId('settings-fold-counter')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('settings-fold-counter'));
    expect(screen.getByText(H('commerce.settings.counter.holdEnabled'))).toBeTruthy();
    expect(screen.getByText(H('commerce.storefront.groupOnline'))).toBeTruthy();
    expect(screen.getAllByText(H('commerce.settings.title')).length).toBeGreaterThanOrEqual(1);
    expect(rendered()).not.toMatch(/commerce\./);
  });
});
