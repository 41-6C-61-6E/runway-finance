#!/usr/bin/env bash
set -e

DATABASE_URL=${DATABASE_URL:-"postgresql://postgres:l45606393b@localhost:5432/runway_finance_test"}
ENCRYPTION_KEY=${ENCRYPTION_KEY:-"f0d03d94e8cd8cf388a681b5c5d3eb741258699d58680af3ab9468dc6ff429a2"}

echo "[Integration Tests] Running migrations on $DATABASE_URL..."
DATABASE_URL="$DATABASE_URL" ENCRYPTION_KEY="$ENCRYPTION_KEY" pnpm vitest run --config vitest.integration.config.ts
