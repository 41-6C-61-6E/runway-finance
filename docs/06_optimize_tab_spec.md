# Spec: Optimize Tab (Withdrawal & Tax Optimizer)

> **Location**: Current Projections → Optimize tab (sixth tab) (Route: `/plan/:planId/strategy/optimize`)
> **Purpose**: Automatically determine the optimal year-by-year withdrawal ordering, Roth conversion ladder amounts, and tax bracket shielding strategies to maximize or minimize a specific planning objective.

---

## 1. Visual Layout & Configuration

The Optimize tab provides a dashboard where users configure and run optimization algorithms:

![Optimize Tab Overview](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/optimize_overview.png)

The layout features:
1.  **Optimization Goal (Objective Selection)**: A radio button group to choose the mathematical target.
2.  **Search Intensity / Depth Selector**: A sliding button group to choose algorithm performance.
3.  **Strategy Toggles**: Checkboxes to enable or disable specific optimizations (withdrawal order, Roth conversions).
4.  **Run Button**: Triggers the background calculations and displays a progress bar.
5.  **Recommendations Table**: Appears after calculation, showing year-by-year instructions.

---

## 2. Optimization Goals (Objectives)

The user can choose one of **6 target objectives** to guide the optimization search:

![Goal Selected Net Legacy](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/optimize_goal_net_legacy.png)

1.  **Lower Lifetime Taxes**:
    *   *Mathematical Target*: Minimize the sum of all tax liabilities paid throughout the planning projection period.
    *   *Formula*: $\min \sum_{t=t_0}^{T} (\text{IncomeTax}_t + \text{CapGainsTax}_t + \text{PayrollTax}_t + \text{IRMAASurcharge}_t)$
2.  **Higher Net Legacy**:
    *   *Mathematical Target*: Maximize the total value of the estate transferred to heirs at the end of the simulation timeline, after subtracting final year taxes, asset liquidation costs, probate administrative drag, and outstanding debts.
    *   *Formula*: $\max \text{NetLegacy}_T$ (calculated via the Module 8 settling logic).
3.  **Higher Net Worth**:
    *   *Mathematical Target*: Maximize the nominal or real total Net Worth of the plan owner at the final year of the simulation timeline.
    *   *Formula*: $\max \text{NetWorth}_T$ (where $\text{NetWorth}_t = \text{Assets}_t - \text{Liabilities}_t$).
4.  **Lower Effective Tax Rate (ETR)**:
    *   *Mathematical Target*: Minimize the average Effective Tax Rate (calculated as Total Taxes divided by Total Gross Income) across the plan life.
    *   *Formula*: $\min \frac{1}{T-t_0+1} \sum_{t=t_0}^{T} \text{ETR}_t$
5.  **Lower Required Minimum Distributions (RMDs)**:
    *   *Mathematical Target*: Minimize the cumulative forced distributions from Traditional tax-deferred accounts during retirement.
    *   *Formula*: $\min \sum_{t=\text{RMD\_Age}}^{T} \text{RMDAmount}_t$
6.  **Reduce IRMAA Surcharges**:
    *   *Mathematical Target*: Minimize the cumulative Income-Related Monthly Adjustment Amount surcharges triggered by exceeding Medicare income thresholds.
    *   *Formula*: $\min \sum_{t=\text{Age } 65}^{T} \text{IRMAA\_Cost}_t$

---

## 3. Search Intensity & Algorithm Depth

Because the optimization space is highly dimensional (evaluating annual withdrawal splits, conversions, and tax boundaries for up to 40+ years results in $N^{40}$ possible paths), the simulator utilizes a **Beam Search Algorithm**.

The user configures search width and precision using the **Search Intensity / Depth Selector**:

| Intensity Level | Beam Width ($W$) | Conversion Step Size | Parallel Execution | Execution Time | Description |
|---|---|---|---|---|---|
| **Quick** | 2 paths | \$10,000 increments | Single Thread | ~1-2 seconds | Swift path check; evaluates primary withdrawal permutations and coarse Roth conversions. |
| **Standard** | 5 paths | \$5,000 increments | Multi-threaded (Web Workers) | ~3-5 seconds | Recommended balance; runs a moderate beam width and searches standard tax bracket margins. |
| **Deep** | 10 paths | \$1,000 increments | Multi-threaded (Web Workers) | ~5-15 seconds | High precision; searches fine-grained conversion amounts and tests minor bracket boundaries. |
| **Extreme** | 25 paths | \$250 increments | Max CPU Core Parallelization | ~15-45 seconds | Exhaustive search; evaluates maximum beam paths and matches conversion amounts precisely to marginal boundaries. |

---

## 4. Beam Search Optimization Logic

The optimization engine performs a forward path search through the planning timeline:

1.  **State Representation ($S_t$)**:
    *   At year $t$, the state is represented by a vector of account balances: $S_t = [A_1, A_2, ..., A_k]$ (e.g. taxable brokerage, Traditional IRA, Roth IRA, cash reserves).
2.  **Action Selection ($a_t$)**:
    *   An action $a_t$ consists of:
        *   An ordered sequence for account withdrawals (e.g., withdraw $X$ from Taxable, $Y$ from Traditional).
        *   A Roth conversion amount $C_t$ (transfer from Traditional to Roth, incurring tax).
3.  **Path Scoring (Heuristic $H(S_t)$)**:
    *   At each step, paths are scored based on cumulative taxes paid, current net worth, and a heuristic predicting future tax drag:
        $$H(S_t) = \text{NetWorth}_t - \text{EstimatedFutureTaxDrag}(S_t)$$
4.  **Beam Transition**:
    *   From the set of active beam paths (size $W$) at year $t-1$:
        1.  Generate all valid action transitions (based on current year cash requirements, standard deductions, and the conversion increment step).
        2.  Simulate the plan forward for one year to obtain candidates.
        3.  Sort the candidate paths by $H(S_t)$ and keep only the top $W$ paths.
    *   Repeat until the plan horizon $T$ is reached.
5.  **Backtracking**:
    *   Select the path at $T$ that scored the highest on the target objective. Trace back the sequence of actions $[a_1, a_2, ..., a_T]$ to compile the recommendations list.

---

## 5. Data Models

### 5.1 Optimization Request Payload
```typescript
interface OptimizeRequest {
  planId: string;
  objective: "taxes" | "legacy" | "networth" | "etr" | "rmds" | "irmaa";
  intensity: "quick" | "standard" | "deep" | "extreme";
  enabledStrategies: {
    optimizeWithdrawalOrder: boolean;
    optimizeRothConversions: boolean;
    optimizeBracketShielding: boolean;
  };
  constraints: {
    minCashReserve: number;
    maxAnnualConversion: number;
    stopConversionsAge: number;
  };
}
```

### 5.2 Year-by-Year Optimization Result
```typescript
interface OptimizeAction {
  year: number;
  age: number;
  withdrawalSequence: Array<{
    accountId: string;
    accountName: string;
    amount: number;
  }>;
  rothConversionAmount: number;
  estimatedTaxSavings: number;
  notes: string; // E.g., "Fill up to the top of the 22% federal bracket"
}

interface OptimizeResponse {
  planId: string;
  baselineMetrics: {
    lifetimeTaxes: number;
    netLegacy: number;
    endingNetWorth: number;
  };
  optimizedMetrics: {
    lifetimeTaxes: number;
    netLegacy: number;
    endingNetWorth: number;
  };
  savings: {
    taxesSaved: number;
    legacyIncrease: number;
  };
  recommendations: OptimizeAction[];
}
```

---

## 6. Interactions & Controls

| Control | Element Type | Behavior |
|---|---|---|
| **Goal Selectors** | Radio buttons | Swaps the active target objective for the optimizer |
| **Search Intensity Slider** | Slider / Button Group | Selects Quick, Standard, Deep, or Extreme beam settings |
| **Run Optimizer Button** | Elevated Button | Initiates background search worker and shows progress overlay |
| **Apply Plan Override** | Button | Commits the optimized action series as overrides on the active plan timeline |
| **Reset Strategy** | Button | Removes optimizer overrides and restores plan default rules |
