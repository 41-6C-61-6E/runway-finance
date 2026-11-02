# ADR 004: Database Repository Pattern and 'server-only' Guard

## Status
Accepted

## Context
Raw Drizzle SQL queries were directly written in routes and service files without centralized user tenancy checks, risking accidental IDOR vulnerabilities if `where(eq(table.userId, ...))` was omitted. Database clients could also accidentally leak into client bundles.

## Decision
1. Guard `lib/db/index.ts` with `import 'server-only'`.
2. Implement domain repositories in `lib/db/repos/` with built-in tenancy enforcement (`findOwned`, `listOwned`, `deleteOwned`).
3. Standardize SQL pagination, sorting, and JSON parsing helpers in `lib/db/repos/sql-helpers.ts`.

## Consequences
Guarantees tenant isolation across high-traffic tables (accounts, transactions, categories, budgets, goals, paystubs), simplifies service queries, and prevents database code from compiling into client bundles.

