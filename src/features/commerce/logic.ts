/**
 * Commerce C3–C6 — the PURE rules the shop app's screens share. No React, no
 * axios: every function here is checked by `commerce-logic.test.ts`.
 *
 * The server stays the judge of every rule (offer shape, limits, tender sum,
 * points caps); these mirror the server's checks only so a mistake is said ON
 * the field, before a round trip.
 */
import { parseRupeesToPaise, paiseToInput } from '../../lib/money';
import type {
  BroadcastSegment, HeatCell, HoldLine, OfferChannel, OfferInput, OfferKind, OfferScopeType, OfferBenefitType,
  OfferStatus, OfferView, ResumedLine, TenderPart, VariantAttribute, WeeklyAllowance,
} from './types';
import { COUPON_CODE_PATTERN, MAX_SCHEDULE_AHEAD_DAYS, MAX_TENDER_PARTS } from './types';
// >>> GAP-C-SHOP
import type { LabelCounts } from './types';
// <<< GAP-C-SHOP

type T = (key: string, options?: Record<string, unknown>) => string;
const DAY_MS = 86_400_000;

// ═══════════════════════════════════════════════════════════════ small helpers

/** `"12.5"` → 1250 basis points; null when not a percentage in (0, 100]. */
export function percentToBp(input: string): number | null {
  const s = input.replace(/[%\s]/g, '');
  if (!s || !/^\d*\.?\d*$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > 100) return null;
  return Math.round(n * 100);
}

/** 1250 → `"12.5"`, 1000 → `"10"`. */
export function bpToPercentText(bp: number | undefined): string {
  if (!bp) return '';
  const n = bp / 100;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

const wholeOrNull = (s: string, min: number, max: number): number | null => {
  if (!s.trim()) return null;
  if (!/^-?\d+$/.test(s.trim())) return NaN;
  const n = Number(s.trim());
  return n < min || n > max ? NaN : n;
};

/** A local `YYYY-MM-DD` for a Date. */
export function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local midnight of a `YYYY-MM-DD` as an ISO instant. */
export const dayStartIso = (day: string): string => new Date(`${day}T00:00:00`).toISOString();
/** The END of a `YYYY-MM-DD` (next local midnight) as an ISO instant — "ends on the 10th" includes the 10th. */
export const dayEndIso = (day: string): string => new Date(new Date(`${day}T00:00:00`).getTime() + DAY_MS).toISOString();
/** An end instant back to the last day it includes. */
export const dayOfEnd = (iso: string): string => localDay(new Date(new Date(iso).getTime() - 1));

// ═══════════════════════════════════════════════════════════════ offers (C3)

/** The offer editor's state — strings while typing, converted once on save. */
export interface OfferForm {
  name: string;
  description: string;
  kind: OfferKind;
  code: string;
  benefitType: OfferBenefitType;
  /** Rupees — FLAT. */
  amount: string;
  /** Percent — PERCENT (and the share off the free units for BUY_X_GET_Y; blank = free). */
  percent: string;
  /** Rupees cap — PERCENT. */
  maxDiscount: string;
  buyQty: string;
  getQty: string;
  getProductId: string;
  scopeType: OfferScopeType;
  productIds: string[];
  categoryIds: string[];
  excludeProductIds: string[];
  minOrder: string;
  firstOrderOnly: boolean;
  /** `YYYY-MM-DD` or ''. */
  startsOn: string;
  endsOn: string;
  daysOfWeek: number[];
  timeWindows: Array<{ from: string; to: string }>;
  tags: string;
  channels: OfferChannel[];
  perCustomer: string;
  total: string;
  stackable: boolean;
  priority: string;
}

export function emptyOfferForm(kind: OfferKind = 'AUTO'): OfferForm {
  return {
    name: '', description: '', kind, code: '',
    benefitType: 'PERCENT', amount: '', percent: '', maxDiscount: '', buyQty: '', getQty: '', getProductId: '',
    scopeType: 'ORDER', productIds: [], categoryIds: [], excludeProductIds: [],
    minOrder: '', firstOrderOnly: false, startsOn: '', endsOn: '', daysOfWeek: [], timeWindows: [], tags: '',
    channels: ['ONLINE', 'COUNTER'], perCustomer: '', total: '', stackable: false, priority: '0',
  };
}

export function offerToForm(o: OfferView): OfferForm {
  const b = o.benefit;
  const c = o.conditions ?? {};
  return {
    name: o.name,
    description: o.description ?? '',
    kind: o.kind,
    code: o.code ?? '',
    benefitType: b.type,
    amount: b.type === 'FLAT' ? paiseToInput(b.valuePaise) : '',
    // A stored BxGy share (even 100%) comes back as typed, so an edit re-sends exactly what is stored —
    // a used offer's benefit must compare equal or the server refuses OFFER_LOCKED_AFTER_USE (C-5).
    percent: b.type === 'PERCENT' || (b.type === 'BUY_X_GET_Y' && b.percentBp) ? bpToPercentText(b.percentBp) : '',
    maxDiscount: b.maxDiscountPaise ? paiseToInput(b.maxDiscountPaise) : '',
    buyQty: b.buyQty ? String(b.buyQty) : '',
    getQty: b.getQty ? String(b.getQty) : '',
    getProductId: b.getProductId ? String(b.getProductId) : '',
    scopeType: o.scope.type,
    productIds: (o.scope.productIds ?? []).map(String),
    categoryIds: (o.scope.categoryIds ?? []).map(String),
    excludeProductIds: (o.scope.excludeProductIds ?? []).map(String),
    minOrder: c.minOrderPaise ? paiseToInput(c.minOrderPaise) : '',
    firstOrderOnly: !!c.firstOrderOnly,
    startsOn: c.startsAt ? localDay(new Date(c.startsAt)) : '',
    endsOn: c.endsAt ? dayOfEnd(c.endsAt) : '',
    daysOfWeek: [...(c.daysOfWeek ?? [])].sort(),
    timeWindows: (c.timeWindows ?? []).map((w) => ({ ...w })),
    tags: (c.partyTags ?? []).join(', '),
    channels: [...(o.channels ?? [])],
    perCustomer: o.limits?.perCustomer ? String(o.limits.perCustomer) : '',
    total: o.limits?.total ? String(o.limits.total) : '',
    stackable: !!o.stacking?.stackable,
    priority: String(o.stacking?.priority ?? 0),
  };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Field → catalogue key of the sentence to show under it. */
export type OfferFormErrors = Partial<Record<keyof OfferForm, string>>;

/**
 * The form → `offerCreateSchema` body, or the field errors. Mirrors
 * `offerShapeProblem` (model) so the partner reads the reason on the field.
 */
export function offerFormToInput(f: OfferForm): { ok: true; body: OfferInput } | { ok: false; errors: OfferFormErrors } {
  const e: OfferFormErrors = {};
  const name = f.name.trim();
  if (!name) e.name = 'commerce.offers.err.name';
  else if (name.length > 60) e.name = 'commerce.offers.err.nameLong';
  const code = f.code.trim().toUpperCase();
  if (f.kind === 'COUPON' && !COUPON_CODE_PATTERN.test(code)) e.code = 'commerce.offers.err.code';

  const benefit: OfferInput['benefit'] = { type: f.benefitType };
  if (f.benefitType === 'FLAT') {
    const v = parseRupeesToPaise(f.amount);
    if (!v || v <= 0) e.amount = 'commerce.offers.err.amount';
    else benefit.valuePaise = v;
  }
  if (f.benefitType === 'PERCENT') {
    const bp = percentToBp(f.percent);
    if (!bp) e.percent = 'commerce.offers.err.percent';
    else benefit.percentBp = bp;
    if (f.maxDiscount.trim()) {
      const cap = parseRupeesToPaise(f.maxDiscount);
      if (!cap || cap <= 0) e.maxDiscount = 'commerce.offers.err.amount';
      else benefit.maxDiscountPaise = cap;
    }
  }
  if (f.benefitType === 'BUY_X_GET_Y') {
    const buy = wholeOrNull(f.buyQty, 1, 1000);
    const get = wholeOrNull(f.getQty, 1, 1000);
    if (!buy || Number.isNaN(buy)) e.buyQty = 'commerce.offers.err.qty';
    else benefit.buyQty = buy;
    if (!get || Number.isNaN(get)) e.getQty = 'commerce.offers.err.qty';
    else benefit.getQty = get;
    if (f.percent.trim()) {
      const bp = percentToBp(f.percent);
      if (!bp) e.percent = 'commerce.offers.err.percent';
      else benefit.percentBp = bp;
    }
    if (f.getProductId) benefit.getProductId = f.getProductId;
    if (f.scopeType === 'ORDER') e.scopeType = 'commerce.offers.err.bxgyScope';
  }

  if (f.scopeType === 'PRODUCTS' && !f.productIds.length) e.productIds = 'commerce.offers.err.products';
  if (f.scopeType === 'CATEGORIES' && !f.categoryIds.length) e.categoryIds = 'commerce.offers.err.categories';
  if (f.productIds.length > 200 || f.excludeProductIds.length > 200) e.productIds = 'commerce.offers.err.tooMany';

  const conditions: OfferInput['conditions'] = {};
  if (f.minOrder.trim()) {
    const m = parseRupeesToPaise(f.minOrder);
    if (m === null) e.minOrder = 'commerce.offers.err.amount';
    else if (m > 0) conditions.minOrderPaise = m;
  }
  if (f.firstOrderOnly) conditions.firstOrderOnly = true;
  if (f.startsOn) conditions.startsAt = dayStartIso(f.startsOn);
  if (f.endsOn) conditions.endsAt = dayEndIso(f.endsOn);
  if (f.startsOn && f.endsOn && f.endsOn < f.startsOn) e.endsOn = 'commerce.offers.err.dates';
  if (f.daysOfWeek.length && f.daysOfWeek.length < 7) conditions.daysOfWeek = [...new Set(f.daysOfWeek)].sort();
  if (f.timeWindows.length) {
    if (f.timeWindows.length > 4 || f.timeWindows.some((w) => !HHMM.test(w.from) || !HHMM.test(w.to) || w.from >= w.to)) {
      e.timeWindows = 'commerce.offers.err.hours';
    } else conditions.timeWindows = f.timeWindows.map((w) => ({ from: w.from, to: w.to }));
  }
  const tags = [...new Set(f.tags.split(',').map((s) => s.trim()).filter(Boolean))];
  if (tags.length > 10 || tags.some((s) => s.length > 30)) e.tags = 'commerce.offers.err.tags';
  else if (tags.length) conditions.partyTags = tags;

  if (!f.channels.length) e.channels = 'commerce.offers.err.channels';

  const limits: OfferInput['limits'] = {};
  const per = wholeOrNull(f.perCustomer, 1, 1000);
  if (Number.isNaN(per)) e.perCustomer = 'commerce.offers.err.qty';
  else if (per) limits.perCustomer = per;
  const total = wholeOrNull(f.total, 1, 10_000_000);
  if (Number.isNaN(total)) e.total = 'commerce.offers.err.qty';
  else if (total) limits.total = total;

  const priority = wholeOrNull(f.priority || '0', -1000, 1000);
  if (priority === null || Number.isNaN(priority)) e.priority = 'commerce.offers.err.priority';

  if (Object.keys(e).length) return { ok: false, errors: e };
  const scope: OfferInput['scope'] = { type: f.scopeType };
  if (f.scopeType === 'PRODUCTS') scope.productIds = [...f.productIds];
  if (f.scopeType === 'CATEGORIES') scope.categoryIds = [...f.categoryIds];
  if (f.scopeType !== 'PRODUCTS' && f.excludeProductIds.length) scope.excludeProductIds = [...f.excludeProductIds];
  return {
    ok: true,
    body: {
      name,
      ...(f.description.trim() ? { description: f.description.trim().slice(0, 300) } : {}),
      kind: f.kind,
      ...(f.kind === 'COUPON' ? { code } : {}),
      benefit,
      conditions,
      scope,
      channels: [...new Set(f.channels)],
      limits,
      stacking: { stackable: f.stackable, priority: priority as number },
    },
  };
}

/** The offer in one short phrase: "₹50 off", "10% off, up to ₹100", "Buy 2, get 1 free", "Free delivery". */
export function offerBenefitText(b: OfferView['benefit'], t: T, money: (p: number) => string): string {
  switch (b.type) {
    case 'FLAT':
      return t('commerce.offers.benefit.flat', { amount: money(b.valuePaise ?? 0) });
    case 'PERCENT':
      return b.maxDiscountPaise
        ? t('commerce.offers.benefit.percentCapped', { percent: bpToPercentText(b.percentBp), cap: money(b.maxDiscountPaise) })
        : t('commerce.offers.benefit.percent', { percent: bpToPercentText(b.percentBp) });
    case 'BUY_X_GET_Y':
      return b.percentBp && b.percentBp !== 10_000
        ? t('commerce.offers.benefit.bxgyPercent', { buy: b.buyQty ?? 0, get: b.getQty ?? 0, percent: bpToPercentText(b.percentBp) })
        : t('commerce.offers.benefit.bxgy', { buy: b.buyQty ?? 0, get: b.getQty ?? 0 });
    case 'FREE_DELIVERY':
      return t('commerce.offers.benefit.freeDelivery');
    default:
      return '';
  }
}

export type OfferState = 'RUNNING' | 'NOT_STARTED' | 'EXPIRED' | 'USED_UP' | 'PAUSED' | 'ENDED';

/** Where the offer stands now — the chip on its row. */
export function offerState(o: Pick<OfferView, 'status' | 'live' | 'conditions' | 'limits' | 'stats'>, now = new Date()): OfferState {
  if (o.status === 'ARCHIVED') return 'ENDED';
  if (o.status === 'PAUSED') return 'PAUSED';
  if (o.live) return 'RUNNING';
  const c = o.conditions ?? {};
  if (c.startsAt && new Date(c.startsAt) > now) return 'NOT_STARTED';
  if (c.endsAt && new Date(c.endsAt) <= now) return 'EXPIRED';
  if (o.limits?.total && (o.stats?.usedCount ?? 0) >= o.limits.total) return 'USED_UP';
  return 'RUNNING';
}

/** What the partner may do from here (C-5: ARCHIVED is terminal). */
export function offerActions(status: OfferStatus): { pause: boolean; resume: boolean; end: boolean; edit: boolean } {
  return {
    pause: status === 'ACTIVE',
    resume: status === 'PAUSED',
    end: status !== 'ARCHIVED',
    edit: status !== 'ARCHIVED',
  };
}

/** The text a shop shares to hand a coupon out (C-8: coupons are given by the shop). */
export function couponShareText(o: Pick<OfferView, 'code' | 'name' | 'benefit' | 'conditions'>, shop: string, t: T, money: (p: number) => string): string {
  const parts = [
    t('commerce.offers.share.line1', { shop, benefit: offerBenefitText(o.benefit, t, money) }),
    t('commerce.offers.share.code', { code: o.code ?? '' }),
  ];
  if (o.conditions?.minOrderPaise) parts.push(t('commerce.offers.share.min', { amount: money(o.conditions.minOrderPaise) }));
  if (o.conditions?.endsAt) parts.push(t('commerce.offers.share.until', { date: dayOfEnd(o.conditions.endsAt) }));
  return parts.join('\n');
}

// ═══════════════════════════════════════════════════════════════ counter (C3 offers, C6)

/**
 * NEVER DOUBLE COUNT (C3/C6 hand-off): a counter draft's line `discountPaise`
 * already INCLUDES the offers' share (`offerRequest.lineOfferPaise`) and, on a
 * bill that redeemed points, the points' share (`loyaltyRequest.lineRedeemPaise`).
 * The server treats a discount it is SENT as the cashier's manual one, so any
 * line taken from a server document must have both parts taken out before it
 * is sent back — or the offer is given twice.
 *
 * A split whose length does not match the lines is ignored (the server's
 * `manualLinesOf` does the same).
 */
export function manualDiscountLines<L extends { discountPaise?: number }>(
  lines: L[],
  offerRequest?: { lineOfferPaise?: number[] } | null,
  loyaltyRequest?: { lineRedeemPaise?: number[] } | null,
): L[] {
  const off = offerRequest?.lineOfferPaise;
  const pts = loyaltyRequest?.lineRedeemPaise;
  const useOff = !!off && off.length === lines.length;
  const usePts = !!pts && pts.length === lines.length;
  return lines.map((l, i) => {
    const d = (l.discountPaise ?? 0) - (useOff ? off![i] ?? 0 : 0) - (usePts ? pts![i] ?? 0 : 0);
    return { ...l, discountPaise: Math.max(0, Math.round(d)) };
  });
}

/** An editable till line, as far as a hold cares. */
export interface TillLine {
  itemId?: string;
  itemName: string;
  qty: number;
  unit?: string;
  ratePaise: number;
  discountPaise?: number;
  catalogRatePaise?: number;
}

/**
 * Local lines → `counterHoldCreateSchema` lines. A rate is held only when the
 * cashier TYPED one (an off-catalogue line, or a changed catalogue price), so a
 * resume bills catalogue lines at today's price.
 */
export function holdLinesOf(lines: TillLine[]): HoldLine[] {
  return lines.slice(0, 200).map((l) => {
    const typed = !l.itemId || (l.catalogRatePaise !== undefined && l.catalogRatePaise !== l.ratePaise);
    return {
      ...(l.itemId ? { itemId: l.itemId } : {}),
      itemName: l.itemName.slice(0, 160),
      qty: l.qty,
      ...(l.unit ? { unit: l.unit.slice(0, 10) } : {}),
      ...(typed ? { ratePaise: Math.max(0, Math.round(l.ratePaise)) } : {}),
      ...((l.discountPaise ?? 0) > 0 ? { discountPaise: Math.round(l.discountPaise ?? 0) } : {}),
    };
  });
}

/** A label for a hold, short enough for the tray (≤ 40). */
export function defaultHoldLabel(partyName: string | undefined, now: Date, t: T): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const who = (partyName ?? '').trim();
  return (who ? `${who} · ${time}` : t('commerce.counter.holdLabelDefault', { time })).slice(0, 40);
}

/**
 * Resumed lines → what goes back on the till. A line whose product is gone,
 * off sale, or became a sizes parent cannot be billed and is DROPPED (named so
 * the cashier can say so); a short line stays, flagged.
 */
export function tillLinesFromResumed(resumed: ResumedLine[]): {
  lines: Array<ResumedLine & { catalogRatePaise?: number }>;
  dropped: string[];
  short: string[];
} {
  const lines: Array<ResumedLine & { catalogRatePaise?: number }> = [];
  const dropped: string[] = [];
  const short: string[] = [];
  for (const l of resumed) {
    if (l.issue === 'GONE' || l.issue === 'OFF_SALE' || l.issue === 'PARENT') { dropped.push(l.itemName); continue; }
    if (l.issue === 'OUT_OF_STOCK') short.push(l.itemName);
    lines.push({ ...l, ...(l.catalogueRatePaise !== undefined ? { catalogRatePaise: l.catalogueRatePaise } : {}) });
  }
  return { lines, dropped, short };
}

/** Minutes until a hold expires (never below 0). */
export const holdMinutesLeft = (expiresAt: string, now = new Date()): number =>
  Math.max(0, Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 60_000));

// ── split tender (D-6)

export const tenderSum = (parts: Pick<TenderPart, 'amountPaise'>[]): number =>
  parts.reduce((s, p) => s + (Number.isFinite(p.amountPaise) ? p.amountPaise : 0), 0);

/** What is still to be collected (negative = over). */
export const tenderRemaining = (totalPaise: number, parts: Pick<TenderPart, 'amountPaise'>[]): number => totalPaise - tenderSum(parts);

export type TenderProblem = 'NONE' | 'EMPTY' | 'ZERO_PART' | 'TOO_MANY' | 'SHORT' | 'OVER' | 'CREDIT_SHORT';

/** The checkout's check before the server's SPLIT_TENDER_MISMATCH. */
export function tenderProblem(totalPaise: number, parts: TenderPart[], creditBalancePaise?: number): TenderProblem {
  if (!parts.length) return 'EMPTY';
  if (parts.length > MAX_TENDER_PARTS) return 'TOO_MANY';
  const left = tenderRemaining(totalPaise, parts);
  // Over first: when the balancing part goes to zero or below it is because the others are too big.
  if (left < 0) return 'OVER';
  if (parts.some((p) => !(p.amountPaise > 0))) return 'ZERO_PART';
  if (left > 0) return 'SHORT';
  if (creditBalancePaise !== undefined) {
    const credit = tenderSum(parts.filter((p) => p.mode === 'STORE_CREDIT'));
    if (credit > creditBalancePaise) return 'CREDIT_SHORT';
  }
  return 'NONE';
}

/**
 * Add a part for whatever is left (or, with nothing left, a ₹0 part the cashier
 * types into). The new part takes the remainder, so two taps settle "₹200 UPI,
 * rest cash".
 */
export function addTenderPart(totalPaise: number, parts: TenderPart[], mode: TenderPart['mode'], maxPaise?: number): TenderPart[] {
  if (parts.length >= MAX_TENDER_PARTS) return parts;
  const left = Math.max(0, tenderRemaining(totalPaise, parts));
  const amount = maxPaise !== undefined ? Math.min(left, Math.max(0, maxPaise)) : left;
  return [...parts, { mode, amountPaise: amount }];
}

/** The first part follows the total until the cashier splits (one part = the whole bill). */
export const singleTender = (totalPaise: number, mode: TenderPart['mode'] = 'CASH'): TenderPart[] => [{ mode, amountPaise: totalPaise }];

// ═══════════════════════════════════════════════════════════════ wallet (C4)

/** Adjust dialog → `walletAdjustSchema` body. Credit is typed in rupees, points whole. */
export function adjustBody(input: { bucket: 'CREDIT' | 'POINTS'; direction: 'ADD' | 'REMOVE'; amount: string; reason: string }):
  { ok: true; body: { bucket: 'CREDIT' | 'POINTS'; amount: number; reason: string } } | { ok: false; field: 'amount' | 'reason' } {
  const magnitude = input.bucket === 'CREDIT'
    ? parseRupeesToPaise(input.amount)
    : (/^\d+$/.test(input.amount.trim()) ? Number(input.amount.trim()) : null);
  if (!magnitude || magnitude <= 0 || magnitude > 10_000_000_00) return { ok: false, field: 'amount' };
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 300) return { ok: false, field: 'reason' };
  return { ok: true, body: { bucket: input.bucket, amount: input.direction === 'ADD' ? magnitude : -magnitude, reason } };
}

/** `walletTopUpSchema.amountPaise`: ₹1 to ₹10,00,000. */
export function topUpAmount(input: string): number | null {
  const p = parseRupeesToPaise(input);
  if (p === null || p < 100 || p > 10_00_000_00) return null;
  return p;
}

/** The statement row's words — a top-up / pay-back reads by `kind`, everything else by `type`. */
export const statementLabelKey = (row: { type: string; kind?: string }): string =>
  row.kind ? `commerce.wallet.kind.${row.kind}` : `commerce.wallet.type.${row.type}`;

// ═══════════════════════════════════════════════════════════════ growth (C5)

/** Drop empty keys so the server sees only what the shop chose (and the query key is stable). */
export function cleanSegment(s: BroadcastSegment): BroadcastSegment {
  const out: BroadcastSegment = {};
  if (s.tags?.length) out.tags = [...s.tags];
  if (s.societyIds?.length) out.societyIds = [...s.societyIds];
  if (s.blockNames?.length) out.blockNames = [...s.blockNames];
  if (s.spendTiers?.length) out.spendTiers = [...s.spendTiers];
  if (s.spendTiers?.length && s.spendWindowDays) out.spendWindowDays = s.spendWindowDays;
  if (s.lastOrderOlderThanDays) out.lastOrderOlderThanDays = s.lastOrderOlderThanDays;
  if (typeof s.hasOrdered === 'boolean') out.hasOrdered = s.hasOrdered;
  return out;
}

export const segmentKey = (s: BroadcastSegment): string => JSON.stringify(cleanSegment(s));

/** A schedule time must be in the future and at most 30 days ahead (server: COMMERCE_FIELD_INVALID scheduledAt). */
export function scheduleProblem(at: Date | null, now = new Date()): 'NONE' | 'PAST' | 'TOO_FAR' {
  if (!at) return 'NONE';
  if (at.getTime() <= now.getTime() + 60_000) return 'PAST';
  if (at.getTime() - now.getTime() > MAX_SCHEDULE_AHEAD_DAYS * DAY_MS) return 'TOO_FAR';
  return 'NONE';
}

/** Sends left this week (never negative). */
export const weeklyLeft = (w: WeeklyAllowance | undefined): number => (w ? Math.max(0, w.max - w.used) : 0);

// ═══════════════════════════════════════════════════════════════ insights (C5)

/** The last `days` days ending today, as the API's inclusive `from`/`to` days. */
export function lastDays(days: number, now = new Date()): { from: string; to: string } {
  const to = localDay(now);
  const from = localDay(new Date(now.getTime() - (days - 1) * DAY_MS));
  return { from, to };
}

/** Six four-hour bands — the phone's heatmap (the full 24 columns do not fit at 320dp). */
export const HEAT_BANDS = [[0, 4], [4, 8], [8, 12], [12, 16], [16, 20], [20, 24]] as const;

/**
 * 7 × 24 → 7 × 6 orders per band, the busiest band and the busiest single hour.
 * Rows are weekdays 0 = Sunday … 6 = Saturday, as the server sends them.
 */
export function heatBands(grid: HeatCell[][] | undefined): {
  cells: number[][];
  max: number;
  busiest: { weekday: number; hour: number; orders: number } | null;
} {
  const cells = Array.from({ length: 7 }, (_, d) =>
    HEAT_BANDS.map(([a, b]) => {
      let n = 0;
      for (let h = a; h < b; h += 1) n += grid?.[d]?.[h]?.orders ?? 0;
      return n;
    }));
  const max = Math.max(0, ...cells.flat());
  let busiest: { weekday: number; hour: number; orders: number } | null = null;
  for (let d = 0; d < 7; d += 1) {
    for (let h = 0; h < 24; h += 1) {
      const n = grid?.[d]?.[h]?.orders ?? 0;
      if (n > 0 && (!busiest || n > busiest.orders)) busiest = { weekday: d, hour: h, orders: n };
    }
  }
  return { cells, max, busiest };
}

/** 0–4 shade step for a cell. */
export const heatLevel = (n: number, max: number): number => (max <= 0 || n <= 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));

// ═══════════════════════════════════════════════════════════════ catalogue (C3 bundles, C6 variants)

/** "500 g / Red" — the same order the server builds `variantLabel` in. */
export const variantLabelOf = (attrs: Array<{ value: string }>): string => attrs.map((a) => a.value.trim()).filter(Boolean).join(' / ');

export function variantAttrsProblem(attrs: VariantAttribute[]): 'NONE' | 'EMPTY' | 'DUPLICATE' | 'TOO_MANY' {
  const filled = attrs.filter((a) => a.value.trim());
  if (!filled.length) return 'EMPTY';
  if (filled.length > 3) return 'TOO_MANY';
  if (new Set(filled.map((a) => a.name)).size !== filled.length) return 'DUPLICATE';
  return 'NONE';
}

/** Bundle components: 1–20, no duplicates, not the bundle itself, qty > 0 (BUNDLE_COMPONENT_INVALID). */
export function bundleProblem(components: Array<{ productId: string; qty: number }>, selfId?: string): 'NONE' | 'EMPTY' | 'DUPLICATE' | 'SELF' | 'QTY' | 'TOO_MANY' {
  if (!components.length) return 'EMPTY';
  if (components.length > 20) return 'TOO_MANY';
  if (selfId && components.some((c) => c.productId === selfId)) return 'SELF';
  if (new Set(components.map((c) => c.productId)).size !== components.length) return 'DUPLICATE';
  if (components.some((c) => !(c.qty > 0))) return 'QTY';
  return 'NONE';
}

/** Move one item in a list (quick-keys order). */
export function moveItem<X>(arr: X[], from: number, to: number): X[] {
  if (from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return arr;
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

// >>> GAP-C-SHOP
/**
 * `X-Labels-Count` / `X-Labels-Skipped` off the label PDF answer. Header names
 * arrive lower-case from axios (an AxiosHeaders object or a plain map). `null`
 * when the server did not send them (an older build): the app then says nothing
 * about counts rather than a wrong number.
 */
export function labelCountsOf(headers: unknown): LabelCounts | null {
  if (!headers || typeof headers !== 'object') return null;
  const h = headers as Record<string, unknown> & { get?: (k: string) => unknown };
  const read = (k: string): unknown => {
    const v = h[k] ?? h[k.toLowerCase()] ?? (typeof h.get === 'function' ? h.get(k) : undefined);
    return Array.isArray(v) ? v[0] : v;
  };
  const made = read('x-labels-count');
  if (made === undefined || made === null || made === '') return null;
  const labels = Number(made);
  if (!Number.isFinite(labels) || labels < 0) return null;
  const left = Number(read('x-labels-skipped'));
  return { labels: Math.floor(labels), skipped: Number.isFinite(left) && left > 0 ? Math.floor(left) : 0 };
}

/** The statement row's receipt (a top-up or a pay-back): its payment id, else nothing. */
export const statementReceiptOf = (row: { kind?: string; paymentId?: string }): string | undefined =>
  (row.kind === 'TOPUP' || row.kind === 'TOPUP_REFUND') && row.paymentId ? row.paymentId : undefined;

/**
 * The quick key as a bill line's product, straight from the key (no product fetch).
 * `null` on an older server whose keys lack the tax facts — the caller then reads
 * the product as before: a line without its rate AND its inclusive flag is a wrong bill.
 */
export function quickKeyProduct(k: {
  productId: string; name: string; unit: string; sellPaise: number;
  taxRatePercent?: number; taxInclusive?: boolean; hsnCode?: string;
}): { _id: string; name: string; unit: string; sellPaise: number; taxRatePercent: number; taxInclusive: boolean; hsnCode?: string } | null {
  if (typeof k.taxRatePercent !== 'number' || typeof k.taxInclusive !== 'boolean') return null;
  return {
    _id: k.productId, name: k.name, unit: k.unit, sellPaise: k.sellPaise,
    taxRatePercent: k.taxRatePercent, taxInclusive: k.taxInclusive,
    ...(k.hsnCode ? { hsnCode: k.hsnCode } : {}),
  };
}
// <<< GAP-C-SHOP
