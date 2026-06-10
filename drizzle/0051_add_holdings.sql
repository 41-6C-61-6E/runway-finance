CREATE TABLE IF NOT EXISTS holdings (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "account_id" uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    "security_id" text NOT NULL,
    "ticker" text,
    "name" text,
    "quantity" text NOT NULL,
    "price" text NOT NULL,
    "cost_basis" text,
    "value" text NOT NULL,
    "currency" text NOT NULL DEFAULT 'USD',
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT holdings_account_id_security_id_unique UNIQUE (account_id, security_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS holding_snapshots (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "account_id" uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    "snapshot_date" date NOT NULL,
    "security_id" text NOT NULL,
    "ticker" text,
    "name" text,
    "quantity" text NOT NULL,
    "price" text NOT NULL,
    "value" text NOT NULL,
    "cost_basis" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT holding_snapshots_user_id_account_id_security_id_snapshot_date_unique UNIQUE (user_id, account_id, security_id, snapshot_date)
);
