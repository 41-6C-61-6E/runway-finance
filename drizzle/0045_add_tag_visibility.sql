ALTER TABLE "user_settings" ADD COLUMN "account_tag_visibility" jsonb DEFAULT '{"sidebar":true,"transactions":true,"legend":true,"budgets":true,"forecast":true,"suggestions":true}';
