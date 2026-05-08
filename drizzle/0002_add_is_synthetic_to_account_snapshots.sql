-- Add is_synthetic column to account_snapshots for tracking calculated balances
ALTER TABLE "account_snapshots" ADD COLUMN "is_synthetic" boolean NOT NULL DEFAULT false;

-- Backfill existing rows to be non-synthetic (they came from SimpleFIN)
UPDATE "account_snapshots" SET "is_synthetic" = false WHERE "is_synthetic" IS NULL;
