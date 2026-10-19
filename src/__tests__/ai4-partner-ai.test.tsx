/**
 * AI-4 — the partner AI drafts in the shop app (parity with the website):
 *   - words: every partner AI code in en + hi; i18next `{{…}}` placeholders;
 *   - P1: Add product shows "Fill from a photo" only when the business has it; the
 *     photo fills the EXISTING form, the price stays empty, nothing is saved until
 *     "Save product" (which then carries the photo);
 *   - P2: a new purchase bill shows "Fill from the supplier bill"; the bill fills
 *     the EXISTING form, the duplicate is flagged, "Add as product" opens Add
 *     product pre-filled (no price), nothing is saved by the AI;
 *   - Purchases › Bills shows the shortcut only when on.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import i18n from 'i18next';
import { renderScreen } from './setup/harness';
import { setRoutes, callsTo, fail } from './setup/mockApi';
import { router, setParams } from './setup/mockRouter';
import { ToastProvider } from '../components/ui';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';
import { AI_PARTNER_ERROR_CODES, toAiPartnerStatus } from '../api/ai-partner.api';

jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    can: () => true,
    hasModule: () => true,
    ready: true,
    entitlements: { isAdmin: true, permissions: {}, commerceFeatures: [] },
    roleLimits: {},
    menu: [],
  }),
  usePlanUsage: () => ({
    capacity: () => ({ included: false, used: 0, limit: null, atLimit: false, fraction: null, comingSoon: false }),
  }),
}));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: false, assets: [{ uri: 'file:///item.jpg', fileName: 'item.jpg', mimeType: 'image/jpeg' }] })),
}));
jest.mock('react-native-modal-datetime-picker', () => () => null);
jest.mock('../features/scanner', () => ({ BarcodeScannerView: () => null }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const CreateProductScreen = require('../../app/(app)/catalog/create').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NewInvoiceScreen = require('../../app/(app)/billing/new').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PurchasesHome = require('../../app/(app)/purchases/index').default;

const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o);
const wrap = (data: unknown) => ({ success: true, data });
const show = (ui: React.ReactElement) => renderScreen(<PaperProvider><ToastProvider>{ui}</ToastProvider></PaperProvider>);
const ON = { available: true, reason: null, features: { supportChat: false, askSociety: false, billDraft: false, productDraft: true, purchaseDraft: true }, consent: { given: true, version: 'v' } };
const OFF = { available: false, reason: 'AI_OFF_FOR_SOCIETY', features: { supportChat: false } };
const PHOTO = 'https://bucket.s3.eu-north-1.amazonaws.com/profile-images/abc.jpg';
const PRODUCT_DRAFT = {
  name: 'Amul Taaza Toned Milk 500 ml', description: { en: 'Toned milk in a 500 ml pouch.', hi: '500 ml पाउच में टोंड दूध।' },
  category: null, unit: 'PCS', hsnCode: '0401', gstRatePercent: 5, price: null, similar: null, unclear: [], confidence: 0.9, warnings: ['TAX_VERIFY'],
};
const SUPPLIER = { _id: 'sup1', name: 'Shree Ganesh Traders', gstin: '27AAPFU0939F1ZV', kind: 'SUPPLIER', phone: null, billingAddress: { state: 'Maharashtra' }, outstandingPaise: 0, isWalkIn: false, isActive: true };
const PURCHASE_DRAFT = {
  supplier: { name: 'Shree Ganesh Traders', gstin: '27AAPFU0939F1ZV', gstinValid: true, match: { kind: 'GSTIN', party: SUPPLIER }, suggestions: [] },
  billNumber: 'SGT/1042', billDate: '2026-10-05',
  lines: [
    { name: 'Tata Salt 1kg', hsn: '2501', qty: 20, unit: 'PCS', ratePaise: 2200, gstRatePercent: 0, amountPaise: 44000, match: { kind: 'CODE', productId: 'p1', productName: 'Tata Salt 1kg', productUnit: 'PCS' }, newProduct: null, warnings: [] },
    { name: 'Maggi Noodles 70 g', hsn: '1902', qty: 48, unit: 'PCS', ratePaise: 1200, gstRatePercent: 12, amountPaise: 57600, match: { kind: 'NONE' }, newProduct: { name: 'Maggi Noodles 70 g', hsnCode: '1902', unit: 'PCS', gstRatePercent: 12 }, warnings: [] },
  ],
  totals: { taxablePaise: 101600, taxPaise: 6912, totalPaise: 108512 },
  duplicate: { id: 'doc9', supplierInvoiceNo: 'SGT/1042', date: '2026-10-05' },
  canAddProducts: true, warnings: ['DUPLICATE_BILL', 'LINES_UNMATCHED'],
};

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  setParams({});
});

it('every partner AI code has en + hi words; placeholders are i18next {{…}}', () => {
  for (const code of AI_PARTNER_ERROR_CODES) {
    expect((en as any).aiPartner.errors[code]).toBeTruthy();
    expect((hi as any).aiPartner.errors[code]).toMatch(/[ऀ-ॿ]/);
  }
  for (const cat of [en, hi]) expect(JSON.stringify((cat as any).aiPartner)).not.toMatch(/(?<!\{)\{[a-z]+\}(?!\})/);
  expect(toAiPartnerStatus({ available: false, features: { productDraft: true } }).productDraft).toBe(false);
});

describe('P1 — Add product', () => {
  it('no card when AI is off for the business', async () => {
    setRoutes({ 'GET /ai/status': wrap(OFF) });
    await show(<CreateProductScreen />);
    expect(screen.queryByTestId('ai-partner-product')).toBeNull();
  });

  it('the photo fills the form; price stays empty; Save product sends the photo', async () => {
    setRoutes({
      'GET /ai/status': wrap(ON),
      'POST /partners/me/ai/product-draft': wrap({ photo: { url: PHOTO }, draft: PRODUCT_DRAFT }),
      'POST /partners/me/products': wrap({ _id: 'new1' }),
    });
    await show(<CreateProductScreen />);
    await screen.findByTestId('ai-partner-product');
    await act(async () => { fireEvent.press(screen.getByText(t('aiPartner.product.chooseApp'))); });
    await waitFor(() => expect(callsTo('POST', '/partners/me/ai/product-draft')).toHaveLength(1));
    expect(await screen.findByDisplayValue('Amul Taaza Toned Milk 500 ml')).toBeTruthy();
    expect(screen.getByText(t('aiPartner.product.review.priceYours'))).toBeTruthy();
    expect(screen.getByDisplayValue('0401')).toBeTruthy();
    // Nothing saved by the AI.
    expect(callsTo('POST', '/partners/me/products')).toHaveLength(0);

    const inputs = screen.getAllByTestId('text-input-outlined');
    const nameAt = inputs.findIndex((i) => i.props.value === 'Amul Taaza Toned Milk 500 ml');
    await act(async () => { fireEvent.changeText(inputs[nameAt + 1], '29'); }); // selling price — the partner's own
    await act(async () => { fireEvent.press(screen.getByText(en.catalog.form.saveProduct)); });
    await waitFor(() => expect(callsTo('POST', '/partners/me/products')).toHaveLength(1));
    const body = callsTo('POST', '/partners/me/products')[0].body as Record<string, unknown>;
    expect(body).toMatchObject({ name: 'Amul Taaza Toned Milk 500 ml', sellPaise: 2900, hsnCode: '0401', taxRatePercent: 5, images: [PHOTO], description: 'Toned milk in a 500 ml pouch.' });
  });

  it('a refusal shows its own words and keeps the photo', async () => {
    setRoutes({ 'GET /ai/status': wrap(ON), 'POST /partners/me/ai/product-draft': fail(422, { code: 'AI_PRODUCT_UNREADABLE', message: 'x', photo: { url: PHOTO } }) });
    await show(<CreateProductScreen />);
    await screen.findByTestId('ai-partner-product');
    await act(async () => { fireEvent.press(screen.getByText(t('aiPartner.product.chooseApp'))); });
    expect(await screen.findByText(`${t('aiPartner.errors.AI_PRODUCT_UNREADABLE')} ${t('aiPartner.photoKept')}`)).toBeTruthy();
  });

  it('a bill line\'s "Add as product" opens the form pre-filled — no price', async () => {
    setRoutes({ 'GET /ai/status': wrap(OFF) });
    setParams({ name: 'Maggi Noodles 70 g', hsn: '1902', unit: 'PCS', taxRate: '12' });
    await show(<CreateProductScreen />);
    expect(await screen.findByDisplayValue('Maggi Noodles 70 g')).toBeTruthy();
    expect(screen.getByTestId('ai-item-prefill')).toBeTruthy();
    expect(screen.getByDisplayValue('12')).toBeTruthy();
  });
});

describe('P2 — new purchase bill', () => {
  it('the bill fills the form; duplicate flagged; "Add as product" has no price; nothing saved', async () => {
    setParams({ direction: 'PURCHASE', docType: 'PURCHASE_INVOICE' });
    setRoutes({ 'GET /ai/status': wrap(ON), 'POST /partners/me/ai/purchase-bill-draft': wrap({ draft: PURCHASE_DRAFT }) });
    await show(<NewInvoiceScreen />);
    await screen.findByTestId('ai-partner-purchase');
    await act(async () => { fireEvent.press(screen.getByText(t('aiPartner.purchase.chooseApp'))); });
    await waitFor(() => expect(callsTo('POST', '/partners/me/ai/purchase-bill-draft')).toHaveLength(1));
    expect(await screen.findByTestId('ai-purchase-duplicate')).toBeTruthy();
    expect(screen.getAllByText('Shree Ganesh Traders').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tata Salt 1kg/).length).toBeGreaterThan(0);
    expect(callsTo('POST', '/partners/me/documents')).toHaveLength(0);

    await act(async () => { fireEvent.press(screen.getByTestId('ai-add-product-1')); });
    expect(router.push).toHaveBeenCalledWith({ pathname: '/catalog/create', params: { name: 'Maggi Noodles 70 g', hsn: '1902', unit: 'PCS', taxRate: '12' } });
  });

  it('no card on a sale, or when the feature is off', async () => {
    setParams({ direction: 'PURCHASE', docType: 'PURCHASE_INVOICE' });
    setRoutes({ 'GET /ai/status': wrap({ ...ON, features: { ...ON.features, purchaseDraft: false } }) });
    await show(<NewInvoiceScreen />);
    expect(screen.queryByTestId('ai-partner-purchase')).toBeNull();
  });
});

it('Purchases › Bills: the shortcut shows only when the feature is on', async () => {
  setRoutes({ 'GET /ai/status': wrap(ON), 'GET /partners/me/documents': wrap([]) });
  await show(<PurchasesHome />);
  await act(async () => { fireEvent.press(screen.getByText(t('purchases.tab.BILL'))); });
  expect(await screen.findByText(t('aiPartner.purchase.shortcutApp'))).toBeTruthy();
});
