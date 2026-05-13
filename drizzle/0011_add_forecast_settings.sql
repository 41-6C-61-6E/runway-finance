-- Add forecast configuration columns to user_settings
ALTER TABLE user_settings ADD COLUMN forecast_mode text NOT NULL DEFAULT 'hybrid';
ALTER TABLE user_settings ADD COLUMN forecast_lookback_months integer NOT NULL DEFAULT 3;
