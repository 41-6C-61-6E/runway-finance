# Spec: Complete Financial Data Model & Database Schema

> **Location**: Database Layer & Input Models
> **Purpose**: Technical specification detailing every single piece of data required by the projection engine, mapping data sources (user input, external tax tables, historical indices), and providing a complete relational SQL schema.

---

## 1. Unified Data Requirements & Sources

To execute the projection engine, data is collected from four distinct sources:
1.  **User Demographics & Profile**: Core variables defining the timeline bounds, filing entity, and tax jurisdictions.
2.  **User Finances (Current Balances & Events)**: Account lists, balances, incomes, expenses, and milestones.
3.  **Plan Configurations (Assumptions)**: Return rates, inflation modes, dividend splits, and withdrawal choices.
4.  **External Reference Tables**: Legal tax brackets, Medicare surcharges, IRS mortality tables, and historical stock/bond returns.

---

## 2. Entity Specifications & Data Schemas

### 2.1 User Profile & Demographics
*   *Data Source*: User Input
*   *Purpose*: Define starting years, tax brackets to apply, and age-based triggers.

| Data Field | Data Type | Description / Constraints | Default Value |
|---|---|---|---|
| `hasSpouse` | Boolean | True if planning for a couple. | `false` |
| `primaryBirthYear` | Integer | Four-digit birth year (e.g. 1985). | — |
| `primaryBirthMonth` | Integer | Range 1 to 12. | — |
| `spouseBirthYear` | Integer | Required if `hasSpouse` is true. | — |
| `spouseBirthMonth` | Integer | Required if `hasSpouse` is true. | — |
| `country` | String | ISO 2-letter country code (e.g. `"US"`). | `"US"` |
| `stateProvince` | String | Sub-national division (e.g. `"CA"`). | — |
| `filingStatus` | String | `"single"` \| `"married_joint"` \| `"married_separate"` \| `"head_of_household"` | `"single"` |

---

### 2.2 Financial Assets
*   *Data Source*: User Current Finances (Module 2)
*   *Purpose*: Starting states for account liquidation, accumulation, and tax calculations.

| Data Field | Data Type | Description / Constraints | Default Value |
|---|---|---|---|
| `id` | UUID | Primary key. | Auto-generated |
| `name` | String | Label for the account (e.g., "Primary 401(k)"). | — |
| `owner` | String | `"primary"` \| `"spouse"` \| `"joint"`. | `"primary"` |
| `type` | String | `"cash"` \| `"taxable"` \| `"traditional_ira"` \| `"roth_ira"` \| `"traditional_401k"` \| `"roth_401k"` \| `"hsa"` \| `"crypto"` | — |
| `balance` | Double | Current asset balance (must be $\geq 0$). | `0.0` |
| `costBasis` | Double | Cost basis of taxable investments (required if type is `"taxable"` or `"crypto"`). | `balance` |
| `expectedGrowthRate` | Double | Expected nominal annual growth rate percentage. | `6.0` |
| `dividendYield` | Double | Expected annual dividend payout percentage. | `2.5` |
| `reinvestDividends` | Boolean | If true, dividend income increases balance and cost basis. | `true` |

---

### 2.3 Liabilities & Loans
*   *Data Source*: User Current Finances (Module 2)
*   *Purpose*: Models mandatory cash outflows and asset debt ratios.

| Data Field | Data Type | Description / Constraints | Default Value |
|---|---|---|---|
| `id` | UUID | Primary key. | Auto-generated |
| `name` | String | Label for the loan (e.g., "Home Mortgage"). | — |
| `owner` | String | `"primary"` \| `"spouse"` \| `"joint"`. | `"primary"` |
| `balance` | Double | Outstanding loan principal balance. | `0.0` |
| `interestRate` | Double | Annual percentage rate (APR) of interest. | `4.5` |
| `monthlyPayment` | Double | Fixed monthly principal + interest payment. | `0.0` |
| `yearsRemaining` | Double | Remaining repayment term in years. | — |
| `linkedAssetId` | UUID | Optional foreign key link to a Real Asset. | `null` |

---

### 2.4 Scheduled Cash Flows (Events)
*   *Data Source*: Plan Timeline (Module 4)
*   *Purpose*: Calendar of incomes and expenses.

| Data Field | Data Type | Description / Constraints | Default Value |
|---|---|---|---|
| `id` | UUID | Primary key. | Auto-generated |
| `name` | String | Label of cash flow (e.g. "Software Job"). | — |
| `category` | String | `"income"` \| `"expense"`. | — |
| `type` | String | `"salary"` \| `"passive"` \| `"pension"` \| `"social_security"` \| `"living_expense"` \| `"healthcare"` \| `"child_related"` \| `"lump_sum"` | — |
| `amount` | Double | Base annual amount. | `0.0` |
| `frequency` | String | `"yearly"` \| `"monthly"`. | `"yearly"` |
| `growthRate` | Double | Annual increase percentage. | `0.0` |
| `growthCap` | Double | Cap on compounding growth. | `null` |
| `adjustForInflation`| Boolean | Compounding inflation modifier toggle. | `true` |
| `startTriggerType` | String | `"now"` \| `"age"` \| `"year"` \| `"milestone"`. | `"now"` |
| `startTriggerValue`| String | Age value, calendar year, or milestone name. | — |
| `endTriggerType` | String | `"age"` \| `"year"` \| `"milestone"` \| `"end_of_plan"`. | `"end_of_plan"` |
| `endTriggerValue`  | String | Age value, calendar year, or milestone name. | — |

---

### 2.5 Cash-Flow Priorities (Flows)
*   *Data Source*: Plan Timeline & Settings
*   *Purpose*: Defines rank-ordered savings rules to allocate cash surpluses.

| Data Field | Data Type | Description / Constraints | Default Value |
|---|---|---|---|
| `id` | UUID | Primary key. | Auto-generated |
| `planId` | UUID | Foreign key referencing plan. | — |
| `name` | String | Label for the savings priority (e.g. "Roth IRA (Me)"). | — |
| `type` | String | `"invest"` \| `"save_maintain"` \| `"pay_debt"`. | `"invest"` |
| `rank` | Integer | Priority order weight ($\geq 1$). | — |
| `targetAccountId` | UUID | Foreign key referencing plan_accounts. | — |
| `ruleType` | String | `"percentage"` \| `"maximize"` \| `"save_maintain"` \| `"save_leftover"`. | — |
| `ruleValue` | Double | Percent of wages or a currency target limit. | `null` |
| `matchRate` | Double | Employer match contribution percent (e.g. 0.50). | `null` |
| `matchLimit` | Double | Max wage percent employer match applies to (e.g. 0.06). | `null` |
| `matchAccountId` | UUID | Target account for employer matched contributions. | `null` |

---

## 3. External Reference Tables & Sources

The simulation calculations require access to the following static/lookup reference tables:

### 3.1 Federal & State Tax Code (Lookup Table)
*   *Data Source*: External Tax API / Legal Lookup Tables (JSON/SQL database seed)
*   *Update Frequency*: Annually
*   *Fields Required*:
    ```typescript
    interface TaxBracket {
      rate: number;          // Marginal tax rate percentage (e.g., 0.22)
      threshold: number;     // Income threshold floor (e.g., 47150)
    }

    interface JurisdictionTaxData {
      year: number;
      filingStatus: string;  // single, married_joint, married_separate
      standardDeduction: number;
      payrollTaxRate: number; // FICA
      payrollTaxWageCap: number; // SS Wage Cap (e.g. $168,600)
      incomeTaxBrackets: TaxBracket[];
      capitalGainsBrackets: TaxBracket[];
      stateIncomeTaxBrackets: TaxBracket[];
      stateStandardDeduction: number;
    }
    ```

### 3.2 Medicare IRMAA Surcharge Brackets (Lookup Table)
*   *Data Source*: Centers for Medicare & Medicaid Services (CMS)
*   *Purpose*: Calculate Income-Related Monthly Adjustment Amount surcharges for retirees over age 65 based on Modified Adjusted Gross Income (MAGI) from 2 years prior.
*   *Fields Required*:
    ```typescript
    interface IRMAABracket {
      magiThresholdSingle: number;
      magiThresholdJoint: number;
      partBPremiumSurcharge: number; // Monthly surcharge
      partDPremiumSurcharge: number; // Monthly surcharge
    }
    ```

### 3.3 IRS Uniform Lifetime Table III (Lookup Table)
*   *Data Source*: IRS Publication 590-B
*   *Purpose*: Calculate Mandatory Required Minimum Distributions (RMDs).
*   *Schema*:
    *   `age`: Key (integers 73 to 120).
    *   `distributionPeriod`: Value (floating point divisor, e.g. 26.5 for age 73).

### 3.4 Historical Market Return Indices (Historical Mode Source)
*   *Data Source*: S&P 500, US Treasury Bonds, US CPI-U Historical Datasets (1928 - present)
*   *Purpose*: Sequence-of-returns simulations.
*   *Fields Required*:
    ```typescript
    interface HistoricalIndexYear {
      year: number;             // E.g., 1928
      stocksGrowth: number;     // S&P 500 capital gain return
      stocksYield: number;      // S&P 500 dividend return
      bondsGrowth: number;      // Bond price return
      bondsYield: number;       // Bond interest yield
      inflationRate: number;    // CPI-U percentage change
    }
    ```

---

## 4. Complete Database Schema (SQL DDL)

A coding agent can implement the database layer using this complete SQL schema definition (PostgreSQL):

```sql
-- CREATE PLANS TABLE
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    has_spouse BOOLEAN DEFAULT FALSE NOT NULL,
    primary_birth_year INT NOT NULL,
    primary_birth_month INT NOT NULL,
    spouse_birth_year INT,
    spouse_birth_month INT,
    country VARCHAR(2) DEFAULT 'US' NOT NULL,
    state_province VARCHAR(50),
    filing_status VARCHAR(50) DEFAULT 'single' NOT NULL,
    retirement_age INT DEFAULT 60 NOT NULL,
    life_expectancy_age INT DEFAULT 100 NOT NULL,
    fi_target_multiplier INT DEFAULT 25 NOT NULL,
    withdrawal_method VARCHAR(50) DEFAULT 'textbook' NOT NULL,
    custom_withdrawal_order JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- CREATE PLAN ACCOUNTS TABLE (ASSETS & SAVINGS)
CREATE TABLE plan_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    owner VARCHAR(50) DEFAULT 'primary' NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'cash', 'taxable', 'traditional_ira', 'roth_ira', 'hsa', etc.
    balance DOUBLE PRECISION DEFAULT 0.0 NOT NULL,
    cost_basis DOUBLE PRECISION DEFAULT 0.0 NOT NULL,
    growth_rate DOUBLE PRECISION DEFAULT 6.0 NOT NULL,
    dividend_yield DOUBLE PRECISION DEFAULT 2.5 NOT NULL,
    reinvest_dividends BOOLEAN DEFAULT TRUE NOT NULL,
    qualified_dividend_ratio DOUBLE PRECISION DEFAULT 1.0 NOT NULL
);

-- CREATE LIABILITIES TABLE (LOANS & DEBTS)
CREATE TABLE plan_liabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    owner VARCHAR(50) DEFAULT 'primary' NOT NULL,
    balance DOUBLE PRECISION DEFAULT 0.0 NOT NULL,
    interest_rate DOUBLE PRECISION DEFAULT 4.5 NOT NULL,
    monthly_payment DOUBLE PRECISION DEFAULT 0.0 NOT NULL,
    years_remaining DOUBLE PRECISION NOT NULL,
    linked_asset_id UUID
);

-- CREATE TIMELINE EVENTS TABLE (INCOMES & EXPENSES)
CREATE TABLE plan_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL, -- 'income', 'expense'
    type VARCHAR(50) NOT NULL, -- 'salary', 'pension', 'living_expense', etc.
    amount DOUBLE PRECISION DEFAULT 0.0 NOT NULL,
    frequency VARCHAR(50) DEFAULT 'yearly' NOT NULL,
    growth_rate DOUBLE PRECISION DEFAULT 0.0 NOT NULL,
    growth_cap DOUBLE PRECISION,
    adjust_for_inflation BOOLEAN DEFAULT TRUE NOT NULL,
    start_trigger_type VARCHAR(50) NOT NULL,
    start_trigger_value VARCHAR(100) NOT NULL,
    end_trigger_type VARCHAR(50) NOT NULL,
    end_trigger_value VARCHAR(100) NOT NULL,
    recurrence_interval INT,
    inflation_per_recurrence DOUBLE PRECISION
);

-- CREATE FLOWS TABLE (SAVINGS & INVESTMENT PRIORITIES)
CREATE TABLE plan_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) DEFAULT 'invest' NOT NULL, -- 'invest', 'save_maintain', 'pay_debt'
    rank INT NOT NULL,
    target_account_id UUID NOT NULL REFERENCES plan_accounts(id) ON DELETE CASCADE,
    rule_type VARCHAR(50) NOT NULL, -- 'percentage', 'maximize', 'save_maintain', 'save_leftover'
    rule_value DOUBLE PRECISION,
    match_rate DOUBLE PRECISION,
    match_limit DOUBLE PRECISION,
    match_account_id UUID REFERENCES plan_accounts(id) ON DELETE SET NULL,
    start_trigger_type VARCHAR(50) DEFAULT 'now' NOT NULL,
    start_trigger_value VARCHAR(100) NOT NULL,
    end_trigger_type VARCHAR(50) DEFAULT 'end_of_plan' NOT NULL,
    end_trigger_value VARCHAR(100) NOT NULL
);

-- CREATE PLAN SETTINGS OVERRIDES TABLE
CREATE TABLE plan_settings (
    plan_id UUID PRIMARY KEY REFERENCES plans(id) ON DELETE CASCADE,
    rates_mode VARCHAR(50) DEFAULT 'fixed' NOT NULL, -- 'fixed', 'historical', 'advanced'
    fixed_inflation_rate DOUBLE PRECISION DEFAULT 3.0 NOT NULL,
    fixed_benefit_cola DOUBLE PRECISION DEFAULT 0.0 NOT NULL,
    historical_start_year INT DEFAULT 1928 NOT NULL,
    historical_loopback_year INT DEFAULT 1928 NOT NULL,
    withholding_deferred DOUBLE PRECISION DEFAULT 20.0 NOT NULL,
    withholding_taxable DOUBLE PRECISION DEFAULT 10.0 NOT NULL,
    income_tax_modifier DOUBLE PRECISION DEFAULT 0.0 NOT NULL,
    cap_gains_tax_modifier DOUBLE PRECISION DEFAULT 0.0 NOT NULL,
    etr_local_tax BOOLEAN DEFAULT FALSE NOT NULL,
    etr_property_tax BOOLEAN DEFAULT FALSE NOT NULL,
    etr_return_of_capital BOOLEAN DEFAULT FALSE NOT NULL,
    etr_non_taxable_sales BOOLEAN DEFAULT FALSE NOT NULL,
    spending_mortgage_principal BOOLEAN DEFAULT FALSE NOT NULL,
    spending_debt_principal BOOLEAN DEFAULT TRUE NOT NULL
);
```
