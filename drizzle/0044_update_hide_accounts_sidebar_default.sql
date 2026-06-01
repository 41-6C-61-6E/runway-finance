-- Custom SQL migration file --
ALTER TABLE user_settings ALTER COLUMN hide_accounts_sidebar_by_default SET DEFAULT true;
UPDATE user_settings SET hide_accounts_sidebar_by_default = true;
