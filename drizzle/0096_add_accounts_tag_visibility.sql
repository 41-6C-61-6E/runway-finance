ALTER TABLE "user_settings" ALTER COLUMN "account_tag_visibility" SET DEFAULT '{"sidebar":true,"transactions":true,"legend":true,"budgets":true,"forecast":true,"suggestions":true,"accounts":true}';--> statement-breakpoint
UPDATE "user_settings" SET "account_tag_visibility" = "account_tag_visibility" || '{"accounts": true}'::jsonb WHERE NOT ("account_tag_visibility" ? 'accounts');
