-- Create import_log table
CREATE TABLE IF NOT EXISTS import_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  file_name text NOT NULL,
  import_type text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  records_imported integer NOT NULL DEFAULT 0,
  records_skipped integer NOT NULL DEFAULT 0,
  records_errored integer NOT NULL DEFAULT 0,
  column_mapping jsonb,
  account_mapping jsonb,
  category_mapping jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add import tracking to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_imported boolean DEFAULT false NOT NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES import_log(id) ON DELETE SET NULL;

-- Add import tracking to account_snapshots
ALTER TABLE account_snapshots ADD COLUMN IF NOT EXISTS is_imported boolean DEFAULT false NOT NULL;
ALTER TABLE account_snapshots ADD COLUMN IF NOT EXISTS import_id uuid REFERENCES import_log(id) ON DELETE SET NULL;

-- Add showImportedData to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS show_imported_data jsonb DEFAULT '{"global": true, "netWorth": true, "realEstate": true, "cashFlowProjections": true}'::jsonb;
