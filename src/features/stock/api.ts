import { apiClient, ApiEnvelope, unwrap, withIdempotency } from '../../api/axios';
import type { Product } from '../catalog/types';
import type { StockMovement } from '../catalog/stockMovements';

/**
 * P1 stock (CONTRACT-partner-P1 §5, §6): opening stock with cost, the
 * adjustments (shrinkage) report, stock counts, and the reorder list.
 * Money in paise; value fields arrive only for a viewer holding COSTS.
 */

// ───────────────────────────────────────────────────────── stock counts
export const STOCK_COUNT_STATUSES = ['COUNTING', 'REVIEW', 'POSTING', 'POSTED', 'CANCELLED'] as const;
export type StockCountStatus = typeof STOCK_COUNT_STATUSES[number];
export const STOCK_COUNT_REASON_CODES = ['RECOUNT', 'DAMAGE', 'EXPIRY', 'THEFT', 'CORRECTION', 'OTHER'] as const;
export type StockCountReasonCode = typeof STOCK_COUNT_REASON_CODES[number];

export interface StockCount {
  _id: string;
  number: string;
  name?: string;
  status: StockCountStatus;
  scope: { all: boolean; categoryIds: string[]; productIds: string[] };
  blind: boolean;
  uncountedPolicy: 'IGNORE' | 'ZERO';
  lineCount: number;
  countedLineCount: number;
  postedLineCount?: number;
  totals?: { gainQty: number; lossQty: number; gainValuePaise?: number; lossValuePaise?: number; netValuePaise?: number };
  startedAt: string;
  submittedAt?: string;
  postedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
}

export interface StockCountLine {
  _id?: string;
  productId: string;
  productName: string;
  barcode?: string;
  unit: string;
  /** Omitted while a blind count is still counting, unless the viewer holds STOCK_MANAGE. */
  systemQtyAtStart?: number;
  countedQty?: number;
  countedAt?: string;
  expectedQtyAtPost?: number;
  varianceQty?: number;
  unitCostPaise?: number;
  varianceValuePaise?: number;
  reasonCode?: StockCountReasonCode;
  note?: string;
}

export interface CountEntry {
  productId?: string;
  barcode?: string;
  countedQty: number;
  mode: 'SET' | 'ADD';
}

export interface CreateStockCountBody {
  name?: string;
  scope: { all: boolean; categoryIds: string[]; productIds: string[] };
  blind: boolean;
  uncountedPolicy: 'IGNORE' | 'ZERO';
}

export interface PageOf<T> { data: T[]; page: number; limit: number; total: number }

// ───────────────────────────────────────────────────────────── reorder
export interface ReorderRow {
  productId: string;
  name: string;
  unit: string;
  stockQty: number;
  lowStockAt?: number;
  reorderQty?: number;
  maxStockQty?: number;
  suggestedQty: number;
  preferredSupplier?: { id: string; name: string };
  lastPurchaseRatePaise?: number;
  lastSupplierId?: string;
  pendingOnOpenPOsQty: number;
}

export interface ReorderSettingsBody {
  lowStockAt?: number | null;
  reorderQty?: number | null;
  maxStockQty?: number | null;
  preferredSupplierId?: string | null;
}

// ───────────────────────────────────────────────────────── adjustments
export interface AdjustmentsReport {
  byReason: { reasonCode: string; qty: number; valuePaise?: number }[];
  rows: StockMovement[];
  page: number;
  limit: number;
  total: number;
}

export const stockApi = {
  // stock counts
  listCounts: (query: { status?: StockCountStatus; page?: number; limit?: number } = {}) =>
    apiClient.get<PageOf<StockCount>>('/partners/me/stock-counts', { params: query }).then((r) => r.data),

  getCount: (id: string) =>
    apiClient.get<ApiEnvelope<StockCount>>(`/partners/me/stock-counts/${id}`).then((r) => unwrap(r.data)),

  createCount: (body: CreateStockCountBody, idempotencyKey: string) =>
    apiClient.post<ApiEnvelope<StockCount>>('/partners/me/stock-counts', body, withIdempotency(idempotencyKey)).then((r) => unwrap(r.data)),

  countLines: (id: string, query: { filter?: 'all' | 'uncounted' | 'counted' | 'variance'; q?: string; page?: number; limit?: number }) =>
    apiClient.get<PageOf<StockCountLine>>(`/partners/me/stock-counts/${id}/lines`, { params: query }).then((r) => r.data),

  /** ≤200 entries; one idempotency key per batch, reused when the same batch is retried. */
  putEntries: (id: string, entries: CountEntry[], idempotencyKey: string) =>
    apiClient
      .put<ApiEnvelope<{ updated: { productId: string; productName: string; countedQty: number }[]; countedLineCount: number }>>(
        `/partners/me/stock-counts/${id}/lines`, { entries }, withIdempotency(idempotencyKey),
      )
      .then((r) => unwrap(r.data)),

  submit: (id: string) =>
    apiClient
      .post<ApiEnvelope<{ count: StockCount; preview: { gainQty: number; lossQty: number; gainValuePaise?: number; lossValuePaise?: number } }>>(
        `/partners/me/stock-counts/${id}/submit`, {},
      )
      .then((r) => unwrap(r.data)),

  reopen: (id: string) =>
    apiClient.post<ApiEnvelope<StockCount>>(`/partners/me/stock-counts/${id}/reopen`, {}).then((r) => unwrap(r.data)),

  setReason: (id: string, productId: string, body: { reasonCode: StockCountReasonCode; note?: string }) =>
    apiClient.put<ApiEnvelope<StockCountLine>>(`/partners/me/stock-counts/${id}/lines/${productId}/reason`, body).then((r) => unwrap(r.data)),

  post: (id: string) =>
    apiClient.post<ApiEnvelope<StockCount>>(`/partners/me/stock-counts/${id}/post`, { confirm: true }).then((r) => unwrap(r.data)),

  cancel: (id: string, reason: string) =>
    apiClient.post<ApiEnvelope<StockCount>>(`/partners/me/stock-counts/${id}/cancel`, { reason }).then((r) => unwrap(r.data)),

  // reorder
  reorder: (query: { supplierId?: string; categoryId?: string; includeAll?: 'true' | 'false'; page?: number; limit?: number } = {}) =>
    apiClient.get<PageOf<ReorderRow>>('/partners/me/reorder', { params: query }).then((r) => r.data),

  createPurchaseOrders: (
    body: { lines: { productId: string; qty: number; supplierId?: string; ratePaise?: number }[]; deliveryDate?: string },
    idempotencyKey: string,
  ) =>
    apiClient
      .post<ApiEnvelope<{ purchaseOrders: { id: string; partyId: string; partyName: string; lineCount: number }[] }>>(
        '/partners/me/reorder/purchase-orders', body, withIdempotency(idempotencyKey),
      )
      .then((r) => unwrap(r.data)),

  reorderSettings: (productId: string, body: ReorderSettingsBody) =>
    apiClient
      .put<ApiEnvelope<{ productId: string } & ReorderSettingsBody>>(`/partners/me/reorder/products/${productId}`, body)
      .then((r) => unwrap(r.data)),

  // adjustments report + opening stock
  adjustments: (query: { from?: string; to?: string; reasonCode?: string; productId?: string; page?: number; limit?: number } = {}) =>
    apiClient.get<ApiEnvelope<AdjustmentsReport>>('/partners/me/stock/adjustments', { params: query }).then((r) => unwrap(r.data)),

  openingStock: (productId: string, body: { qty: number; unitCostPaise: number; asOf?: string }, idempotencyKey: string) =>
    apiClient
      .post<ApiEnvelope<{ product: Product; movement: StockMovement }>>(
        `/partners/me/products/${productId}/opening-stock`, body, withIdempotency(idempotencyKey),
      )
      .then((r) => unwrap(r.data)),
};
