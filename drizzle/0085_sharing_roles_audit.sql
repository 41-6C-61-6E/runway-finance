ALTER TABLE "account_share_members" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;

CREATE TABLE IF NOT EXISTS "share_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"data_user_id" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"action" text NOT NULL,
	"target_table" text,
	"target_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "share_audit_log_data_user_idx" ON "share_audit_log" ("data_user_id", "created_at");
