/**
 * Partner P1 (CONTRACT-partner-P1) — the pure rules behind the shop app's
 * business screens: role limits, bill-of-supply labels, the count-by-scan
 * offline queue, receiving against a PO, reorder grouping, khata, money, the
 * low-stock push route, the supplier master and the error catalogue additions.
 */
import {
  checkRoleLimits, earliestAllowedDay, istDay, mayOverrideCredit, normaliseRoleLimits, canManageDocType,
} from '../features/p1/access';
import {
  BILL_OF_SUPPLY_LABEL_KEY, CREATABLE_DOCUMENT_TYPES, CREATABLE_PURCHASE_DOCUMENT_TYPES, PURCHASE_DOCUMENT_TYPES,
  documentTypeLabelKey,
} from '../features/billing/types';
import {
  EMPTY_QUEUE, batchDone, batchEntries, dropRefused, enqueueScan, takeBatch, unsentUnits, MAX_BATCH,
} from '../features/stock/countQueue';
import {
  buildReceiveBody, canBillTogether, initialReceiveDraft, maxReceivable, returnableLines, tickLineByItem, toggleGrn,
} from '../features/purchases/logic';
import type { PoReceiptLine, UnbilledGrn } from '../features/purchases/api';
import { buildReorderRequest, initialPicks } from '../features/stock/reorderLogic';
import type { ReorderRow } from '../features/stock/api';
import { buildKhataBody, formFrom, shareMessage } from '../features/khata/logic';
import { buildExpenseBody, cashVariance, defaultAccountFor, sumDenominations } from '../features/money/logic';
import type { MoneyAccount } from '../features/money/api';
import { notificationDestination } from '../api/notification.api';
import { supplierInputFrom, EMPTY_SUPPLIER_FORM } from '../features/purchases/components/SupplierFields';
import { takesSupplierBillFields } from '../features/purchases/components/PurchaseBillFields';
import { PARTNER_ACCESS_MODULES, PARTNER_DOCUMENT_TYPES } from '../types/api-contract.generated';
import en from '../i18n/locales/en.json';
import hi from '../i18n/locales/hi.json';

const iso = (ymd: string) => new Date(`${ymd}T00:00:00`).toISOString();

// ───────────────────────────────────────────────────────── role limits
describe('role limits (mirror of checkRoleLimits)', () => {
  const line = (over: object = {}) => ({ itemId: 'p1', itemName: 'Rice 5kg', qty: 2, ratePaise: 50000, discountPaise: 0, ...over });

  it('no limits (the proprietor) → nothing is refused', () => {
    expect(checkRoleLimits({ limits: {}, lines: [line({ discountPaise: 99999 })] })).toBeNull();
    expect(checkRoleLimits({ limits: undefined, lines: [line({ discountPaise: 99999 })] })).toBeNull();
  });

  it('per-line discount above the cap names the item and the line', () => {
    // 10% of 2 × ₹500 = ₹100; ₹100.01 is over.
    expect(checkRoleLimits({ limits: { maxDiscountPercent: 10 }, lines: [line({ discountPaise: 10000 })] })).toBeNull();
    const v = checkRoleLimits({ limits: { maxDiscountPercent: 10 }, lines: [line(), line({ itemName: 'Dal', discountPaise: 10001 })] });
    expect(v).toEqual({ code: 'DISCOUNT_ABOVE_ROLE_CAP', params: { capPercent: '10', itemName: 'Dal' }, lineIndex: 1 });
  });

  it('bill discount cap is summed over lines and said in rupees', () => {
    const v = checkRoleLimits({
      limits: { maxDiscountPaisePerBill: 5000 },
      lines: [line({ discountPaise: 3000 }), line({ discountPaise: 2001 })],
    });
    expect(v).toEqual({ code: 'BILL_DISCOUNT_ABOVE_ROLE_CAP', params: { cap: '50.00' } });
  });

  it('price edit refused when the rate is not the catalogue price', () => {
    const v = checkRoleLimits({ limits: { mayEditPrice: false }, lines: [line({ ratePaise: 45000 })], catalogPricePaise: () => 50000 });
    expect(v?.code).toBe('PRICE_EDIT_NOT_ALLOWED');
    expect(checkRoleLimits({ limits: { mayEditPrice: false }, lines: [line()], catalogPricePaise: () => 50000 })).toBeNull();
    // A one-off line (no item) is never price-checked.
    expect(checkRoleLimits({ limits: { mayEditPrice: false }, lines: [line({ itemId: undefined, ratePaise: 1 })], catalogPricePaise: () => 50000 })).toBeNull();
  });

  it('backdating beyond the allowed days is refused first (the order a clerk fixes them in)', () => {
    const now = new Date('2026-09-30T06:00:00.000Z');
    const v = checkRoleLimits({ limits: { mayBackdateDays: 2, maxDiscountPercent: 0 }, lines: [line({ discountPaise: 1 })], documentDay: '2026-09-27', now });
    expect(v).toEqual({ code: 'BACKDATE_BEYOND_ROLE_LIMIT', params: { days: '2' } });
    expect(checkRoleLimits({ limits: { mayBackdateDays: 2 }, lines: [line()], documentDay: '2026-09-28', now })).toBeNull();
    expect(earliestAllowedDay({ mayBackdateDays: 2 }, now)).toBe('2026-09-28');
    expect(earliestAllowedDay({}, now)).toBeUndefined();
  });

  it('istDay is the India calendar day', () => {
    expect(istDay(new Date('2026-09-29T20:00:00.000Z'))).toBe('2026-09-30');
  });

  it('normalises the entitlements limits and fails to "no limit" on junk', () => {
    expect(normaliseRoleLimits({ maxDiscountPercent: 5, mayEditPrice: false, junk: 1, mayBackdateDays: -1 }))
      .toEqual({ maxDiscountPercent: 5, mayEditPrice: false });
    expect(normaliseRoleLimits(null)).toEqual({});
    expect(mayOverrideCredit(false, { mayOverrideCreditLimit: true })).toBe(true);
    expect(mayOverrideCredit(false, {})).toBe(false);
    expect(mayOverrideCredit(true, {})).toBe(true);
  });

  it('manage permission follows the document side', () => {
    const can = (m: string) => m === 'PURCHASES_MANAGE';
    expect(canManageDocType(can, 'PURCHASE_ORDER')).toBe(true);
    expect(canManageDocType(can, 'GOODS_RECEIPT')).toBe(true);
    expect(canManageDocType(can, 'TAX_INVOICE')).toBe(false);
  });
});

// ───────────────────────────────────────────── documents: labels & types
describe('document types and bill-of-supply labels', () => {
  it('GOODS_RECEIPT is listed but never offered on the generic create screen', () => {
    expect(PURCHASE_DOCUMENT_TYPES).toContain('GOODS_RECEIPT');
    expect(CREATABLE_PURCHASE_DOCUMENT_TYPES).not.toContain('GOODS_RECEIPT');
    expect(CREATABLE_DOCUMENT_TYPES).not.toContain('GOODS_RECEIPT');
    expect(PARTNER_DOCUMENT_TYPES).toContain('GOODS_RECEIPT');
  });

  it('printAs wins: a composition bill reads "Bill of supply" even from a registered shop', () => {
    expect(documentTypeLabelKey('TAX_INVOICE', true, 0, 'BILL_OF_SUPPLY_COMPOSITION')).toBe(BILL_OF_SUPPLY_LABEL_KEY);
    expect(documentTypeLabelKey('TAX_INVOICE', true, 0, 'BILL_OF_SUPPLY_EXEMPT')).toBe(BILL_OF_SUPPLY_LABEL_KEY);
    expect(documentTypeLabelKey('TAX_INVOICE', false, 0, 'TAX_INVOICE')).toBe('billing.documentType.TAX_INVOICE');
    // No stamp (pre-P1 document): the old rule.
    expect(documentTypeLabelKey('TAX_INVOICE', false, 0)).toBe(BILL_OF_SUPPLY_LABEL_KEY);
    expect(documentTypeLabelKey('TAX_INVOICE', true, 1800)).toBe('billing.documentType.TAX_INVOICE');
    expect(documentTypeLabelKey('GOODS_RECEIPT', true)).toBe('billing.documentType.GOODS_RECEIPT');
  });

  it('supplier bill fields belong to purchase bills and debit notes only', () => {
    expect(takesSupplierBillFields('PURCHASE_INVOICE')).toBe(true);
    expect(takesSupplierBillFields('DEBIT_NOTE')).toBe(true);
    expect(takesSupplierBillFields('TAX_INVOICE')).toBe(false);
  });

  it('the regenerated contract carries the ten P1 permission rows', () => {
    for (const m of ['PURCHASES_VIEW', 'PURCHASES_MANAGE', 'STOCK_VIEW', 'STOCK_MANAGE', 'STOCK_COUNT', 'EXPENSES_VIEW', 'EXPENSES_MANAGE', 'ACCOUNTS', 'COSTS', 'DOCUMENTS_VOID']) {
      expect(PARTNER_ACCESS_MODULES).toContain(m);
    }
  });
});

// ─────────────────────────────────────────────── count-by-scan queue
describe('count-by-scan offline queue', () => {
  it('each scan is one unit; the same product merges while waiting', () => {
    let q = enqueueScan(EMPTY_QUEUE, { productId: 'p1', label: 'Rice', qty: 1 });
    q = enqueueScan(q, { productId: 'p1', label: 'Rice', qty: 1 });
    q = enqueueScan(q, { barcode: '890123', label: '890123', qty: 1 });
    q = enqueueScan(q, { barcode: '890123', label: '890123', qty: 1 });
    expect(q.pending).toEqual([
      { productId: 'p1', label: 'Rice', qty: 2 },
      { barcode: '890123', label: '890123', qty: 2 },
    ]);
    expect(unsentUnits(q)).toBe(4);
  });

  it('a batch is ADD mode, keeps its key until answered, and new scans queue behind it', () => {
    let q = enqueueScan(EMPTY_QUEUE, { productId: 'p1', label: 'Rice', qty: 3 });
    q = takeBatch(q, 'key-1');
    expect(batchEntries(q)).toEqual([{ productId: 'p1', countedQty: 3, mode: 'ADD' }]);
    q = enqueueScan(q, { productId: 'p1', label: 'Rice', qty: 1 });
    // Still the same batch under the same key (a retry after a dropped connection).
    expect(takeBatch(q, 'key-2').inFlight?.key).toBe('key-1');
    expect(unsentUnits(q)).toBe(4);
    q = batchDone(q);
    expect(q.inFlight).toBeNull();
    expect(q.pending).toEqual([{ productId: 'p1', label: 'Rice', qty: 1 }]);
  });

  it('batches are at most 200 lines', () => {
    let q = EMPTY_QUEUE;
    for (let i = 0; i < 250; i += 1) q = enqueueScan(q, { productId: `p${i}`, label: `P${i}`, qty: 1 });
    q = takeBatch(q, 'k');
    expect(q.inFlight?.scans).toHaveLength(MAX_BATCH);
    expect(q.pending).toHaveLength(50);
  });

  it('a refused barcode is dropped and the rest are re-queued', () => {
    let q = enqueueScan(EMPTY_QUEUE, { productId: 'p1', label: 'Rice', qty: 1 });
    q = enqueueScan(q, { barcode: 'BAD', label: 'BAD', qty: 2 });
    q = takeBatch(q, 'k');
    const { state, dropped } = dropRefused(q, 'STOCK_COUNT_BARCODE_UNKNOWN', { barcode: 'BAD' });
    expect(dropped).toEqual([{ barcode: 'BAD', label: 'BAD', qty: 2 }]);
    expect(state.inFlight).toBeNull();
    expect(state.pending).toEqual([{ productId: 'p1', label: 'Rice', qty: 1 }]);
    // Out of scope is matched by the product's name.
    const r2 = dropRefused(takeBatch(state, 'k2'), 'STOCK_COUNT_PRODUCT_NOT_IN_SCOPE', { productName: 'Rice' });
    expect(r2.dropped).toHaveLength(1);
  });
});

// ───────────────────────────────────────────────── receive against PO
describe('receive against a purchase order', () => {
  const lines: PoReceiptLine[] = [
    { poLineIndex: 0, itemId: 'p1', itemName: 'Rice', unit: 'BAG', ordered: 10, received: 4, pending: 6, ratePaise: 100000 },
    { poLineIndex: 1, itemId: 'p2', itemName: 'Dal', unit: 'KG', ordered: 5, received: 5, pending: 0, ratePaise: 9000 },
  ];

  it('starts with everything still to come, and sends only lines with a quantity', () => {
    const draft = initialReceiveDraft(lines);
    expect(draft).toEqual({ 0: { qty: 6 }, 1: { qty: 0 } });
    expect(buildReceiveBody(lines, draft).body).toEqual([{ poLineIndex: 0, qty: 6 }]);
  });

  it('a changed rate is sent; the same rate is not', () => {
    expect(buildReceiveBody(lines, { 0: { qty: 2, ratePaise: 95000 } }).body).toEqual([{ poLineIndex: 0, qty: 2, ratePaise: 95000 }]);
    expect(buildReceiveBody(lines, { 0: { qty: 2, ratePaise: 100000 } }).body).toEqual([{ poLineIndex: 0, qty: 2 }]);
  });

  it('over the pending qty (plus the shop tolerance) is flagged', () => {
    expect(buildReceiveBody(lines, { 0: { qty: 7 } }).over).toHaveLength(1);
    expect(buildReceiveBody(lines, { 0: { qty: 7 } }, 20).over).toHaveLength(0);
    expect(maxReceivable(6, 20)).toBe(7.2);
    expect(maxReceivable(6, 50)).toBe(7.2); // capped at 20%
  });

  it('a scan ticks the matching line (from zero on the first scan)', () => {
    const d = tickLineByItem(lines, { 0: { qty: 6 } }, 'p1', true);
    expect(d?.[0].qty).toBe(1);
    expect(tickLineByItem(lines, d!, 'p1', false)?.[0].qty).toBe(2);
    expect(tickLineByItem(lines, d!, 'nope', false)).toBeNull();
  });

  it('GRNs go on one bill only from one supplier', () => {
    const g = (id: string, partyId: string) => ({ id, number: id, documentDate: '', partyId, partyName: partyId, lineCount: 1, totals: { grandPaise: 1 } }) as UnbilledGrn;
    let sel = toggleGrn([], g('a', 's1'));
    sel = toggleGrn(sel, g('b', 's1'));
    expect(sel.map((x) => x.id)).toEqual(['a', 'b']);
    expect(canBillTogether(sel)).toBe(true);
    // Another supplier's note starts a new selection.
    expect(toggleGrn(sel, g('c', 's2')).map((x) => x.id)).toEqual(['c']);
    expect(canBillTogether([g('a', 's1'), g('c', 's2')])).toBe(false);
    expect(toggleGrn(sel, g('a', 's1')).map((x) => x.id)).toEqual(['b']);
  });

  it('only catalogue lines can be returned', () => {
    const l = (itemId?: string) => ({ itemId, itemName: 'x', qty: 1, unit: 'PCS', ratePaise: 1, discountPaise: 0, taxInclusive: true, taxRatePercent: 0, cessRatePercent: 0, taxablePaise: 1, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, cessPaise: 0, totalPaise: 1 });
    expect(returnableLines([l('p1'), l(undefined), l('p2')]).map((r) => r.lineIndex)).toEqual([0, 2]);
  });
});

// ────────────────────────────────────────────────────────────── reorder
describe('reorder list → purchase orders', () => {
  const rows: ReorderRow[] = [
    { productId: 'p1', name: 'Rice', unit: 'BAG', stockQty: 1, suggestedQty: 9, preferredSupplier: { id: 's1', name: 'Agro' }, lastPurchaseRatePaise: 90000, lastSupplierId: 's1', pendingOnOpenPOsQty: 0 },
    { productId: 'p2', name: 'Dal', unit: 'KG', stockQty: 0, suggestedQty: 5, preferredSupplier: { id: 's2', name: 'Pulses' }, pendingOnOpenPOsQty: 0 },
    { productId: 'p3', name: 'Oil', unit: 'LTR', stockQty: 0, suggestedQty: 3, pendingOnOpenPOsQty: 0 },
  ];

  it('ticked lines become one PO per supplier; an item with no supplier is named', () => {
    const picks = initialPicks(rows);
    const r = buildReorderRequest(rows, picks);
    expect(r.missingSupplier).toEqual(['Oil']);
    expect(r.supplierCount).toBe(2);
    expect(r.lines).toEqual([
      { productId: 'p1', qty: 9, supplierId: 's1', ratePaise: 90000 },
      { productId: 'p2', qty: 5, supplierId: 's2' },
    ]);
    const fixed = buildReorderRequest(rows, { ...picks, p3: { qty: 2, selected: true, supplier: { id: 's1', name: 'Agro' } } });
    expect(fixed.missingSupplier).toEqual([]);
    expect(fixed.supplierCount).toBe(2);
    // The last rate only rides along to the supplier it was paid to.
    const moved = buildReorderRequest(rows, { ...picks, p1: { qty: 9, selected: true, supplier: { id: 's2', name: 'Pulses' } }, p3: { ...picks.p3, selected: false } });
    expect(moved.lines[0]).toEqual({ productId: 'p1', qty: 9, supplierId: 's2' });
  });
});

// ─────────────────────────────────────────────────────────────── khata
describe('khata', () => {
  it('the share text carries the link and UPI link once each', () => {
    expect(shareMessage({ text: 'Pay ₹500', url: 'https://x/khata/t', upiUri: 'upi://pay?x' }))
      .toBe('Pay ₹500\nhttps://x/khata/t\nupi://pay?x');
    expect(shareMessage({ text: 'Pay ₹500 https://x/khata/t', url: 'https://x/khata/t' })).toBe('Pay ₹500 https://x/khata/t');
  });

  it('settings: no limit + no plan clears both; limit in rupees; weekly carries the weekday', () => {
    const isoOf = (d: string) => (d ? `${d}T00:00:00.000Z` : undefined);
    expect(buildKhataBody(formFrom(), isoOf).body).toEqual({ credit: null, collectionPlan: null });
    const f = { ...formFrom(), hasLimit: true, limit: '5,000', mode: 'BLOCK' as const, days: '15', cadence: 'WEEKLY' as const, weekday: 3, autoRemind: true };
    expect(buildKhataBody(f, isoOf).body).toEqual({
      credit: { limitPaise: 500000, days: 15, mode: 'BLOCK' },
      collectionPlan: { cadence: 'WEEKLY', autoRemind: true, nextDate: null, weekday: 3 },
    });
    expect(buildKhataBody({ ...formFrom(), hasLimit: true, limit: 'abc' }, isoOf).error).toBe('limit');
    expect(buildKhataBody({ ...formFrom(), cadence: 'ON_DATE' }, isoOf).error).toBe('nextDate');
    expect(buildKhataBody({ ...formFrom(), days: '400' }, isoOf).error).toBe('days');
  });

  it('reads saved settings back into the form', () => {
    const f = formFrom({ limitPaise: 250000, days: 7, mode: 'WARN' }, { cadence: 'MONTHLY', dayOfMonth: 5, autoRemind: true, nextDate: '2026-10-05T00:00:00.000Z' });
    expect(f).toMatchObject({ hasLimit: true, limit: '2500.00', days: '7', cadence: 'MONTHLY', dayOfMonth: 5, nextDate: '2026-10-05' });
  });
});

// ─────────────────────────────────────────────────────────────── money
describe('money', () => {
  const base = { day: '2026-09-30', categoryId: 'c1', description: 'Rent', amount: '1,180', gst: '', supplierGstin: '', itcEligible: true, mode: 'CASH' as const, reference: '' };

  it('an expense body is paise, GST optional, ITC only with GST', () => {
    expect(buildExpenseBody(base, iso).body).toEqual({
      expenseDate: iso('2026-09-30'), categoryId: 'c1', description: 'Rent', amountPaise: 118000, itcEligible: false, mode: 'CASH',
    });
    expect(buildExpenseBody({ ...base, gst: '180', supplierGstin: '08abcde1234f1z5' }, iso).body).toMatchObject({
      gstPaise: 18000, supplierGstin: '08ABCDE1234F1Z5', itcEligible: true,
    });
  });

  it('refuses what the server would: GST above the amount, no category, bad GSTIN', () => {
    expect(buildExpenseBody({ ...base, gst: '2000' }, iso).error).toBe('gstExceeds');
    expect(buildExpenseBody({ ...base, categoryId: '' }, iso).error).toBe('category');
    expect(buildExpenseBody({ ...base, amount: '0' }, iso).error).toBe('amount');
    expect(buildExpenseBody({ ...base, supplierGstin: 'XYZ' }, iso).error).toBe('gstin');
  });

  it('the default account follows the mode; the drawer count adds up', () => {
    const acc = (id: string, kind: 'CASH' | 'BANK', isDefault: boolean) => ({ _id: id, kind, isDefault, isActive: true, name: id, openingBalancePaise: 0, balancePaise: 0 }) as MoneyAccount;
    const list = [acc('cash', 'CASH', true), acc('b1', 'BANK', false), acc('b2', 'BANK', true)];
    expect(defaultAccountFor(list, 'CASH')?._id).toBe('cash');
    expect(defaultAccountFor(list, 'UPI')?._id).toBe('b2');
    expect(sumDenominations({ 500: 2, 100: 3, 10: 1 })).toBe(131000);
    expect(cashVariance(100000, 98000)).toBe(-2000);
  });
});

// ─────────────────────────────────────────────── low-stock push, supplier master
describe('low-stock push and supplier master', () => {
  it('a low-stock tap opens the reorder list (link or kind)', () => {
    expect(notificationDestination({ link: '/dashboard/partner/reorder', kind: 'PARTNER_LOW_STOCK' }))
      .toEqual({ href: '/stock/reorder', requires: 'CATALOG' });
    expect(notificationDestination({ kind: 'PARTNER_LOW_STOCK' })).toEqual({ href: '/stock/reorder', requires: 'CATALOG' });
    expect(notificationDestination({ kind: 'PARTNER_KHATA_REMINDER' })).toEqual({ href: '/khata', requires: 'INVOICING' });
  });

  it('the supplier form sends the full PAN (upper-case) and refuses a bad one', () => {
    expect(supplierInputFrom({ ...EMPTY_SUPPLIER_FORM, pan: 'abcde1234f', paymentTermsDays: '30' }).input)
      .toEqual({ pan: 'ABCDE1234F', paymentTermsDays: 30, isComposition: false });
    expect(supplierInputFrom({ ...EMPTY_SUPPLIER_FORM, pan: 'ABC' }).error).toBe('pan');
    expect(supplierInputFrom({ ...EMPTY_SUPPLIER_FORM, ifsc: 'sbin0001234', acNoLast4: '1234' }).input?.bank).toEqual({ ifsc: 'SBIN0001234', acNoLast4: '1234' });
    expect(supplierInputFrom({ ...EMPTY_SUPPLIER_FORM, leadTimeDays: '400' }).error).toBe('leadTimeDays');
  });
});

// ─────────────────────────────────────────────────── catalogue: P1 codes
describe('P1 error sentences are in both catalogues', () => {
  it('every §10 code reads in English and Hindi', () => {
    const codes = ['DOCUMENT_TYPE_NOT_PERMITTED', 'GRN_QTY_EXCEEDS_PENDING', 'STOCK_COUNT_BARCODE_UNKNOWN', 'KHATA_REMINDER_NO_CHANNEL', 'DAY_ALREADY_CLOSED', 'PARTY_CREDIT_LIMIT_EXCEEDED'];
    for (const code of codes) {
      expect((en.errors as Record<string, string>)[code]).toBeTruthy();
      expect((hi.errors as Record<string, string>)[code]).toBeTruthy();
    }
    expect((hi.errors as Record<string, string>).GRN_QTY_EXCEEDS_PENDING).toContain('{{pending}}');
  });
});
