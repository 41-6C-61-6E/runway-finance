# ADR 005: Strict Kebab-Case File Naming Across All Modules

## Status
Accepted

## Context
The codebase mixed PascalCase filenames (`AccountRow.tsx`, `ConfirmDeleteDialog.tsx`, `NotificationsDropdown.test.tsx`) with kebab-case filenames, causing case-sensitivity issues across macOS/Linux build environments and inconsistent module imports.

## Decision
1. Standardize 100% of filenames in `components/`, `lib/`, `app/`, and `tests/` on lowercase `kebab-case.ts(x)`.
2. Component exports remain PascalCase within their respective files.
3. Enforce zero PascalCase files via ratchet in `scripts/consolidation-ratchet.mjs`.

## Consequences
Eliminates cross-platform file resolution bugs in Linux CI environments and establishes uniform import patterns across the codebase.

