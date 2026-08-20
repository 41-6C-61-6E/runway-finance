import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// ── Retirement Plans (Scenarios) ─────────────────────────────────────────────
export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  isDefault: boolean('is_default').notNull().default(false),
  hasSpouse: boolean('has_spouse').notNull().default(false),
  primaryBirthYear: integer('primary_birth_year').notNull().default(1985),
  primaryBirthMonth: integer('primary_birth_month').notNull().default(1),
  spouseBirthYear: integer('spouse_birth_year'),
  spouseBirthMonth: integer('spouse_birth_month'),
  spouseName: text('spouse_name').notNull().default('Spouse / Partner'),
  spouseRetirementAge: integer('spouse_retirement_age').notNull().default(60),
  spouseLifeExpectancyAge: integer('spouse_life_expectancy_age').notNull().default(100),
  primarySsMonthlyAmount: text('primary_ss_monthly_amount').notNull().default('2500'),
  primarySsStartAge: integer('primary_ss_start_age').notNull().default(67),
  spouseSsMonthlyAmount: text('spouse_ss_monthly_amount').notNull().default('2000'),
  spouseSsStartAge: integer('spouse_ss_start_age').notNull().default(67),
  enableSpousalSsBenefit: boolean('enable_spousal_ss_benefit').notNull().default(true),
  country: text('country').notNull().default('US'),
  stateProvince: text('state_province'),
  filingStatus: text('filing_status').notNull().default('single'), // 'single' | 'married_joint' | 'married_separate' | 'head_of_household'
  retirementAge: integer('retirement_age').notNull().default(60),
  lifeExpectancyAge: integer('life_expectancy_age').notNull().default(100),
  fiTargetMultiplier: integer('fi_target_multiplier').notNull().default(25),
  withdrawalMethod: text('withdrawal_method').notNull().default('textbook'), // 'textbook' | 'proportional' | 'custom_order'
  customWithdrawalOrder: jsonb('custom_withdrawal_order'), // Array of account ids/types
  primarySalary: text('primary_salary').notNull().default('0'),
  spouseSalary: text('spouse_salary').notNull().default('0'),
  primarySalaryYear: integer('primary_salary_year').notNull().default(2026),
  primarySalaryRaisePct: text('primary_salary_raise_pct').notNull().default('0'),
  primarySalaryOverrides: jsonb('primary_salary_overrides'), // { [year: number]: number }
  spouseSalaryYear: integer('spouse_salary_year').notNull().default(2026),
  spouseSalaryRaisePct: text('spouse_salary_raise_pct').notNull().default('0'),
  spouseSalaryOverrides: jsonb('spouse_salary_overrides'), // { [year: number]: number }
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Plan Accounts (Asset Holdings) ────────────────────────────────────────────
export const planAccounts = pgTable('plan_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  owner: text('owner').notNull().default('primary'), // 'primary' | 'spouse' | 'joint'
  type: text('type').notNull(), // 'cash' | 'taxable' | 'traditional_ira' | 'roth_ira' | 'traditional_401k' | 'roth_401k' | 'hsa' | 'crypto'
  balance: text('balance').notNull().default('0'),
  costBasis: text('cost_basis').notNull().default('0'),
  expectedGrowthRate: text('expected_growth_rate').notNull().default('6.0'),
  dividendYield: text('dividend_yield').notNull().default('2.5'),
  reinvestDividends: boolean('reinvest_dividends').notNull().default(true),
  qualifiedDividendRatio: text('qualified_dividend_ratio').notNull().default('1.0'),
  rothPercentage: integer('roth_percentage'), // For mixed 401(k)s
  isIncluded: boolean('is_included').notNull().default(true),
  contributionMode: text('contribution_mode').notNull().default('none'), // 'none' | 'percentage' | 'fixed_amount' | 'maximize'
  contributionValue: text('contribution_value'), // % of salary or annual $ amount
  contributionSalarySource: text('contribution_salary_source'), // 'primary' | 'spouse' — derived from owner if null
  companyMatchRate: text('company_match_rate'), // e.g., '1.0' for 100% match
  companyMatchLimit: text('company_match_limit'), // Max % of salary the match applies to
  isSurplusDestination: boolean('is_surplus_destination').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Plan Liabilities (Loans & Mortgages) ──────────────────────────────────────
export const planLiabilities = pgTable('plan_liabilities', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  owner: text('owner').notNull().default('primary'),
  balance: text('balance').notNull().default('0'),
  interestRate: text('interest_rate').notNull().default('4.5'),
  monthlyPayment: text('monthly_payment').notNull().default('0'),
  yearsRemaining: text('years_remaining').notNull().default('30'),
  linkedAssetId: uuid('linked_asset_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Plan Events (Timeline Scheduled Incomes & Expenses) ───────────────────────
export const planEvents = pgTable('plan_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  category: text('category').notNull(), // 'income' | 'expense'
  type: text('type').notNull(), // 'salary' | 'passive' | 'pension' | 'social_security' | 'living_expense' | 'healthcare' | 'child_related' | 'lump_sum'
  owner: text('owner').notNull().default('primary'),
  amount: text('amount').notNull().default('0'),
  frequency: text('frequency').notNull().default('yearly'), // 'yearly' | 'monthly'
  growthRate: text('growth_rate').notNull().default('0.0'),
  growthCap: text('growth_cap'),
  adjustForInflation: boolean('adjust_for_inflation').notNull().default(true),
  startTriggerType: text('start_trigger_type').notNull().default('now'), // 'now' | 'age' | 'year' | 'milestone'
  startTriggerValue: text('start_trigger_value'),
  endTriggerType: text('end_trigger_type').notNull().default('end_of_plan'), // 'age' | 'year' | 'milestone' | 'end_of_plan' | 'retirement'
  endTriggerValue: text('end_trigger_value'),
  recurrenceInterval: integer('recurrence_interval'),
  inflationPerRecurrence: text('inflation_per_recurrence'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Plan Flows (Cash-Flow Savings Priorities) ─────────────────────────────────
export const planFlows = pgTable('plan_flows', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').notNull().references(() => plans.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  name: text('name').notNull(),
  type: text('type').notNull().default('invest'), // 'invest' | 'save_maintain' | 'pay_debt'
  rank: integer('rank').notNull().default(1),
  targetAccountId: uuid('target_account_id').references(() => planAccounts.id, { onDelete: 'cascade' }),
  ruleType: text('rule_type').notNull(), // 'percentage' | 'maximize' | 'save_maintain' | 'save_leftover'
  ruleValue: text('rule_value'),
  matchRate: text('match_rate'),
  matchLimit: text('match_limit'),
  matchAccountId: uuid('match_account_id').references(() => planAccounts.id, { onDelete: 'set null' }),
  startTriggerType: text('start_trigger_type').notNull().default('now'),
  startTriggerValue: text('start_trigger_value'),
  endTriggerType: text('end_trigger_type').notNull().default('end_of_plan'),
  endTriggerValue: text('end_trigger_value'),
  salarySource: text('salary_source'), // 'primary' | 'spouse' | 'combined'
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Plan Settings (Assumptions Overrides) ─────────────────────────────────────
export const planSettings = pgTable('plan_settings', {
  planId: uuid('plan_id').primaryKey().references(() => plans.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull(),
  ratesMode: text('rates_mode').notNull().default('fixed'), // 'fixed' | 'historical' | 'advanced'
  fixedInflationRate: text('fixed_inflation_rate').notNull().default('3.0'),
  fixedBenefitCola: text('fixed_benefit_cola').notNull().default('0.0'),
  historicalStartYear: integer('historical_start_year').notNull().default(1928),
  historicalLoopbackYear: integer('historical_loopback_year').notNull().default(1928),
  withholdingDeferred: text('withholding_deferred').notNull().default('20.0'),
  withholdingTaxable: text('withholding_taxable').notNull().default('10.0'),
  incomeTaxModifier: text('income_tax_modifier').notNull().default('0.0'),
  // L-1 (TAX_PAYROLL_REVIEW.md): optional graduated state income-tax table.
  // JSON: { stateCode?, stateTaxBrackets?: [{threshold, rate}],
  //         stateTaxStandardDeduction?, stateGrossFloorRate? }
  // Absent/empty → the flat incomeTaxModifier fallback (legacy behavior).
  stateTaxTable: jsonb('state_tax_table'),
  // T-2 (TAX_PAYROLL_REVIEW.md): 'inflationEscalated' (default, legacy
  // behavior) escalates base-year rule figures with plan inflation; 'statutory'
  // uses published per-year rule rows (2024/2025) where the simulation spans them.
  projectionMode: text('projection_mode').notNull().default('inflationEscalated'),
  // T-5 (TAX_PAYROLL_REVIEW.md): opt-in AMT in the tax engine.
  enableAmt: boolean('enable_amt').notNull().default(false),
  capGainsTaxModifier: text('cap_gains_tax_modifier').notNull().default('0.0'),
  etrLocalTax: boolean('etr_local_tax').notNull().default(false),
  etrPropertyTax: boolean('etr_property_tax').notNull().default(false),
  etrReturnOfCapital: boolean('etr_return_of_capital').notNull().default(false),
  etrNonTaxableSales: boolean('etr_non_taxable_sales').notNull().default(false),
  spendingMortgagePrincipal: boolean('spending_mortgage_principal').notNull().default(false),
  spendingDebtPrincipal: boolean('spending_debt_principal').notNull().default(true),
  heirFlatIncomeTaxRate: text('heir_flat_income_tax_rate').notNull().default('25.0'),
  stepUpBasis: boolean('step_up_basis').notNull().default(true),
  realEstateLiquidationRate: text('real_estate_liquidation_rate').notNull().default('6.0'),
  administrativeCostRate: text('administrative_cost_rate').notNull().default('1.0'),
  charitableGiving: text('charitable_giving').notNull().default('0.0'),
  charitableAllocationStrategy: text('charitable_allocation_strategy').notNull().default('tax_inefficient_first'),
  allowPenaltyWithdrawals: boolean('allow_penalty_withdrawals').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── System Tax Rules Store (Global statutory tax rates, thresholds, & limits) ──
export const systemTaxRules = pgTable('system_tax_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  taxYear: integer('tax_year').notNull().default(2026),
  country: text('country').notNull().default('US'),
  standardDeductionSingle: text('standard_deduction_single').notNull().default('15000'),
  standardDeductionMfj: text('standard_deduction_mfj').notNull().default('30000'),
  standardDeductionHoH: text('standard_deduction_hoh').notNull().default('22500'),
  standardDeductionMfs: text('standard_deduction_mfs').notNull().default('15000'),
  standardDeduction: text('standard_deduction').notNull().default('15000'),
  additionalStdDeduction65Plus: jsonb('additional_std_deduction_65_plus').notNull(),
  ordinaryTaxBrackets: jsonb('ordinary_tax_brackets').notNull(),
  headOfHouseholdBrackets: jsonb('head_of_household_brackets').notNull(),
  capitalGainsBrackets: jsonb('capital_gains_brackets').notNull(),
  ficaRules: jsonb('fica_rules').notNull(),
  socialSecurityRules: jsonb('social_security_rules').notNull(),
  earlyPenaltyRules: jsonb('early_penalty_rules').notNull(),
  niitRules: jsonb('niit_rules').notNull(),
  acaRules: jsonb('aca_rules').notNull(),
  niitThreshold: text('niit_threshold').notNull().default('200000'),
  irmaaThresholds: jsonb('irmaa_thresholds').notNull(),
  ssTaxationThresholds: jsonb('ss_taxation_thresholds').notNull(),
  contributionLimits: jsonb('contribution_limits').notNull(),
  giftEstateExemptions: jsonb('gift_estate_exemptions').notNull(),
  acaSubsidyTable: jsonb('aca_subsidy_table').notNull(),
  fplAmount: text('fpl_amount').notNull().default('15060'),
  secureActRules: jsonb('secure_act_rules').notNull(),
  rmdUniformLifetimeTable: jsonb('rmd_uniform_lifetime_table').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Legacy Retirement Rules Store (Kept for backward compatibility) ─────────
export const retirementRules = pgTable('retirement_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  taxYear: integer('tax_year').notNull().default(2026),
  filingStatus: text('filing_status').notNull().default('single'),
  standardDeduction: text('standard_deduction').notNull().default('15000'),
  ordinaryTaxBrackets: jsonb('ordinary_tax_brackets').notNull(),
  capitalGainsBrackets: jsonb('capital_gains_brackets').notNull(),
  niitThreshold: text('niit_threshold').notNull().default('200000'),
  irmaaThresholds: jsonb('irmaa_thresholds').notNull(),
  ssTaxationThresholds: jsonb('ss_taxation_thresholds').notNull(),
  contributionLimits: jsonb('contribution_limits').notNull(),
  giftEstateExemptions: jsonb('gift_estate_exemptions').notNull(),
  acaSubsidyTable: jsonb('aca_subsidy_table').notNull(),
  fplAmount: text('fpl_amount').notNull().default('15060'),
  secureActRules: jsonb('secure_act_rules').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

