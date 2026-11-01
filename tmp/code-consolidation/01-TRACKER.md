# Code Consolidation — Live Tracker

## 1. Workstream Status Matrix

| ID | Workstream | Wave | Audit | Remediation | Findings | Done | Net LOC Δ | Dossier |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | ---: | :--- |
| CC-00 | Baseline, Guardrail Tooling & Characterization Tests | 0 | `COMPLETE` | `COMPLETE` | 7 | 7 | 0 | `workstreams/CC-00-baseline-tooling-and-characterization.md` |
| CC-01 | Dead Code, Unused Exports & Dependencies | 0 | `COMPLETE` | `COMPLETE` | 11 | 11 | -3114 | `workstreams/CC-01-dead-code-and-dependencies.md` |
| CC-02 | API Route Layer Standardization | 2 | `COMPLETE` | `COMPLETE` | 12 | 12 | -1098 | `workstreams/CC-02-api-route-layer.md` |
| CC-03 | Client Data Layer | 2 | `COMPLETE` | `COMPLETE` | 9 | 9 | -147 | `workstreams/CC-03-client-data-layer.md` |
| CC-04 | UI Primitive Adoption & Consolidation | 3 | `COMPLETE` | `NOT_STARTED` | 12 | 0 | -1425 | `workstreams/CC-04-ui-primitives.md` |
| CC-05 | Formatting, Date & Numeric Utilities | 1 | `COMPLETE` | `COMPLETE` | 10 | 10 | -895 | `workstreams/CC-05-format-date-numeric-utils.md` |
| CC-06 | Domain Types, Constants & Validation | 1 | `COMPLETE` | `COMPLETE` | 9 | 9 | -770 | `workstreams/CC-06-types-constants-validation.md` |
| CC-07 | Oversized Module Decomposition | 4 | `COMPLETE` | `NOT_STARTED` | 24 | 0 | -4250 | `workstreams/CC-07-oversized-module-decomposition.md` |
| CC-08 | Services, Schedulers, Integrations & AI | 2 | `COMPLETE` | `COMPLETE` | 11 | 11 | -450 | `workstreams/CC-08-services-integrations-ai.md` |
| CC-09 | Hooks, Providers & Client State | 2 | `COMPLETE` | `COMPLETE` | 10 | 10 | +80 | `workstreams/CC-09-hooks-providers-state.md` |
| CC-10 | Charts & Visualization | 3 | `COMPLETE` | `NOT_STARTED` | 8 | 0 | -1900 | `workstreams/CC-10-charts-visualization.md` |
| CC-11 | Styling Tokens & Tailwind | 3 | `COMPLETE` | `NOT_STARTED` | 9 | 0 | -300 | `workstreams/CC-11-styling-tokens.md` |
| CC-12 | TypeScript Strictness | 1→∞ | `COMPLETE` | `IN_PROGRESS` | 11 | 4 | -300 | `workstreams/CC-12-typescript-strictness.md` |
| CC-13 | Lint, Conventions & Naming | 1/4 | `COMPLETE` | `IN_PROGRESS` | 9 | 3 | -125 | `workstreams/CC-13-lint-conventions-naming.md` |
| CC-14 | Test Suite Consolidation | 5 | `COMPLETE` | `NOT_STARTED` | 7 | 0 | -4750 | `workstreams/CC-14-test-suite.md` |
| CC-15 | Database Access Patterns | 2 | `COMPLETE` | `COMPLETE` | 10 | 10 | +820 | `workstreams/CC-15-database-access.md` |
| CC-16 | Build, Scripts, Config & Repo Hygiene | 5 | `COMPLETE` | `NOT_STARTED` | 11 | 0 | -1450 | `workstreams/CC-16-build-scripts-hygiene.md` |
| CC-17 | Architecture Docs & Module Boundaries | 5 | `COMPLETE` | `NOT_STARTED` | 8 | 0 | -80 | `workstreams/CC-17-architecture-boundaries.md` |
| CC-18 | Hard-Coded Values, Magic Numbers & Literal Strings | 1/2/3 | `COMPLETE` | `IN_PROGRESS` | 14 | 7 | -750 | `workstreams/CC-18-hard-coded-values.md` |

Status values: `NOT_STARTED` | `IN_PROGRESS` | `COMPLETE` | `BLOCKED`

---

## 2. Metrics Ratchet (Audited Baseline Snapshot, 2026-11-01)

| Metric | Master Plan Estimate | Audited Exact Baseline | Current (Wave 0 Landed) | Target |
| :--- | ---: | ---: | ---: | ---: |
| App LOC (app+components+lib) | 162,921 | 162,921 | 161,088 | ≤ 140,000 |
| Files > 1,000 lines | 33 | 33 (49,892 LOC) | 33 (50,505 LOC) | ≤ 8 |
| Raw `fetch(` hits | 386 | 405 (113 files) | 365 (86 files) | server-side only |
| `useQuery`/`useMutation` hits | 13 | 13 (9 useQuery, 4 useMutation) | 13 (8 files) | ↑ |
| Inline `queryKey: ['` | 53 | 54 | 53 (22 files) | 0 |
| Routes with direct `await auth()` | 139 | 139 | 135 routes | ≤ 5 |
| Files using `NextResponse.json` | 124 | 124 | 122 files | ≤ 5 |
| `fixed inset-0` outside `components/ui` | ~15 files | 15 files (20 call sites) | 20 (15 files) | 0 |
| `<Loader2` direct | 28 files | 28 files | 64 (25 files) | 0 (outside ui) |
| Local formatter re-definitions | ~15 | 28 sites across 21 files | 28 sites | 0 |
| `.toFixed(` | 129 | 129 | 129 | ≤ 20 (non-UI math only) |
| `Intl.NumberFormat` outside format.ts | 32 | 32 | 25 (16 files) | 0 |
| `any` in production (app+components+lib) | 876 | 960 (1,709 repo-wide) | 949 (196 files) | ≤ 150 |
| Hex literals in TSX/TS | 381 | 410 (58 files) | 379 (54 files) | ≤ 40 (palette sources only) |
| `text-[Npx]` | 1,151 | 1,165 (126 files) | 1,152 (122 files) | ≤ 100 |
| `style={{` | 295 | 295 (63 static) | 286 (89 files) | ≤ 80 (dynamic values only) |
| Direct `localStorage` | 34 | 34 (14 files) | 37 (14 files) | ≤ 3 (inside hooks) |
| `console.*` in app/components/lib | 146 | 146 | 134 (57 files) | 0 |
| `process.env.` outside env module | 70 | 87 reads (33 files) | 87 (33 files) | 0 |
| PascalCase component filenames | 59 | 59 (+1 camelCase) | 58 | 0 |
| Zero-import modules | 21 | 16 verified dead (1,889 LOC) | 0 (all 16 deleted) | 0 |
| Hard-coded `'/api/` paths outside `routes.ts` | 421 | 420 (106 files) | 415 (102 files) | 0 |
| Duration literals `N * 60 * 1000` | 114 | 124 (58 files) | 83 (44 files) | 0 |
| Hard-coded external URLs outside registry | 20 | 32 runtime URLs | 32 runtime URLs | 0 |
| Literal HTTP status codes in routes | 649 | 665 (146 routes) | 665 (146 routes) | 0 |
| Inline route error strings | 271 | 567 strings | 567 strings | 0 |

---

## 3. File Locks (CC-07 decomposition / mass edits)
| File | Locked by | Since | Notes |
| :--- | :--- | :--- | :--- |

---

## 4. Escalations, Divergences & Cross-Workstream Handoffs
| Date | Source | Target | Finding | Description | Status |
| :--- | :---: | :---: | :---: | :--- | :---: |
| 2026-11-01 | CC-06 | User | `CC-06-F01` | Account Taxonomy `GROUP_ORDER`: `components/.../account-types.ts` has phantom `'Savings'` and lacks `'Assets'`, causing unstable sorting in account hierarchy tree vs sidebar. Standardize to include `'Assets'` (BEHAVIOR-VISIBLE). | `APPROVED` |
| 2026-11-01 | CC-01 | User | `CC-01-F06` | 13 uncalled orphan API routes identified (1,123 LOC). Approval requested to delete or retain as deprecated aliases (BEHAVIOR-VISIBLE). | `APPROVED` |
| 2026-11-01 | CC-01 | User | `CC-01-F07` | Abandoned dev-only page `app/dev/defaults/page.tsx` (421 LOC). Approval requested to delete (BEHAVIOR-VISIBLE). | `APPROVED` |
| 2026-11-01 | CC-04 | User | `CC-04-F08` | 6 synchronous `window.confirm()` popups across 3 files. Request sign-off to migrate to asynchronous `ConfirmDeleteDialog` / `AlertDialog` (BEHAVIOR-VISIBLE). | `APPROVED` |
| 2026-11-01 | CC-02 | User / CC-03 | `CC-02-F02` | API error envelope standardization: Standardize on `{ error, message, details? }` to satisfy both `res.error` and `res.message` readers simultaneously without breaking clients. | `APPROVED` |
| 2026-11-01 | CC-09 | CC-15 / WS-08 | `CC-09-F02` | Signout cache purge in `lib/query-client.tsx` only matches `finance-*` and misses all `finance:*` keys (`compactView`, tab selections), leaving local state on shared devices. | `HANDOFF` |
| 2026-11-01 | CC-08 | User | `CC-08-F11` | Package `server-only` is not installed (0 occurrences). Approval requested to add `server-only` to dependencies. | `APPROVED` |
| 2026-11-01 | CC-18 | WS-02 | `CC-18-F08` | Financial default divergence: 6.0% vs 7.0% growth rate and 0.04 SWR fallback between `financial-logic/page.tsx` and `retirement-engine.ts`. Keep explicitly named variants until WS-02 issues guidance. | `HANDOFF` |
| 2026-11-01 | CC-05 | WS-01 | `CC-05-F03` | `lib/advice/redact.ts` shadows `formatPercent` with 1-decimal rate vs 2-decimal signed delta. Preserve via explicit `trimZero` parameter. | `HANDOFF` |
| 2026-11-01 | CC-16 | User | `CC-16-F04` | Port number discrepancy (dev 3001, compose 3001:3000, start 3000). Keep ports unchanged and document in README.md. | `RESOLVED` |
| 2026-11-01 | CC-17 | CC-08 / CC-06 | `CC-17-F01` | 6 circular dependency cycles (42 files) identified via Tarjan SCC analysis, including service importing API route (`paystub-auto-generate.ts` -> `app/api/paystubs/route.ts`). | `HANDOFF` |

---

## 5. Approved Dev-Tooling Additions
| Package | Purpose | Approved by user? |
| :--- | :--- | :---: |
| `typescript-eslint`, `eslint-plugin-react-hooks`, `@next/eslint-plugin-next`, `eslint-plugin-simple-import-sort` | Real TS/TSX AST linting (CC-13) | ☑ |
| `knip` | Unused files/exports/deps (CC-01) | ☑ |
| `jscpd` | Copy-paste detection (CC-00) | ☑ |
| `server-only` | Enforce server/client module boundary (CC-08, CC-13, CC-17) | ☑ |


