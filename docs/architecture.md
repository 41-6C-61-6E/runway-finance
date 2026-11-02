# Runway Finance — Architecture Guide

## 1. Architectural Layers & Unidirectional Dependency Graph

Runway Finance follows a strict layered architecture with enforced unidirectional dependencies. Cross-layer violations are checked continuously in CI via `scripts/check-module-boundaries.mjs`.

```
┌────────────────────────────────────────────────────────┐
│                      Client Pages                      │
│                  (app/(dashboard)/*)                   │
└───────────────────────────┬────────────────────────────┘
                            │ imports
┌───────────────────────────▼────────────────────────────┐
│                    Domain Components                   │
│                 (components/<domain>/*)                │
└─────────────┬────────────────────────────┬─────────────┘
              │ imports                    │ imports
┌─────────────▼─────────────┐┌─────────────▼─────────────┐
│       UI Primitives       ││     Domain Query Hooks    │
│     (components/ui/*)     ││       (lib/queries/*)     │
└───────────────────────────┘└─────────────┬─────────────┘
                                           │ apiFetch
                             ┌─────────────▼─────────────┐
                             │    API Client & Routes    │
                             │   (lib/api/routes.ts,     │
                             │    lib/utils/api-client)  │
                             └─────────────┬─────────────┘
                                           │ HTTP
═══════════════════════════════════════════╪════════════════════════════════════
                             Server Boundary
═══════════════════════════════════════════╪════════════════════════════════════
                             ┌─────────────▼─────────────┐
                             │       API Route Layer     │
                             │        (app/api/**)       │
                             └─────────────┬─────────────┘
                                           │ withAuth / withAuthAndDek
                             ┌─────────────▼─────────────┐
                             │     Service & Business    │
                             │      (lib/services/*)     │
                             └─────────────┬─────────────┘
                                           │
                             ┌─────────────▼─────────────┐
                             │    Database Repository    │
                             │     (lib/db/repos/*)      │
                             └─────────────┬─────────────┘
                                           │
                             ┌─────────────▼─────────────┐
                             │   PostgreSQL / Drizzle    │
                             │       (lib/db/index)      │
                             └───────────────────────────┘

Shared Pure Foundation (Headless, imported across any layer):
- `lib/types/*`: Canonical domain models (`Account`, `Category`, `Transaction`, `Goal`)
- `lib/constants/*`: Domain constants (`account-types.ts`, `limits.ts`, `time.ts`, `cache.ts`)
- `lib/validations/*`: Zod input validation schemas
- `lib/utils/*`: Pure numerical, date, and formatting utilities (`format.ts`, `date/`)
```

## 2. Layer Invariants & Enforced Boundary Rules

1. **Pure UI Primitives (`components/ui/*`)**:
   - Primitives must never import from database, server services, or domain-specific logic.
   - Reusable across any feature.
2. **Encapsulated API Route Layer (`app/api/**`)**:
   - Client components and services must never import from `app/api/**`.
   - All shared types, DTOs, and schemas reside in `lib/types/` or `lib/validations/`.
3. **Database Repositories (`lib/db/repos/*`)**:
   - High-traffic database access is abstracted behind typed repository functions.
   - `lib/db/index.ts` is guarded with `'server-only'` to prevent leaking database drivers to client bundles.
4. **Pure Financial Calculators (`lib/finance/*`, `lib/tax/*`)**:
   - Deterministic, side-effect free financial math without database dependencies.

