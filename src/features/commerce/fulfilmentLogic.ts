/**
 * Commerce C2 — the pure rules behind the shop's fulfilment sheets
 * (CONTRACT-commerce §0.4 B-1..B-5). The server (`planPartialAccept`,
 * `deliveryActionCheck`) stays the judge; these say the problem on the sheet.
 */
import type { PartialChange, PartialReason } from './fulfilmentApi';

export interface PartialLine { productId: string; name: string; qty: number }

export type PartialProblem = 'NONE' | 'NOTHING_CHANGED' | 'ALL_REMOVED' | 'RAISED' | 'NEEDS_REASON';

/**
 * The order's lines folded per PRODUCT (B-1: the same product on two lines
 * changes together — its new quantity is the product's total).
 */
export function partialProducts(lines: PartialLine[]): PartialLine[] {
  const out = new Map<string, PartialLine>();
  for (const l of lines) {
    const had = out.get(l.productId);
    if (had) had.qty = Math.round((had.qty + l.qty) * 1000) / 1000;
    else out.set(l.productId, { ...l });
  }
  return [...out.values()];
}

/**
 * The sheet's choices → `partialAcceptSchema.changes`. Only LOWER quantities
 * (0 = remove); at least one product changes; at least one survives; every
 * change carries a reason.
 */
export function partialChanges(
  lines: PartialLine[],
  toQty: Record<string, number>,
  reasons: Record<string, PartialReason | undefined>,
  notes: Record<string, string> = {},
): { ok: true; changes: PartialChange[] } | { ok: false; problem: Exclude<PartialProblem, 'NONE'> } {
  const products = partialProducts(lines);
  const changes: PartialChange[] = [];
  let kept = 0;
  for (const p of products) {
    const next = toQty[p.productId] ?? p.qty;
    if (next > p.qty + 1e-9) return { ok: false, problem: 'RAISED' };
    if (next > 0) kept += 1;
    if (Math.abs(next - p.qty) < 1e-9) continue;
    const reason = reasons[p.productId];
    if (!reason) return { ok: false, problem: 'NEEDS_REASON' };
    const note = (notes[p.productId] ?? '').trim();
    changes.push({ productId: p.productId, toQty: Math.max(0, next), reason, ...(note ? { note: note.slice(0, 200) } : {}) });
  }
  if (!changes.length) return { ok: false, problem: 'NOTHING_CHANGED' };
  if (kept === 0) return { ok: false, problem: 'ALL_REMOVED' };
  return { ok: true, changes };
}

export type ProofMode = 'NONE' | 'OTP' | 'PHOTO' | 'OTP_OR_PHOTO';

/** Does handing this order over need proof (B-5)? A pickup never does; only an order out for delivery. */
export const needsProof = (mode: ProofMode | undefined, order: { deliveryMode: string; status: string }): boolean =>
  !!mode && mode !== 'NONE' && order.deliveryMode === 'DELIVERY' && order.status === 'OUT_FOR_DELIVERY';

// >>> GAP-C-SHOP
/** The rider's "what hand-over needs" line for a mode (`delivery.proofMode`); none for NONE or no rule sent. */
export const proofNeededKey = (mode: ProofMode | undefined): string | null =>
  mode === 'OTP' || mode === 'PHOTO' || mode === 'OTP_OR_PHOTO' ? `commerce.fulfilment.proofNeeded.${mode}` : null;
// <<< GAP-C-SHOP

/** Which proof the sheet offers first. */
export const proofStart = (mode: ProofMode | undefined): 'OTP' | 'PHOTO' => (mode === 'PHOTO' ? 'PHOTO' : 'OTP');

/** What the cashier typed on the pad → at most 4 digits. */
export const otpDigits = (s: string): string => s.replace(/\D/g, '').slice(0, 4);

/** `params.attemptsLeft` of DELIVERY_OTP_WRONG as a number, when sent. */
export function attemptsLeftOf(params: Record<string, unknown> | undefined): number | undefined {
  const n = Number(params?.attemptsLeft);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Assignable for a rider (B-3 / `ASSIGNABLE`): a delivery order that is accepted, packed or on its way. */
export const assignable = (o: { deliveryMode: string; status: string }): boolean =>
  o.deliveryMode === 'DELIVERY' && ['ACCEPTED', 'PACKED', 'OUT_FOR_DELIVERY'].includes(o.status);
