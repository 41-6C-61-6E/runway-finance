CREATE TABLE IF NOT EXISTS "dek_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"primary_user_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"dek_wrapped_server" text NOT NULL,
	"wrapping_iv" text NOT NULL,
	"wrapping_tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "dek_versions_primary_version_idx" ON "dek_versions" ("primary_user_id", "version");

CREATE TABLE IF NOT EXISTS "dek_version_wraps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_id" uuid NOT NULL REFERENCES "dek_versions"("id") ON DELETE CASCADE,
	"member_user_id" text NOT NULL,
	"wrapped_dek" text NOT NULL,
	"wrapping_iv" text NOT NULL,
	"wrapping_tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dek_version_wraps_version_member_unique" UNIQUE ("version_id", "member_user_id")
);
CREATE INDEX IF NOT EXISTS "dek_version_wraps_member_idx" ON "dek_version_wraps" ("member_user_id");
