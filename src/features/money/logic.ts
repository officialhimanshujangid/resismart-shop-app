import { parseRupeesToPaise } from '../../lib/money';
import type { CreateExpenseBody, ExpenseMode, MoneyAccount } from './api';

/** Pure rules for the money screens — tested directly; the server re-checks. */

export interface ExpenseForm {
  day: string;
  categoryId: string;
  description: string;
  amount: string;
  gst: string;
  supplierGstin: string;
  itcEligible: boolean;
  mode: ExpenseMode;
  accountId?: string;
  reference: string;
}

export type ExpenseFormError = 'category' | 'description' | 'amount' | 'gst' | 'gstExceeds' | 'gstin';

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function buildExpenseBody(
  f: ExpenseForm,
  isoOf: (ymd: string) => string | undefined,
): { body?: CreateExpenseBody; error?: ExpenseFormError } {
  if (!f.categoryId) return { error: 'category' };
  if (!f.description.trim()) return { error: 'description' };
  const amountPaise = parseRupeesToPaise(f.amount);
  if (amountPaise === null || amountPaise <= 0) return { error: 'amount' };
  let gstPaise: number | undefined;
  if (f.gst.trim()) {
    const g = parseRupeesToPaise(f.gst);
    if (g === null) return { error: 'gst' };
    if (g > amountPaise) return { error: 'gstExceeds' };
    gstPaise = g;
  }
  const gstin = f.supplierGstin.trim().toUpperCase();
  if (gstin && !GSTIN.test(gstin)) return { error: 'gstin' };
  return {
    body: {
      expenseDate: isoOf(f.day) as string,
      categoryId: f.categoryId,
      description: f.description.trim(),
      amountPaise,
      ...(gstPaise !== undefined ? { gstPaise } : {}),
      ...(gstin ? { supplierGstin: gstin } : {}),
      itcEligible: gstPaise ? f.itcEligible : false,
      mode: f.mode,
      ...(f.accountId ? { accountId: f.accountId } : {}),
      ...(f.reference.trim() ? { reference: f.reference.trim() } : {}),
    },
  };
}

/** The account a payment mode lands in by default: CASH → the default cash drawer, anything else → the default bank. */
export function defaultAccountFor(accounts: readonly MoneyAccount[], mode: ExpenseMode): MoneyAccount | undefined {
  const kind = mode === 'CASH' ? 'CASH' : 'BANK';
  const active = accounts.filter((a) => a.isActive && a.kind === kind);
  return active.find((a) => a.isDefault) ?? active[0];
}

/** Counted minus expected: + is extra cash in the drawer, − is short. */
export function cashVariance(expectedPaise: number, countedPaise: number): number {
  return countedPaise - expectedPaise;
}

/**
 * Denominations → paise, for the "count the drawer" helper on day close.
 * Keys are rupee notes/coins, values are how many.
 */
export const DENOMINATIONS = [2000, 500, 200, 100, 50, 20, 10, 5, 2, 1] as const;
export function sumDenominations(counts: Partial<Record<number, number>>): number {
  return DENOMINATIONS.reduce((s, d) => s + d * 100 * Math.max(0, Math.floor(counts[d] ?? 0)), 0);
}
