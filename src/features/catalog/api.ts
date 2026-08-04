import { apiClient, ApiEnvelope, unwrap } from '../../api/axios';
import {
  CreateProductInput, Product, ProductCategory, ProductFormInput, ProductListFilters,
  StockAdjustMode, StockAdjustReasonCode,
} from './types';

/**
 * `/partners/me/products/**` and `/partners/me/product-categories/**` — see
 * `partner-product.routes.ts` and `partner-product.controller.ts`.
 *
 * No idempotency key on `create`/`adjustStock`, unlike the billing rule in
 * `src/lib/idempotency.ts`. That is not an oversight: `withIdempotency()`
 * only means something if the ROUTE reads the header, and
 * `partner-product.controller.ts#create` / `#adjustStock` do not — there is
 * no `Idempotency-Key` handling anywhere in this vertical. Sending the header
 * anyway would be a client-side promise the server never keeps. The actual
 * backstops here are: the barcode/SKU partial-unique indexes reject an exact
 * duplicate outright (`fail()`'s 409 branch already turns that into a
 * readable sentence), and every create/adjust button in this feature disables
 * itself while its own mutation is in flight — see `useCreateProduct` /
 * `useAdjustStock`. NOT MINE — if double-submission-under-retry protection is
 * wanted here the way it exists for invoices, `partner-product.controller.ts`
 * needs to grow the same `Idempotency-Key` handling first.
 */

export interface ProductListPage {
  data: Product[];
  page: number;
  limit: number;
  total: number;
}

export const catalogApi = {
  list: (filters: ProductListFilters) =>
    apiClient
      .get<ProductListPage>('/partners/me/products', {
        params: {
          q: filters.q || undefined,
          categoryId: filters.categoryId,
          isActive: filters.isActive,
          lowStock: filters.lowStock,
          page: filters.page ?? 1,
          limit: filters.limit ?? 50,
        },
      })
      .then((r) => r.data),

  getOne: (id: string) =>
    apiClient.get<ApiEnvelope<Product>>(`/partners/me/products/${id}`).then((r) => unwrap(r.data)),

  create: (body: CreateProductInput) =>
    apiClient.post<ApiEnvelope<Product>>('/partners/me/products', body).then((r) => unwrap(r.data)),

  update: (id: string, body: Partial<ProductFormInput>) =>
    apiClient.put<ApiEnvelope<Product>>(`/partners/me/products/${id}`, body).then((r) => unwrap(r.data)),

  /** Deactivates — `partner-product.controller.ts#remove` never hard-deletes. */
  remove: (id: string) =>
    apiClient.delete<ApiEnvelope<unknown>>(`/partners/me/products/${id}`).then((r) => r.data),

  adjustStock: (id: string, body: { mode: StockAdjustMode; qty: number; reason: string; reasonCode?: StockAdjustReasonCode }) =>
    apiClient
      .post<ApiEnvelope<{ name: string; stockQty: number; lowStockAt?: number }>>(`/partners/me/products/${id}/stock`, body)
      .then((r) => r.data),

  listCategories: () =>
    apiClient.get<ApiEnvelope<ProductCategory[]>>('/partners/me/product-categories').then((r) => unwrap(r.data)),

  createCategory: (name: string) =>
    apiClient.post<ApiEnvelope<ProductCategory>>('/partners/me/product-categories', { name }).then((r) => unwrap(r.data)),
};
