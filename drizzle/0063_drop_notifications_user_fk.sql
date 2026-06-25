-- push_subscriptions, sent_notifications, and custom_alert_rules were created with
-- REFERENCES "user"(id), but the app uses the "users" table username as the user
-- identifier and never populates the "user" table. Drop the FKs so push
-- subscriptions, sent notifications, and custom alerts work.
ALTER TABLE "push_subscriptions" DROP CONSTRAINT IF EXISTS "push_subscriptions_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "sent_notifications" DROP CONSTRAINT IF EXISTS "sent_notifications_user_id_user_id_fk";--> statement-breakpoint
ALTER TABLE "custom_alert_rules" DROP CONSTRAINT IF EXISTS "custom_alert_rules_user_id_user_id_fk";
