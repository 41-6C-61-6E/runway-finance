# Runway Finance — Agent Guidelines

Personal finance dashboard for tracking net worth, cash flow, investments, budgets, and FIRE planning.

## Tech Stack Snapshot
- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Styling & UI**: Tailwind CSS v4, Radix UI primitives, Lucide icons, Recharts
- **Database & ORM**: PostgreSQL (16), Drizzle ORM (`drizzle-orm`, `drizzle-kit`)
- **Authentication**: NextAuth v5 beta (`auth` alias / `@/lib/auth`)
- **Package Manager**: `pnpm` (>= 10.x) — **Never use `npm` or `yarn`**

## Essential Commands
- **Dev Server**: `pnpm dev` (Runs on `http://localhost:3001` via `--turbo`; generates CSS palette and service worker before launch)
- **Restart Dev Server**: `pnpm restart` or `pnpm dev:restart`
- **Typecheck**: `pnpm typecheck` (`tsc --noEmit`)
- **Lint**: `pnpm lint` (`eslint . && node scripts/ui-ratchet.mjs`)
- **Unit & Integration Tests**: `pnpm test` (Vitest)
- **E2E Tests**: `pnpm test:e2e` (Playwright)
- **CI Suite**: `pnpm ci` (Lint, typecheck, test, and build)

## Database & ORM Workflows
- **Connection**: Requires `DATABASE_URL` (configured in `.env` / `.env.local`). Docker service runs via `compose.yml` on port `5432`.
- **DB Client**: `getDb()` from `@/lib/db` (returns Drizzle instance with schema preloaded).
- **Schema Location**: `lib/db/schema.ts` (barrel file re-exporting domain schemas from `lib/db/schema/*.ts`).
- **Generate Migrations**: `pnpm db:generate` (Outputs migration SQL to `drizzle/`).
- **Apply Migrations**: `pnpm db:migrate`
- **Drizzle Studio**: `pnpm db:studio`
- **Seeds & Synthetic Data**: Located in `scripts/` (e.g. `scripts/seed-demo01-synthetic-data.ts`).

## Project Layout
- `app/`: Next.js App Router pages, layouts, server actions, and API routes (`app/api/*`)
- `components/`: UI components; generic reusable primitives are in `components/ui/*`
- `lib/`: Business logic, crypto/security, React Query hooks, and DB access
  - `lib/db/schema/`: Modular database table schemas
  - `lib/auth.ts`: Auth.js handlers and session logic
- `drizzle/`: Auto-generated migration SQL and metadata snapshots (do not edit manually)
- `scripts/`: Seed scripts, build generators (`generate-css-from-palette.mjs`), and maintenance tools
- `tests/`: Vitest test suites and Playwright configurations

## Critical Conventions & Guardrails
1. **Package Manager**: Strictly use `pnpm`. Running `npm install` creates unwanted lockfiles and dependency conflicts.
2. **Path Aliases**: Use `@/*` for root imports and `auth` for `@/lib/auth` (configured in `tsconfig.json`).
3. **Database Modifications**: When altering database structures, update the appropriate schema file in `lib/db/schema/`, ensure it is exported in `lib/db/schema.ts`, and run `pnpm db:generate`. Never manually tweak existing applied migration files.
4. **Port Number**: The dev server binds to port `3001` (not `3000`).
5. **UI Ratchet**: The lint step (`pnpm lint`) includes a UI ratchet check (`scripts/ui-ratchet.mjs`). Maintain existing Radix UI and Tailwind patterns without adding superfluous styling dependencies.
6. **Verification**: Always execute `pnpm typecheck` and `pnpm test` before concluding tasks involving code changes.
7. **Security**: Never commit secrets or sensitive information to the repository. Always use environment variables for sensitive configuration. Code with security best practices
7. **Pirimitives**: Always use the existing primitives in `components/ui/*` for UI components. Do not create new ones unless necessary. Follw existing styling patterns.