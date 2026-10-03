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
  // P1.5, appended: what the shrinkage (adjustments) report groups by.
  'OPENING', 'OWN_USE', 'SAMPLE_GIFT', 'SPOILAGE',
] as const;
export type StockAdjustReasonCode = typeof STOCK_ADJUST_REASON_CODES[number];

/**
 * WHAT A STOCK-ADJUST REASON IS CALLED ON SCREEN — a catalogue key per code,
 * not the words.
 *
 * The KEYS are `STOCK_ADJUST_REASON_CODES` above, which is the wire value:
 * `reasonCode` on `POST .../stock`, validated against the server's own
 * `STOCK_ADJUST_REASON_CODES` in `order.validator.ts` and written to the audit
 * record an auditor reads. Those literals never move. Only the labels are
 * translated — the same split `features/billing/types.ts` is the worked example
 * of.
 */
export const STOCK_ADJUST_REASON_LABEL_KEYS: Record<StockAdjustReasonCode, string> = {
  PURCHASE: 'catalog.stockReason.PURCHASE',
  RETURN_TO_SHELF: 'catalog.stockReason.RETURN_TO_SHELF',
  DAMAGE: 'catalog.stockReason.DAMAGE',
  EXPIRY: 'catalog.stockReason.EXPIRY',
  THEFT: 'catalog.stockReason.THEFT',
  RECOUNT: 'catalog.stockReason.RECOUNT',
  CORRECTION: 'catalog.stockReason.CORRECTION',
  OTHER: 'catalog.stockReason.OTHER',
  OPENING: 'catalog.stockReason.OPENING',
  OWN_USE: 'catalog.stockReason.OWN_USE',
  SAMPLE_GIFT: 'catalog.stockReason.SAMPLE_GIFT',
  SPOILAGE: 'catalog.stockReason.SPOILAGE',
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
  // P1 cost fields (§1.3) — sent ONLY to a viewer holding COSTS; absent otherwise.
  costPricePaise?: number;
  avgCostPaise?: number;
  stockValuePaise?: number;
  marginPercent?: number;
  reorderQty?: number;
  maxStockQty?: number;
  preferredSupplierId?: string;
  // P2 PHARMACY (§1.1) — present only on a medicine a pharmacy has described.
  batchTracking?: boolean;
  batchTrackingSuspended?: boolean;
  drugSchedule?: 'H' | 'H1' | 'X';
  composition?: string;
  manufacturer?: string;
  // Commerce C3/C6 (CONTRACT-commerce §1.3) — present only when set.
  /** A non-sellable parent whose sizes / types are the products sold (C6). */
  isVariantParent?: boolean;
  variantParentId?: string;
  variantLabel?: string;
  variantAttributes?: Array<{ name: string; value: string }>;
  /** List rows only, on a parent. */
  variantCount?: number;
  /** getOne only, on a parent. */
  variants?: Product[];
  /** A bundle (C3): selling it moves these components' stock. */
  bundleComponents?: Array<{ productId: string; qty: number }>;
  // >>> MP1-COMPLETE — Commerce C1 product page + quantity rules (`productCommerceFieldsSchema`); absent when unset.
  description?: string;
  highlights?: string[];
  qtyStep?: number;
  minQty?: number;
  maxQty?: number;
  // <<< MP1-COMPLETE
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
  /**
   * Commerce C3 (feature BUNDLES): the items one unit of this product is made
   * of. `null` on an update turns a bundle back into a plain product; absent
   * leaves it alone. The server keeps a bundle's own stock at 0 (untracked).
   */
  bundleComponents?: Array<{ productId: string; qty: number }> | null;
  // >>> MP1-COMPLETE — Commerce C1 (`productCommerceFieldsSchema`): absent = leave alone, `null` = clear.
  description?: string | null;
  highlights?: string[] | null;
  qtyStep?: number | null;
  minQty?: number | null;
  maxQty?: number | null;
  // <<< MP1-COMPLETE
}

export interface CreateProductInput extends ProductFormInput {
  stockQty: number;
}
