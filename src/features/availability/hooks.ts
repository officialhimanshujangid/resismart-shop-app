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
      // P9A Q7: a person's own hours must not overwrite the business's cached row.
      if (!row?.staffId) queryClient.setQueryData(qk.availability.business(), row);
      void queryClient.invalidateQueries({ queryKey: qk.availability.rows() });
    },
  });
}

/** P9A (Owner Q7): every schedule — the business's and each person's own hours. */
export function useAvailabilityRows(enabled = true) {
  return useQuery({
    queryKey: qk.availability.rows(),
    queryFn: () => availabilityApi.list(),
    enabled,
  });
}

/** P9A Q7: "Back on the business's hours" for one person. */
export function useRemoveStaffHours() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (staffId: string) => availabilityApi.removeOverride(staffId),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: qk.availability.rows() }); },
  });
}
