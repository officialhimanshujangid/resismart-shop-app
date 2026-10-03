/**
 * Commerce C3 bundles / C6 sizes, labels, quick keys, and C2 fulfilment
 * (accept with changes, give to a rider, proof at hand-over, My deliveries),
 * against the BUILT routes.
 */
import React from 'react';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';

import { VariantsCard } from '../features/commerce/components/VariantsCard';
import { BundleCard } from '../features/commerce/components/BundleCard';
import { LabelsSheet } from '../features/commerce/components/LabelsSheet';
import QuickKeysScreen from '../../app/(app)/commerce/quick-keys';
import MyDeliveriesScreen from '../../app/(app)/commerce/deliveries';
import { AssignRiderSheet, DeliverProofSheet, PartialAcceptSheet } from '../features/commerce/components/FulfilmentSheets';
import type { Product } from '../features/catalog/types';
import type { PartnerOrder } from '../features/orders/types';
import { callsTo, fail, setRoutes, type Call } from './setup/mockApi';
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
  class File { uri = 'file:///cache/x.pdf'; create = jest.fn(); write = jest.fn(); constructor(..._a: unknown[]) {} }
  return { Directory, File, Paths: { cache: 'cache' } };
});
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-image-picker', () => ({ launchCameraAsync: jest.fn(async () => ({ canceled: true, assets: [] })) }));
jest.mock('react-native-modal-datetime-picker', () => () => null);

const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
const ERR = en.errors as Record<string, string>;
const noRawKeys = () => expect(screen.queryByText(/commerce\.[a-z]/)).toBeNull();

const product = (over: Partial<Product> = {}): Product => ({
  _id: 'p1', name: 'T-shirt', unit: 'PCS', mrpPaise: 0, sellPaise: 29900, taxRatePercent: 5, taxInclusive: true,
  stockQty: 0, trackStock: true, images: [], isActive: true, sortOrder: 0, createdAt: '', updatedAt: '', ...over,
} as Product);

const order = (over: Partial<PartnerOrder> = {}): PartnerOrder => ({
  id: 'o1', code: 'ORD-0001', status: 'PLACED', deliveryMode: 'DELIVERY',
  items: [
    { productId: 'p1', snapshot: { name: 'Rice', unit: 'KG', ratePaise: 5000, taxRatePercent: 0, taxInclusive: true }, qty: 2, discountPaise: 0, linePaise: 10000 },
    { productId: 'p2', snapshot: { name: 'Dal', unit: 'KG', ratePaise: 9000, taxRatePercent: 0, taxInclusive: true }, qty: 1, discountPaise: 0, linePaise: 9000 },
  ],
  amounts: { subPaise: 19000, taxPaise: 0, deliveryPaise: 0, discountPaise: 0, totalPaise: 19000 },
  payment: { mode: 'COD', status: 'PENDING' }, timeline: [], allowedVerbs: ['accept'],
  customer: { name: 'Asha', contactMasked: false, flatLabel: 'A-101', societyName: 'Green Park' },
  itemCount: 2, createdAt: '', updatedAt: '', ...over,
} as PartnerOrder);

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockEnt.features = ['VARIANTS', 'BUNDLES', 'QUICK_KEYS', 'PARTIAL_ACCEPT', 'DELIVERY_STAFF', 'DELIVERY_PROOF'];
  mockEnt.admin = true;
  mockEnt.perms = {};
});

describe('sizes & types (C6)', () => {
  it('adds a size: the body carries the attributes, the price in paise and the opening stock', async () => {
    setRoutes({ 'POST /partners/me/products/p1/variants': { success: true, data: { parent: product({ isVariantParent: true }), variant: product({ _id: 'v1' }) } } });
    await paper(<VariantsCard product={product()} />);
    await fireEvent.press(screen.getByTestId('variant-add'));
    await fireEvent.changeText(screen.getByTestId('variant-value-0'), 'M');
    await fireEvent.changeText(screen.getByTestId('variant-sell'), '349');
    await fireEvent.changeText(screen.getByTestId('variant-stock'), '5');
    await fireEvent.press(screen.getByTestId('variant-save'));
    await waitFor(() => expect(callsTo('POST', '/partners/me/products/p1/variants')).toHaveLength(1));
    expect(callsTo('POST', '/partners/me/products/p1/variants')[0].body).toEqual({
      attributes: [{ name: 'SIZE', value: 'M' }], sellPaise: 34900, stockQty: 5,
    });
  });

  it('a product with stock is refused in our words (VARIANT_PARENT_HAS_STOCK)', async () => {
    setRoutes({ 'POST /partners/me/products/p1/variants': fail(400, { code: 'VARIANT_PARENT_HAS_STOCK', error: 'x' }) });
    await paper(<VariantsCard product={product({ stockQty: 4 })} />);
    await fireEvent.press(screen.getByTestId('variant-add'));
    await fireEvent.changeText(screen.getByTestId('variant-value-0'), 'L');
    await fireEvent.press(screen.getByTestId('variant-save'));
    await waitFor(() => expect(screen.getByTestId('variant-error').props.children).toBe(ERR.VARIANT_PARENT_HAS_STOCK));
  });

  it('nothing is drawn when Sizes & types is off and the product is plain', async () => {
    mockEnt.features = [];
    await paper(<VariantsCard product={product()} />);
    expect(screen.queryByTestId('variants-card')).toBeNull();
  });
});

describe('bundles (C3)', () => {
  it('saves the items of a bundle with a PUT of bundleComponents', async () => {
    setRoutes({
      'GET /partners/me/products/c1': { success: true, data: product({ _id: 'c1', name: 'Mug' }) },
      'PUT /partners/me/products/b1': { success: true, data: product({ _id: 'b1', bundleComponents: [{ productId: 'c1', qty: 2 }] }) },
    });
    await paper(<BundleCard product={product({ _id: 'b1', name: 'Gift pack', trackStock: false, bundleComponents: [{ productId: 'c1', qty: 1 }] })} />);
    await waitFor(() => expect(screen.getByText('Mug')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('bundle-edit'));
    await fireEvent.press(screen.getByLabelText('+ Mug'));
    await fireEvent.press(screen.getByTestId('bundle-save'));
    await waitFor(() => expect(callsTo('PUT', '/partners/me/products/b1')).toHaveLength(1));
    expect(callsTo('PUT', '/partners/me/products/b1')[0].body).toEqual({ bundleComponents: [{ productId: 'c1', qty: 2 }] });
  });
});

describe('labels and quick keys (C6)', () => {
  it('posts the label sheet and shares the PDF', async () => {
    setRoutes({ 'POST /partners/me/products/labels': new ArrayBuffer(4) });
    await paper(<LabelsSheet visible onDismiss={jest.fn()} items={[{ productId: 'p1', name: 'T-shirt' }]} />);
    await fireEvent.press(screen.getByTestId('labels-print'));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalled());
    expect(callsTo('POST', '/partners/me/products/labels')[0].body).toEqual({
      items: [{ productId: 'p1', copies: 1 }], layout: 'A4_65', showPrice: true, showMrp: true,
    });
  });

  it('reorders the quick keys and saves them in the new order', async () => {
    setRoutes({
      'GET /partners/me/counter/quick-keys': {
        success: true,
        data: [
          { productId: 'a', name: 'Milk', unit: 'PCS', sellPaise: 3000 },
          { productId: 'b', name: 'Bread', unit: 'PCS', sellPaise: 4000 },
        ],
      },
      'PUT /partners/me/counter/quick-keys': (call: Call) => ({ success: true, data: (call.body as { productIds: string[] }).productIds.map((id) => ({ productId: id, name: id, unit: 'PCS', sellPaise: 1 })) }),
    });
    await paper(<QuickKeysScreen />);
    await waitFor(() => expect(screen.getByTestId('quick-key-up-1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('quick-key-up-1'));
    await fireEvent.press(screen.getByTestId('quick-keys-save'));
    await waitFor(() => expect(callsTo('PUT', '/partners/me/counter/quick-keys')).toHaveLength(1));
    expect(callsTo('PUT', '/partners/me/counter/quick-keys')[0].body).toEqual({ productIds: ['b', 'a'] });
  });
});

describe('fulfilment (C2)', () => {
  it('accept with changes: quantities only go down, the body names each change with a reason', async () => {
    setRoutes({ 'POST /partners/me/orders/o1/accept-partial': { success: true, data: order({ status: 'ACCEPTED' }) } });
    const onDone = jest.fn();
    await paper(<PartialAcceptSheet order={order()} onDismiss={jest.fn()} onDone={onDone} />);
    // The + of the first line is disabled at the ordered quantity.
    expect(screen.getByLabelText('+ Rice').props.accessibilityState?.disabled ?? true).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('− Rice'));
    await fireEvent.press(screen.getByText((en as unknown as { commerce: { fulfilment: { reason: Record<string, string> } } }).commerce.fulfilment.reason.OUT_OF_STOCK));
    await fireEvent.press(screen.getByTestId('partial-submit'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(callsTo('POST', '/partners/me/orders/o1/accept-partial')[0].body).toEqual({
      changes: [{ productId: 'p1', toQty: 1, reason: 'OUT_OF_STOCK' }],
    });
  });

  it('a change that would raise the total is refused in our words (PARTIAL_ACCEPT_RAISES_TOTAL)', async () => {
    setRoutes({
      'POST /partners/me/orders/o1/accept-partial': fail(409, {
        code: 'PARTIAL_ACCEPT_RAISES_TOTAL', params: { oldTotal: '190.00', newTotal: '195.00' }, error: 'x',
      }),
    });
    const onDone = jest.fn();
    await paper(<PartialAcceptSheet order={order()} onDismiss={jest.fn()} onDone={onDone} />);
    await fireEvent.press(screen.getByLabelText('− Rice'));
    await fireEvent.press(screen.getByText((en as unknown as { commerce: { fulfilment: { reason: Record<string, string> } } }).commerce.fulfilment.reason.OUT_OF_STOCK));
    await fireEvent.press(screen.getByTestId('partial-submit'));
    await waitFor(() => expect(screen.getByTestId('partial-error').props.children).toBe(ERR.PARTIAL_ACCEPT_RAISES_TOTAL));
    expect(onDone).not.toHaveBeenCalled();
  });

  it('give to a rider posts the staff id', async () => {
    setRoutes({
      'GET /partners/me/orders/eligible-riders': { success: true, data: [{ staffId: 's1', userId: 'u1', name: 'Raju', designation: 'Rider' }] },
      'POST /partners/me/orders/o1/assign': { success: true, data: order({ status: 'PACKED', delivery: { staffName: 'Raju' } }) },
    });
    await paper(<AssignRiderSheet order={order({ status: 'PACKED' })} onDismiss={jest.fn()} onDone={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('rider-s1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('rider-s1'));
    await waitFor(() => expect(callsTo('POST', '/partners/me/orders/o1/assign')[0].body).toEqual({ staffId: 's1' }));
  });

  it('a wrong code says how many tries are left; a locked code moves to the photo', async () => {
    let n = 0;
    setRoutes({
      'POST /partners/me/orders/o1/deliver': () => (++n === 1
        ? fail(400, { code: 'DELIVERY_OTP_WRONG', params: { attemptsLeft: '3' } })
        : fail(429, { code: 'DELIVERY_OTP_LOCKED' })),
    });
    await paper(<DeliverProofSheet order={order({ status: 'OUT_FOR_DELIVERY' })} mode="OTP_OR_PHOTO" onDismiss={jest.fn()} onDone={jest.fn()} />);
    for (const k of ['1', '2', '3', '4']) await fireEvent.press(screen.getByTestId(`otp-key-${k}`));
    await waitFor(() => expect(screen.getByTestId('proof-error').props.children).toBe('That code is wrong. 3 tries left.'));
    expect(callsTo('POST', '/partners/me/orders/o1/deliver')[0].body).toEqual({ otp: '1234' });
    for (const k of ['9', '9', '9', '9']) await fireEvent.press(screen.getByTestId(`otp-key-${k}`));
    await waitFor(() => expect(screen.getByTestId('proof-error').props.children).toBe(ERR.DELIVERY_OTP_LOCKED));
    expect(screen.getByTestId('proof-photo')).toBeTruthy();
  });

  it('My deliveries: the rider sees only their orders and sends one out', async () => {
    mockEnt.admin = false;
    mockEnt.perms = { ORDER_DELIVERIES: 'FULL' };
    setRoutes({
      'GET /partners/me/orders/my-deliveries': { success: true, data: [order({ status: 'PACKED', allowedVerbs: ['dispatch'] })], page: 1, limit: 50, total: 1 },
      'POST /partners/me/orders/o1/dispatch': { success: true, data: order({ status: 'OUT_FOR_DELIVERY' }) },
    });
    await paper(<MyDeliveriesScreen />);
    await waitFor(() => expect(screen.getByTestId('delivery-o1')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('dispatch-o1'));
    await waitFor(() => expect(callsTo('POST', '/partners/me/orders/o1/dispatch')).toHaveLength(1));
  });

  it('My deliveries reads in Hindi', async () => {
    setRoutes({ 'GET /partners/me/orders/my-deliveries': { success: true, data: [], page: 1, limit: 50, total: 0 } });
    await paper(<MyDeliveriesScreen />, 'hi');
    await waitFor(() => expect(callsTo('GET', '/partners/me/orders/my-deliveries')).toHaveLength(1));
    noRawKeys();
  });
});
