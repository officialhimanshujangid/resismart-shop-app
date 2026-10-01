/**
 * P2 PHARMACY at the counter (CONTRACT-partner-P2 §7, §14 S):
 *  - a Schedule H medicine on a bill asks for the prescription before Issue,
 *    and the bill goes out with `rx` and the chosen batch;
 *  - a bill for a business WITHOUT Pharmacy is exactly what it was (no rx, no batch);
 *  - accepting an order refused with RX_DETAILS_REQUIRED takes the prescription
 *    and accepts again.
 */
import React from 'react';
import { Alert } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import NewInvoiceScreen from '../../app/(app)/billing/new';
import { OrderRxSheet } from '../features/p2/billing/OrderRxSheet';
import { callsTo, setRoutes } from './setup/mockApi';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';

const mockState: { modules: string[] } = { modules: ['PHARMACY'] };
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    can: () => true,
    hasModule: () => true,
    ready: true,
    entitlements: { isAdmin: true, categoryModules: mockState.modules },
    roleLimits: {},
  }),
  usePlanUsage: () => ({
    capacity: () => ({ included: false, used: 0, limit: null, atLimit: false, fraction: null, comingSoon: false }),
  }),
}));
jest.mock('../features/scanner', () => ({ BarcodeScannerView: () => null }));

const paper = (ui: React.ReactElement) => renderScreen(<PaperProvider>{ui}</PaperProvider>);

const product = {
  _id: 'p1', name: 'Azithral 500', unit: 'PCS', sellPaise: 10000, mrpPaise: 12000, taxRatePercent: 12,
  taxInclusive: true, stockQty: 10, trackStock: true, images: [], isActive: true, sortOrder: 0,
};

function routes() {
  setRoutes({
    'GET /partners/me/products': { data: [product] },
    'GET /partners/me/pharmacy/products/p1/batches': {
      success: true,
      data: {
        product: { id: 'p1', name: 'Azithral 500', stockQty: 10, unit: 'PCS', batchTracking: true, drugSchedule: 'H' },
        unbatchedQty: 0,
        batches: [{ id: 'b1', productId: 'p1', productName: 'Azithral 500', batchNo: 'AZ12', expiryDate: '2027-03-31T18:29:59.999Z', qtyOnHand: 10, status: 'OK', daysToExpiry: 180 }],
      },
    },
    'POST /partners/me/documents': { success: true, data: { _id: 'd1' } },
    'POST /partners/me/documents/d1/issue': { success: true, data: { _id: 'd1', number: 'INV/26-27/0001' } },
  });
}

async function addAzithral() {
  await fireEvent.changeText(screen.getByPlaceholderText(en.billing.new.searchCatalogue), 'azi');
  await waitFor(() => expect(screen.getByText('Azithral 500')).toBeTruthy(), { timeout: 3000 });
  await fireEvent.press(screen.getByText('Azithral 500'));
}

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockState.modules = ['PHARMACY'];
});

describe('Pharmacy bill', () => {
  it('asks for the prescription, then issues with rx and the chosen batch', async () => {
    routes();
    await paper(<NewInvoiceScreen />);
    await addAzithral();
    await waitFor(() => expect(screen.getByTestId('bill-rx')).toBeTruthy());

    // Batch: pick AZ12 instead of automatic.
    await fireEvent.press(screen.getByTestId('line-batch-0'));
    await waitFor(() => expect(screen.getByText(/AZ12/)).toBeTruthy());
    await fireEvent.press(screen.getByText(/AZ12/));

    // Issue without a patient → said on the phone, nothing sent.
    await fireEvent.press(screen.getByText(/Issue invoice/));
    await waitFor(() => expect(screen.getByText(en.p2.pharmacy.rx.needPatient)).toBeTruthy());
    expect(callsTo('POST', '/partners/me/documents')).toHaveLength(0);

    await fireEvent.changeText(screen.getByTestId('bill-rx-patientName'), 'Asha Rao');
    await fireEvent.changeText(screen.getByTestId('bill-rx-doctorName'), 'Dr Mehta');
    await fireEvent.changeText(screen.getByTestId('bill-rx-rxNo'), 'RX-9');
    await fireEvent.press(screen.getByText(/Issue invoice/));
    await waitFor(() => expect(callsTo('POST', '/partners/me/documents')).toHaveLength(1));
    const body = callsTo('POST', '/partners/me/documents')[0].body as { rx?: object; lines: { batchId?: string }[] };
    expect(body.rx).toMatchObject({ patientName: 'Asha Rao', doctorName: 'Dr Mehta', rxNo: 'RX-9' });
    expect(body.lines[0].batchId).toBe('b1');
  });

  it('a business without Pharmacy bills exactly as before — no rx, no batch, no lookups', async () => {
    mockState.modules = [];
    routes();
    await paper(<NewInvoiceScreen />);
    await addAzithral();
    expect(screen.queryByTestId('bill-rx')).toBeNull();
    await fireEvent.press(screen.getByText(/Issue invoice/));
    await waitFor(() => expect(callsTo('POST', '/partners/me/documents')).toHaveLength(1));
    const body = callsTo('POST', '/partners/me/documents')[0].body as Record<string, unknown> & { lines: object[] };
    expect(body).not.toHaveProperty('rx');
    expect(body.lines[0]).not.toHaveProperty('batchId');
    expect(callsTo('GET', /\/pharmacy\//)).toHaveLength(0);
  });
});

describe('Drug facts from the product lookup', () => {
  it('when the lookup carries the schedule, no extra pharmacy request is made', async () => {
    routes();
    setRoutes({
      'GET /partners/me/products': { data: [{ ...product, drugSchedule: 'H1', batchTracking: false }] },
    });
    await paper(<NewInvoiceScreen />);
    await addAzithral();
    await waitFor(() => expect(screen.getByTestId('bill-rx')).toBeTruthy());
    expect(callsTo('GET', /\/pharmacy\//)).toHaveLength(0);
    expect(screen.queryByTestId('line-batch-0')).toBeNull();
  });
});

describe('Order accept with a prescription', () => {
  it('takes the prescription and hands it to accept', async () => {
    const onAccept = jest.fn();
    await paper(
      <OrderRxSheet
        visible
        orderCode="ORD-0042"
        drug={{ name: 'Azithral 500', schedule: 'H' }}
        refusal="needs rx"
        submitting={false}
        onAccept={onAccept}
        onDismiss={() => undefined}
      />,
    );
    await fireEvent.press(screen.getByTestId('order-rx-accept'));
    expect(onAccept).not.toHaveBeenCalled();
    expect(screen.getByText(en.p2.pharmacy.rx.needPatient)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('order-rx-patientName'), 'Asha Rao');
    await fireEvent.changeText(screen.getByTestId('order-rx-doctorName'), 'Dr Mehta');
    await fireEvent.press(screen.getByTestId('order-rx-accept'));
    expect(onAccept).toHaveBeenCalledWith(expect.objectContaining({ patientName: 'Asha Rao', doctorName: 'Dr Mehta' }));
  });
});
