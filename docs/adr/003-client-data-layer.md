# ADR 003: Unified Client Data Layer & React Query Query Keys

## Status
Accepted

## Context
Client components made ad-hoc `fetch()` calls, invented uncoordinated `queryKey` string arrays (causing cache invalidation misses), and relied on an unmaintained custom caching utility (`lib/fetch-cache.ts`).

## Decision
1. Retire `lib/fetch-cache.ts` in favor of `@tanstack/react-query`.
2. Standardize all client requests through typed `apiFetch()` with automatic base URL, error throwing, and JSON handling.
3. Centralize all query keys in `lib/query-keys.ts` with factory functions (e.g. `queryKeys.accounts.list(userId)`).
4. Organize domain React Query hooks in `lib/queries/<domain>.ts`.

## Consequences
Eliminates cache desynchronization, reduces client-side boilerplate, and ensures multi-account data invalidates cleanly on logout or mutation.

