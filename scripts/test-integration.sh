#!/usr/bin/env bash
set -e

# L-13 (2026-08-27 security review): DATABASE_URL must come from the
# environment — no hardcoded local test-DB password in the repo.
DATABASE_URL="${DATABASE_URL:?DATABASE_URL must be set for integration tests. Export your local test DB URL, e.g. postgresql://postgres:<strong-password>@localhost:5432/runway_finance_test (see the Integration tests section of the README)}"
# Synthetic test-only key. A real ENCRYPTION_KEY must come from the
# environment (e.g. export ENCRYPTION_KEY=... or a .env file). A real key
# was previously committed here and leaked to git history; a live key must
# never be a fallback default.
ENCRYPTION_KEY=${ENCRYPTION_KEY:-"deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"}

echo "[Integration Tests] Running migrations on $DATABASE_URL..."
DATABASE_URL="$DATABASE_URL" ENCRYPTION_KEY="$ENCRYPTION_KEY" pnpm vitest run --config vitest.integration.config.ts
