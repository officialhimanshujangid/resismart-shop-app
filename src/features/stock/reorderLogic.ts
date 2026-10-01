import type { ReorderRow } from './api';

/**
 * The reorder list's pure rules (screen S12). `suggestedQty` is the SERVER's
 * number (§6); the client only lets the partner change it, pick a supplier, and
 * groups the ticked lines the way the server will (one PO draft per supplier).
 */
export interface ReorderPick {
  qty: number;
  supplier?: { id: string; name: string };
  selected: boolean;
}

export function initialPicks(rows: readonly ReorderRow[]): Record<string, ReorderPick> {
  const out: Record<string, ReorderPick> = {};
  for (const r of rows) {
    out[r.productId] = { qty: Math.max(1, r.suggestedQty), supplier: r.preferredSupplier, selected: true };
  }
  return out;
}

export interface ReorderRequest {
  lines: { productId: string; qty: number; supplierId?: string; ratePaise?: number }[];
  /** Ticked items with no supplier at all — REORDER_NEEDS_SUPPLIER before the round trip. */
  missingSupplier: string[];
  /** How many POs this will draft — one per supplier. */
  supplierCount: number;
}

export function buildReorderRequest(rows: readonly ReorderRow[], picks: Record<string, ReorderPick>): ReorderRequest {
  const lines: ReorderRequest['lines'] = [];
  const missingSupplier: string[] = [];
  const suppliers = new Set<string>();
  for (const r of rows) {
    const p = picks[r.productId];
    if (!p?.selected || !(p.qty > 0)) continue;
    const supplierId = p.supplier?.id;
    if (!supplierId) { missingSupplier.push(r.name); continue; }
    suppliers.add(supplierId);
    // Always named: the PO is drafted for exactly the supplier shown on the row.
    const line: ReorderRequest['lines'][number] = { productId: r.productId, qty: p.qty, supplierId };
    // The last rate paid rides along only when it was paid to this same supplier.
    if (r.lastPurchaseRatePaise !== undefined && supplierId === (r.lastSupplierId ?? r.preferredSupplier?.id)) {
      line.ratePaise = r.lastPurchaseRatePaise;
    }
    lines.push(line);
  }
  return { lines, missingSupplier, supplierCount: suppliers.size };
}
