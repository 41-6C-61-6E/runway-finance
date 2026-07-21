# Spec: Plan Tab (Timeline Events & Flows)

> **Location**: Current Projections → Plan tab (first tab, default view)
> **Purpose**: Define the chronological timeline of life events (incomes, expenses, and milestones) and configure the prioritized cash-flow savings rules ("Flows") that drive the entire financial projection.

---

## 1. Visual Layout

### 1.1 Split-Panel Architecture
The Plan tab uses a two-column layout:

| Panel | Width | Content |
|-------|-------|---------|
| **Left Settings Panel** | ~320px, scrollable | Global plan configuration: Withdrawals, ETR overrides, Spending definitions, Estate assumptions, Plan Notes, Tax Strategy |
| **Right Content Panel** | Remaining width | Timeline event lists organized into three sections: **Incomes**, **Expenses**, and **Flows (Cash-Flow Priorities)** |

### 1.2 Left Settings Panel — Accordions
Collapsible accordion cards with header labels and chevrons:
*   **Textbook Withdrawals**: Method selector (`"textbook"` | `"custom_order"` | `"proportional"`) and custom prioritization list.
    *   *Reference Image*: [Textbook Withdrawals Accordion](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/plan_textbook_withdrawals_dropdown.png)
*   **Effective Tax Rate Overrides**: Boolean checkboxes toggling ETR calculation inclusions (Return of Capital, Non-taxable Sale proceeds, Tax-free distributions, Local income tax, Property tax).
    *   *Reference Image*: [Tax Overrides Accordion](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/plan_tax_overrides_dropdown.png)
*   **Spending Configuration**: Boolean checkboxes defining what counts as spending (Tax liability, Mortgage payments, Mortgage principal, Consumer debt principal).
    *   *Reference Image*: [Spending Settings Accordion](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/plan_spending_settings_dropdown.png)
*   **Estate Assumptions**: Sliders for probate cost, liquidation fee, stepped-up basis toggle, and heir flat tax rate.
    *   *Reference Image*: [Estate Assumptions Accordion](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/plan_estate_assumptions_dropdown.png)

### 1.3 Right Content Panel — Timeline Events

![Plan Tab](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/plan_tab.png)

The right panel displays three event lists:

#### Incomes Section
*   Header: "Incomes" with an "Add Income" button (+ icon).
*   Lists wage streams (Salary, Pension, Social Security) showing Owner, Value, and triggers.

#### Expenses Section
*   Header: "Expenses" with an "Add Expense" button (+ icon).
*   Lists living, housing, and child expenses showing Name, Amount, and active ranges.

#### Flows Section (Cash-Flow Priorities)
*   Header: "Flows" with an "Add Flow" button (+ icon).
*   Lists savings and investment priorities in rank order (Priority #1 to #N).
*   Each row shows the Rank, Flow Name, Type, and target contribution rules.
*   Supports drag-and-drop to adjust priority ranking.

---

## 2. Income Event Modal

![Edit Income Modal](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/plan_edit_income_modal.png)

### 2.1 Input Fields
*   **Name**: Text input (Required).
*   **Type**: Dropdown (`"salary"` | `"passive"` | `"social_security"` | `"pension"` | `"rental"` | `"side_income"`).
*   **Owner**: Dropdown (`"primary"` | `"spouse"`).
*   **Amount**: Currency input ($\geq 0$).
*   **Frequency**: Dropdown (`"yearly"` | `"monthly"`).
*   **Tax Withholding**: Slider (0–100%, defaults to 25%).
*   **Growth Rate**: Percentage (-10% to 20%).
*   **Growth Cap**: Currency input (optional).
*   **Adjust for Inflation**: Toggle (boolean).
*   **Schedule Triggers**: Start trigger (now, age, year, milestone) and End trigger (retirement, age, year, milestone, end of plan).

### 2.2 Data Model
```typescript
interface IncomeEvent {
  id: string;
  name: string;
  type: "salary" | "passive" | "social_security" | "pension" | "rental" | "side_income";
  owner: "primary" | "spouse";
  amount: number;
  frequency: "yearly" | "monthly";
  withholdingRate: number;
  growthRate: number;
  growthCap?: number;
  adjustForInflation: boolean;
  schedule: {
    startTrigger: { type: "now" | "age" | "year" | "milestone"; value?: number; milestoneName?: string };
    endTrigger: { type: "retirement" | "age" | "year" | "milestone" | "end_of_plan"; value?: number; milestoneName?: string };
  };
}
```

---

## 3. Expense Event Modal

![Edit Expense Modal](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/plan_edit_expense_modal.png)

### 3.1 Input Fields
*   **Name**: Text input (Required).
*   **Type**: Dropdown (`"living_expense"` | `"housing"` | `"child_related"` | `"healthcare"` | `"lump_sum"` | `"recurring_interval"`).
*   **Amount**: Currency input ($\geq 0$).
*   **Frequency**: Dropdown (`"yearly"` | `"monthly"`).
*   **Growth Rate**: Percentage (-10% to 20%).
*   **Growth Cap**: Currency input (optional).
*   **Adjust for Inflation**: Toggle (boolean).
*   **Schedule Triggers**: Start and End triggers (now, age, year, retirement, milestone, end of plan).
*   **Recurrence** (only if type is `"recurring_interval"`): Interval in years and inflation rate per recurrence.

### 3.2 Data Model
```typescript
interface ExpenseEvent {
  id: string;
  name: string;
  type: "living_expense" | "housing" | "child_related" | "healthcare" | "lump_sum" | "recurring_interval";
  amount: number;
  frequency: "yearly" | "monthly";
  growthRate: number;
  growthCap?: number;
  adjustForInflation: boolean;
  schedule: {
    startTrigger: { type: "now" | "age" | "year" | "retirement" | "milestone"; value?: number; milestoneName?: string };
    endTrigger: { type: "age" | "year" | "end_of_plan" | "milestone"; value?: number; milestoneName?: string };
  };
  recurrence?: {
    intervalYears: number;
    inflationPerRecurrence: number;
  };
}
```

---

## 4. Flows (Cash-Flow Priorities) Modal

### 4.1 Input Fields
*   **Name**: Text input (Required, e.g., "Roth IRA (Me)").
*   **Type**: Dropdown (`"invest"` | `"save_maintain"` | `"pay_debt"`).
*   **Target Account**: Dropdown selecting from Savings, Investments, or Debt accounts.
*   **Rule Type**: Dropdown selection:
    *   `"percentage"`: Save a percentage of specific wage income.
    *   `"maximize"`: Fill up to annual IRS limit for the account type.
    *   `"save_maintain"`: Target specific balance (e.g. build emergency fund to \$40K).
    *   `"save_leftover"`: Fill with all remaining cash surplus.
*   **Rule Value**: Percentage or currency amount based on selected rule.
*   **Employer Match Toggle** (only if type is invest and target account is tax-deferred 401k):
    *   *Match Percentage*: Employer match percent (e.g., 50%).
    *   *Match Limit*: Limit percent of employee wages (e.g., up to 6%).
*   **Schedule Triggers**: Start and End triggers.

### 4.2 Data Model
```typescript
interface PlanFlow {
  id: string;
  planId: string;
  name: string;
  type: "invest" | "save_maintain" | "pay_debt";
  rank: number; // Priority order (1, 2, 3...)
  targetAccountId: string;
  ruleType: "percentage" | "maximize" | "save_maintain" | "save_leftover";
  ruleValue?: number;
  employerMatch?: {
    matchRate: number; // E.g., 0.5 for 50%
    matchLimit: number; // E.g., 0.06 for 6% of wages
    matchAccountId: string;
  };
  schedule: {
    startTrigger: { type: "now" | "age" | "year" | "milestone"; value?: number; milestoneName?: string };
    endTrigger: { type: "age" | "year" | "milestone" | "end_of_plan"; value?: number; milestoneName?: string };
  };
}
```

---

## 5. Milestone Modal

![Add Milestone Modal](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/plan_add_milestone_modal.png)

### 5.1 Input Fields
*   **Name**: Text input (Required).
*   **Owner**: Dropdown (`"primary"` | `"spouse"`).
*   **Trigger Type**: Dropdown (`"age"` | `"year"`).
*   **Trigger Value**: Positive integer.

### 5.2 Data Model
```typescript
interface MilestoneEvent {
  id: string;
  name: string;
  owner: "primary" | "spouse";
  trigger: {
    type: "age" | "year";
    value: number;
  };
}
```

---

## 6. Calculation Logic (Growth & Inflation)

For each simulation year $t$:

### 6.1 Income & Expense Growth
$$\text{Value}_{t} = \min(\text{Value}_{t-1} \times (1 + g_{\text{effective}}), \text{growthCap})$$
*   If `adjustForInflation` is `true`: $g_{\text{effective}} = g_{\text{user}} + \text{inflationRate}$.
*   Else: $g_{\text{effective}} = g_{\text{user}}$.

### 6.2 Recurring Interval Expenses
$$\text{Amount}_k = \text{Amount}_0 \times (1 + \text{inflationPerRecurrence})^k$$
*(where $k$ is the recurrence index).*

---

## 7. Required Global Data Dependencies

This tab requires the following data from other modules to function:

| Dependency | Source Module | Purpose |
|-----------|--------------|---------|
| `primaryAge`, `spouseAge` | About You (Module 2) | Resolve age-based triggers |
| `planStartYear`, `planEndYear` | Plan Settings | Define timeline bounds |
| `inflationRate` | Plan Settings | Apply inflation adjustments |
| `accounts[]` | Current Finances (Module 2) | Link Target Accounts for Flows |

---

## 8. Output

The Plan tab produces the **event schedule** and the prioritized **savings flows** that feed into the Simulation Engine.

```typescript
interface PlanOutput {
  incomes: IncomeEvent[];
  expenses: ExpenseEvent[];
  flows: PlanFlow[];
  milestones: MilestoneEvent[];
  withdrawalStrategy: WithdrawalStrategy;
  etrOverrides: ETROverrides;
  spendingConfig: SpendingConfig;
  estateAssumptions: EstateAssumptions;
}
```

---

## 9. Cookie Consent Modal (General Component)

The application includes a standard cookie consent preference modal that overlay screens upon initial visit:
*   **Cookie Consent Banner**: Dialog titled "Cookies at ProjectionLab" describing privacy preferences.
*   *Reference Image*: [Cookie Preferences Dialog](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/temp_floating_menu.png)
*   *Configuration Options*:
    *   Strictly Necessary Cookies (Always Active toggle)
    *   Functional Cookies (Toggle)
    *   Performance Cookies (Toggle)
    *   Targeting Cookies (Toggle)
    *   Action Buttons: "Cookies Policy" link, "Close (X)" button, and "Confirm" selection button.

