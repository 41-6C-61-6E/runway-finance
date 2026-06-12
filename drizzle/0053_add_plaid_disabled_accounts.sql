ALTER TABLE "plaid_connections" ADD COLUMN IF NOT EXISTS "disabled_accounts" jsonb DEFAULT '[]'::jsonb;
