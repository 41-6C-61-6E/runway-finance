-- Per-user encryption infrastructure and column type changes

-- Create user_encryption_keys table
CREATE TABLE IF NOT EXISTS user_encryption_keys (
  user_id TEXT PRIMARY KEY NOT NULL,
  wrapped_dek TEXT NOT NULL,
  wrapping_iv TEXT NOT NULL,
  wrapping_tag TEXT NOT NULL,
  server_wrapped_dek TEXT,
  server_wrapping_iv TEXT,
  server_wrapping_tag TEXT,
  salt TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── accounts ──────────────────────────────────────────────────────────────────
ALTER TABLE accounts ALTER COLUMN balance DROP DEFAULT;
ALTER TABLE accounts ALTER COLUMN balance TYPE TEXT USING balance::text;
ALTER TABLE accounts ALTER COLUMN metadata TYPE TEXT USING metadata::text;

-- ── transactions ──────────────────────────────────────────────────────────────
ALTER TABLE transactions ALTER COLUMN amount DROP DEFAULT;
ALTER TABLE transactions ALTER COLUMN amount TYPE TEXT USING amount::text;

-- ── net_worth_snapshots ──────────────────────────────────────────────────────
ALTER TABLE net_worth_snapshots ALTER COLUMN total_assets DROP DEFAULT;
ALTER TABLE net_worth_snapshots ALTER COLUMN total_assets TYPE TEXT USING total_assets::text;
ALTER TABLE net_worth_snapshots ALTER COLUMN total_liabilities DROP DEFAULT;
ALTER TABLE net_worth_snapshots ALTER COLUMN total_liabilities TYPE TEXT USING total_liabilities::text;
ALTER TABLE net_worth_snapshots ALTER COLUMN net_worth DROP DEFAULT;
ALTER TABLE net_worth_snapshots ALTER COLUMN net_worth TYPE TEXT USING net_worth::text;

-- ── account_snapshots ────────────────────────────────────────────────────────
ALTER TABLE account_snapshots ALTER COLUMN balance DROP DEFAULT;
ALTER TABLE account_snapshots ALTER COLUMN balance TYPE TEXT USING balance::text;

-- ── monthly_cash_flow ────────────────────────────────────────────────────────
ALTER TABLE monthly_cash_flow ALTER COLUMN total_income DROP DEFAULT;
ALTER TABLE monthly_cash_flow ALTER COLUMN total_income TYPE TEXT USING total_income::text;
ALTER TABLE monthly_cash_flow ALTER COLUMN total_expenses DROP DEFAULT;
ALTER TABLE monthly_cash_flow ALTER COLUMN total_expenses TYPE TEXT USING total_expenses::text;
ALTER TABLE monthly_cash_flow ALTER COLUMN net_cash_flow DROP DEFAULT;
ALTER TABLE monthly_cash_flow ALTER COLUMN net_cash_flow TYPE TEXT USING net_cash_flow::text;
ALTER TABLE monthly_cash_flow ALTER COLUMN transaction_count DROP DEFAULT;
ALTER TABLE monthly_cash_flow ALTER COLUMN transaction_count TYPE TEXT USING transaction_count::text;

-- ── category_spending_summary ────────────────────────────────────────────────
ALTER TABLE category_spending_summary ALTER COLUMN amount DROP DEFAULT;
ALTER TABLE category_spending_summary ALTER COLUMN amount TYPE TEXT USING amount::text;
ALTER TABLE category_spending_summary ALTER COLUMN transaction_count DROP DEFAULT;
ALTER TABLE category_spending_summary ALTER COLUMN transaction_count TYPE TEXT USING transaction_count::text;

-- ── category_income_summary ──────────────────────────────────────────────────
ALTER TABLE category_income_summary ALTER COLUMN amount DROP DEFAULT;
ALTER TABLE category_income_summary ALTER COLUMN amount TYPE TEXT USING amount::text;
ALTER TABLE category_income_summary ALTER COLUMN transaction_count DROP DEFAULT;
ALTER TABLE category_income_summary ALTER COLUMN transaction_count TYPE TEXT USING transaction_count::text;

-- ── budgets ──────────────────────────────────────────────────────────────────
ALTER TABLE budgets ALTER COLUMN amount DROP DEFAULT;
ALTER TABLE budgets ALTER COLUMN amount TYPE TEXT USING amount::text;

-- ── financial_goals ──────────────────────────────────────────────────────────
ALTER TABLE financial_goals ALTER COLUMN target_amount DROP DEFAULT;
ALTER TABLE financial_goals ALTER COLUMN target_amount TYPE TEXT USING target_amount::text;
ALTER TABLE financial_goals ALTER COLUMN current_amount DROP DEFAULT;
ALTER TABLE financial_goals ALTER COLUMN current_amount TYPE TEXT USING current_amount::text;
ALTER TABLE financial_goals ALTER COLUMN percentage DROP DEFAULT;
ALTER TABLE financial_goals ALTER COLUMN percentage TYPE TEXT USING percentage::text;
ALTER TABLE financial_goals ALTER COLUMN reserve DROP DEFAULT;
ALTER TABLE financial_goals ALTER COLUMN reserve TYPE TEXT USING reserve::text;

-- ── retirement_projections ──────────────────────────────────────────────────
ALTER TABLE retirement_projections ALTER COLUMN portfolio_at_retirement DROP DEFAULT;
ALTER TABLE retirement_projections ALTER COLUMN portfolio_at_retirement TYPE TEXT USING portfolio_at_retirement::text;
ALTER TABLE retirement_projections ALTER COLUMN expected_return_rate DROP DEFAULT;
ALTER TABLE retirement_projections ALTER COLUMN expected_return_rate TYPE TEXT USING expected_return_rate::text;
ALTER TABLE retirement_projections ALTER COLUMN inflation_rate DROP DEFAULT;
ALTER TABLE retirement_projections ALTER COLUMN inflation_rate TYPE TEXT USING inflation_rate::text;
ALTER TABLE retirement_projections ALTER COLUMN annual_withdrawal DROP DEFAULT;
ALTER TABLE retirement_projections ALTER COLUMN annual_withdrawal TYPE TEXT USING annual_withdrawal::text;
ALTER TABLE retirement_projections ALTER COLUMN ss_annual DROP DEFAULT;
ALTER TABLE retirement_projections ALTER COLUMN ss_annual TYPE TEXT USING ss_annual::text;
ALTER TABLE retirement_projections ALTER COLUMN pension_annual DROP DEFAULT;
ALTER TABLE retirement_projections ALTER COLUMN pension_annual TYPE TEXT USING pension_annual::text;
ALTER TABLE retirement_projections ALTER COLUMN part_time_income DROP DEFAULT;
ALTER TABLE retirement_projections ALTER COLUMN part_time_income TYPE TEXT USING part_time_income::text;
ALTER TABLE retirement_projections ALTER COLUMN rental_income_annual DROP DEFAULT;
ALTER TABLE retirement_projections ALTER COLUMN rental_income_annual TYPE TEXT USING rental_income_annual::text;
ALTER TABLE retirement_projections ALTER COLUMN healthcare_annual DROP DEFAULT;
ALTER TABLE retirement_projections ALTER COLUMN healthcare_annual TYPE TEXT USING healthcare_annual::text;
ALTER TABLE retirement_projections ALTER COLUMN legacy_goal DROP DEFAULT;
ALTER TABLE retirement_projections ALTER COLUMN legacy_goal TYPE TEXT USING legacy_goal::text;

-- ── fire_scenarios ──────────────────────────────────────────────────────────
ALTER TABLE fire_scenarios ALTER COLUMN target_annual_expenses DROP DEFAULT;
ALTER TABLE fire_scenarios ALTER COLUMN target_annual_expenses TYPE TEXT USING target_annual_expenses::text;
ALTER TABLE fire_scenarios ALTER COLUMN current_investable_assets DROP DEFAULT;
ALTER TABLE fire_scenarios ALTER COLUMN current_investable_assets TYPE TEXT USING current_investable_assets::text;
ALTER TABLE fire_scenarios ALTER COLUMN annual_contributions DROP DEFAULT;
ALTER TABLE fire_scenarios ALTER COLUMN annual_contributions TYPE TEXT USING annual_contributions::text;
ALTER TABLE fire_scenarios ALTER COLUMN expected_return_rate DROP DEFAULT;
ALTER TABLE fire_scenarios ALTER COLUMN expected_return_rate TYPE TEXT USING expected_return_rate::text;
ALTER TABLE fire_scenarios ALTER COLUMN inflation_rate DROP DEFAULT;
ALTER TABLE fire_scenarios ALTER COLUMN inflation_rate TYPE TEXT USING inflation_rate::text;
ALTER TABLE fire_scenarios ALTER COLUMN safe_withdrawal_rate DROP DEFAULT;
ALTER TABLE fire_scenarios ALTER COLUMN safe_withdrawal_rate TYPE TEXT USING safe_withdrawal_rate::text;

-- ── sync_logs ────────────────────────────────────────────────────────────────
ALTER TABLE sync_logs ALTER COLUMN accounts_synced DROP DEFAULT;
ALTER TABLE sync_logs ALTER COLUMN accounts_synced TYPE TEXT USING accounts_synced::text;
ALTER TABLE sync_logs ALTER COLUMN transactions_fetched DROP DEFAULT;
ALTER TABLE sync_logs ALTER COLUMN transactions_fetched TYPE TEXT USING transactions_fetched::text;
ALTER TABLE sync_logs ALTER COLUMN transactions_new DROP DEFAULT;
ALTER TABLE sync_logs ALTER COLUMN transactions_new TYPE TEXT USING transactions_new::text;
ALTER TABLE sync_logs ALTER COLUMN duration_ms DROP DEFAULT;
ALTER TABLE sync_logs ALTER COLUMN duration_ms TYPE TEXT USING duration_ms::text;

-- ── user_settings ────────────────────────────────────────────────────────────
ALTER TABLE user_settings ALTER COLUMN api_keys TYPE TEXT USING api_keys::text;
