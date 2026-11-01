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

# Find files with hardcoded asset type arrays (supporting single-line and multi-line array declarations)
ASSET_PATTERN='\[[^\]]*?[\x27"]checking[\x27"][^\]]*?[\x27"]savings[\x27"][^\]]*?[\x27"]investment[\x27"][^\]]*?[\x27"]brokerage[\x27"][^\]]*?[\x27"]retirement[\x27"][^\]]*?\]'
LIABILITY_PATTERN='\[[^\]]*?[\x27"]credit[\x27"][^\]]*?[\x27"]loan[\x27"][^\]]*?[\x27"]mortgage[\x27"][^\]]*?\]'

matches_pattern() {
  local pattern="$1"
  local file="$2"
  perl -0777 -ne "exit(0) if /$pattern/s; exit(1)" "$file" 2>/dev/null
}

while IFS= read -r file; do
  # Skip the source of truth definition itself and tests
  case "$file" in
    */lib/utils/account-scope.ts|*/tests/*|*/scripts/*) continue ;;
  esac

  # Check if the file has a hardcoded asset/liability list
  if matches_pattern "$ASSET_PATTERN" "$file"; then
    # Make sure it's importing from account-scope
    if ! grep -qE "from.*account-scope" "$file" 2>/dev/null; then
      echo "❌ $file has hardcoded asset type list without importing from account-scope"
      HAS_ERROR=1
    fi
  fi
  if matches_pattern "$LIABILITY_PATTERN" "$file"; then
    if ! grep -qE "from.*account-scope" "$file" 2>/dev/null; then
      echo "❌ $file has hardcoded liability type list without importing from account-scope"
      HAS_ERROR=1
    fi
  fi
done < <(find "$ROOT" \( -name '*.tsx' -o -name '*.ts' \) \
  ! -path '*/node_modules/*' \
  ! -path '*/dist/*' \
  ! -path '*/.next/*' \
  ! -path '*/drizzle/*')

echo "✅ Checking for deprecated asset-calculations references..."
if find "$ROOT" \( -name '*.ts' -o -name '*.tsx' \) \
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
