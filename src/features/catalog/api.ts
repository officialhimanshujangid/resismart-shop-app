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

  /**
   * Rename a category, reorder it, or put a hidden one back.
   *
   * `PUT /product-categories/:id` has existed since the vertical was built and
   * was called by nothing, so a typo'd aisle name was permanent — `CategoryPicker`
   * said as much in its own header ("full folder management … is out of this
   * build's scope"). `updateProductCategorySchema` takes exactly these three
   * fields, all optional, so an omitted key means "leave it alone".
   *
   * A duplicate name is a 409 with a readable sentence, and the unique index is
   * COLLATED — "Dairy" collides with "dairy". `apiErrorMessage` surfaces the
   * server's own wording, which already says so.
   */
  updateCategory: (id: string, body: { name?: string; sortOrder?: number; isActive?: boolean }) =>
    apiClient
      .put<ApiEnvelope<ProductCategory>>(`/partners/me/product-categories/${id}`, body)
      .then((r) => unwrap(r.data)),

  /**
   * Hide a category. SOFT, and it has to be — products point at the row by
   * `_id`, and a hard delete would file every one of them under a folder that
   * renders blank and can never be filtered for again. The controller says the
   * same thing in its own header, and its success MESSAGE names how many
   * products are in it, which is the thing the partner is about to wonder — so
   * that message is read back rather than replaced with one of ours.
   *
   * Undone with `updateCategory(id, { isActive: true })`, which is why this
   * pair is not a one-way door.
   */
  removeCategory: (id: string) =>
    apiClient
      .delete<{ success: boolean; message?: string }>(`/partners/me/product-categories/${id}`)
      .then((r) => r.data),
};
