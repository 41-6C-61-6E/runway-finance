-- Add index on user_id for custom_alert_rules to prevent full-table scans during sync
CREATE INDEX IF NOT EXISTS "custom_alert_rules_user_id_idx" ON "custom_alert_rules" ("user_id");
