/**
 * P1 access helpers (CONTRACT-partner-P1 §1.7, §2, §4.4) — pure, so the screens
 * only hide, disable or warn. The SERVER decides every one of these again
 * (`requirePartnerPermission*`, `checkRoleLimits`, `evaluateCreditLimit`).
 *
 * `entitlements.limits` is the ROLE's limits (`{}` for the proprietor, absent
 * key = unlimited). It is a different thing from `entitlements.plan.limits`,
 * which is the plan's capability ceilings.
 */
import type { PartnerDocumentType } from '../billing/types';

export interface PartnerRoleLimits {
  maxDiscountPercent?: number;
  /** Paise. */
  maxDiscountPaisePerBill?: number;
  mayEditPrice?: boolean;
  mayBackdateDays?: number;
  mayOverrideCreditLimit?: boolean;
}

/** Anything unreadable is dropped — an absent key means "no limit", as on the server. */
export function normaliseRoleLimits(raw: unknown): PartnerRoleLimits {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: PartnerRoleLimits = {};
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
  if (num(r.maxDiscountPercent) !== undefined) out.maxDiscountPercent = num(r.maxDiscountPercent);
  if (num(r.maxDiscountPaisePerBill) !== undefined) out.maxDiscountPaisePerBill = num(r.maxDiscountPaisePerBill);
  if (num(r.mayBackdateDays) !== undefined) out.mayBackdateDays = num(r.mayBackdateDays);
  if (typeof r.mayEditPrice === 'boolean') out.mayEditPrice = r.mayEditPrice;
  if (typeof r.mayOverrideCreditLimit === 'boolean') out.mayOverrideCreditLimit = r.mayOverrideCreditLimit;
  return out;
}

export interface LimitLine {
  itemId?: string;
  itemName: string;
  qty: number;
  ratePaise: number;
  discountPaise?: number;
}

export type LimitViolationCode =
  | 'DISCOUNT_ABOVE_ROLE_CAP' | 'BILL_DISCOUNT_ABOVE_ROLE_CAP' | 'PRICE_EDIT_NOT_ALLOWED' | 'BACKDATE_BEYOND_ROLE_LIMIT';

export interface LimitViolation {
  code: LimitViolationCode;
  params: Record<string, string>;
  /** Which line broke it, when a line did — so the screen can mark that row. */
  lineIndex?: number;
}

/** `YYYY-MM-DD` of a date in India time (the server compares IST calendar days). */
export function istDay(d: Date): string {
  const ist = new Date(d.getTime() + 330 * 60_000);
  return ist.toISOString().slice(0, 10);
}

/**
 * The same four rules, in the same order, as `checkRoleLimits` in
 * `backend/src/services/partner-policy-limits.ts`: backdate, price edit,
 * per-line discount (basis points on integers), per-bill discount.
 *
 * `cap` for the bill rule is sent as a RUPEE string here (the sentence adds ₹).
 */
export function checkRoleLimits(input: {
  limits: PartnerRoleLimits | undefined;
  lines: readonly LimitLine[];
  documentDay?: string;
  now?: Date;
  catalogPricePaise?: (itemId: string) => number | undefined;
}): LimitViolation | null {
  const limits = input.limits ?? {};
  const now = input.now ?? new Date();

  if (limits.mayBackdateDays !== undefined && input.documentDay) {
    const earliest = istDay(new Date(now.getTime() - limits.mayBackdateDays * 86_400_000));
    if (input.documentDay < earliest) {
      return { code: 'BACKDATE_BEYOND_ROLE_LIMIT', params: { days: String(limits.mayBackdateDays) } };
    }
  }

  if (limits.mayEditPrice === false && input.catalogPricePaise) {
    for (let i = 0; i < input.lines.length; i += 1) {
      const line = input.lines[i];
      if (!line.itemId) continue;
      const price = input.catalogPricePaise(line.itemId);
      if (price !== undefined && line.ratePaise !== price) {
        return { code: 'PRICE_EDIT_NOT_ALLOWED', params: { itemName: line.itemName }, lineIndex: i };
      }
    }
  }

  if (limits.maxDiscountPercent !== undefined) {
    for (let i = 0; i < input.lines.length; i += 1) {
      const line = input.lines[i];
      const gross = line.qty * line.ratePaise;
      const disc = line.discountPaise ?? 0;
      if (disc <= 0) continue;
      if (gross <= 0 || disc * 10_000 > Math.round(limits.maxDiscountPercent * 100) * gross) {
        return {
          code: 'DISCOUNT_ABOVE_ROLE_CAP',
          params: { capPercent: String(limits.maxDiscountPercent), itemName: line.itemName },
          lineIndex: i,
        };
      }
    }
  }

  if (limits.maxDiscountPaisePerBill !== undefined) {
    const total = input.lines.reduce((s, l) => s + (l.discountPaise ?? 0), 0);
    if (total > limits.maxDiscountPaisePerBill) {
      return {
        code: 'BILL_DISCOUNT_ABOVE_ROLE_CAP',
        params: { cap: (limits.maxDiscountPaisePerBill / 100).toFixed(2) },
      };
    }
  }
  return null;
}

/** The earliest document day a role may pick (`YYYY-MM-DD`), or undefined when unlimited. */
export function earliestAllowedDay(limits: PartnerRoleLimits | undefined, now: Date = new Date()): string | undefined {
  if (limits?.mayBackdateDays === undefined) return undefined;
  return istDay(new Date(now.getTime() - limits.mayBackdateDays * 86_400_000));
}

/** May this person bill past a customer's BLOCK credit limit? The proprietor always may. */
export function mayOverrideCredit(isAdmin: boolean, limits: PartnerRoleLimits | undefined): boolean {
  return isAdmin || limits?.mayOverrideCreditLimit === true;
}

/** Documents a PURCHASE_* permission covers (§4.4); everything else is INVOICING_*. */
const PURCHASE_TYPES: ReadonlySet<PartnerDocumentType> = new Set<PartnerDocumentType>([
  'PURCHASE_INVOICE', 'PURCHASE_ORDER', 'DEBIT_NOTE', 'GOODS_RECEIPT',
]);

export function isPurchaseType(type: PartnerDocumentType): boolean {
  return PURCHASE_TYPES.has(type);
}

type Can = (module: 'INVOICING_MANAGE' | 'PURCHASES_MANAGE' | 'INVOICING_VIEW' | 'PURCHASES_VIEW', level?: 'READ' | 'FULL') => boolean;

/** May this person change / issue a document of this type? */
export function canManageDocType(can: Can, type: PartnerDocumentType): boolean {
  return isPurchaseType(type) ? can('PURCHASES_MANAGE', 'FULL') : can('INVOICING_MANAGE', 'FULL');
}
