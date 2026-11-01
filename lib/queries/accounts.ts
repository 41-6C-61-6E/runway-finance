import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiFetch } from '@/lib/utils/api-client';
import type { Account } from '@/lib/types/account';

export interface UseAccountsOptions {
  includeHidden?: boolean;
  includeVirtual?: boolean;
  enabled?: boolean;
}

export function useAccountsQuery(options: UseAccountsOptions = {}) {
  const { includeHidden = false, includeVirtual = false, enabled = true } = options;
  const queryKey = includeHidden && includeVirtual
    ? queryKeys.accounts.allIncl
    : ([...queryKeys.accounts.all, includeHidden, includeVirtual] as const);

  return useQuery<Account[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (includeHidden) params.set('includeHidden', 'true');
      if (includeVirtual) params.set('includeVirtual', 'true');
      const qs = params.toString() ? `?${params.toString()}` : '';
      return apiFetch<Account[]>(`/api/accounts${qs}`);
    },
    enabled,
    staleTime: 60 * 1000,
  });
}
