export {
  useProducts, useProduct, useProductCategories,
  useCreateProduct, useUpdateProduct, useDeactivateProduct, useAdjustStock, useCreateCategory,
} from './hooks';
export type { AdjustStockInput } from './hooks';
export { catalogApi } from './api';
export type { ProductListPage } from './api';
export {
  STOCK_ADJUST_MODES, STOCK_ADJUST_REASON_CODES, STOCK_ADJUST_REASON_LABELS,
} from './types';
export type {
  Product, ProductCategory, ProductListFilters, ProductFormInput, CreateProductInput,
  StockAdjustMode, StockAdjustReasonCode,
} from './types';

export { ProductCard } from './components/ProductCard';
export { UsageMeterBar } from './components/UsageMeterBar';
export { StockAdjustModal } from './components/StockAdjustModal';
export type { StockAdjustTarget } from './components/StockAdjustModal';
export { CategoryPicker } from './components/CategoryPicker';
