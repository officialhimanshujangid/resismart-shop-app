/**
 * Partner P1 screens with the api mocked (CONTRACT-partner-P1 §11):
 *  - receive against a PO: pre-filled, over-receipt refused on the line, the
 *    GRN request, and a coded refusal read in Hindi;
 *  - count-by-scan: each scan is one ADD unit, sent in one batch; review → post;
 *  - reorder → purchase orders; a missing supplier is said before the request;
 *  - khata list: totals, remind by share;
 *  - expense quick-add (3 taps) and its GST rule; day close variance;
 *  - role gates: a role without DOCUMENTS_VOID sees no cancel.
 */
import React from 'react';
import { Alert, Share, Text as RNText, Pressable } from 'react-native';
import { PaperProvider } from 'react-native-paper';
import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { AccountPicker } from '../features/money/components/AccountPicker';
import { useIsGstRegistered } from '../features/billing/useGstRegistration';
import { BILL_OF_SUPPLY_LABEL_KEY, documentTypeLabelKey } from '../features/billing/types';
import { themeColors } from '../constants/colors';

import ReceiveAgainstPoScreen from '../../app/(app)/purchases/receive/[poId]';
import StockCountScreen from '../../app/(app)/stock/counts/[id]';
import ReorderScreen from '../../app/(app)/stock/reorder';
import KhataScreen from '../../app/(app)/khata/index';
import ExpenseQuickAddScreen from '../../app/(app)/money/expense';
import ExpensesScreen from '../../app/(app)/money/expenses';
import DayCloseScreen from '../../app/(app)/money/day-close';
import PurchasesHomeScreen from '../../app/(app)/purchases/index';
import { callsTo, fail, setRoutes } from './setup/mockApi';
import { router, setParams } from './setup/mockRouter';
import { renderScreen } from './setup/harness';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

// ── permissions, switchable per test
const mockPerms: { deny: Set<string>; isAdmin: boolean } = { deny: new Set(), isAdmin: true };
jest.mock('../hooks', () => ({
  usePartnerEntitlements: () => ({
    can: (m: string) => !mockPerms.deny.has(m),
    hasModule: () => true,
    ready: true,
    entitlements: { isAdmin: mockPerms.isAdmin },
    roleLimits: {},
  }),
}));

// ── the camera is replaced by two buttons that "scan" a known and an unknown code
jest.mock('../features/scanner', () => {
  const { Pressable: P, Text: T, View: V } = require('react-native');
  return {
    BarcodeScannerView: ({ onResult }: { onResult: (o: unknown) => void }) => (
      <V>
        <P testID="fake-scan-rice" onPress={() => onResult({ status: 'found', product: { _id: 'p1', name: 'Rice 5kg' }, hit: { code: '111' } })}><T>scan rice</T></P>
        <P testID="fake-scan-unknown" onPress={() => onResult({ status: 'unknown', barcode: '999', hit: { code: '999' } })}><T>scan unknown</T></P>
      </V>
    ),
  };
});

const paper = (ui: React.ReactElement, lang?: 'en' | 'hi') => renderScreen(<PaperProvider>{ui}</PaperProvider>, { lang });
const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(String(v)), s);
const pressAlertButton = async (label: string) => {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const buttons = calls[calls.length - 1][2] as { text: string; onPress?: () => void }[];
  await act(async () => { buttons.find((b) => b.text === label)!.onPress!(); });
};

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  mockPerms.deny = new Set();
  mockPerms.isAdmin = true;
});
void RNText; void Pressable;

// ─────────────────────────────────────────────────── receive against PO
const receipts = {
  po: { id: 'po1', number: 'PO/26-27/0007', status: 'ISSUED', fulfilment: 'PARTIAL', partyId: 's1', partyName: 'Agro Traders' },
  lines: [
    { poLineIndex: 0, itemId: 'p1', itemName: 'Rice 5kg', unit: 'BAG', ordered: 10, received: 4, pending: 6, ratePaise: 100000 },
    { poLineIndex: 1, itemId: 'p2', itemName: 'Toor Dal', unit: 'KG', ordered: 5, received: 5, pending: 0, ratePaise: 9000 },
  ],
  grns: [{ id: 'g0', number: 'GRN/26-27/0001', status: 'ISSUED', documentDate: '2026-09-20' }],
};

describe('Receive against a purchase order', () => {
  it('pre-fills what is still to come and sends it as one GRN with an idempotency key', async () => {
    setParams({ poId: 'po1' });
    setRoutes({
      'GET /partners/me/purchases/purchase-orders/po1/receipts': { success: true, data: receipts },
      'POST /partners/me/purchases/purchase-orders/po1/receive': { success: true, data: { grn: { _id: 'g1', number: 'GRN/26-27/0002' }, po: { id: 'po1', fulfilment: 'RECEIVED' } } },
    });
    await paper(<ReceiveAgainstPoScreen />);
    await waitFor(() => expect(screen.getByText('Rice 5kg')).toBeTruthy());
    expect(screen.getByText(en.purchases.receive.lineDone)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('receive-save'));
    await waitFor(() => expect(callsTo('POST', '/partners/me/purchases/purchase-orders/po1/receive')).toHaveLength(1));
    expect(callsTo('POST', '/partners/me/purchases/purchase-orders/po1/receive')[0].body).toEqual({
      lines: [{ poLineIndex: 0, qty: 6 }], issue: true,
    });
    await pressAlertButton(en.purchases.receive.billNow);
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/purchases/bill-from-grns', params: { grnId: 'g1' } });
  });

  it('more than pending is refused on the line; the server refusal reads in Hindi', async () => {
    setParams({ poId: 'po1' });
    setRoutes({
      'GET /partners/me/purchases/purchase-orders/po1/receipts': { success: true, data: receipts },
      'POST /partners/me/purchases/purchase-orders/po1/receive': fail(409, { code: 'GRN_QTY_EXCEEDS_PENDING', params: { itemName: 'Rice 5kg', pending: 6, qty: 6 } }),
    });
    await paper(<ReceiveAgainstPoScreen />, 'hi');
    await waitFor(() => expect(screen.getByText('Rice 5kg')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('+ Rice 5kg'));
    expect(screen.getByText(fill(hi.purchases.receive.overPending, { max: 6 }))).toBeTruthy();
    expect(screen.getByTestId('receive-save')).toBeDisabled();
    await fireEvent.press(screen.getByLabelText('− Rice 5kg'));
    await fireEvent.press(screen.getByTestId('receive-save'));
    await waitFor(() => expect(screen.getByText(fill(hi.errors.GRN_QTY_EXCEEDS_PENDING, { itemName: 'Rice 5kg', pending: 6, qty: 6 }))).toBeTruthy());
  });
});

// ────────────────────────────────────────────────────── count-by-scan
const count = (status: string, over: object = {}) => ({
  _id: 'sc1', number: 'SC/26-27/0003', status, scope: { all: true, categoryIds: [], productIds: [] }, blind: false,
  uncountedPolicy: 'IGNORE', lineCount: 2, countedLineCount: 0, startedAt: '2026-09-30T04:00:00.000Z', ...over,
});

describe('Stock count', () => {
  it('each scan is one unit, sent as ADD entries in one batch', async () => {
    setParams({ id: 'sc1' });
    setRoutes({
      'GET /partners/me/stock-counts/sc1': { success: true, data: count('COUNTING') },
      'GET /partners/me/stock-counts/sc1/lines': { data: [{ productId: 'p1', productName: 'Rice 5kg', unit: 'BAG', systemQtyAtStart: 4 }], page: 1, limit: 200, total: 1 },
      'PUT /partners/me/stock-counts/sc1/lines': { success: true, data: { updated: [], countedLineCount: 1 } },
    });
    await paper(<StockCountScreen />);
    await waitFor(() => expect(screen.getByTestId('count-scan')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('count-scan'));
    await fireEvent.press(screen.getByTestId('fake-scan-rice'));
    await waitFor(() => expect(callsTo('PUT', '/partners/me/stock-counts/sc1/lines').length).toBeGreaterThan(0));
    const bodies = callsTo('PUT', '/partners/me/stock-counts/sc1/lines').map((c) => c.body as { entries: unknown[] });
    expect(bodies[0].entries).toEqual([{ productId: 'p1', countedQty: 1, mode: 'ADD' }]);
  });

  it('an unknown barcode is dropped with the server sentence, and the count carries on', async () => {
    setParams({ id: 'sc1' });
    setRoutes({
      'GET /partners/me/stock-counts/sc1': { success: true, data: count('COUNTING') },
      'GET /partners/me/stock-counts/sc1/lines': { data: [], page: 1, limit: 200, total: 0 },
      'PUT /partners/me/stock-counts/sc1/lines': fail(404, { code: 'STOCK_COUNT_BARCODE_UNKNOWN', params: { barcode: '999' } }),
    });
    await paper(<StockCountScreen />);
    await waitFor(() => expect(screen.getByTestId('count-scan')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('count-scan'));
    await fireEvent.press(screen.getByTestId('fake-scan-unknown'));
    await waitFor(() => expect(screen.getByTestId('count-queue-error')).toHaveTextContent(fill(en.errors.STOCK_COUNT_BARCODE_UNKNOWN, { barcode: '999' })));
  });

  it('review shows the differences; a manager posts after confirming', async () => {
    setParams({ id: 'sc1' });
    setRoutes({
      'GET /partners/me/stock-counts/sc1': { success: true, data: count('REVIEW', { countedLineCount: 2, totals: { gainQty: 1, lossQty: -2 } }) },
      'GET /partners/me/stock-counts/sc1/lines': (c: { params?: unknown }) => ((c.params as { filter?: string })?.filter === 'variance'
        ? { data: [{ productId: 'p1', productName: 'Rice 5kg', unit: 'BAG', systemQtyAtStart: 4, countedQty: 2, varianceQty: -2 }], page: 1, limit: 200, total: 1 }
        : { data: [], page: 1, limit: 200, total: 0 }),
      'POST /partners/me/stock-counts/sc1/post': { success: true, data: count('POSTED') },
    });
    await paper(<StockCountScreen />);
    await waitFor(() => expect(screen.getByTestId('variance-p1')).toBeTruthy());
    expect(screen.getByTestId('variance-p1')).toHaveTextContent(/−2/);
    await fireEvent.press(screen.getByTestId('count-post'));
    await pressAlertButton(en.stock.count.post);
    await waitFor(() => expect(callsTo('POST', '/partners/me/stock-counts/sc1/post')).toHaveLength(1));
    expect(callsTo('POST', '/partners/me/stock-counts/sc1/post')[0].body).toEqual({ confirm: true });
  });

  it('a counter without STOCK_MANAGE cannot post', async () => {
    mockPerms.deny = new Set(['STOCK_MANAGE']);
    mockPerms.isAdmin = false;
    setParams({ id: 'sc1' });
    setRoutes({
      'GET /partners/me/stock-counts/sc1': { success: true, data: count('REVIEW') },
      'GET /partners/me/stock-counts/sc1/lines': { data: [], page: 1, limit: 200, total: 0 },
    });
    await paper(<StockCountScreen />);
    await waitFor(() => expect(screen.getByText(en.stock.count.waitingManager)).toBeTruthy());
    expect(screen.queryByTestId('count-post')).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────── reorder
describe('Reorder list → purchase orders', () => {
  it('drafts one PO per supplier from the ticked lines', async () => {
    setRoutes({
      'GET /partners/me/reorder': {
        data: [
          { productId: 'p1', name: 'Rice 5kg', unit: 'BAG', stockQty: 1, suggestedQty: 9, preferredSupplier: { id: 's1', name: 'Agro Traders' }, pendingOnOpenPOsQty: 0 },
          { productId: 'p2', name: 'Toor Dal', unit: 'KG', stockQty: 0, suggestedQty: 5, preferredSupplier: { id: 's2', name: 'Pulses Co' }, pendingOnOpenPOsQty: 2 },
        ],
        page: 1, limit: 200, total: 2,
      },
      'POST /partners/me/reorder/purchase-orders': { success: true, data: { purchaseOrders: [{ id: 'po1', partyId: 's1', partyName: 'Agro Traders', lineCount: 1 }, { id: 'po2', partyId: 's2', partyName: 'Pulses Co', lineCount: 1 }] } },
    });
    await paper(<ReorderScreen />);
    await waitFor(() => expect(screen.getByText('Rice 5kg')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('reorder-create'));
    await waitFor(() => expect(callsTo('POST', '/partners/me/reorder/purchase-orders')).toHaveLength(1));
    expect(callsTo('POST', '/partners/me/reorder/purchase-orders')[0].body).toEqual({
      lines: [{ productId: 'p1', qty: 9, supplierId: 's1' }, { productId: 'p2', qty: 5, supplierId: 's2' }],
    });
  });

  it('an item with no supplier is named before any request', async () => {
    setRoutes({
      'GET /partners/me/reorder': { data: [{ productId: 'p3', name: 'Mustard Oil', unit: 'LTR', stockQty: 0, suggestedQty: 3, pendingOnOpenPOsQty: 0 }], page: 1, limit: 200, total: 1 },
    });
    await paper(<ReorderScreen />);
    await waitFor(() => expect(screen.getByTestId('reorder-missing')).toHaveTextContent(fill(en.errors.REORDER_NEEDS_SUPPLIER, { productName: 'Mustard Oil' })));
    expect(screen.getByTestId('reorder-create')).toBeDisabled();
  });
});

// ─────────────────────────────────────────────────────────────── khata
describe('Khata', () => {
  it('shows the total due and reminds through the phone share sheet', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    setRoutes({
      'GET /partners/me/parties/khata': {
        data: [{ partyId: 'c1', name: 'Meena', isResidentLinked: false, outstandingPaise: 125000, oldestOpenAgeDays: 12, overLimit: true, overdueBeyondDays: false }],
        totals: { duePaise: 125000, parties: 1 }, page: 1, limit: 20, total: 1,
      },
      'POST /partners/me/parties/c1/remind': { success: true, data: { channel: 'SHARE', text: 'Namaste Meena, ₹1,250 is due.', url: 'https://x/khata/tok', upiUri: 'upi://pay?pa=shop@upi' } },
    });
    await paper(<KhataScreen />);
    await waitFor(() => expect(screen.getByText('Meena')).toBeTruthy());
    expect(screen.getByTestId('khata-c1')).toHaveTextContent(new RegExp(en.khata.flagOverLimit));
    expect(screen.getByTestId('khata-total')).toHaveTextContent(/1,250.00/);
    await fireEvent.press(screen.getByLabelText(fill(en.khata.remindName, { name: 'Meena' })));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(callsTo('POST', '/partners/me/parties/c1/remind')[0].body).toEqual({ channel: 'SHARE', includeUpiLink: true, lang: 'en' });
    expect(share.mock.calls[0][0]).toEqual({ message: 'Namaste Meena, ₹1,250 is due.\nhttps://x/khata/tok\nupi://pay?pa=shop@upi' });
  });
});

// ─────────────────────────────────────────────────────────────── money
const categories = { success: true, data: [
  { _id: 'cat-rent', name: 'Rent', systemKey: 'RENT', isSystem: true, isActive: true, sortOrder: 1 },
  { _id: 'cat-tea', name: 'Tea & snacks', isSystem: false, isActive: true, sortOrder: 9 },
] };

describe('Expense quick-add', () => {
  it('three taps: category, amount, save', async () => {
    setRoutes({
      'GET /partners/me/money/expense-categories': categories,
      'GET /partners/me/money/accounts': { success: true, data: [{ _id: 'cash1', kind: 'CASH', name: 'Cash in shop', isDefault: true, isActive: true, openingBalancePaise: 0, balancePaise: 0 }] },
      'POST /partners/me/money/expenses': { success: true, data: { _id: 'e1', number: 'EXP/26-27/0001' } },
    });
    await paper(<ExpenseQuickAddScreen />);
    await waitFor(() => expect(screen.getByTestId('expense-cat-cat-rent')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('expense-cat-cat-rent'));
    await fireEvent.changeText(screen.getByTestId('expense-amount'), '15000');
    await fireEvent.press(screen.getByTestId('expense-save'));
    await waitFor(() => expect(callsTo('POST', '/partners/me/money/expenses')).toHaveLength(1));
    const body = callsTo('POST', '/partners/me/money/expenses')[0].body as Record<string, unknown>;
    expect(body).toMatchObject({ categoryId: 'cat-rent', description: 'Rent', amountPaise: 1500000, mode: 'CASH', itcEligible: false, accountId: 'cash1' });
  });

  it('a Hindi reader sees the category in Hindi and the GST rule before the request', async () => {
    setRoutes({ 'GET /partners/me/money/expense-categories': categories, 'GET /partners/me/money/accounts': { success: true, data: [] } });
    await paper(<ExpenseQuickAddScreen />, 'hi');
    await waitFor(() => expect(screen.getByText(hi.money.systemCategory.RENT)).toBeTruthy());
    await fireEvent.press(screen.getByTestId('expense-cat-cat-rent'));
    await fireEvent.changeText(screen.getByTestId('expense-amount'), '100');
    await fireEvent(screen.getByLabelText(hi.money.expense.hasGst), 'valueChange', true);
    await fireEvent.changeText(screen.getByTestId('expense-gst'), '500');
    await fireEvent.press(screen.getByTestId('expense-save'));
    await waitFor(() => expect(screen.getByTestId('expense-error')).toHaveTextContent(hi.money.expense.error.gstExceeds));
    expect(callsTo('POST', '/partners/me/money/expenses')).toHaveLength(0);
  });
});

describe('Role limits in the UI', () => {
  const expenses = {
    data: [{ _id: 'e1', number: 'EXP/1', expenseDate: '2026-09-30', categoryId: 'c', categoryName: 'Rent', description: 'Shop rent', amountPaise: 1500000, itcEligible: false, accountId: 'a', mode: 'BANK', attachmentUrls: [], status: 'RECORDED' }],
    totals: { amountPaise: 1500000, gstPaise: 0 }, page: 1, limit: 30, total: 1,
  };
  it('without DOCUMENTS_VOID there is no Cancel on an expense', async () => {
    mockPerms.deny = new Set(['DOCUMENTS_VOID']);
    setRoutes({ 'GET /partners/me/money/expenses': expenses });
    await paper(<ExpensesScreen />);
    await waitFor(() => expect(screen.getByText('Shop rent')).toBeTruthy());
    expect(screen.queryByText(en.money.expense.cancel)).toBeNull();
  });
  it('with it, Cancel asks for a reason', async () => {
    setRoutes({ 'GET /partners/me/money/expenses': expenses, 'POST /partners/me/money/expenses/e1/cancel': { success: true, data: {} } });
    await paper(<ExpensesScreen />);
    await waitFor(() => expect(screen.getByText(en.money.expense.cancel)).toBeTruthy());
  });
  it('the generic list never offers "new GRN"; purchases home lists receipts', async () => {
    setRoutes({ 'GET /partners/me/documents': { data: [], page: 1, limit: 20, total: 0 } });
    await paper(<PurchasesHomeScreen />);
    await waitFor(() => expect(screen.getByText(en.purchases.empty.PO)).toBeTruthy());
    expect(callsTo('GET', '/partners/me/documents')[0].params).toMatchObject({ type: 'PURCHASE_ORDER' });
    expect(screen.queryByText(en.billing.documentType.GOODS_RECEIPT)).toBeNull();
  });
});

describe('Day close', () => {
  it('shows the difference and closes with the counted cash', async () => {
    setRoutes({
      'GET /partners/me/money/day-summary': { success: true, data: {
        date: '2026-09-30', sales: [{ printAs: 'BILL_OF_SUPPLY_COMPOSITION', count: 3, taxablePaise: 300000, taxPaise: 0, grandPaise: 300000 }],
        creditSalesPaise: 0, collections: [{ mode: 'CASH', amountPaise: 300000 }], paymentsOutPaise: 0, expenses: [], purchasesPaise: 0,
        cash: { openingPaise: 100000, inPaise: 300000, outPaise: 0, expensesPaise: 0, transfersPaise: 0, expectedPaise: 400000 }, topItems: [],
      } },
      'POST /partners/me/money/day-close': { success: true, data: { _id: 'd1' } },
    });
    await paper(<DayCloseScreen />);
    await waitFor(() => expect(screen.getByTestId('day-counted')).toBeTruthy());
    // A composition shop's sales read as bills of supply.
    expect(screen.getByText(fill(en.money.day.salesRow, { label: en.billing.documentType.BILL_OF_SUPPLY, count: 3 }))).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('day-counted'), '3,980');
    expect(screen.getByTestId('day-variance')).toHaveTextContent(/-₹20\.00|−₹20\.00/);
    await fireEvent.press(screen.getByTestId('day-close'));
    await pressAlertButton(en.money.day.close);
    await waitFor(() => expect(callsTo('POST', '/partners/me/money/day-close')).toHaveLength(1));
    expect(callsTo('POST', '/partners/me/money/day-close')[0].body).toMatchObject({ countedCashPaise: 398000 });
  });
});

// ─────────────────────────────────── account picker, composition labels
describe('Payment account picker', () => {
  const acc = (id: string, name: string, kind = 'BANK') => ({ _id: id, kind, name, isDefault: false, isActive: true, openingBalancePaise: 0, balancePaise: 0 });
  it('is hidden when the shop has one account', async () => {
    setRoutes({ 'GET /partners/me/money/accounts': { success: true, data: [acc('a1', 'Cash in shop', 'CASH')] } });
    await paper(<AccountPicker c={themeColors(false)} value="" onChange={jest.fn()} />);
    await waitFor(() => expect(callsTo('GET', '/partners/me/money/accounts')).toHaveLength(1));
    expect(screen.queryByTestId('account-picker')).toBeNull();
  });
  it('offers the usual account plus each account when there are several', async () => {
    const onChange = jest.fn();
    setRoutes({ 'GET /partners/me/money/accounts': { success: true, data: [acc('a1', 'Cash in shop', 'CASH'), acc('b1', 'HDFC current')] } });
    await paper(<AccountPicker c={themeColors(false)} value="" onChange={onChange} />);
    await waitFor(() => expect(screen.getByTestId('account-picker')).toBeTruthy());
    expect(screen.getByText(en.money.picker.default)).toBeTruthy();
    await fireEvent.press(screen.getByText('HDFC current'));
    expect(onChange).toHaveBeenCalledWith('b1');
  });
});

describe('Composition shop reads as bill of supply everywhere', () => {
  it('useIsGstRegistered is false for a composition partner', async () => {
    setRoutes({ 'GET /partners/me/settings/business': { success: true, data: { isGstRegistered: true, registrationType: 'COMPOSITION' } } });
    const { client } = await renderScreen(<RNText>x</RNText>);
    const { result } = await renderHook(() => useIsGstRegistered(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(result.current).toBe(false));
    expect(documentTypeLabelKey('TAX_INVOICE', result.current)).toBe(BILL_OF_SUPPLY_LABEL_KEY);
  });
});
