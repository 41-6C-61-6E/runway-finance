-- Add simplefin_sync_logs table
CREATE TABLE IF NOT EXISTS simplefin_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES simplefin_connections(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  transaction_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add index on connection_id for faster queries
CREATE INDEX IF NOT EXISTS idx_simplefin_sync_logs_connection_id ON simplefin_sync_logs(connection_id);