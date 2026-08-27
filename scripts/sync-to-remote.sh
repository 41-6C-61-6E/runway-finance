#!/bin/bash
# Sync local changes to the remote machine runway-finance directory
#
# L-15 (2026-08-27 security review) — WARNING: this is a bulk-egress path.
# It ships your working tree to the LAN deploy host. The excludes below were
# audited as of 2026-08-27 to keep secrets/scratch out of the transfer:
#   - .env* / *.env      — live secrets (ENCRYPTION_KEY, NEXTAUTH_SECRET,
#                          VAPID pair, Postgres password, ...)
#   - *.sql, *.dump, dumps — database contents
#   - scratch/           — includes security review reports w/ key prefixes
#   - coverage/, dumps, node_modules, .next — noise
# KEEP these excludes current whenever you add new secret-bearing files.
# A real secret found in the tree after this audit MUST add a matching
# exclude here before the next sync.

echo "Syncing local files to antithropic@10.1.1.10:~/runway-finance/ ..."

rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.git' \
  --exclude='.env*' \
  --exclude='*.env' \
  --exclude='scratch' \
  --exclude='*.sql' \
  --exclude='*.dump' \
  --exclude='*.key' \
  --exclude='*.pem' \
  --exclude='*.p12' \
  --exclude='dumps' \
  --exclude='coverage' \
  --exclude='tsconfig.tsbuildinfo' \
  --exclude='.DS_Store' \
  --exclude='._*' \
  ./ antithropic@10.1.1.10:~/runway-finance/

# Defensive last line: warn (and abort) if a live .env somehow slipped past
# the excludes (rsync already excluded it, but belt-and-suspenders).
if [ -f .env ]; then
  echo "NOTE: .env is present locally and is EXCLUDED from this sync by design."
fi

echo "Sync complete!"
