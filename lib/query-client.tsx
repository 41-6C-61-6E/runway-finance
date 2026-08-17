'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider, type Persister, type PersistedClient } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';
import { useState, useMemo, type ReactNode } from 'react';

const IDB_PERSIST_KEY = 'RUNWAY_FINANCE_QUERY_CACHE';

export function createIDBPersister(idbKey: string = IDB_PERSIST_KEY): Persister {
  return {
    persistClient: async (persistedClient: PersistedClient) => {
      try {
        await set(idbKey, persistedClient);
      } catch (err) {
        console.warn('[QueryPersist] Failed to persist client to IndexedDB:', err);
      }
    },
    restoreClient: async () => {
      try {
        return await get<PersistedClient>(idbKey);
      } catch (err) {
        console.warn('[QueryPersist] Failed to restore client from IndexedDB:', err);
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await del(idbKey);
      } catch (err) {
        console.warn('[QueryPersist] Failed to delete client from IndexedDB:', err);
      }
    },
  };
}

export async function clearQueryPersistence(idbKey: string = IDB_PERSIST_KEY) {
  try {
    await del(idbKey);
    queryClient.clear();
  } catch (err) {
    console.error('[QueryPersist] Error clearing query persistence:', err);
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days (durability for offline persistence)
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function ReactQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => queryClient);
  const persister = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return createIDBPersister();
  }, []);

  if (!persister) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
        buster: process.env.NEXT_PUBLIC_BUILD_NUMBER || 'v1',
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            // Persist all successfully fetched read queries
            return query.state.status === 'success';
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

