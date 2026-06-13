ALTER TABLE "import_log" ADD COLUMN "file_content" text;--> statement-breakpoint
ALTER TABLE "plaid_connections" ADD COLUMN "disabled_accounts" jsonb DEFAULT '[]'::jsonb;