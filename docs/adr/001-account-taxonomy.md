# ADR 001: Unified Account Taxonomy and Canonical Group Order

## Status
Accepted

## Context
Multiple disparate account taxonomy definitions, grouping orders, and icon mappings existed across client and server components. Certain views omitted or misclassified manual and real estate assets.

## Decision
1. Standardize account grouping into canonical `GROUP_ORDER`:
   `['Cash', 'Investments', 'Assets', 'Credit Cards', 'Loans']`
2. All asset subtypes (`real_estate`, `vehicle`, `asset`, `precious_metal`, etc.) belong to the `'Assets'` group.
3. Centralize type definitions in `lib/constants/account-types.ts` and `lib/types/account.ts`.

## Consequences
Consistent net worth rollups, predictable ordering in overview grids and hierarchy trees, and zero divergence across financial review audits.

