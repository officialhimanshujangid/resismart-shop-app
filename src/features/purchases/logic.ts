import type { PoReceiptLine, UnbilledGrn } from './api';
import type { PartnerDocumentLine } from '../billing/types';

/**
 * Pure rules behind the purchase screens — tested directly
 * (`src/__tests__/partner-p1-logic.test.ts`). The server re-checks each one.
 */

/** What a receive form holds per PO line: the qty being received now, and an optional new rate. */
export interface ReceiveDraftLine {
  qty: number;
  /** Paise; absent = the PO's rate. */
  ratePaise?: number;
}

/** The most that may arrive on a line: pending plus the shop's over-receipt tolerance. */
export function maxReceivable(pending: number, overReceiptPercent = 0): number {
  const pct = Math.min(Math.max(overReceiptPercent, 0), 20);
  // Integer percent arithmetic, rounded to 3 decimals: 6 × 1.2 in floats is
  // 7.1999…, which would refuse a legal 7.2.
  return Math.round(pending * (100 + pct) * 10) / 1000;
}

/** The form's starting point: every still-pending line pre-filled with what is pending ("all arrived"). */
export function initialReceiveDraft(lines: readonly PoReceiptLine[]): Record<number, ReceiveDraftLine> {
  const out: Record<number, ReceiveDraftLine> = {};
  for (const l of lines) out[l.poLineIndex] = { qty: Math.max(l.pending, 0) };
  return out;
}

export interface ReceiveCheck {
  body: { poLineIndex: number; qty: number; ratePaise?: number }[];
  /** Lines over the tolerance — the screen names them; the server would 409 GRN_QTY_EXCEEDS_PENDING. */
  over: { poLineIndex: number; itemName: string; pending: number; qty: number }[];
}

/** Lines with qty > 0 become the request; a rate is sent only when it differs from the PO's. */
export function buildReceiveBody(
  lines: readonly PoReceiptLine[],
  draft: Record<number, ReceiveDraftLine>,
  overReceiptPercent = 0,
): ReceiveCheck {
  const body: ReceiveCheck['body'] = [];
  const over: ReceiveCheck['over'] = [];
  for (const l of lines) {
    const d = draft[l.poLineIndex];
    if (!d || !(d.qty > 0)) continue;
    if (d.qty > maxReceivable(l.pending, overReceiptPercent)) {
      over.push({ poLineIndex: l.poLineIndex, itemName: l.itemName, pending: l.pending, qty: d.qty });
    }
    const row: { poLineIndex: number; qty: number; ratePaise?: number } = { poLineIndex: l.poLineIndex, qty: d.qty };
    if (d.ratePaise !== undefined && d.ratePaise !== l.ratePaise) row.ratePaise = d.ratePaise;
    body.push(row);
  }
  return { body, over };
}

/**
 * A scanned barcode ticks the matching PO line up by one ("scan to tick
 * lines"). Returns the new draft, or `null` when no line carries that item.
 */
export function tickLineByItem(
  lines: readonly PoReceiptLine[],
  draft: Record<number, ReceiveDraftLine>,
  itemId: string,
  fromZero: boolean,
): Record<number, ReceiveDraftLine> | null {
  const line = lines.find((l) => l.itemId === itemId);
  if (!line) return null;
  const current = draft[line.poLineIndex]?.qty ?? 0;
  return { ...draft, [line.poLineIndex]: { ...draft[line.poLineIndex], qty: fromZero ? 1 : current + 1 } };
}

/** GRNs may go on one bill only when they are all from ONE supplier (409 GRN_SUPPLIER_MISMATCH). */
export function canBillTogether(selected: readonly UnbilledGrn[]): boolean {
  return new Set(selected.map((g) => g.partyId)).size <= 1;
}

/** Toggle a GRN in the selection; picking one from another supplier starts a new selection. */
export function toggleGrn(selected: readonly UnbilledGrn[], grn: UnbilledGrn): UnbilledGrn[] {
  if (selected.some((g) => g.id === grn.id)) return selected.filter((g) => g.id !== grn.id);
  if (selected.length && selected[0].partyId !== grn.partyId) return [grn];
  return [...selected, grn];
}

/** A bill line that can go back: catalogue items only (they move stock), qty > 0. */
export function returnableLines(lines: readonly PartnerDocumentLine[]): { lineIndex: number; line: PartnerDocumentLine }[] {
  return lines
    .map((line, lineIndex) => ({ lineIndex, line }))
    .filter(({ line }) => !!line.itemId && line.qty > 0);
}
