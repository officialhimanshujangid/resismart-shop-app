/**
 * Commerce at the counter (CONTRACT-commerce §8 counter offers, §11 C6, §16):
 *  - the bill screen draws Checkout / Hold / quick keys only when the shop has them;
 *  - Checkout makes a server draft (auto offers asked), a coupon change goes WITHOUT
 *    lines (never double count), points are quoted, split tender is checked out in one call;
 *  - a walk-in bill is issued (no payment parts without a party);
 *  - hold / held bills tray / resume; quick keys; a scanned parent asks "which size?".
 */
import React from 'react';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import NewInvoiceScreen from '../../app/(app)/billing/new';
import { CounterCheckoutSheet } from '../features/commerce/components/CounterCheckoutSheet';
import { HoldTraySheet } from '../features/commerce/components/HoldSheets';
import { VariantPickerSheet } from '../features/commerce/components/VariantPickerSheet';
import { callsTo, fail, setRoutes, type Call } from './setup/mockApi';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const mockEnt: { features: string[] } = { features: [] };
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    can: () => true,
    hasModule: () => true,
    ready: true,
    entitlements: { isAdmin: true, permissions: {}, commerceFeatures: mockEnt.features },
    roleLimits: {},
    menu: [],
  }),
  usePlanUsage: () => ({
    capacity: () => ({ included: false, used: 0, limit: null, atLimit: false, fraction: null, comingSoon: false }),
  }),
}));
jest.mock('../features/scanner', () => ({ BarcodeScannerView: () => null }));

const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
const E = en as unknown as { commerce: { counter: Record<string, string> } };

const product = {
  _id: 'p1', name: 'Basmati 1kg', unit: 'PCS', sellPaise: 12000, mrpPaise: 13000, taxRatePercent: 5,
  taxInclusive: true, stockQty: 10, trackStock: true, images: [], isActive: true, sortOrder: 0,
};
const draft = (over: object = {}) => ({
  _id: 'd1', type: 'TAX_INVOICE', status: 'DRAFT', lines: [], partySnapshot: { name: 'Asha' },
  totals: { grandPaise: 10800 }, offers: [{ offerId: 'o1', kind: 'AUTO', name: 'Festive 10%', benefitType: 'PERCENT', discountPaise: 1200 }],
  offerRequest: { applyAutoOffers: true, lineOfferPaise: [1143] }, ...over,
});
const payload = {
  type: 'TAX_INVOICE' as const, partyId: 'party1', partySnapshot: { name: 'Asha' },
  lines: [{ itemId: 'p1', itemName: 'Basmati 1kg', qty: 1, ratePaise: 12000, discountPaise: 0, taxRatePercent: 5, taxInclusive: true }],
  sourceType: 'MANUAL' as const,
};
const allOn = { offers: true, coupons: true, points: true, split: true, credit: true };

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockEnt.features = [];
});

describe('the bill screen', () => {
  it('a shop with nothing switched on sees exactly the old bill (no Checkout, Hold, quick keys)', async () => {
    setRoutes({ 'GET /partners/me/products': { data: [product] } });
    await paper(<NewInvoiceScreen />);
    expect(screen.queryByTestId('hold-tray-open')).toBeNull();
    expect(screen.queryByTestId('quick-keys')).toBeNull();
    expect(callsTo('GET', '/partners/me/counter/quick-keys')).toHaveLength(0);
    expect(callsTo('GET', '/partners/me/counter/holds')).toHaveLength(0);
  });

  it('quick keys add a line; Checkout opens and creates a draft asking for automatic offers', async () => {
    mockEnt.features = ['OFFERS', 'QUICK_KEYS', 'COUNTER_HOLD'];
    setRoutes({
      'GET /partners/me/counter/quick-keys': { success: true, data: [{ productId: 'p1', name: 'Basmati 1kg', unit: 'PCS', sellPaise: 12000 }] },
      'GET /partners/me/counter/holds': { success: true, data: [] },
      'GET /partners/me/products/p1': { success: true, data: product },
      'POST /partners/me/documents': { success: true, data: draft() },
    });
    await paper(<NewInvoiceScreen />);
    await waitFor(() => expect(screen.getByTestId('quick-key-p1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('quick-key-p1'));
    await waitFor(() => expect(screen.getAllByText('Basmati 1kg').length).toBeGreaterThan(1));
    expect(screen.getByTestId('hold-open')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('bill-primary'));
    await waitFor(() => expect(callsTo('POST', '/partners/me/documents')).toHaveLength(1));
    const body = callsTo('POST', '/partners/me/documents')[0].body as { applyAutoOffers?: boolean; lines: Array<{ discountPaise?: number }> };
    expect(body.applyAutoOffers).toBe(true);
    expect(body.lines[0].discountPaise).toBe(0);
    await waitFor(() => expect(screen.getByText('Festive 10%')).toBeTruthy());
    // A walk-in: no payment parts — the bill is issued and paid as usual.
    expect(screen.getByTestId('checkout-issue-only')).toBeTruthy();
  });
});

describe('Checkout sheet', () => {
  it('a coupon is applied WITHOUT re-sending lines; a refused coupon shows its sentence', async () => {
    setRoutes({
      'POST /partners/me/documents': { success: true, data: draft() },
      'PUT /partners/me/documents/d1': (call: Call) => ((call.body as { couponCode?: string }).couponCode === 'BAD10'
        ? fail(409, { code: 'OFFER_BELOW_MINIMUM', params: { code: 'BAD10' }, error: 'x' })
        : { success: true, data: draft({ offerRequest: { couponCode: 'SAVE20', lineOfferPaise: [2000] } }) }),
      'POST /partners/me/counter/points-quote': fail(409, { code: 'POINTS_SHORT', params: { points: '0' } }),
    });
    const onDraftId = jest.fn();
    await paper(
      <CounterCheckoutSheet visible onDismiss={jest.fn()} payload={payload} draftId={null} onDraftId={onDraftId}
        partyId="party1" features={allOn} canViewWallet={false} onDone={jest.fn()} />,
    );
    await waitFor(() => expect(onDraftId).toHaveBeenCalledWith('d1'));
    await waitFor(() => expect(screen.getByTestId('checkout-points-note')).toBeTruthy());
    // MP-1 (b): the number the refusal carries is said as a second sentence, like the web.
    expect(screen.getByTestId('checkout-points-note').props.children).toBe(
      `${(en.errors as Record<string, string>).POINTS_SHORT} ${en.common.apiError.extra.pointsBalance.replace('{{value}}', '0')}`,
    );

    await fireEvent.changeText(screen.getByTestId('checkout-coupon'), 'bad10');
    await fireEvent.press(screen.getByTestId('checkout-coupon-apply'));
    await waitFor(() => expect(screen.getByTestId('checkout-coupon-error')).toBeTruthy());
    expect(screen.getByTestId('checkout-coupon-error').props.children).toBe((en.errors as Record<string, string>).OFFER_BELOW_MINIMUM);
    const put = callsTo('PUT', '/partners/me/documents/d1')[0].body as Record<string, unknown>;
    expect(put).toEqual({ couponCode: 'BAD10' });
    expect('lines' in put).toBe(false);

    await fireEvent.changeText(screen.getByTestId('checkout-coupon'), 'SAVE20');
    await fireEvent.press(screen.getByTestId('checkout-coupon-apply'));
    await waitFor(() => expect(screen.getByTestId('checkout-coupon-on')).toBeTruthy());
  });

  it('split payment with points: one checkout call with every part and the points', async () => {
    setRoutes({
      'PUT /partners/me/documents/d1': { success: true, data: draft() },
      'POST /partners/me/counter/points-quote': {
        success: true,
        data: { usablePoints: 300, maxRedeemable: 100, points: 100, discountPaise: 10000, totalBeforePaise: 10800, totalAfterPaise: 800 },
      },
      'POST /partners/me/counter/checkout': { success: true, data: { document: { _id: 'd1', number: 'INV/1', status: 'PAID', totals: { grandPaise: 800 } }, payments: [] } },
    });
    const onDone = jest.fn();
    await paper(
      <CounterCheckoutSheet visible onDismiss={jest.fn()} payload={payload} draftId="d1" onDraftId={jest.fn()}
        partyId="party1" features={allOn} canViewWallet={false} onDone={onDone} />,
    );
    // An existing draft is UPDATED with the till's own (manual) lines.
    await waitFor(() => expect(callsTo('PUT', '/partners/me/documents/d1')).toHaveLength(1));
    expect((callsTo('PUT', '/partners/me/documents/d1')[0].body as { lines: Array<{ discountPaise: number }> }).lines[0].discountPaise).toBe(0);
    await waitFor(() => expect(screen.getByTestId('checkout-points')).toBeTruthy());
    await fireEvent(screen.getByTestId('checkout-points'), 'press');
    await waitFor(() => expect(screen.getByTestId('checkout-to-pay').props.children).toBe('₹8.00'));
    await fireEvent.press(screen.getByTestId('tender-split'));
    await fireEvent.changeText(screen.getByTestId('tender-amount-1'), '3');
    await fireEvent.press(screen.getByTestId('checkout-pay'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith('d1'));
    expect(callsTo('POST', '/partners/me/counter/checkout')[0].body).toEqual({
      documentId: 'd1',
      payments: [{ mode: 'CASH', amountPaise: 500 }, { mode: 'UPI', amountPaise: 300 }],
      usePoints: 100,
    });
  });

  it('a split that is more than the bill cannot be taken', async () => {
    setRoutes({
      'PUT /partners/me/documents/d1': { success: true, data: draft() },
      'POST /partners/me/counter/points-quote': fail(409, { code: 'WALLET_OFF' }),
    });
    await paper(
      <CounterCheckoutSheet visible onDismiss={jest.fn()} payload={payload} draftId="d1" onDraftId={jest.fn()}
        partyId="party1" features={allOn} canViewWallet={false} onDone={jest.fn()} />,
    );
    await waitFor(() => expect(screen.getByTestId('tender-split')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('tender-split'));
    await fireEvent.changeText(screen.getByTestId('tender-amount-1'), '500');
    await waitFor(() => expect(screen.getByTestId('tender-problem').props.children).toBe(E.commerce.counter.tenderOver));
    await fireEvent.press(screen.getByTestId('checkout-pay'));
    expect(callsTo('POST', '/partners/me/counter/checkout')).toHaveLength(0);
  });

  it('reads in Hindi', async () => {
    setRoutes({ 'POST /partners/me/documents': { success: true, data: draft() } });
    await paper(
      <CounterCheckoutSheet visible onDismiss={jest.fn()} payload={{ ...payload, partyId: undefined }} draftId={null} onDraftId={jest.fn()}
        features={{ ...allOn, points: false }} canViewWallet={false} onDone={jest.fn()} />,
      'hi',
    );
    await waitFor(() => expect(screen.getByText((hi as unknown as { commerce: { counter: Record<string, string> } }).commerce.counter.autoOffers)).toBeTruthy());
    expect(screen.queryByText(/commerce\./)).toBeNull();
  });
});

describe('held bills', () => {
  it('lists the tray and resumes one (the server re-prices it)', async () => {
    setRoutes({
      'GET /partners/me/counter/holds': {
        success: true,
        data: [{ _id: 'h1', label: 'Asha · 10:05', lines: [{ itemName: 'Rice', qty: 1 }], approxTotalPaise: 5000, status: 'HELD', heldAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600_000).toISOString() }],
      },
      'POST /partners/me/counter/holds/h1/resume': {
        success: true, data: { hold: { _id: 'h1', label: 'Asha · 10:05', lines: [], approxTotalPaise: 0, status: 'RESUMED', heldAt: '', expiresAt: '' }, lines: [] },
      },
    });
    const onResumed = jest.fn();
    await paper(<HoldTraySheet visible onDismiss={jest.fn()} onResumed={onResumed} />);
    await waitFor(() => expect(screen.getByText('Asha · 10:05')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('resume-h1'));
    await waitFor(() => expect(onResumed).toHaveBeenCalled());
  });

  it('HOLD_NOT_OPEN shows its sentence', async () => {
    setRoutes({
      'GET /partners/me/counter/holds': {
        success: true,
        data: [{ _id: 'h2', label: 'Bill', lines: [], approxTotalPaise: 0, status: 'HELD', heldAt: '', expiresAt: new Date(Date.now() + 60_000).toISOString() }],
      },
      'POST /partners/me/counter/holds/h2/resume': fail(409, { code: 'HOLD_NOT_OPEN' }),
    });
    await paper(<HoldTraySheet visible onDismiss={jest.fn()} onResumed={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('resume-h2')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('resume-h2'));
    await waitFor(() => expect(screen.getByTestId('tray-error').props.children).toBe((en.errors as Record<string, string>).HOLD_NOT_OPEN));
  });
});

describe('which size? (C6)', () => {
  it('lists the sizes from a scan and adds the one tapped', async () => {
    const onPick = jest.fn();
    await paper(
      <VariantPickerSheet
        visible
        parentName="T-shirt"
        variants={[
          { _id: 'v1', name: 'T-shirt (M)', variantLabel: 'M', unit: 'PCS', sellPaise: 29900, taxRatePercent: 5, taxInclusive: true, stockQty: 3, trackStock: true },
          { _id: 'v2', name: 'T-shirt (L)', variantLabel: 'L', unit: 'PCS', sellPaise: 29900, taxRatePercent: 5, taxInclusive: true, stockQty: 0, trackStock: true },
        ]}
        onPick={onPick}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByText(E.commerce.counter.outOfStock)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('variant-v1'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ _id: 'v1' }));
  });
});
