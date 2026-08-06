import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { servicesApi } from './api';
import { ServiceFormInput, ServiceListFilters } from './types';
import { qk } from '../../lib/queryKeys';

export function useServices(filters: ServiceListFilters = {}) {
  return useQuery({
    queryKey: qk.services.list(filters as Record<string, string | undefined>),
    queryFn: () => servicesApi.list(filters),
  });
}

export function useService(id: string | undefined) {
  return useQuery({
    queryKey: qk.services.detail(id ?? ''),
    queryFn: () => servicesApi.getOne(id as string),
    enabled: Boolean(id),
  });
}

/** Invalidates the whole `services` branch AND `usage()` — a service added or withdrawn moves the `max_services` meter. */
function invalidateServices(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: qk.services.all() });
  void queryClient.invalidateQueries({ queryKey: qk.usage() });
}

export function useCreateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ServiceFormInput) => servicesApi.create(body),
    onSuccess: () => invalidateServices(queryClient),
  });
}

export function useUpdateService(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ServiceFormInput>) => servicesApi.update(id, body),
    onSuccess: (updated) => {
      queryClient.setQueryData(qk.services.detail(id), updated);
      invalidateServices(queryClient);
    },
  });
}

/** Withdraw (deactivate-or-delete, server decides — see `servicesApi.remove`). */
export function useWithdrawService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => servicesApi.remove(id),
    onSuccess: () => invalidateServices(queryClient),
  });
}
