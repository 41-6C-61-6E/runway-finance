CREATE TABLE IF NOT EXISTS plaid_connections (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "access_token_encrypted" text NOT NULL,
    "access_token_iv" text NOT NULL DEFAULT '',
    "access_token_tag" text NOT NULL DEFAULT '',
    "item_id" text NOT NULL,
    "institution_id" text,
    "institution_name" text,
    "cursor" text,
    "label" text NOT NULL DEFAULT 'Plaid Connection',
    "sync_frequency" text NOT NULL DEFAULT 'manual',
    "last_sync_at" timestamp with time zone,
    "last_sync_status" text NOT NULL DEFAULT 'pending',
    "last_sync_error" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS plaid_connection_id uuid REFERENCES plaid_connections(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE accounts ADD CONSTRAINT accounts_plaid_connection_id_external_id_unique UNIQUE (plaid_connection_id, external_id);
--> statement-breakpoint
ALTER TABLE sync_logs ADD COLUMN IF NOT EXISTS plaid_connection_id uuid REFERENCES plaid_connections(id) ON DELETE SET NULL;
