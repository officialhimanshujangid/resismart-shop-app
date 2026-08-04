import { ProductUnit } from '../../types/api-contract.generated';

/**
 * NOTE ON WHERE THIS FILE LIVES: the assignment names
 * `mobile-shop/src/features/orders/**` and `.../scanner/**` explicitly but
 * lists catalog only as `app/(app)/catalog/**`. expo-router (verified in
 * `node_modules/expo-router/build/matchers.js` — no underscore-prefix
 * exclusion for plain files, only `_layout`) treats every file under `app/`
 * as route material, and Expo's own docs are explicit that "components,
 * hooks, utilities... should be placed in other directories such as
 * src/components, src/hooks" — NOT inside `app/`. Duplicating a `Product`
 * type and its API calls across four catalog route files was the other
 * option and a worse one. `src/features/catalog/` is the same shape as the
 * two folders this agent was explicitly given, feeds only the catalog routes
 * this agent owns, and no other agent's assignment mentions catalog business
 * logic — see `judgementCalls` in this agent's final report.
 */

/** = `STOCK_ADJUST_MODES` in `order.validator.ts`. */
export const STOCK_ADJUST_MODES = ['SET', 'INCREASE', 'DECREASE'] as const;
export type StockAdjustMode = typeof STOCK_ADJUST_MODES[number];

/** = `STOCK_ADJUST_REASON_CODES` in `order.validator.ts`. */
export const STOCK_ADJUST_REASON_CODES = [
  'PURCHASE', 'RETURN_TO_SHELF', 'DAMAGE', 'EXPIRY', 'THEFT', 'RECOUNT', 'CORRECTION', 'OTHER',
] as const;
export type StockAdjustReasonCode = typeof STOCK_ADJUST_REASON_CODES[number];

export const STOCK_ADJUST_REASON_LABELS: Record<StockAdjustReasonCode, string> = {
  PURCHASE: 'New stock received',
  RETURN_TO_SHELF: 'Returned to shelf',
  DAMAGE: 'Damaged',
  EXPIRY: 'Expired',
  THEFT: 'Theft / loss',
  RECOUNT: 'Physical recount',
  CORRECTION: 'Correction',
  OTHER: 'Other',
};

export interface ProductCategoryRef {
  _id: string;
  name: string;
}

export interface ProductCategory {
  _id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
}

/** `IPartnerProduct`, as `partner-product.controller.ts` returns it (list/getOne populate `categoryId`). */
export interface Product {
  _id: string;
  name: string;
  sku?: string;
  barcode?: string;
  hsnCode?: string;
  unit: ProductUnit;
  mrpPaise: number;
  sellPaise: number;
  taxRatePercent: number;
  taxInclusive: boolean;
  stockQty: number;
  lowStockAt?: number;
  trackStock: boolean;
  images: string[];
  categoryId?: ProductCategoryRef | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductListFilters {
  q?: string;
  categoryId?: string;
  isActive?: 'true' | 'false';
  lowStock?: 'true' | 'false';
  page?: number;
  limit?: number;
}

/**
 * What the create/edit form sends. `stockQty` is create-only — see
 * `createProductSchema` vs `updateProductSchema`: an opening count needs no
 * explanation, but every later change goes through `adjustStock` with a
 * reason attached. This type takes `categoryId` as a bare string (the form's
 * selection), never the populated `{ _id, name }` the read side returns.
 *
 * `lowStockAt` and `categoryId` accept `null` as well as `undefined` — that is
 * not a widening for its own sake, it mirrors `updateProductSchema`'s own
 * `.nullable().optional()` on both: `undefined` means "leave it alone" (the
 * key is omitted, zod does not touch it), `null` means "clear it" (turn off
 * the low-stock alert, remove the category). Typing this as plain `?number`
 * would make the clearing case uncheckable at compile time and invite a `null
 * as unknown as undefined` cast at the call site — which sends the wrong
 * instruction (Mongoose reads `undefined` as "no change", not "clear").
 */
export interface ProductFormInput {
  name: string;
  sku?: string;
  barcode?: string;
  hsnCode?: string;
  unit: ProductUnit;
  mrpPaise: number;
  sellPaise: number;
  taxRatePercent: number;
  taxInclusive: boolean;
  lowStockAt?: number | null;
  trackStock: boolean;
  images: string[];
  categoryId?: string | null;
  isActive: boolean;
}

export interface CreateProductInput extends ProductFormInput {
  stockQty: number;
}
