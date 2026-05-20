#!/usr/bin/env bash
set -euo pipefail

# Check for hardcoded asset/liability type lists in frontend components
# that should be importing from lib/utils/account-scope instead.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HAS_ERROR=0

echo "🔍 Checking financial type consistency..."

# Pattern: look for any file that has a hardcoded array of account types
# that isn't importing from account-scope.
# This catches patterns like:
#   const ASSET_TYPES = ['checking', 'savings', ...]
#   const LIABILITY_TYPES = ['credit', ...]

# Find files with hardcoded asset type arrays
ASSET_PATTERN="['\"]checking['\"].*['\"]savings['\"].*['\"]investment['\"].*['\"]brokerage['\"].*['\"]retirement['\"]"
LIABILITY_PATTERN="['\"]credit['\"].*['\"]loan['\"].*['\"]mortgage['\"]"

while IFS= read -r file; do
  # Check if the file has a hardcoded asset/liability list
  if grep -qE "$ASSET_PATTERN" "$file" 2>/dev/null; then
    # Make sure it's importing from account-scope
    if ! grep -qE "from.*account-scope" "$file" 2>/dev/null; then
      echo "❌ $file has hardcoded asset type list without importing from account-scope"
      HAS_ERROR=1
    fi
  fi
  if grep -qE "$LIABILITY_PATTERN" "$file" 2>/dev/null; then
    if ! grep -qE "from.*account-scope" "$file" 2>/dev/null; then
      echo "❌ $file has hardcoded liability type list without importing from account-scope"
      HAS_ERROR=1
    fi
  fi
done < <(find "$ROOT" -name '*.tsx' -o -name '*.ts' \
  ! -path '*/node_modules/*' \
  ! -path '*/dist/*' \
  ! -path '*/.next/*' \
  ! -path '*/drizzle/*')

echo "✅ Checking for deprecated asset-calculations references..."
if find "$ROOT" -name '*.ts' -o -name '*.tsx' \
  ! -path '*/node_modules/*' \
  ! -path '*/dist/*' \
  ! -path '*/.next/*' | xargs grep -l 'asset-calculations' 2>/dev/null; then
  echo "❌ Found references to deprecated asset-calculations.ts"
  HAS_ERROR=1
fi

if [ "$HAS_ERROR" -eq 0 ]; then
  echo "✅ All checks passed!"
fi

exit $HAS_ERROR
