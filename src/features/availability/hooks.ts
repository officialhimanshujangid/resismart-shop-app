import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { availabilityApi } from './api';
import { qk } from '../../lib/queryKeys';

export function useAvailability() {
  return useQuery({
    queryKey: qk.availability.business(),
    queryFn: () => availabilityApi.get(),
  });
}

export function useSaveAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => availabilityApi.save(body),
    onSuccess: (row) => {
      queryClient.setQueryData(qk.availability.business(), row);
    },
  });
}
