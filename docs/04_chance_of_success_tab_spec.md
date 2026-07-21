# Spec: Chance of Success Tab (Monte Carlo Simulator)

> **Location**: Current Projections → Chance of Success tab (fourth tab)
> **Purpose**: Run Monte Carlo simulations to stress-test the financial plan against a range of market return scenarios and calculate the statistical probability of not running out of money.

---

## 1. Visual Layout

### 1.1 Primary View — Fan/Cone Chart

![Monte Carlo Results](/Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/plan_monte_carlo_results.png)

The main visualization is a **percentile fan chart** showing the distribution of net worth trajectories over time:

*   **X-axis**: Year (or Age)
*   **Y-axis**: Net Worth ($)
*   **Bands displayed**:
    *   90th percentile path (top of fan) — light fill
    *   75th percentile path
    *   50th percentile path (median) — bold line
    *   25th percentile path
    *   10th percentile path (bottom of fan) — light fill
*   **Color**: Gradient fill from green (optimistic) to red (pessimistic)
*   **Zero line**: Dashed horizontal line at $0 indicating plan failure threshold

### 1.2 Summary Statistics Panel
Displayed as cards alongside or above the chart:

| Metric | Description | Sample Value |
|--------|-----------|--------------|
| **Chance of Success** | % of trials ending with Net Worth > $0 | **95.92%** |
| **Total Trials** | Number of simulation runs | 196 |
| **Median Legacy** | 50th percentile ending net worth | $2.45M |
| **Average Legacy** | Mean ending net worth across all trials | $2.89M |
| **Worst Case Legacy** | Minimum ending net worth across trials | -$420K |
| **Best Case Legacy** | Maximum ending net worth across trials | $8.12M |
| **Median Depletion Age** | Age at which assets reach $0 in failed trials | 87 |

### 1.3 Simulation Settings Drawer/Modal

A settings drawer (opened via gear icon or "Simulation Settings" button) allows configuration:

| Control | Type | Options | Default |
|---------|------|---------|---------|
| Return Model | Dropdown | `"historical_bootstrap"` \| `"normal_distribution"` \| `"constant"` | `"historical_bootstrap"` |
| Number of Trials | Number input / Slider | 100–10,000 | 1,000 |
| Mean Annual Return (μ) | Percentage input | -5% to 20% | 7.0% |
| Return Std Deviation (σ) | Percentage input | 0% to 30% | 12.0% |
| Inflation Mean | Percentage input | 0% to 10% | 3.0% |
| Inflation Std Dev | Percentage input | 0% to 5% | 1.5% |
| Include Sequence Risk | Toggle | boolean | `true` |
| Historical Data Range | Date range | 1926–present | 1926–2025 |

---

## 2. Data Models

### 2.1 Simulation Configuration
```typescript
interface MonteCarloConfig {
  returnModel: "historical_bootstrap" | "normal_distribution" | "constant";
  numberOfTrials: number;         // 100–10,000
  meanAnnualReturn: number;       // e.g., 0.07 for 7%
  returnStdDeviation: number;     // e.g., 0.12 for 12%
  inflationMean: number;          // e.g., 0.03 for 3%
  inflationStdDev: number;        // e.g., 0.015 for 1.5%
  includeSequenceRisk: boolean;
  historicalDataRange?: {
    startYear: number;
    endYear: number;
  };
}
```

### 2.2 Single Trial Result
```typescript
interface TrialResult {
  trialIndex: number;
  yearlyNetWorth: number[];      // Net worth at end of each year
  endingNetWorth: number;         // Final year net worth
  success: boolean;               // endingNetWorth > 0
  depletionAge?: number;          // Age when assets hit $0 (if failed)
  annualReturns: number[];        // The return sequence used in this trial
}
```

### 2.3 Monte Carlo Output
```typescript
interface MonteCarloOutput {
  config: MonteCarloConfig;
  trials: TrialResult[];
  
  // Aggregate statistics
  successRate: number;            // 0–100%
  successCount: number;
  failureCount: number;
  
  // Percentile paths (indexed by year offset from plan start)
  percentiles: {
    p10: number[];
    p25: number[];
    p50: number[];
    p75: number[];
    p90: number[];
  };
  
  // Summary stats
  medianLegacy: number;
  averageLegacy: number;
  worstCaseLegacy: number;
  bestCaseLegacy: number;
  medianDepletionAge?: number;
}
```

---

## 3. Simulation Algorithm

### 3.1 Historical Bootstrap Method
```
For each trial t in [1, numberOfTrials]:
  1. Create a fresh copy of the plan state (all accounts, events, milestones)
  2. For each simulation year y in [startYear, endYear]:
    a. Randomly sample a historical year h from [historicalStartYear, historicalEndYear]
    b. Look up the market return R_h and inflation I_h for that historical year
    c. Apply R_h as the growth rate to all investment accounts
    d. Apply I_h to adjust inflation-linked expenses and incomes
    e. Run the standard annual cash flow sequence (Module 5):
       - Calculate inflows, taxes, outflows
       - Distribute surplus or cover deficit via withdrawals
    f. Record netWorth[y] = sum of all account balances − liabilities
  3. Record trial result: success = (netWorth[endYear] > 0)
```

### 3.2 Normal Distribution Method
```
For each trial t in [1, numberOfTrials]:
  1. Create a fresh copy of the plan state
  2. For each simulation year y:
    a. Generate random return: R_y = μ + σ × Z  (Z ~ N(0,1))
    b. Generate random inflation: I_y = μ_infl + σ_infl × Z'
    c. Apply R_y and I_y to accounts and events
    d. Run annual cash flow sequence
    e. Record netWorth[y]
  3. Record trial result
```

### 3.3 Random Number Generation
Use the **Box-Muller transform** for generating normally distributed returns:
$$Z = \sqrt{-2 \ln U_1} \cdot \cos(2\pi U_2)$$
where $U_1, U_2$ are uniformly distributed in $(0, 1)$.

### 3.4 Success Rate Calculation
$$\text{successRate} = \frac{|\{t : \text{endingNetWorth}_t > 0\}|}{N} \times 100\%$$

### 3.5 Percentile Path Calculation
For each year offset $y$:
$$P_k(y) = \text{k-th percentile of } \{\text{netWorth}_t(y) : t \in [1, N]\}$$

Sort the net worth values for year $y$ across all trials and interpolate at the desired percentile.

---

## 4. Input Dependencies

| Dependency | Source | Purpose |
|-----------|--------|---------|
| Full plan state | All modules | Clone plan for each trial |
| `accounts[]` | Current Finances | Starting balances |
| `incomes[]`, `expenses[]` | Plan Tab | Cash flow events |
| `taxEngine` | Tax Analytics | Tax calculations per year |
| `withdrawalStrategy` | Plan Tab | Drawdown ordering |
| Historical return data | Built-in dataset | Bootstrap sampling |

---

## 5. Interactions & Controls

| Control | Type | Behavior |
|---------|------|----------|
| Run Simulation | Button | Triggers the Monte Carlo engine; shows progress bar |
| Year/Age Toggle | Segmented control | Switch X-axis between calendar year and owner age |
| Percentile Hover | Tooltip on chart | Shows exact net worth value at that year for the hovered percentile |
| Trial Hover | Individual line plot | Optionally overlay individual trial paths on the fan chart |
| Export Results | Button | Download trial data as CSV |

---

## 6. Performance Requirements

*   **Target**: 1,000 trials in < 3 seconds on modern hardware
*   **Strategy**: Use Web Workers to run simulations off the main thread
*   **Progressive rendering**: Update the chart as trials complete in batches
*   **Memory**: Store only percentile paths and aggregate stats; discard individual trial year-by-year data after computing percentiles (unless export is requested)
