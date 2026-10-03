// >>> MP1-COMPLETE — shop app P1 (product online-shop fields) + P2 (refundTo on credit note / sales return).
/**
 * P1: catalog create / [id] carry description, highlights, qtyStep, minQty, maxQty
 *     (`productCommerceFieldsSchema`), shown while the shop sells online or has any
 *     commerce feature on (or the product already has one), checked like the server,
 *     sent only when filled (create) / changed (update, `null` clears), and a
 *     COMMERCE_FIELD_INVALID {field} marks that box.
 * P2: "Refund as" (web RefundToChoice rules) on a credit note / sales return with a
 *     customer, only with WALLET on; default = the shop's setting; sent as `refundTo` on issue.
 */
import React from 'react';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import CreateProductScreen from '../../app/(app)/catalog/create';
import ProductDetailScreen from '../../app/(app)/catalog/[id]';
import DocumentDetailScreen from '../../app/(app)/billing/[id]';
import NewInvoiceScreen from '../../app/(app)/billing/new';
import CatalogLayout from '../../app/(app)/catalog/_layout';
import {
  hasShopFields, parseQty, shopFieldOfError, shopFieldsBody, shopFieldsFormOf, shopFieldsOn, shopFieldsProblems,
} from '../features/catalog/commerceFields';
import { asksRefundTo, refundToBody, refundToDefault } from '../features/billing/refundTo';
import { callsTo, fail, setRoutes } from './setup/mockApi';
import { setParams } from './setup/mockRouter';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const mockEnt: { features: string[]; modules: string[] } = { features: [], modules: ['ORDERS', 'INVOICING', 'CATALOG'] };
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    can: () => true,
    hasModule: (m: string) => mockEnt.modules.includes(m),
    ready: true,
    entitlements: { isAdmin: true, permissions: {}, commerceFeatures: mockEnt.features },
    roleLimits: {},
    menu: [],
  }),
  usePlanUsage: () => ({
    capacity: () => ({ included: false, used: 0, limit: null, atLimit: false, fraction: null, comingSoon: false }),
  }),
}));
// The shared router fake, with a Stack that DRAWS each screen's `headerRight` — so the
// catalog layout's "?" on add / edit product can be seen.
jest.mock('expo-router', () => {
  const base = jest.requireActual('./setup/mockRouter');
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const Stack = ({ children }: { children?: unknown }) => createElement(View, null, children);
  Stack.Screen = ({ name, options }: { name: string; options?: { headerRight?: (p: object) => unknown } }) =>
    createElement(View, { testID: `stack-screen-${name}` }, options?.headerRight ? options.headerRight({}) : null);
  return { ...base, Stack };
});
jest.mock('expo-file-system', () => {
  class Directory { exists = true; create = jest.fn(); constructor(..._a: unknown[]) {} }
  class File { uri = 'file:///cache/x.pdf'; create = jest.fn(); write = jest.fn(); constructor(..._a: unknown[]) {} }
  return { Directory, File, Paths: { cache: 'cache' } };
});
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-image-picker', () => ({ launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })) }));
jest.mock('react-native-modal-datetime-picker', () => () => null);
jest.mock('../features/scanner', () => ({ BarcodeScannerView: () => null }));

const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
const SP = en.catalog.shopPage;
const RT = en.billing.refundTo;
const access = (online: boolean, anyOn: boolean) =>
  ({ anyOn, settings: { visible: { online } } }) as unknown as Parameters<typeof shopFieldsOn>[0];

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockEnt.features = [];
  mockEnt.modules = ['ORDERS', 'INVOICING', 'CATALOG'];
});

// ═══════════════════════════════════════════════════════════════ P1 rules

describe('P1 product shop fields — rules', () => {
  const form = (over: Partial<ReturnType<typeof shopFieldsFormOf>> = {}) => ({ ...shopFieldsFormOf(null), ...over });

  it('shows while the shop sells online or any commerce feature is on, or the product already has a field', () => {
    expect(shopFieldsOn(access(true, false))).toBe(true);
    expect(shopFieldsOn(access(false, true))).toBe(true);
    expect(shopFieldsOn(access(false, false))).toBe(false);
    expect(shopFieldsOn(access(false, false), { qtyStep: 0.5 })).toBe(true);
    expect(hasShopFields({ description: '  ' })).toBe(false);
    expect(hasShopFields({ highlights: ['Fresh'] })).toBe(true);
  });

  it('mirrors the server checks: decimals, size, whole steps for counted units, multiples, min ≤ max', () => {
    expect(parseQty('0,25')).toBe(0.25);
    expect(parseQty('')).toBeUndefined();
    expect(parseQty('1e3')).toBeNaN();
    expect(shopFieldsProblems(form({ qtyStep: '0.2505' }), 'KG').qtyStep?.key).toBe('catalog.shopPage.err.qtyInvalid');
    expect(shopFieldsProblems(form({ qtyStep: '-1' }), 'KG').qtyStep?.key).toBe('catalog.shopPage.err.qtyInvalid');
    expect(shopFieldsProblems(form({ maxQty: '100001' }), 'KG').maxQty?.key).toBe('catalog.shopPage.err.qtyTooBig');
    expect(shopFieldsProblems(form({ qtyStep: '0.5' }), 'PCS').qtyStep?.key).toBe('catalog.shopPage.err.stepWhole');
    expect(shopFieldsProblems(form({ qtyStep: '0.5' }), 'KG')).toEqual({});
    expect(shopFieldsProblems(form({ qtyStep: '0.25', minQty: '0.3' }), 'KG').minQty).toEqual({ key: 'catalog.shopPage.err.notMultiple', params: { step: '0.25' } });
    expect(shopFieldsProblems(form({ minQty: '5', maxQty: '2' }), 'PCS').minQty?.key).toBe('catalog.shopPage.err.minAboveMax');
    expect(shopFieldsProblems(form({ description: 'x'.repeat(2001) }), 'PCS').description?.key).toBe('catalog.shopPage.err.descriptionTooLong');
    expect(shopFieldsProblems(form({ highlights: 'a\nb\nc\nd\ne\nf\ng' }), 'PCS').highlights?.key).toBe('catalog.shopPage.err.tooManyPoints');
    expect(shopFieldsProblems(form({ highlights: 'y'.repeat(121) }), 'PCS').highlights?.key).toBe('catalog.shopPage.err.pointTooLong');
    // Blank lines are not points.
    expect(shopFieldsProblems(form({ highlights: 'a\n\n\nb\n \nc\nd\ne\nf' }), 'PCS')).toEqual({});
  });

  it('create sends only what was filled in', () => {
    expect(shopFieldsBody(form())).toEqual({});
    expect(shopFieldsBody(form({ description: ' Fresh atta ', highlights: 'Stone ground\n\n Fresh ', qtyStep: '0.5' })))
      .toEqual({ description: 'Fresh atta', highlights: ['Stone ground', 'Fresh'], qtyStep: 0.5 });
  });

  it('update sends only what changed; an emptied box clears with null', () => {
    const stored = { description: 'Old', highlights: ['A', 'B'], qtyStep: 0.5, minQty: 1 };
    const f = shopFieldsFormOf(stored);
    expect(f).toEqual({ description: 'Old', highlights: 'A\nB', qtyStep: '0.5', minQty: '1', maxQty: '' });
    expect(shopFieldsBody(f, stored)).toEqual({});
    expect(shopFieldsBody({ ...f, description: '', highlights: 'A\nC', maxQty: '10' }, stored))
      .toEqual({ description: null, highlights: ['A', 'C'], maxQty: 10 });
    expect(shopFieldsBody({ ...f, qtyStep: '' }, stored)).toEqual({ qtyStep: null });
  });

  it('a COMMERCE_FIELD_INVALID names the box; any other refusal does not', () => {
    expect(shopFieldOfError('COMMERCE_FIELD_INVALID', { field: 'maxQty' })).toBe('maxQty');
    expect(shopFieldOfError('COMMERCE_FIELD_INVALID', { field: 'scheduledAt' })).toBeNull();
    expect(shopFieldOfError('PRODUCT_MISSING', { field: 'maxQty' })).toBeNull();
  });

  it('every word is in English and Hindi, with the agreed labels', () => {
    expect(SP.description).toBe('Description');
    expect(SP.highlights).toBe('Key points (one per line)');
    expect(SP.qtyStep).toBe('Sell in steps of');
    expect(SP.minQty).toBe('Minimum per order');
    expect(SP.maxQty).toBe('Maximum per order');
    const H = hi.catalog.shopPage;
    expect(H.description).toBe('विवरण');
    expect(H.highlights).toBe('ख़ास बातें (हर लाइन में एक)');
    expect(H.qtyStep).toBe('इतने-इतने में बिकेगा');
    expect(H.minQty).toBe('एक ऑर्डर में कम से कम');
    expect(H.maxQty).toBe('एक ऑर्डर में ज़्यादा से ज़्यादा');
    expect(Object.keys(H.err).sort()).toEqual(Object.keys(SP.err).sort());
  });
});

// ═══════════════════════════════════════════════════════════════ P1 screens

describe('P1 product shop fields — screens', () => {
  const shopInputs = () => within(screen.getByTestId('product-shop-fields')).getAllByTestId('text-input-outlined');

  async function fillBasics() {
    const all = screen.getAllByTestId('text-input-outlined');
    await fireEvent.changeText(all[0], 'Atta');
    await fireEvent.changeText(all[1], '50');
  }

  it('create: fills the page fields and sends them with the product', async () => {
    setRoutes({ 'POST /partners/me/products': { success: true, data: { _id: 'p9' } } });
    await paper(<CreateProductScreen />);
    expect(screen.getByText(SP.title)).toBeTruthy();
    await fillBasics();
    const [desc, points] = shopInputs();
    await fireEvent.changeText(desc, 'Stone-ground wheat flour');
    await fireEvent.changeText(points, 'Fresh every week\nNo additives');
    await fireEvent.changeText(screen.getByTestId('shop-max-qty'), '10');
    await fireEvent.press(screen.getByText(en.catalog.form.saveProduct));
    await waitFor(() => expect(callsTo('POST', '/partners/me/products')).toHaveLength(1));
    const body = callsTo('POST', '/partners/me/products')[0].body as Record<string, unknown>;
    expect(body).toMatchObject({ description: 'Stone-ground wheat flour', highlights: ['Fresh every week', 'No additives'], maxQty: 10 });
    expect(body).not.toHaveProperty('qtyStep');
    expect(body).not.toHaveProperty('minQty');
  });

  it('create: a half step on a PCS item is said on the box, nothing is sent', async () => {
    await paper(<CreateProductScreen />);
    await fillBasics();
    await fireEvent.changeText(screen.getByTestId('shop-qty-step'), '0.5');
    await fireEvent.press(screen.getByText(en.catalog.form.saveProduct));
    await waitFor(() => expect(screen.getByText(SP.err.stepWhole)).toBeTruthy());
    expect(callsTo('POST', '/partners/me/products')).toHaveLength(0);
  });

  it('create: the server refusal marks its box with the server sentence', async () => {
    setRoutes({ 'POST /partners/me/products': fail(400, { code: 'COMMERCE_FIELD_INVALID', params: { field: 'minQty' }, error: 'bad' }) });
    await paper(<CreateProductScreen />);
    await fillBasics();
    await fireEvent.changeText(screen.getByTestId('shop-min-qty'), '2');
    await fireEvent.press(screen.getByText(en.catalog.form.saveProduct));
    await waitFor(() => expect(screen.getByText(en.errors.COMMERCE_FIELD_INVALID)).toBeTruthy());
    expect(Alert.alert).toHaveBeenCalledWith(en.catalog.form.createFailed, en.errors.COMMERCE_FIELD_INVALID);
  });

  it('create: a counter-only shop with nothing switched on sees no page fields and sends none', async () => {
    mockEnt.modules = ['INVOICING', 'CATALOG'];
    setRoutes({ 'POST /partners/me/products': { success: true, data: { _id: 'p9' } } });
    await paper(<CreateProductScreen />);
    expect(screen.queryByTestId('product-shop-fields')).toBeNull();
    await fillBasics();
    await fireEvent.press(screen.getByText(en.catalog.form.saveProduct));
    await waitFor(() => expect(callsTo('POST', '/partners/me/products')).toHaveLength(1));
    const body = callsTo('POST', '/partners/me/products')[0].body as Record<string, unknown>;
    for (const k of ['description', 'highlights', 'qtyStep', 'minQty', 'maxQty']) expect(body).not.toHaveProperty(k);
  });

  it('edit: loads the stored fields; clearing one sends null, unchanged ones are not sent', async () => {
    mockEnt.modules = ['INVOICING', 'CATALOG']; // not online — shown because the product already has fields
    setParams({ id: 'p1' });
    const product = {
      _id: 'p1', name: 'Rice', unit: 'KG', sellPaise: 5000, mrpPaise: 0, taxRatePercent: 0, taxInclusive: true,
      stockQty: 10, trackStock: true, images: [], isActive: true, sortOrder: 0, createdAt: '', updatedAt: '2026-10-01T00:00:00Z',
      description: 'Basmati', highlights: ['Aged'], qtyStep: 0.5,
    };
    setRoutes({
      'GET /partners/me/products/p1': { success: true, data: product },
      'PUT /partners/me/products/p1': { success: true, data: product },
    });
    await paper(<ProductDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('product-shop-fields')).toBeTruthy());
    expect(screen.getByDisplayValue('Basmati')).toBeTruthy();
    expect(screen.getByDisplayValue('0.5')).toBeTruthy();
    const [desc] = shopInputs();
    await fireEvent.changeText(desc, '');
    await fireEvent.changeText(screen.getByTestId('shop-min-qty'), '1');
    await fireEvent.press(screen.getByText(en.catalog.form.saveChanges));
    await waitFor(() => expect(callsTo('PUT', '/partners/me/products/p1')).toHaveLength(1));
    const body = callsTo('PUT', '/partners/me/products/p1')[0].body as Record<string, unknown>;
    expect(body.description).toBeNull();
    expect(body.minQty).toBe(1);
    expect(body).not.toHaveProperty('qtyStep');
    expect(body).not.toHaveProperty('highlights');
    setParams({});
  });

  it('reads in Hindi', async () => {
    await paper(<CreateProductScreen />, 'hi');
    expect(screen.getByText(hi.catalog.shopPage.qtyStep)).toBeTruthy();
    expect(screen.queryByText(/catalog\.shopPage/)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════ P2 refundTo

describe('P2 refundTo — rules', () => {
  it('asked only with WALLET, on a credit note / sales return, for a named customer', () => {
    expect(asksRefundTo({ walletOn: true, type: 'CREDIT_NOTE', partyId: 'pa1' })).toBe(true);
    expect(asksRefundTo({ walletOn: true, type: 'SALES_RETURN', partyId: 'pa1' })).toBe(true);
    expect(asksRefundTo({ walletOn: false, type: 'CREDIT_NOTE', partyId: 'pa1' })).toBe(false);
    expect(asksRefundTo({ walletOn: true, type: 'TAX_INVOICE', partyId: 'pa1' })).toBe(false);
    expect(asksRefundTo({ walletOn: true, type: 'CREDIT_NOTE' })).toBe(false);
  });

  it('defaults to the shop setting, else unset; unset sends nothing', () => {
    expect(refundToDefault({ refundToCreditDefault: true })).toBe('STORE_CREDIT');
    expect(refundToDefault({ refundToCreditDefault: false })).toBe('CASH_OR_KHATA');
    expect(refundToDefault(undefined)).toBe('');
    expect(refundToBody({ walletOn: true, type: 'CREDIT_NOTE', partyId: 'pa1', refundTo: '' })).toEqual({});
    expect(refundToBody({ walletOn: true, type: 'CREDIT_NOTE', partyId: 'pa1', refundTo: 'STORE_CREDIT' })).toEqual({ refundTo: 'STORE_CREDIT' });
    expect(refundToBody({ walletOn: false, type: 'CREDIT_NOTE', partyId: 'pa1', refundTo: 'STORE_CREDIT' })).toEqual({});
  });

  it('the words are the web words, in both languages', () => {
    expect(RT).toEqual({
      label: 'Refund as', cash: 'Cash or khata', cashHint: 'Money back, or less owed on their khata',
      credit: 'Store credit', creditHint: 'Kept with the shop for their next purchase',
      unset: "If you do not choose, your shop's usual choice is used.",
    });
    expect(hi.billing.refundTo.label).toBe('वापसी कैसे करें');
    expect(Object.keys(hi.billing.refundTo).sort()).toEqual(Object.keys(RT).sort());
  });
});

describe('P2 refundTo — screens', () => {
  const draft = (over: Record<string, unknown> = {}) => ({
    _id: 'd1', type: 'CREDIT_NOTE', status: 'DRAFT', partyId: 'pa1', partySnapshot: { name: 'Asha' },
    lines: [], totals: { subPaise: 5000, taxPaise: 0, grandPaise: 5000, discountPaise: 0, roundOffPaise: 0 },
    paidPaise: 0, documentDate: '2026-10-01T00:00:00Z', ...over,
  });
  const settings = (creditDefault: boolean) => ({
    success: true, data: { settings: { wallet: { enabled: true, refundToCreditDefault: creditDefault, allowAtCounter: true } } },
  });

  it('document detail: follows the shop default, the choice is sent on issue', async () => {
    mockEnt.features = ['WALLET'];
    setParams({ id: 'd1' });
    setRoutes({
      'GET /partners/me/documents/d1': { success: true, data: draft(), conversionTargets: [] },
      'GET /partners/me/commerce/settings': settings(true),
      'POST /partners/me/documents/d1/issue': { success: true, data: draft({ status: 'ISSUED', number: 'CN-1' }), message: 'ok', warnings: [] },
    });
    await paper(<DocumentDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('refund-to')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('refund-to-STORE_CREDIT').props.accessibilityState).toMatchObject({ checked: true }));
    await fireEvent.press(screen.getByTestId('refund-to-CASH_OR_KHATA'));
    await fireEvent.press(screen.getByText(en.billing.detail.issueNow));
    await waitFor(() => expect(callsTo('POST', '/partners/me/documents/d1/issue')).toHaveLength(1));
    expect(callsTo('POST', '/partners/me/documents/d1/issue')[0].body).toEqual({ refundTo: 'CASH_OR_KHATA' });
    setParams({});
  });

  it('document detail: without store credit there is no choice and the body stays empty', async () => {
    setParams({ id: 'd1' });
    setRoutes({
      'GET /partners/me/documents/d1': { success: true, data: draft(), conversionTargets: [] },
      'POST /partners/me/documents/d1/issue': { success: true, data: draft({ status: 'ISSUED', number: 'CN-1' }), message: 'ok', warnings: [] },
    });
    await paper(<DocumentDetailScreen />);
    await waitFor(() => expect(screen.getByText(en.billing.detail.issueNow)).toBeTruthy());
    expect(screen.queryByTestId('refund-to')).toBeNull();
    await fireEvent.press(screen.getByText(en.billing.detail.issueNow));
    await waitFor(() => expect(callsTo('POST', '/partners/me/documents/d1/issue')).toHaveLength(1));
    expect(callsTo('POST', '/partners/me/documents/d1/issue')[0].body).toEqual({});
    expect(callsTo('GET', '/partners/me/commerce/settings')).toHaveLength(0);
    setParams({});
  });

  it('document detail: settings not readable → unset, the note says the shop default applies, nothing sent', async () => {
    mockEnt.features = ['WALLET'];
    setParams({ id: 'd1' });
    setRoutes({
      'GET /partners/me/documents/d1': { success: true, data: draft({ type: 'SALES_RETURN' }), conversionTargets: [] },
      'GET /partners/me/commerce/settings': fail(403, { code: 'FORBIDDEN' }),
      'POST /partners/me/documents/d1/issue': { success: true, data: draft({ status: 'ISSUED', number: 'SR-1' }), message: 'ok', warnings: [] },
    });
    await paper(<DocumentDetailScreen />);
    await waitFor(() => expect(screen.getByTestId('refund-to-unset')).toBeTruthy());
    expect(screen.getByText(RT.unset)).toBeTruthy();
    await fireEvent.press(screen.getByText(en.billing.detail.issueNow));
    await waitFor(() => expect(callsTo('POST', '/partners/me/documents/d1/issue')).toHaveLength(1));
    expect(callsTo('POST', '/partners/me/documents/d1/issue')[0].body).toEqual({});
    setParams({});
  });

  it('new credit note for a customer: the choice rides on the queued draft and is sent on issue', async () => {
    mockEnt.features = ['WALLET'];
    setParams({ partyId: 'pa1', partyName: 'Asha', itemName: 'Rice', ratePaise: '5000' });
    setRoutes({
      'GET /partners/me/commerce/settings': settings(false),
      'POST /partners/me/documents': { success: true, data: { _id: 'd7' } },
      'POST /partners/me/documents/d7/issue': { success: true, data: draft({ _id: 'd7', status: 'ISSUED', number: 'CN-7' }), message: 'ok', warnings: [] },
    });
    await paper(<NewInvoiceScreen />);
    expect(screen.queryByTestId('refund-to')).toBeNull(); // a tax invoice is never asked
    await fireEvent.press(screen.getByText(en.billing.documentType.CREDIT_NOTE));
    await waitFor(() => expect(screen.getByTestId('refund-to')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('refund-to-CASH_OR_KHATA').props.accessibilityState).toMatchObject({ checked: true }));
    await fireEvent.press(screen.getByTestId('refund-to-STORE_CREDIT'));
    await fireEvent.press(screen.getByTestId('bill-primary'));
    await waitFor(() => expect(callsTo('POST', '/partners/me/documents/d7/issue')).toHaveLength(1));
    expect(callsTo('POST', '/partners/me/documents')[0].body).toMatchObject({ type: 'CREDIT_NOTE', partyId: 'pa1' });
    expect(callsTo('POST', '/partners/me/documents')[0].body).not.toHaveProperty('refundTo');
    expect(callsTo('POST', '/partners/me/documents/d7/issue')[0].body).toEqual({ refundTo: 'STORE_CREDIT' });
    setParams({});
  });
});

// ═══════════════════════════════════════════════════════════════ "?" help on the MP-1 screens

describe('Help button on the counter and the product screens', () => {
  it('the counter (New bill, no stack header) has its own "?"', async () => {
    await paper(<NewInvoiceScreen />);
    expect(screen.getByLabelText(en.help.openHelp)).toBeTruthy();
  });

  it('add product and edit product carry the "?" in their header, like the list', async () => {
    await paper(<CatalogLayout />);
    for (const name of ['index', 'create', '[id]']) {
      expect(within(screen.getByTestId(`stack-screen-${name}`)).getByLabelText(en.help.openHelp)).toBeTruthy();
    }
  });
});
// <<< MP1-COMPLETE
