import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { apiFetch } from '@/lib/utils/api-client';

export interface Tag {
  id: string;
  name: string;
  color?: string | null;
}

export function useTagsQuery(options: { enabled?: boolean } = {}) {
  return useQuery<Tag[]>({
    queryKey: queryKeys.tags.all,
    queryFn: () => apiFetch<Tag[]>('/api/tags'),
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
  });
}
