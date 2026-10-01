import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { apiClient, unwrap, withIdempotency } from '../../api/axios';
import i18n from '../../i18n';
import type {
  BatchCorrectionBody, BatchListQuery, BatchMovement, BatchRow, DrugFieldsBody, NearExpiryView, Paged,
  ProductBatchesView, ProductDrugInfo, RxEntry, RxRegisterQuery, RxRegisterRow, SplitBatchInput, SplitResult,
  WriteOffBody, WriteOffResult,
} from './types';

/**
 * `/api/v1/partners/me/pharmacy` (CONTRACT-partner-P2 §7, verified against
 * `routes/pharmacy.routes.ts`). PHARMACY_VIEW reads batches and near-expiry,
 * PHARMACY_MANAGE writes, RX_REGISTER reads the register. The register has no
 * edit and no delete route — by law it is never deletable.
 */
const BASE = '/partners/me/pharmacy';

/** Drop empty query values so the validators never see `q=''`. */
function clean(q: object): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v as string | number | boolean;
  }
  return out;
}

/** A paged answer `{success, data, page, limit, total}` — read defensively (an empty server answers nothing). */
function paged<T>(body: unknown): Paged<T> {
  const b = (body && typeof body === 'object' ? body : {}) as Partial<Paged<T>>;
  const data = Array.isArray(b.data) ? b.data : [];
  return { data, page: Number(b.page) || 1, limit: Number(b.limit) || 50, total: Number(b.total) || data.length };
}

function productView(raw: unknown): ProductBatchesView | null {
  const v = raw as Partial<ProductBatchesView> | undefined;
  if (!v || !v.product) return null;
  return {
    product: v.product,
    unbatchedQty: Number(v.unbatchedQty) || 0,
    batches: Array.isArray(v.batches) ? v.batches : [],
  };
}

export const pharmacyApi = {
  batches: (query: BatchListQuery) =>
    apiClient.get(`${BASE}/batches`, { params: clean(query) }).then((r) => paged<BatchRow>(r.data)),

  /** 404 PRODUCT_MISSING. Only batches with stock on the shelf. */
  productBatches: (productId: string) =>
    apiClient.get(`${BASE}/products/${productId}/batches`).then((r) => productView(unwrap(r.data))),

  /** 404 BATCH_NOT_FOUND. Newest first. */
  batchMovements: (id: string, page = 1, limit = 50) =>
    apiClient.get(`${BASE}/batches/${id}/movements`, { params: { page, limit } }).then((r) => paged<BatchMovement>(r.data)),

  /** 404 PRODUCT_MISSING; 409 PRODUCT_NOT_STOCK_TRACKED {productName}. `null` clears a field. */
  updateDrug: (productId: string, body: DrugFieldsBody) =>
    apiClient.put(`${BASE}/products/${productId}/drug`, body)
      .then((r) => (unwrap(r.data) as { product?: ProductDrugInfo } | undefined)?.product ?? null),

  /** 409 BATCH_SPLIT_EXCEEDS_UNBATCHED {unbatched}; 400 BATCH_EXPIRY_INVALID {itemName}. No stock movement. */
  splitUnbatched: (productId: string, batches: SplitBatchInput[], key: string) =>
    apiClient.post(`${BASE}/products/${productId}/batches/split-unbatched`, { batches }, withIdempotency(key))
      .then((r) => unwrap(r.data) as SplitResult),

  /** 404 BATCH_NOT_FOUND; 409 BATCH_DUPLICATE. Audited — `note` is required. */
  correctBatch: (id: string, body: BatchCorrectionBody) =>
    apiClient.put(`${BASE}/batches/${id}`, body).then((r) => unwrap(r.data) as BatchRow),

  /** 409 BATCH_PICK_SHORT {batchNo, available, needed}. */
  writeOff: (id: string, body: WriteOffBody, key: string) =>
    apiClient.post(`${BASE}/batches/${id}/write-off`, body, withIdempotency(key))
      .then((r) => unwrap(r.data) as WriteOffResult),

  nearExpiry: (query: { withinDays?: number; includeExpired?: boolean } = {}) =>
    apiClient.get(`${BASE}/near-expiry`, {
      params: clean({
        withinDays: query.withinDays,
        includeExpired: query.includeExpired === undefined ? undefined : String(query.includeExpired),
      }),
    }).then((r): NearExpiryView => {
      const v = unwrap(r.data) as Partial<NearExpiryView> | undefined;
      return { buckets: Array.isArray(v?.buckets) ? v!.buckets : [], rows: Array.isArray(v?.rows) ? v!.rows : [] };
    }),

  rxRegister: (query: RxRegisterQuery) =>
    apiClient.get(`${BASE}/rx-register`, { params: clean({ ...query, format: 'json' }) })
      .then((r) => paged<RxRegisterRow>(r.data)),

  /** 404 RX_ENTRY_NOT_FOUND. */
  rxEntry: (id: string) =>
    apiClient.get(`${BASE}/rx-register/${id}`).then((r) => (unwrap(r.data) as RxEntry | undefined) ?? null),

  /**
   * Composition / manufacturer to pre-fill the drug card. They are not in the
   * batches answer, so read the product itself (CATALOG_VIEW) — optional.
   */
  productInfo: (productId: string) =>
    apiClient.get(`/partners/me/products/${productId}`)
      .then((r) => (unwrap(r.data) as ProductDrugInfo | undefined) ?? null),
};

export type RxExportFormat = 'pdf' | 'csv';

/**
 * The register as a file (the H1 layout), with the screen's current filters,
 * written to the cache and handed to the share sheet — the same path as
 * `exportReport` in `src/api/reports.api.ts`. The export is audited server-side.
 */
export async function exportRxRegister(query: RxRegisterQuery, format: RxExportFormat): Promise<void> {
  const { page: _page, limit: _limit, ...filters } = query;
  void _page; void _limit;
  const response = await apiClient.get<ArrayBuffer>(`${BASE}/rx-register`, {
    params: clean({ ...filters, format }),
    responseType: 'arraybuffer',
    timeout: 60_000,
  });
  const mimeType = format === 'pdf' ? 'application/pdf' : 'text/csv';
  const file = new File(Paths.cache, `prescription-register-${Date.now()}.${format}`);
  file.write(new Uint8Array(response.data ?? new ArrayBuffer(0)));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error(i18n.t('p2.pharmacy.register.export.sharingUnavailable'));
  }
  await Sharing.shareAsync(file.uri, {
    mimeType,
    dialogTitle: i18n.t('p2.pharmacy.register.export.dialogTitle'),
  });
}

/** Query keys — all under `['p2', 'pharmacy']` (a live event invalidates `['p2']`). */
export const pharmacyKeys = {
  all: () => ['p2', 'pharmacy'] as const,
  batches: (q: object) => ['p2', 'pharmacy', 'batches', q] as const,
  product: (id: string) => ['p2', 'pharmacy', 'product', id] as const,
  productInfo: (id: string) => ['p2', 'pharmacy', 'product-info', id] as const,
  movements: (id: string) => ['p2', 'pharmacy', 'movements', id] as const,
  nearExpiry: () => ['p2', 'pharmacy', 'near-expiry'] as const,
  rx: (q: object) => ['p2', 'pharmacy', 'rx', q] as const,
  rxEntry: (id: string) => ['p2', 'pharmacy', 'rx-entry', id] as const,
};
