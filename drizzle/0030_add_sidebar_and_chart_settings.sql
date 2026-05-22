-- Custom SQL migration file, put your code below! --
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS hide_accounts_sidebar_by_default boolean DEFAULT false NOT NULL;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS chart_selections jsonb DEFAULT '{}'::jsonb;