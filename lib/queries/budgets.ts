import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiFetch } from '@/lib/utils/api-client';

export interface BudgetQueryParams {
  periodType?: string;
  periodKey?: string;
  enabled?: boolean;
}

export function useBudgetsQuery(params: BudgetQueryParams = {}) {
  const { periodType, periodKey, enabled = true } = params;
  return useQuery({
    queryKey: queryKeys.budgets.byPeriod(periodType, periodKey),
    queryFn: async () => {
      const search = new URLSearchParams();
      if (periodType) search.set('periodType', periodType);
      if (periodKey) search.set('periodKey', periodKey);
      const qs = search.toString() ? `?${search.toString()}` : '';
      return apiFetch(`/api/budgets${qs}`);
    },
    enabled,
    staleTime: 60 * 1000,
  });
}
