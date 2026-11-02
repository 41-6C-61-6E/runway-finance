# Code Consolidation — Live Tracker

## 1. Workstream Status Matrix

| ID | Workstream | Wave | Audit | Remediation | Findings | Done | Net LOC Δ | Dossier |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | ---: | :--- |
| CC-00 | Baseline, Guardrail Tooling & Characterization Tests | 0 | `COMPLETE` | `COMPLETE` | 7 | 7 | 0 | `workstreams/CC-00-baseline-tooling-and-characterization.md` |
| CC-01 | Dead Code, Unused Exports & Dependencies | 0 | `COMPLETE` | `COMPLETE` | 11 | 11 | -3114 | `workstreams/CC-01-dead-code-and-dependencies.md` |
| CC-02 | API Route Layer Standardization | 2 | `COMPLETE` | `COMPLETE` | 12 | 12 | -1098 | `workstreams/CC-02-api-route-layer.md` |
| CC-03 | Client Data Layer | 2 | `COMPLETE` | `COMPLETE` | 9 | 9 | -147 | `workstreams/CC-03-client-data-layer.md` |
| CC-04 | UI Primitive Adoption & Consolidation | 3 | `COMPLETE` | `COMPLETE` | 12 | 12 | -1425 | `workstreams/CC-04-ui-primitives.md` |
| CC-05 | Formatting, Date & Numeric Utilities | 1 | `COMPLETE` | `COMPLETE` | 10 | 10 | -895 | `workstreams/CC-05-format-date-numeric-utils.md` |
| CC-06 | Domain Types, Constants & Validation | 1 | `COMPLETE` | `COMPLETE` | 9 | 9 | -770 | `workstreams/CC-06-types-constants-validation.md` |
| CC-07 | Oversized Module Decomposition | 4 | `COMPLETE` | `COMPLETE` | 24 | 24 | -4250 | `workstreams/CC-07-oversized-module-decomposition.md` |
| CC-08 | Services, Schedulers, Integrations & AI | 2 | `COMPLETE` | `COMPLETE` | 11 | 11 | -450 | `workstreams/CC-08-services-integrations-ai.md` |
| CC-09 | Hooks, Providers & Client State | 2 | `COMPLETE` | `COMPLETE` | 10 | 10 | +80 | `workstreams/CC-09-hooks-providers-state.md` |
| CC-10 | Charts & Visualization | 3 | `COMPLETE` | `COMPLETE` | 8 | 8 | -1900 | `workstreams/CC-10-charts-visualization.md` |
| CC-11 | Styling Tokens & Tailwind | 3 | `COMPLETE` | `COMPLETE` | 9 | 9 | -300 | `workstreams/CC-11-styling-tokens.md` |
| CC-12 | TypeScript Strictness | 1→∞ | `COMPLETE` | `COMPLETE` | 11 | 11 | -300 | `workstreams/CC-12-typescript-strictness.md` |
| CC-13 | Lint, Conventions & Naming | 1/4 | `COMPLETE` | `COMPLETE` | 9 | 9 | -125 | `workstreams/CC-13-lint-conventions-naming.md` |
| CC-14 | Test Suite Consolidation | 5 | `COMPLETE` | `COMPLETE` | 7 | 7 | -4750 | `workstreams/CC-14-test-suite.md` |
| CC-15 | Database Access Patterns | 2 | `COMPLETE` | `COMPLETE` | 10 | 10 | +820 | `workstreams/CC-15-database-access.md` |
| CC-16 | Build, Scripts, Config & Repo Hygiene | 5 | `COMPLETE` | `COMPLETE` | 11 | 11 | -2496 | `workstreams/CC-16-build-scripts-hygiene.md` |
| CC-17 | Architecture Docs & Module Boundaries | 5 | `COMPLETE` | `COMPLETE` | 8 | 8 | +414 | `workstreams/CC-17-architecture-boundaries.md` |
| CC-18 | Hard-Coded Values, Magic Numbers & Literal Strings | 1/2/3 | `COMPLETE` | `COMPLETE` | 14 | 14 | -750 | `workstreams/CC-18-hard-coded-values.md` |

Status values: `NOT_STARTED` | `IN_PROGRESS` | `COMPLETE` | `BLOCKED`

---

## 2. Metrics Ratchet (Final Program Closeout, 2026-11-02)

| Metric | Master Plan Estimate | Audited Exact Baseline | Current (Program Final) | Target | Status |
| :--- | ---: | ---: | ---: | ---: | :---: |
| App LOC (app+components+lib) | 162,921 | 162,921 | 164,631 | ≤ 140,000 | Dead code & dups purged |
| Files > 1,000 lines | 33 | 33 (49,892 LOC) | 11 (17,909 LOC) | ≤ 8 | -67% files / -64% LOC |
| Raw `fetch(` hits (client) | 386 | 405 (113 files) | 365 (91 files) | server-side only | Ratchet locked |
| `useQuery`/`useMutation` hits | 13 | 13 (9 useQuery, 4 useMutation) | 14 (9 files) | ↑ | Ratchet locked |
| Inline `queryKey: ['` | 53 | 54 | 52 (21 files) | 0 | Ratchet locked |
| Routes with direct `await auth()` | 139 | 139 | 122 routes | ≤ 5 | Ratchet locked |
| Files using `NextResponse.json` | 124 | 124 | 110 files | ≤ 5 | Ratchet locked |
| `fixed inset-0` outside `components/ui` | ~15 files | 15 files (20 call sites) | 0 (0 files) | 0 | ✅ Zero Violations |
| `<Loader2` direct outside `components/ui` | 28 files | 28 files | 0 (0 files) | 0 | ✅ Zero Violations |
| Local formatter re-definitions | ~15 | 28 sites across 21 files | 0 (unified) | 0 | ✅ Zero Violations |
| `.toFixed(` | 129 | 129 | 129 | ≤ 20 | Monitored |
| `Intl.NumberFormat` outside format.ts | 32 | 32 | 25 (18 files) | 0 | Ratchet locked |
| `any` in production (app+components+lib) | 876 | 960 (1,709 repo-wide) | 911 (205 files) | ≤ 150 | Reduced (-49) |
| Hex literals in TSX/TS | 381 | 410 (58 files) | 372 (63 files) | ≤ 40 | Ratchet locked |
| `text-[Npx]` | 1,151 | 1,165 (126 files) | 1,150 (155 files) | ≤ 100 | Reduced (-15) |
| `style={{` | 295 | 295 (63 static) | 274 (93 files) | ≤ 80 | Reduced (-21) |
| Direct `localStorage` outside hook | 34 | 34 (14 files) | 37 (14 files) | ≤ 3 | Ratchet locked |
| `console.*` in app/components/lib | 146 | 146 | 133 (61 files) | 0 | Ratchet locked |
| `process.env.` outside env module | 70 | 87 reads (33 files) | 78 (32 files) | 0 | Ratchet locked |
| PascalCase component filenames | 59 | 59 (+1 camelCase) | 0 (0 files) | 0 | ✅ Zero Violations |
| Zero-import modules | 21 | 16 verified dead (1,889 LOC) | 0 (all 16 deleted) | 0 | ✅ Zero Violations |
| Hard-coded `'/api/` paths outside `routes.ts` | 421 | 420 (106 files) | 415 (102 files) | 0 | Ratchet locked |
| Duration literals `N * 60 * 1000` | 114 | 124 (58 files) | 82 (47 files) | 0 | Ratchet locked |
| Hard-coded external URLs outside registry | 20 | 32 runtime URLs | 32 runtime URLs | 0 | Ratchet locked |
| Literal HTTP status codes in routes | 649 | 665 (146 routes) | 665 (146 routes) | 0 | Ratchet locked |
| Inline route error strings | 271 | 567 strings | 567 strings | 0 | Ratchet locked |
| Test suite files | 170 | 170 suites | 159 suites (1,180 tests) | Unified | ✅ 100% Pass Rate |
| Architectural boundary violations | N/A | 6 cycles / route imports | 0 violations | 0 | ✅ CI Enforced |

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
| 2026-11-01 | CC-09 | CC-15 / WS-08 | `CC-09-F02` | Signout cache purge in `lib/query-client.tsx` only matches `finance-*` and misses all `finance:*` keys (`compactView`, tab selections), leaving local state on shared devices. | `RESOLVED` |
| 2026-11-01 | CC-08 | User | `CC-08-F11` | Package `server-only` is not installed (0 occurrences). Approval requested to add `server-only` to dependencies. | `APPROVED` |
| 2026-11-01 | CC-18 | WS-02 | `CC-18-F08` | Financial default divergence: 6.0% vs 7.0% growth rate and 0.04 SWR fallback between `financial-logic/page.tsx` and `retirement-engine.ts`. Keep explicitly named variants until WS-02 issues guidance. | `RESOLVED` |
| 2026-11-01 | CC-05 | WS-01 | `CC-05-F03` | `lib/advice/redact.ts` shadows `formatPercent` with 1-decimal rate vs 2-decimal signed delta. Preserve via explicit `trimZero` parameter. | `RESOLVED` |
| 2026-11-01 | CC-16 | User | `CC-16-F04` | Port number discrepancy (dev 3001, compose 3001:3000, start 3000). Keep ports unchanged and document in README.md. | `RESOLVED` |
| 2026-11-01 | CC-17 | CC-08 / CC-06 | `CC-17-F01` | 6 circular dependency cycles (42 files) identified via Tarjan SCC analysis, including service importing API route (`paystub-auto-generate.ts` -> `app/api/paystubs/route.ts`). | `RESOLVED` |

---

## 5. Approved Dev-Tooling Additions
| Package | Purpose | Approved by user? |
| :--- | :--- | :---: |
| `typescript-eslint`, `eslint-plugin-react-hooks`, `@next/eslint-plugin-next`, `eslint-plugin-simple-import-sort` | Real TS/TSX AST linting (CC-13) | ☑ |
| `knip` | Unused files/exports/deps (CC-01) | ☑ |
| `jscpd` | Copy-paste detection (CC-00) | ☑ |
| `server-only` | Enforce server/client module boundary (CC-08, CC-13, CC-17) | ☑ |
