import { useInfiniteQuery } from '@tanstack/react-query';

import { apiClient } from '../../api/axios';
import { qk } from '../../lib/queryKeys';

/**
 * The stock ledger — CONTRACT-partner-P0 §5. Read-only here: every row is
 * written by the server in the same transaction as the stock change itself.
 */

export const STOCK_MOVEMENT_TYPES = [
  'OPENING', 'SALE', 'SALE_RETURN', 'PURCHASE', 'PURCHASE_RETURN', 'ADJUSTMENT', 'COUNT_VARIANCE', 'TRANSFER',
  // P1: a value-only true-up (qty 0) when a supplier bill's cost differs from its GRN.
  'COST_ADJUSTMENT',
] as const;
export type StockMovementType = typeof STOCK_MOVEMENT_TYPES[number];

export const STOCK_SOURCE_TYPES = [
  'PRODUCT_CREATE', 'PRODUCT_IMPORT', 'STOCK_ADJUST', 'DOCUMENT', 'ORDER', 'BACKFILL',
  'STOCK_COUNT', 'OPENING_STOCK',
] as const;
export type StockSourceType = typeof STOCK_SOURCE_TYPES[number];

export interface StockMovement {
  id: string;
  productId: string;
  variantKey?: string;
  /** Signed: + in, − out. */
  qty: number;
  type: StockMovementType | string;
  reason?: string;
  reasonCode?: string;
  sourceType: StockSourceType | string;
  sourceId?: string;
  /** Document number or order code. */
  sourceRef?: string;
  balanceAfter: number;
  /** Paise, purchases only. */
  unitCost?: number;
  isReversal: boolean;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
  /** Present on the shop-wide list when the server populates it; never required. */
  productName?: string;
  /** P1 value columns (§1.2) — only for a viewer holding COSTS, and absent on older rows. */
  valueDeltaPaise?: number;
  avgCostAfterPaise?: number;
  stockValueAfterPaise?: number;
}

export interface StockMovementFilters {
  productId?: string;
  type?: StockMovementType;
  /** `YYYY-MM-DD` from `DateField`; sent as the start of that local day. */
  from?: string;
  /** `YYYY-MM-DD`; sent as the END of that local day, so "to today" includes today. */
  to?: string;
}

export interface StockMovementPage {
  data: StockMovement[];
  page: number;
  limit: number;
  total: number;
  product?: { _id: string; name: string; stockQty: number; trackStock: boolean; unit: string };
}

export const STOCK_PAGE_SIZE = 30;

function dayBoundary(ymd: string | undefined, end: boolean): string | undefined {
  if (!ymd) return undefined;
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  const date = end ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
  return date.toISOString();
}

/** The query string the contract's zod schema reads. Pure — tested directly. */
export function stockMovementParams(f: StockMovementFilters, page: number, limit = STOCK_PAGE_SIZE) {
  return {
    type: f.type || undefined,
    from: dayBoundary(f.from, false),
    to: dayBoundary(f.to, true),
    page,
    limit,
  };
}

export const stockMovementsApi = {
  /** Per product: `GET /partners/me/products/:id/stock-movements`. */
  forProduct: (productId: string, f: StockMovementFilters, page: number) =>
    apiClient
      .get<StockMovementPage>(`/partners/me/products/${encodeURIComponent(productId)}/stock-movements`, {
        params: stockMovementParams(f, page),
      })
      .then((r) => r.data),

  /** Shop-wide: `GET /partners/me/products/stock-movements` (+ optional `productId`). */
  all: (f: StockMovementFilters, page: number) =>
    apiClient
      .get<StockMovementPage>('/partners/me/products/stock-movements', {
        params: { ...stockMovementParams(f, page), productId: f.productId || undefined },
      })
      .then((r) => r.data),
};

/** Next page when the ones fetched so far do not yet cover `total`. */
export function nextStockPage(last: StockMovementPage | undefined): number | undefined {
  if (!last || !Array.isArray(last.data)) return undefined;
  const page = last.page || 1;
  const limit = last.limit || STOCK_PAGE_SIZE;
  return page * limit < (last.total ?? 0) && last.data.length > 0 ? page + 1 : undefined;
}

/**
 * Infinite scroll over the ledger. `scope: 'product'` reads the per-product
 * route (which also returns the product header); `'shop'` the shop-wide one.
 */
export function useStockMovements(scope: 'product' | 'shop', filters: StockMovementFilters, enabled = true) {
  const key: Record<string, string | undefined> = {
    scope,
    productId: filters.productId,
    type: filters.type,
    from: filters.from,
    to: filters.to,
  };
  return useInfiniteQuery({
    queryKey: qk.catalog.stockMovements(key),
    queryFn: ({ pageParam }) =>
      scope === 'product'
        ? stockMovementsApi.forProduct(filters.productId ?? '', filters, pageParam)
        : stockMovementsApi.all(filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: (last) => nextStockPage(last),
    enabled: enabled && (scope === 'shop' || Boolean(filters.productId)),
  });
}

/** Catalogue key for a movement type's chip label. Unknown types fall back to the raw value. */
export const STOCK_TYPE_LABEL_KEYS: Record<StockMovementType, string> = {
  OPENING: 'stockHistory.type.OPENING',
  SALE: 'stockHistory.type.SALE',
  SALE_RETURN: 'stockHistory.type.SALE_RETURN',
  PURCHASE: 'stockHistory.type.PURCHASE',
  PURCHASE_RETURN: 'stockHistory.type.PURCHASE_RETURN',
  ADJUSTMENT: 'stockHistory.type.ADJUSTMENT',
  COUNT_VARIANCE: 'stockHistory.type.COUNT_VARIANCE',
  TRANSFER: 'stockHistory.type.TRANSFER',
  COST_ADJUSTMENT: 'stockHistory.type.COST_ADJUSTMENT',
};

/** "+5" / "−3" / "0" — the true minus sign, so the column lines up and reads as a sign. */
export function signedQty(qty: number): string {
  if (qty > 0) return `+${qty}`;
  if (qty < 0) return `−${Math.abs(qty)}`;
  return '0';
}
