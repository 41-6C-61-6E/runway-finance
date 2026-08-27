'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider, type Persister, type PersistedClient } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';
import { useState, useMemo, type ReactNode } from 'react';

const IDB_PERSIST_KEY = 'RUNWAY_FINANCE_QUERY_CACHE';

/**
 * H-6 (2026-08-27 security review): the query cache is DECRYPTED financial
 * data. Previously every successful query was persisted to IndexedDB for
 * 7 days, keeping a week-old plaintext mirror of the household's finances
 * in the browser profile (readable by any XSS). We now:
 *   - cap persistence + GC at 24 hours, and
 *   - refuse to dehydrate the largest full-dump datasets (see below); the
 *     rest (accounts, budgets, settings, reference data) still work offline
 *     within the 24h window.
 */
const PERSIST_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h

/** Query-key first tokens that are never written to IndexedDB. */
const NON_PERSISTABLE_QUERY_PREFIXES = new Set([
  'account-transactions', // full transaction dumps per account
  'accounts-history', // full balance-history series
  'investments',
  'investments-quotes',
  'investments-history', // holding series
  'investments-income',
  'net-worth-chart', // full series
  'net-worth',
  'cash-vs-credit',
]);

function isPersistableQuery(query) {
  const key = query.queryKey;
  if (Array.isArray(key) && typeof key[0] === 'string' && NON_PERSISTABLE_QUERY_PREFIXES.has(key[0])) {
    return false;
  }
  return true;
}

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

/**
 * H-7: wipe ALL client-side caches (IndexedDB query cache + service-worker
 * Cache Storage) — called on sign-out so a shared device does not keep a
 * decrypted mirror or a cached auth/home page for the next user.
 */
export async function clearAllClientCaches() {
  await clearQueryPersistence();
  try {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      const cacheKeys = await caches.keys();
      await Promise.all([
        ...cacheKeys.map((k) => caches.delete(k)),
        ...regs.map((r) => r.unregister()),
      ]);
    }
  } catch (err) {
    console.error('[QueryPersist] Error clearing service-worker caches:', err);
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: PERSIST_MAX_AGE_MS, // H-6: 24h — limits how long decrypted data sits in memory
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
        maxAge: PERSIST_MAX_AGE_MS, // H-6: 24h cap on IndexedDB lifetime
        buster: process.env.NEXT_PUBLIC_BUILD_NUMBER || 'v1',
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            return query.state.status === 'success' && isPersistableQuery(query);
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

