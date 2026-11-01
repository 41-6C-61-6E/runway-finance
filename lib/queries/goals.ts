import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiFetch } from '@/lib/utils/api-client';
import type { Goal } from '@/lib/types/goal';

export function useGoalsQuery(params: { status?: string; type?: string; enabled?: boolean } = {}) {
  const { status, type, enabled = true } = params;
  return useQuery<Goal[]>({
    queryKey: [...queryKeys.goals.all, status, type] as const,
    queryFn: async () => {
      const search = new URLSearchParams();
      if (status) search.set('status', status);
      if (type) search.set('type', type);
      const qs = search.toString() ? `?${search.toString()}` : '';
      return apiFetch<Goal[]>(`/api/goals${qs}`);
    },
    enabled,
    staleTime: 60 * 1000,
  });
}
