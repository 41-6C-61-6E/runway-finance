CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"balance" numeric(20, 4) DEFAULT '0' NOT NULL,
	"balance_date" timestamp with time zone,
	"type" text NOT NULL,
	"institution" text,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"is_excluded_from_net_worth" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_connection_id_external_id_unique" UNIQUE("connection_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"icon" text,
	"is_income" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"exclude_from_reports" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"condition_field" text NOT NULL,
	"condition_operator" text NOT NULL,
	"condition_value" text NOT NULL,
	"condition_case_sensitive" boolean DEFAULT false NOT NULL,
	"set_category_id" uuid,
	"set_payee" text,
	"set_reviewed" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fire_scenarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text DEFAULT 'Primary Scenario' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"current_age" integer,
	"target_age" integer,
	"target_annual_expenses" numeric(20, 4),
	"current_investable_assets" numeric(20, 4),
	"annual_contributions" numeric(20, 4),
	"expected_return_rate" numeric(6, 4) DEFAULT '0.07',
	"inflation_rate" numeric(6, 4) DEFAULT '0.03',
	"safe_withdrawal_rate" numeric(6, 4) DEFAULT '0.04',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_asset_value_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"value" numeric(20, 4) NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "manual_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"asset_type" text NOT NULL,
	"is_liability" boolean DEFAULT false NOT NULL,
	"value" numeric(20, 4) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"institution" text,
	"notes" text,
	"is_excluded_from_net_worth" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "net_worth_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"snapshot_date" date NOT NULL,
	"total_assets" numeric(20, 4) NOT NULL,
	"total_liabilities" numeric(20, 4) NOT NULL,
	"net_worth" numeric(20, 4) NOT NULL,
	"breakdown" jsonb NOT NULL,
	CONSTRAINT "net_worth_snapshots_user_id_snapshot_date_unique" UNIQUE("user_id","snapshot_date")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_addr" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "simplefin_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"access_url_encrypted" text NOT NULL,
	"access_url_iv" text NOT NULL,
	"access_url_tag" text NOT NULL,
	"label" text DEFAULT 'Primary' NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" text DEFAULT 'pending' NOT NULL,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"connection_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text NOT NULL,
	"accounts_synced" integer DEFAULT 0 NOT NULL,
	"transactions_fetched" integer DEFAULT 0 NOT NULL,
	"transactions_new" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"date" date NOT NULL,
	"posted_date" date,
	"amount" numeric(20, 4) NOT NULL,
	"description" text NOT NULL,
	"payee" text,
	"memo" text,
	"pending" boolean DEFAULT false NOT NULL,
	"category_id" uuid,
	"notes" text,
	"reviewed" boolean DEFAULT false NOT NULL,
	"ignored" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_account_id_external_id_unique" UNIQUE("account_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" timestamp with time zone,
	"image" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"locale" text DEFAULT 'en-US' NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"theme" text DEFAULT 'dark' NOT NULL,
	"accent_color" text DEFAULT 'indigo' NOT NULL,
	"compact_mode" boolean DEFAULT false NOT NULL,
	"date_format" text DEFAULT 'MM/DD/YYYY' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_connection_id_simplefin_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."simplefin_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_set_category_id_categories_id_fk" FOREIGN KEY ("set_category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_asset_value_history" ADD CONSTRAINT "manual_asset_value_history_asset_id_manual_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."manual_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_connection_id_simplefin_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."simplefin_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;