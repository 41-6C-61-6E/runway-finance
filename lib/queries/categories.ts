import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiFetch } from '@/lib/utils/api-client';
import type { Category } from '@/lib/types/category';

export function useCategoriesQuery(options: { enabled?: boolean } = {}) {
  return useQuery<Category[]>({
    queryKey: queryKeys.categories.all,
    queryFn: () => apiFetch<Category[]>('/api/categories'),
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  });
}
