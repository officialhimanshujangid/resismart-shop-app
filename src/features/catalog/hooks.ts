import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { catalogApi } from './api';
import {
  CreateProductInput, ProductFormInput, ProductListFilters, StockAdjustMode, StockAdjustReasonCode,
} from './types';
import { qk } from '../../lib/queryKeys';

export function useProducts(filters: ProductListFilters) {
  return useQuery({
    queryKey: qk.catalog.products(filters as Record<string, string | number | undefined>),
    queryFn: () => catalogApi.list(filters),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: qk.catalog.product(id ?? ''),
    queryFn: () => catalogApi.getOne(id as string),
    enabled: Boolean(id),
  });
}

export function useProductCategories() {
  return useQuery({
    queryKey: qk.catalog.categories(),
    queryFn: () => catalogApi.listCategories(),
    staleTime: 60_000,
  });
}

/** Invalidates the whole `catalog` branch AND `usage()` — a product created or
 *  deactivated moves the `max_products` meter the create button reads. */
function invalidateCatalog(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: qk.catalog.all() });
  void queryClient.invalidateQueries({ queryKey: qk.usage() });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProductInput) => catalogApi.create(body),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useUpdateProduct(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ProductFormInput>) => catalogApi.update(id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.catalog.product(id), updated);
      invalidateCatalog(queryClient);
    },
  });
}

export function useDeactivateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => catalogApi.remove(id),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export interface AdjustStockInput {
  id: string;
  mode: StockAdjustMode;
  qty: number;
  reason: string;
  reasonCode?: StockAdjustReasonCode;
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: AdjustStockInput) => catalogApi.adjustStock(id, body),
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({ queryKey: qk.catalog.product(variables.id) });
      invalidateCatalog(queryClient);
    },
  });
}

export function useCreateCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => catalogApi.createCategory(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.catalog.categories() });
    },
  });
}
