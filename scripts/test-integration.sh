#!/usr/bin/env bash
set -e

DATABASE_URL=${DATABASE_URL:-"postgresql://postgres:***REMOVED-POSTGRES_PASSWORD***@localhost:5432/runway_finance_test"}
ENCRYPTION_KEY=${ENCRYPTION_KEY:-"***REMOVED-ENCRYPTION_KEY***"}

echo "[Integration Tests] Running migrations on $DATABASE_URL..."
DATABASE_URL="$DATABASE_URL" ENCRYPTION_KEY="$ENCRYPTION_KEY" pnpm vitest run --config vitest.integration.config.ts
