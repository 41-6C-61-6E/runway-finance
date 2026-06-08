-- Custom SQL migration file, put your code below! --
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS cardless_mode boolean DEFAULT false NOT NULL;
