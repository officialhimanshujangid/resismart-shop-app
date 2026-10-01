import { parseRupeesToPaise } from '../../lib/money';
import type { PartnerAccessModule } from '../../types/api-contract.generated';
import type { PartnerRentBill, PartnerRentList } from './types';

/**
 * Pure rules for "My shop rent". None of them decide anything the server does
 * not also decide — they only choose what to DRAW before asking.
 */

type Can = (module: PartnerAccessModule, level?: 'READ' | 'FULL') => boolean;

/**
 * The route's own guards (`partner-society-rent.routes.ts`), no module gate:
 * rent is owed whatever the shop has switched on. `can` already lets the
 * proprietor through (`allows` short-circuits on `isAdmin`).
 */
export function rentAccess(can: Can): { canView: boolean; canNote: boolean } {
  return {
    canView: can('INVOICING_VIEW', 'READ') || can('EXPENSES_VIEW', 'READ') || can('ACCOUNTS', 'READ'),
    canNote: can('INVOICING_MANAGE', 'FULL') || can('EXPENSES_MANAGE', 'FULL'),
  };
}

/** "My shop rent" exists only for a business that rents a unit from a society. */
export const hasLease = (list: PartnerRentList | undefined | null): list is PartnerRentList =>
  !!list && Array.isArray(list.leases) && list.leases.length > 0;

const OPEN = new Set(['ISSUED', 'PARTIALLY_PAID', 'OVERDUE']);
export const isOpenBill = (b: Pick<PartnerRentBill, 'status' | 'outstandingPaise'>) =>
  (b.outstandingPaise || 0) > 0 && OPEN.has(b.status);

/**
 * The Today card: "Rent ₹35,400 due 5 Oct" — what is due in all, and the
 * earliest due date among the open bills. Nothing due → no card.
 */
export interface RentDueCard {
  duePaise: number;
  overduePaise: number;
  /** Earliest due date of an open bill on the first page, when there is one. */
  dueDate?: string;
  overdue: boolean;
  /** Exactly one open bill → the card opens it; otherwise the list. */
  onlyBillId?: string;
}
export function rentDueCard(list: PartnerRentList | undefined | null): RentDueCard | null {
  if (!hasLease(list)) return null;
  const due = list.totals?.duePaise ?? 0;
  if (due <= 0) return null;
  const open = (list.bills ?? []).filter(isOpenBill);
  const earliest = open.reduce<PartnerRentBill | undefined>(
    (min, b) => (!min || new Date(b.dueDate).getTime() < new Date(min.dueDate).getTime() ? b : min),
    undefined,
  );
  const overduePaise = list.totals?.overduePaise ?? 0;
  return {
    duePaise: due,
    overduePaise,
    dueDate: earliest?.dueDate,
    overdue: overduePaise > 0,
    onlyBillId: open.length === 1 && list.total === 1 ? open[0].id : undefined,
  };
}

/** The server's period words in the reader's language ("Oct 2026" / "अक्टूबर 2026"). */
export function periodText(bill: Pick<PartnerRentBill, 'periodLabel'>, lang: string): string {
  const l = bill.periodLabel;
  if (!l) return '';
  return (lang?.startsWith('hi') ? l.hi : l.en) || l.en || l.hi || '';
}

/** Catalogue key for a bill status (unknown ones fall back to the wire word). */
export const BILL_STATUS_KEYS: Record<string, string> = {
  ISSUED: 'rent.billStatus.ISSUED',
  PARTIALLY_PAID: 'rent.billStatus.PARTIALLY_PAID',
  OVERDUE: 'rent.billStatus.OVERDUE',
  PAID: 'rent.billStatus.PAID',
};
export const LEASE_STATUS_KEYS: Record<string, string> = {
  ACTIVE: 'rent.leaseStatus.ACTIVE',
  NOTICE: 'rent.leaseStatus.NOTICE',
  ENDED: 'rent.leaseStatus.ENDED',
  TERMINATED: 'rent.leaseStatus.TERMINATED',
};

/** `YYYY-MM-DD` of a local date. */
export function dayOf(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** `2026-10-05` → a local Date (the backend's days are calendar days, not instants). */
export function dateOfDay(day: string): Date {
  const [y, m, d] = day.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * The "I have paid" sheet, checked the way `partnerRentPaidSchema` checks it:
 * amount ≥ 1 paisa, reference 3–80 characters, a day not in the future.
 * Returns catalogue keys, `null` when the form may be sent.
 */
export interface PaidFormErrors { amount?: string; reference?: string; paidOn?: string }
export function paidFormErrors(
  input: { amount: string; reference: string; paidOn: string },
  today: string,
): PaidFormErrors | null {
  const errors: PaidFormErrors = {};
  const paise = parseRupeesToPaise(input.amount);
  if (paise === null || paise < 1) errors.amount = 'rent.paid.amountInvalid';
  const ref = input.reference.trim();
  if (ref.length < 3 || ref.length > 80) errors.reference = 'rent.paid.referenceInvalid';
  if (input.paidOn && (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) || input.paidOn > today)) {
    errors.paidOn = 'rent.paid.dateInvalid';
  }
  return Object.keys(errors).length ? errors : null;
}

/** Rupees for the amount field — `3540000` → `"35400"`, `3540050` → `"35400.50"`. */
export function rupeesInput(paise: number): string {
  if (!Number.isFinite(paise) || paise <= 0) return '';
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

/** Only a bill-id-shaped `?open=` is followed (a Mongo ObjectId). */
export const isBillId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-fA-F]{24}$/.test(v);
