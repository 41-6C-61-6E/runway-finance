-- Migration: Add sync frequency to connections table
-- This migration adds the sync_frequency column with a default value of 'manual'
-- to support per-connection sync frequency configuration

-- Add the sync_frequency column with proper default and constraints
ALTER TABLE IF EXISTS simplefin_connections 
ADD COLUMN IF NOT EXISTS sync_frequency TEXT NOT NULL DEFAULT 'manual';

-- Add a comment to describe what the column represents
COMMENT ON COLUMN simplefin_connections.sync_frequency IS 'How often to sync this connection: manual, daily, weekly, monthly';