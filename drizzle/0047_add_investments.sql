CREATE TABLE "investment_holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"ticker" text NOT NULL,
	"shares" numeric NOT NULL,
	"cost_basis" numeric NOT NULL,
	"purchase_date" date,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"ticker" text NOT NULL,
	"type" text NOT NULL,
	"shares" numeric NOT NULL,
	"price_per_share" numeric NOT NULL,
	"commission" numeric DEFAULT '0',
	"transaction_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_price_history" (
	"ticker" text NOT NULL,
	"price_date" date NOT NULL,
	"close_price" numeric NOT NULL,
	CONSTRAINT "security_price_history_ticker_price_date_unique" UNIQUE("ticker","price_date")
);
--> statement-breakpoint
CREATE TABLE "security_prices" (
	"ticker" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"current_price" numeric NOT NULL,
	"daily_change" numeric,
	"daily_change_percent" numeric,
	"sector" text,
	"asset_class" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "investment_holdings" ADD CONSTRAINT "investment_holdings_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "investment_transactions" ADD CONSTRAINT "investment_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "security_price_history" ADD CONSTRAINT "security_price_history_ticker_security_prices_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."security_prices"("ticker") ON DELETE cascade ON UPDATE no action;