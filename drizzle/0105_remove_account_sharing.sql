DROP TABLE IF EXISTS "account_share_members" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "account_sharing_invitations" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "dek_version_wraps" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "dek_versions" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "share_audit_log" CASCADE;--> statement-breakpoint
ALTER TABLE "user_encryption_keys" DROP COLUMN IF EXISTS "primary_user_id";--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "sensitive";

