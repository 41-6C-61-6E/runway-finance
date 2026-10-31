CREATE TABLE IF NOT EXISTS "equity_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"company_name" text NOT NULL,
	"grant_name" text NOT NULL,
	"grant_type" text DEFAULT 'iso' NOT NULL,
	"grant_date" date NOT NULL,
	"vesting_start_date" date NOT NULL,
	"expiration_date" date,
	"total_shares" text NOT NULL,
	"exercised_shares" text DEFAULT '0' NOT NULL,
	"sold_shares" text DEFAULT '0' NOT NULL,
	"strike_price" text DEFAULT '0' NOT NULL,
	"current_fmv" text DEFAULT '0' NOT NULL,
	"preferred_price" text,
	"valuation_mode" text DEFAULT 'fmv' NOT NULL,
	"vesting_schedule" text NOT NULL,
	"early_exercise_allowed" boolean DEFAULT false NOT NULL,
	"filed_83b" boolean DEFAULT false NOT NULL,
	"early_exercise_date" date,
	"logo_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "equity_grants" ADD CONSTRAINT "equity_grants_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equity_grants_user_id_idx" ON "equity_grants" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "equity_grants_account_id_idx" ON "equity_grants" USING btree ("account_id");

