ALTER TABLE "user_settings" ADD COLUMN "ai_ask_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "ai_ask_model" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "ai_ask_include_account_names" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "ai_ask_consent_host" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "ai_ask_consent_at" timestamp with time zone;