/**
 * Commerce C1–C6 in the shop app — the PURE rules (features/commerce/logic.ts,
 * access.ts, fulfilmentLogic.ts) and the notification routes for the new
 * kinds and links. Checked against the BUILT backend's own rules.
 */
import {
  addTenderPart, adjustBody, bpToPercentText, bundleProblem, cleanSegment, emptyOfferForm, heatBands, heatLevel,
  holdLinesOf, lastDays, manualDiscountLines, moveItem, offerActions, offerFormToInput, offerState, offerToForm,
  percentToBp, scheduleProblem, segmentKey, singleTender, statementLabelKey, tenderProblem, tenderRemaining,
  tillLinesFromResumed, topUpAmount, variantAttrsProblem, variantLabelOf, weeklyLeft, defaultHoldLabel,
} from '../features/commerce/logic';
import { commerceAccessOf, commerceDoors } from '../features/commerce/access';
import { commerceAllows, isCommerceFeature } from '../features/commerce/features';
import { assignable, attemptsLeftOf, needsProof, otpDigits, partialChanges, partialProducts } from '../features/commerce/fulfilmentLogic';
import { notificationDestination } from '../api/notification.api';
import type { OfferView } from '../features/commerce/types';

const t = (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k);

describe('offers (C3)', () => {
  it('percent ↔ basis points', () => {
    expect(percentToBp('10')).toBe(1000);
    expect(percentToBp('12.5%')).toBe(1250);
    expect(percentToBp('0')).toBeNull();
    expect(percentToBp('101')).toBeNull();
    expect(percentToBp('abc')).toBeNull();
    expect(bpToPercentText(1250)).toBe('12.5');
    expect(bpToPercentText(1000)).toBe('10');
  });

  it('a % off coupon becomes the server body (code upper-cased, both channels)', () => {
    const f = { ...emptyOfferForm('COUPON'), name: ' Diwali ', code: 'diwali10', benefitType: 'PERCENT' as const, percent: '10', maxDiscount: '100' };
    const out = offerFormToInput(f);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.body).toMatchObject({
      name: 'Diwali', kind: 'COUPON', code: 'DIWALI10',
      benefit: { type: 'PERCENT', percentBp: 1000, maxDiscountPaise: 10000 },
      scope: { type: 'ORDER' }, channels: ['ONLINE', 'COUNTER'], stacking: { stackable: false, priority: 0 },
    });
  });

  it('refuses the shapes the server refuses (offerShapeProblem), on the field', () => {
    const bad = offerFormToInput({ ...emptyOfferForm('COUPON'), benefitType: 'BUY_X_GET_Y', code: 'x' });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.errors).toMatchObject({
      name: 'commerce.offers.err.name', code: 'commerce.offers.err.code',
      buyQty: 'commerce.offers.err.qty', getQty: 'commerce.offers.err.qty', scopeType: 'commerce.offers.err.bxgyScope',
    });
    const noItems = offerFormToInput({ ...emptyOfferForm(), name: 'A', percent: '5', scopeType: 'PRODUCTS' });
    expect(!noItems.ok && noItems.errors.productIds).toBe('commerce.offers.err.products');
    const dates = offerFormToInput({ ...emptyOfferForm(), name: 'A', percent: '5', startsOn: '2026-10-10', endsOn: '2026-10-01' });
    expect(!dates.ok && dates.errors.endsOn).toBe('commerce.offers.err.dates');
    expect(offerFormToInput({ ...emptyOfferForm(), name: 'A', percent: '5', channels: [] }).ok).toBe(false);
  });

  it('a stored offer round-trips unchanged — a used offer must compare equal (C-5)', () => {
    const view = {
      id: 'o1', name: 'BxGy', kind: 'AUTO', benefit: { type: 'BUY_X_GET_Y', buyQty: 2, getQty: 1, percentBp: 10000 },
      conditions: { minOrderPaise: 50000, daysOfWeek: [5, 6] }, scope: { type: 'PRODUCTS', productIds: ['p1', 'p2'] },
      channels: ['ONLINE'], limits: { perCustomer: 2 }, stacking: { stackable: true, priority: 3 }, status: 'ACTIVE',
      stats: { usedCount: 4, discountGivenPaise: 100 }, live: true,
    } as unknown as OfferView;
    const out = offerFormToInput(offerToForm(view));
    expect(out.ok && out.body.benefit).toEqual({ type: 'BUY_X_GET_Y', buyQty: 2, getQty: 1, percentBp: 10000 });
    expect(out.ok && out.body.conditions).toEqual({ minOrderPaise: 50000, daysOfWeek: [5, 6] });
    expect(out.ok && out.body.scope).toEqual({ type: 'PRODUCTS', productIds: ['p1', 'p2'] });
  });

  it('where an offer stands, and what may be done (ARCHIVED is final)', () => {
    const now = new Date('2026-10-02T10:00:00Z');
    const base = { status: 'ACTIVE' as const, live: false, stats: { usedCount: 0, discountGivenPaise: 0 } };
    expect(offerState({ ...base, live: true }, now)).toBe('RUNNING');
    expect(offerState({ ...base, conditions: { startsAt: '2026-11-01T00:00:00Z' } }, now)).toBe('NOT_STARTED');
    expect(offerState({ ...base, conditions: { endsAt: '2026-09-01T00:00:00Z' } }, now)).toBe('EXPIRED');
    expect(offerState({ ...base, limits: { total: 3 }, stats: { usedCount: 3, discountGivenPaise: 0 } }, now)).toBe('USED_UP');
    expect(offerState({ ...base, status: 'PAUSED' }, now)).toBe('PAUSED');
    expect(offerState({ ...base, status: 'ARCHIVED' }, now)).toBe('ENDED');
    expect(offerActions('ARCHIVED')).toEqual({ pause: false, resume: false, end: false, edit: false });
    expect(offerActions('PAUSED')).toMatchObject({ resume: true, pause: false });
  });
});

describe('counter (C3 offers, C6 holds / split tender) — never double count', () => {
  it('strips the offers\' and the points\' share before lines go back to the server', () => {
    const lines = [{ discountPaise: 1500 }, { discountPaise: 300 }, { discountPaise: 0 }];
    expect(manualDiscountLines(lines, { lineOfferPaise: [1000, 300, 0] }, { lineRedeemPaise: [200, 0, 0] }))
      .toEqual([{ discountPaise: 300 }, { discountPaise: 0 }, { discountPaise: 0 }]);
    // A split that does not match the lines is ignored, never misapplied.
    expect(manualDiscountLines(lines, { lineOfferPaise: [1000] })).toEqual(lines);
    expect(manualDiscountLines(lines)).toEqual(lines);
    // Never below zero.
    expect(manualDiscountLines([{ discountPaise: 100 }], { lineOfferPaise: [500] })).toEqual([{ discountPaise: 0 }]);
  });

  it('a hold keeps a typed rate only when the cashier typed one', () => {
    expect(holdLinesOf([
      { itemId: 'p1', itemName: 'Rice', qty: 2, unit: 'KG', ratePaise: 5000, catalogRatePaise: 5000 },
      { itemId: 'p2', itemName: 'Dal', qty: 1, ratePaise: 9000, catalogRatePaise: 9500, discountPaise: 500 },
      { itemName: 'Bag', qty: 1, ratePaise: 1000 },
    ])).toEqual([
      { itemId: 'p1', itemName: 'Rice', qty: 2, unit: 'KG' },
      { itemId: 'p2', itemName: 'Dal', qty: 1, ratePaise: 9000, discountPaise: 500 },
      { itemName: 'Bag', qty: 1, ratePaise: 1000 },
    ]);
    expect(defaultHoldLabel('Asha', new Date(2026, 9, 2, 9, 5), t)).toBe('Asha · 09:05');
    expect(defaultHoldLabel(undefined, new Date(2026, 9, 2, 18, 30), t)).toContain('commerce.counter.holdLabelDefault');
  });

  it('a resumed hold drops lines that cannot be sold and flags short ones', () => {
    const out = tillLinesFromResumed([
      { itemId: 'p1', itemName: 'Rice', qty: 1, unit: 'KG', ratePaise: 5000, catalogueRatePaise: 5200 },
      { itemId: 'p2', itemName: 'Gone', qty: 1, unit: 'PCS', ratePaise: 100, issue: 'GONE' },
      { itemId: 'p3', itemName: 'Shirt', qty: 1, unit: 'PCS', ratePaise: 100, issue: 'PARENT' },
      { itemId: 'p4', itemName: 'Milk', qty: 9, unit: 'LTR', ratePaise: 6000, issue: 'OUT_OF_STOCK' },
    ]);
    expect(out.lines.map((l) => l.itemName)).toEqual(['Rice', 'Milk']);
    expect(out.lines[0].catalogRatePaise).toBe(5200);
    expect(out.dropped).toEqual(['Gone', 'Shirt']);
    expect(out.short).toEqual(['Milk']);
  });

  it('split tender adds up exactly (D-6), at most 5 parts, credit within the balance', () => {
    expect(singleTender(10000)).toEqual([{ mode: 'CASH', amountPaise: 10000 }]);
    expect(tenderProblem(10000, singleTender(10000))).toBe('NONE');
    expect(tenderProblem(10000, [{ mode: 'CASH', amountPaise: 6000 }])).toBe('SHORT');
    expect(tenderProblem(10000, [{ mode: 'CASH', amountPaise: 6000 }, { mode: 'UPI', amountPaise: 5000 }])).toBe('OVER');
    expect(tenderProblem(10000, [{ mode: 'CASH', amountPaise: 10000 }, { mode: 'UPI', amountPaise: 0 }])).toBe('ZERO_PART');
    expect(tenderProblem(10000, Array.from({ length: 6 }, () => ({ mode: 'CASH' as const, amountPaise: 1 })))).toBe('TOO_MANY');
    expect(tenderProblem(10000, [{ mode: 'CASH', amountPaise: 4000 }, { mode: 'STORE_CREDIT', amountPaise: 6000 }], 5000)).toBe('CREDIT_SHORT');
    const parts = addTenderPart(10000, [{ mode: 'UPI', amountPaise: 2000 }], 'CASH');
    expect(parts).toEqual([{ mode: 'UPI', amountPaise: 2000 }, { mode: 'CASH', amountPaise: 8000 }]);
    expect(tenderRemaining(10000, parts)).toBe(0);
    expect(addTenderPart(10000, [], 'STORE_CREDIT', 3000)).toEqual([{ mode: 'STORE_CREDIT', amountPaise: 3000 }]);
  });
});

describe('wallet (C4)', () => {
  it('adjust: signed, reason required, credit in rupees and points whole', () => {
    expect(adjustBody({ bucket: 'CREDIT', direction: 'ADD', amount: '50', reason: 'Goodwill' }))
      .toEqual({ ok: true, body: { bucket: 'CREDIT', amount: 5000, reason: 'Goodwill' } });
    expect(adjustBody({ bucket: 'POINTS', direction: 'REMOVE', amount: '12', reason: 'Wrong entry' }))
      .toEqual({ ok: true, body: { bucket: 'POINTS', amount: -12, reason: 'Wrong entry' } });
    expect(adjustBody({ bucket: 'POINTS', direction: 'ADD', amount: '1.5', reason: 'abc' })).toEqual({ ok: false, field: 'amount' });
    expect(adjustBody({ bucket: 'CREDIT', direction: 'ADD', amount: '5', reason: 'ab' })).toEqual({ ok: false, field: 'reason' });
  });

  it('top-up amounts: ₹1 to ₹10,00,000', () => {
    expect(topUpAmount('0.50')).toBeNull();
    expect(topUpAmount('1')).toBe(100);
    expect(topUpAmount('1000000')).toBe(100000000);
    expect(topUpAmount('1000001')).toBeNull();
  });

  it('statement words: a top-up reads by kind, the rest by type', () => {
    expect(statementLabelKey({ type: 'CREDIT_ADJUST', kind: 'TOPUP' })).toBe('commerce.wallet.kind.TOPUP');
    expect(statementLabelKey({ type: 'POINTS_EXPIRE' })).toBe('commerce.wallet.type.POINTS_EXPIRE');
  });
});

describe('growth (C5)', () => {
  it('segments drop empty keys; the window rides only with tiers', () => {
    expect(cleanSegment({ tags: [], spendTiers: [], spendWindowDays: 90, hasOrdered: false })).toEqual({ hasOrdered: false });
    expect(cleanSegment({ spendTiers: ['VIP'], spendWindowDays: 90 })).toEqual({ spendTiers: ['VIP'], spendWindowDays: 90 });
    expect(segmentKey({ tags: [] })).toBe(segmentKey({}));
  });

  it('schedule: future and ≤ 30 days; weekly allowance never negative', () => {
    const now = new Date('2026-10-02T10:00:00Z');
    expect(scheduleProblem(null, now)).toBe('NONE');
    expect(scheduleProblem(new Date('2026-10-02T09:00:00Z'), now)).toBe('PAST');
    expect(scheduleProblem(new Date('2026-11-05T10:00:00Z'), now)).toBe('TOO_FAR');
    expect(scheduleProblem(new Date('2026-10-03T10:00:00Z'), now)).toBe('NONE');
    expect(weeklyLeft({ used: 3, max: 2 })).toBe(0);
    expect(weeklyLeft({ used: 1, max: 2 })).toBe(1);
  });

  it('the phone heatmap folds 24 hours into six bands and finds the busiest hour', () => {
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ orders: 0, salesPaise: 0 })));
    grid[6][18].orders = 5; // Saturday 6 pm
    grid[6][19].orders = 2;
    grid[1][9].orders = 1;
    const out = heatBands(grid);
    expect(out.cells[6][4]).toBe(7); // 16–20 band
    expect(out.cells[1][2]).toBe(1);
    expect(out.max).toBe(7);
    expect(out.busiest).toEqual({ weekday: 6, hour: 18, orders: 5 });
    expect(heatLevel(0, 7)).toBe(0);
    expect(heatLevel(7, 7)).toBe(4);
    expect(heatBands(undefined).busiest).toBeNull();
    expect(lastDays(7, new Date(2026, 9, 2))).toEqual({ from: '2026-09-26', to: '2026-10-02' });
  });
});

describe('catalogue (C3 bundles, C6 variants)', () => {
  it('bundle and variant shape checks', () => {
    expect(bundleProblem([])).toBe('EMPTY');
    expect(bundleProblem([{ productId: 'a', qty: 1 }, { productId: 'a', qty: 2 }])).toBe('DUPLICATE');
    expect(bundleProblem([{ productId: 'self', qty: 1 }], 'self')).toBe('SELF');
    expect(bundleProblem([{ productId: 'a', qty: 0 }])).toBe('QTY');
    expect(bundleProblem([{ productId: 'a', qty: 2 }])).toBe('NONE');
    expect(variantAttrsProblem([{ name: 'SIZE', value: ' ' }])).toBe('EMPTY');
    expect(variantAttrsProblem([{ name: 'SIZE', value: 'S' }, { name: 'SIZE', value: 'M' }])).toBe('DUPLICATE');
    expect(variantLabelOf([{ value: '500 g' }, { value: 'Red' }])).toBe('500 g / Red');
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a'], 0, 3)).toEqual(['a']);
  });
});

describe('access (gate 3 + features) and More rows', () => {
  const base = { ready: true, can: () => true, hasModule: () => true };
  it('the proprietor sees every door once a feature is on; nothing but the settings door before', () => {
    const none = commerceAccessOf({ ...base, isAdmin: true, permissions: {}, features: [] });
    expect(commerceDoors(none).map((d) => d.key)).toEqual(['SETTINGS']);
    const all = commerceAccessOf({ ...base, isAdmin: true, permissions: {}, features: ['OFFERS', 'WALLET', 'BROADCAST', 'DELIVERY_STAFF', 'NOT_A_FEATURE'] });
    expect([...all.features]).not.toContain('NOT_A_FEATURE');
    expect(commerceDoors(all).map((d) => d.key)).toEqual(['DELIVERIES', 'OFFERS', 'WALLET', 'BROADCAST', 'INSIGHTS', 'SETTINGS']);
  });

  it('a staff role reads the derived commerce rows; absent = NONE', () => {
    const staff = commerceAccessOf({
      ...base, isAdmin: false, permissions: { OFFERS_VIEW: 'READ', WALLET_VIEW: 'READ', ORDER_DELIVERIES: 'FULL' },
      features: ['OFFERS', 'LOYALTY', 'DELIVERY_STAFF'],
    });
    expect(staff.offers).toEqual({ canView: true, canManage: false });
    expect(staff.wallet.canView).toBe(true);
    expect(staff.wallet.canManage).toBe(false);
    // No STOREFRONT_MANAGE / OFFERS_MANAGE / WALLET_MANAGE rows: those sections are read-only…
    expect(staff.settings.section).toMatchObject({ storefront: false, offers: false, wallet: false, growthBroadcast: false });
    // …while counter / catalogue follow the plain INVOICING_MANAGE / CATALOG_MANAGE this role holds.
    expect(staff.settings.section).toMatchObject({ counter: true, catalog: true });
    expect(staff.deliveries.canDeliver).toBe(true);
    expect(commerceAllows({ isAdmin: false, permissions: {} }, 'BROADCAST_SEND', 'FULL')).toBe(false);
    expect(isCommerceFeature('SPLIT_TENDER')).toBe(true);
    expect(isCommerceFeature('PROMOTION')).toBe(false);
  });

  it('settings sections follow the shop\'s modules (SECTION_MODULES): a counter-only shop still opens its sections', () => {
    const counterOnly = commerceAccessOf({ ...base, hasModule: (m) => m === 'INVOICING', isAdmin: true, permissions: {}, features: [] });
    expect(counterOnly.settings.canView).toBe(true);
    expect(counterOnly.settings.visible).toEqual({ online: false, offers: false, wallet: true, growth: false, counter: true, catalog: false });
    expect(counterOnly.settings.section).toMatchObject({ storefront: false, counter: true, wallet: true, offers: false });
    expect(commerceDoors(counterOnly).map((d) => d.key)).toEqual(['SETTINGS']);
    const catalogOnly = commerceAccessOf({ ...base, hasModule: (m) => m === 'CATALOG', isAdmin: true, permissions: {}, features: [] });
    expect(catalogOnly.settings.visible).toMatchObject({ offers: true, catalog: true, counter: false, online: false });
  });

  it('nothing before the entitlement answer (fails closed)', () => {
    expect(commerceDoors(commerceAccessOf({ ...base, ready: false, isAdmin: true, permissions: {}, features: ['OFFERS'] }))).toEqual([]);
  });
});

describe('fulfilment (C2)', () => {
  const lines = [
    { productId: 'p1', name: 'Rice', qty: 2 },
    { productId: 'p2', name: 'Dal', qty: 1 },
    { productId: 'p1', name: 'Rice', qty: 1 },
  ];
  it('the same product on two lines changes together (B-1)', () => {
    expect(partialProducts(lines)).toEqual([{ productId: 'p1', name: 'Rice', qty: 3 }, { productId: 'p2', name: 'Dal', qty: 1 }]);
  });
  it('only lower, ≥1 survives, every change has a reason', () => {
    expect(partialChanges(lines, {}, {})).toEqual({ ok: false, problem: 'NOTHING_CHANGED' });
    expect(partialChanges(lines, { p1: 4 }, { p1: 'OTHER' })).toEqual({ ok: false, problem: 'RAISED' });
    expect(partialChanges(lines, { p1: 1 }, {})).toEqual({ ok: false, problem: 'NEEDS_REASON' });
    expect(partialChanges(lines, { p1: 0, p2: 0 }, { p1: 'OUT_OF_STOCK', p2: 'DAMAGED' })).toEqual({ ok: false, problem: 'ALL_REMOVED' });
    expect(partialChanges(lines, { p1: 1 }, { p1: 'OTHER' }, { p1: ' torn bag ' }))
      .toEqual({ ok: true, changes: [{ productId: 'p1', toQty: 1, reason: 'OTHER', note: 'torn bag' }] });
  });
  it('proof only for a delivery out for delivery; OTP pad and attempts', () => {
    expect(needsProof('OTP', { deliveryMode: 'DELIVERY', status: 'OUT_FOR_DELIVERY' })).toBe(true);
    expect(needsProof('OTP', { deliveryMode: 'PICKUP', status: 'OUT_FOR_DELIVERY' })).toBe(false);
    expect(needsProof('NONE', { deliveryMode: 'DELIVERY', status: 'OUT_FOR_DELIVERY' })).toBe(false);
    expect(otpDigits('12a345')).toBe('1234');
    expect(attemptsLeftOf({ attemptsLeft: '3' })).toBe(3);
    expect(attemptsLeftOf(undefined)).toBeUndefined();
    expect(assignable({ deliveryMode: 'DELIVERY', status: 'PACKED' })).toBe(true);
    expect(assignable({ deliveryMode: 'PICKUP', status: 'PACKED' })).toBe(false);
  });
});

describe('notifications: the four new kinds and the commerce links', () => {
  it('route by kind', () => {
    expect(notificationDestination({ kind: 'PARTNER_OFFER' })?.href).toBe('/commerce/broadcasts');
    expect(notificationDestination({ kind: 'WALLET' })?.href).toBe('/commerce/wallet');
    expect(notificationDestination({ kind: 'BACK_IN_STOCK' })?.href).toBe('/commerce/insights');
    expect(notificationDestination({ kind: 'DELIVERY_ASSIGNED' })?.href).toBe('/commerce/deliveries');
    // C2's auto-cancel tells the shop with the orders link — unchanged route.
    expect(notificationDestination({ kind: 'PARTNER_ORDER_CANCELLED', link: '/dashboard/partner/orders?id=o1' })?.href)
      .toBe('/(app)/(tabs)/orders?id=o1');
  });
  it('route by the web partner pages\' links', () => {
    expect(notificationDestination({ link: '/dashboard/partner/my-deliveries?id=o1', kind: 'DELIVERY_ASSIGNED' })?.href).toBe('/commerce/deliveries');
    expect(notificationDestination({ link: '/dashboard/partner/offers/abc123' })?.href).toBe('/commerce/offers/abc123');
    expect(notificationDestination({ link: '/dashboard/partner/wallet/p9' })?.href).toBe('/commerce/wallet/p9');
    expect(notificationDestination({ link: '/dashboard/partner/broadcasts' })?.href).toBe('/commerce/broadcasts');
  });
});
