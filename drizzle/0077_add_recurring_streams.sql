CREATE TABLE IF NOT EXISTS "recurring_streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid REFERENCES "accounts"("id") ON DELETE cascade,
	"category_id" uuid REFERENCES "categories"("id") ON DELETE set null,
	"name" text NOT NULL,
	"payee" text,
	"amount" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"type" text DEFAULT 'subscription' NOT NULL,
	"frequency" text DEFAULT 'monthly' NOT NULL,
	"interval_days" integer,
	"anchor_date" date NOT NULL,
	"next_expected_date" date NOT NULL,
	"is_auto_detected" boolean DEFAULT true NOT NULL,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"confidence" integer DEFAULT 100 NOT NULL,
	"is_variable_amount" boolean DEFAULT false NOT NULL,
	"average_amount" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_recurring_streams_user_id" ON "recurring_streams" ("user_id");
