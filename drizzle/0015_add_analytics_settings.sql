ALTER TABLE user_settings ADD COLUMN show_synthetic_data JSONB DEFAULT '{"global":true,"netWorth":true,"realEstate":true,"cashFlowProjections":true}'::jsonb;
ALTER TABLE user_settings ADD COLUMN default_chart_time_range TEXT NOT NULL DEFAULT '1y';
ALTER TABLE user_settings ADD COLUMN default_chart_type TEXT NOT NULL DEFAULT 'line';
