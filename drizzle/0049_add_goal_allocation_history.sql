-- Create goal_allocation_history table for tracking allocation changes over time
CREATE TABLE IF NOT EXISTS goal_allocation_history (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "goal_id" uuid NOT NULL REFERENCES financial_goals(id) ON DELETE CASCADE,
    "account_id" uuid NOT NULL REFERENCES accounts(id) ON DELETE SET NULL,
    "snapshot_date" date NOT NULL DEFAULT CURRENT_DATE,
    "account_balance" numeric(20, 4) NOT NULL,
    "allocated_amount" numeric(20, 4) NOT NULL DEFAULT '0',
    "desired_amount" numeric(20, 4) NOT NULL DEFAULT '0',
    "percentage" numeric(5, 2) NOT NULL DEFAULT '100',
    "priority" integer NOT NULL DEFAULT 0,
    "sort_order" integer NOT NULL DEFAULT 0,
    "is_underfunded" boolean NOT NULL DEFAULT false,
    "remaining_on_account" numeric(20, 4) NOT NULL DEFAULT '0',
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS goal_allocation_history_user_id_goal_id_idx ON goal_allocation_history(user_id, goal_id);
CREATE INDEX IF NOT EXISTS goal_allocation_history_snapshot_date_idx ON goal_allocation_history(snapshot_date);
CREATE INDEX IF NOT EXISTS goal_allocation_history_account_id_idx ON goal_allocation_history(account_id);
