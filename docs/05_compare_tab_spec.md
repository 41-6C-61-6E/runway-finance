# Spec: Compare Tab (Scenario & Tax Strategy Comparison)

> **Location**: Current Projections → Compare tab (fifth tab)
> **Purpose**: Allow users to compare multiple plan scenarios side-by-side (What-If overrides vs. baseline plans) or evaluate 15 pre-configured tax strategies in a comparison matrix to find the optimal tax, withdrawal, and savings decisions.

---

## 1. Visual Layout & Navigation Modes

The Compare tab supports two primary sub-views:
1. **Scenario & Plan Comparison (What-If / Plan-to-Plan)**
2. **Tax Strategy Comparison Matrix** (Route: `/plan/:planId/strategy/compare`)

### 1.1 Scenario & Plan Comparison Dashboard

![Active Comparison View](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/compare_active_view.png)

This dashboard compares standard plan scenarios:
*   **Scenario Selector Bar** (top): Allows multi-selecting saved plans (e.g. comparing the current plan to `plan2`).
    *   *Reference Image*: [Plan Selector Menu](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/compare_plan2_active.png)
*   **Delta Summary Cards** (middle): Side-by-side metrics comparing baseline against alternative scenarios.
*   **Comparison Chart** (bottom): Overlaid line charts showing trajectories of Net Worth, Liquid Net Worth, Annual Spending, Tax Burden, or Withdrawal Rate.

### 1.2 What-If Override Mode
Users can toggle "What-If" mode to temporarily adjust key parameters of the current plan via slider controls:
*   Retirement Age
*   Savings Rate
*   Market Return
*   Inflation Rate
*   Annual Spending
*   Social Security Start Age

#### What-If Exit Actions Menu
When exiting What-If mode, a confirmation pop-up menu is displayed with three options:
1. **Keep Changes**: Applies the temporary changes to the current plan and makes them permanent.
2. **Revert Changes**: Discards all What-If overrides and returns the current plan to its baseline state.
3. **Save as New Plan**: Clones the modified plan into a brand-new saved plan scenario, then reverts the current plan back to its original baseline state.
    *   *Reference Image*: [What-If Exit Dialog](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/temp_compare_whatif.png)

### 1.3 Tax Strategy Comparison Matrix

![Tax Strategy Matrix Overview](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/compare_strategies_overview.png)
*   *Reference Image (Detailed Columns & Star Badges)*: [Compare Strategies Grid View](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/plan_compare_scenarios_view.png)

This view provides an exhaustive side-by-side grid comparing **15 pre-configured tax strategies**:

| Strategy Name | Description | Key Variable / Rule |
|---|---|---|
| **Baseline** | Current plan settings and custom rules | Plan Defaults |
| **Roth Conversion (12% Bracket)** | Convert Traditional funds to Roth up to the 12% marginal bracket | Federal 12% Bracket |
| **Roth Conversion (22% Bracket)** | Convert up to the 22% marginal bracket | Federal 22% Bracket |
| **Roth Conversion (24% Bracket)** | Convert up to the 24% marginal bracket | Federal 24% Bracket |
| **Roth Conversion (32% Bracket)** | Convert up to the 32% marginal bracket | Federal 32% Bracket |
| **Roth Conversion (Bracket Shielding)** | Realize income up to standard deduction or lowest bracket | Low-Bracket Filling |
| **Capital Gain Harvesting** | Sell taxable assets up to the 0% LTCG tax bracket threshold | 0% LTCG Bracket |
| **IRMAA-Shielded Conversions** | Cap conversions to avoid Medicare premium IRMAA surcharges | IRMAA Surcharges |
| **NIIT-Shielded Conversions** | Cap income to stay below Net Investment Income Tax threshold | NIIT $200k/$250k Limit |
| **Traditional-First Withdrawals** | Drawdown sequence: Taxable → Traditional → Roth | Traditional Order |
| **Roth-First Withdrawals** | Drawdown sequence: Taxable → Roth → Traditional | Roth-First Order |
| **Proportional Withdrawals** | Withdraw proportionally from Taxable, Traditional, and Roth | Proportional Draw |
| **SS Delay (Age 70)** | Delay Social Security benefit start to maximum age | SS Age 70 |
| **SS Early (Age 62)** | Start Social Security benefits as early as possible | SS Age 62 |
| **Custom Withdrawal Order** | User-defined sequence of account drawdowns | Custom Sequence |

#### Column Customization & Star Badging
*   **Metrics Selector Dropdown**: Users click a multi-select dropdown to choose which comparison metrics (columns) to display in the matrix.
    *   *Reference Image*: [Metrics Dropdown Open](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/compare_metrics_dropdown_open.png)
    *   *Metrics*: Tax Liability, Net Legacy, Effective Tax Rate (ETR), Net Worth, RMDs, and IRMAA.
*   **Gold Star Badges**: In each column, a gold star icon badge highlights the optimal cell (e.g., the lowest Tax Liability, the highest Net Legacy, or the lowest ETR).

#### Timeline Details Panel
*   At the bottom of the matrix, the user can expand a **Timeline Details** collapsible panel to see a comprehensive year-by-year 39-year timeline breakdown of the projections side-by-side for the compared strategies.
    *   *Reference Image*: [Timeline Details Expanded](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/compare_details_expanded.png)

---

## 2. Comparison Metrics & Delta Logic

### 2.1 Delta Calculations
For any selected comparison scenario $S$ against the baseline plan $B$:
$$\Delta_{\text{metric}} = S_{\text{metric}} - B_{\text{metric}}$$
$$\Delta\%_{\text{metric}} = \frac{S_{\text{metric}} - B_{\text{metric}}}{B_{\text{metric}}} \times 100\%$$

### 2.2 Color-Coding Rules (Context-Aware)
The UI applies CSS classes dynamically based on whether a positive delta is favorable:
*   **Favorable (Green text + Up Arrow)**:
    *   $\Delta \text{ Net Legacy} > 0$
    *   $\Delta \text{ Success Rate} > 0$
    *   $\Delta \text{ Net Worth} > 0$
*   **Unfavorable (Red text + Down Arrow)**:
    *   $\Delta \text{ Tax Liability} > 0$
    *   $\Delta \text{ ETR} > 0$
    *   $\Delta \text{ RMDs} > 0$
    *   $\Delta \text{ IRMAA Surcharges} > 0$
    *   *(Opposite applies for negative deltas, e.g. lower taxes are green).*

---

## 3. Data Models

### 3.1 Comparison Matrix Data Structure
```typescript
interface TaxStrategyMetrics {
  strategyId: string;
  name: string;
  lifetimeTaxes: number;
  netLegacy: number;
  effectiveTaxRate: number;
  peakNetWorth: number;
  cumulativeRMDs: number;
  irmaaYearsTriggered: number;
  isOptimal: {
    lifetimeTaxes: boolean;
    netLegacy: boolean;
    effectiveTaxRate: boolean;
    peakNetWorth: boolean;
    cumulativeRMDs: boolean;
    irmaaYearsTriggered: boolean;
  };
}

interface MatrixComparisonResult {
  baselinePlanId: string;
  availableMetrics: Array<"taxes" | "legacy" | "etr" | "networth" | "rmds" | "irmaa">;
  selectedMetrics: Array<"taxes" | "legacy" | "etr" | "networth" | "rmds" | "irmaa">;
  strategies: TaxStrategyMetrics[];
}
```

### 3.2 What-If Exit Options
```typescript
type WhatIfExitAction = "keep_changes" | "revert" | "save_as_new";

interface WhatIfExitPayload {
  planId: string;
  action: WhatIfExitAction;
  newPlanName?: string; // Required if action === "save_as_new"
}
```

---

## 4. Interactions & Controls

| Control | Element Type | Action / Behavior |
|---|---|---|
| **Compare Tab Selector** | Tab Button | Switches between Plan Timeline and Compare view |
| **Tax Strategies Button** | Link / Sub-route | Navigates to `/strategy/compare` |
| **Metrics Dropdown** | Multi-select Select | Toggles visibility of columns in comparison matrix |
| **Timeline Details Accordion** | Expand Panel | Slides open the 39-year comparative projections grid |
| **Exit What-If Mode** | Button / Icon | Triggers the `WhatIfExitAction` pop-up menu |
