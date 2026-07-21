# Spec: Cash Flow Tab

> **Location**: Current Projections → Cash Flow tab (second tab)
> **Purpose**: Visualize where money comes from and where it goes each year, using an interactive Sankey diagram and supporting data tables.

---

## 1. Visual Layout

### 1.1 Primary View — Sankey Diagram

![Cash Flow View](/Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/cash_flow.png)

The centerpiece is an interactive **Sankey flow diagram** that maps:

```
Sources (left)          →        Destinations (right)
─────────────────────────────────────────────────────
Wage Income (You)       →   Federal Income Tax
Wage Income (Spouse)    →   State Income Tax
Investment Income       →   FICA / Payroll Tax
Withdrawal Income       →   Property Tax
Social Security         →   Living Expenses
Pension Income          →   Housing (Rent/Mortgage)
                        →   Healthcare
                        →   Children
                        →   Discretionary (Vacation, etc.)
                        →   Net Savings / Contributions
```

### 1.2 Visual Design
*   **Inflow bands**: Teal/Green color family
*   **Tax bands**: Red/Coral color family
*   **Expense bands**: Amber/Orange color family
*   **Savings bands**: Blue/Indigo color family
*   **Band thickness**: Proportional to dollar value
*   **Hover state**: Highlight the selected flow path and display a tooltip with the exact dollar amount and percentage of total
*   **Year selector**: Slider or dropdown at the top to scrub through projection years

### 1.3 Secondary View — Cash Flow Table
Below the Sankey diagram, a tabular breakdown provides exact numbers:

| Column | Description |
|--------|-------------|
| Year | Projection year (e.g., 2026, 2027, ...) |
| Gross Income | Sum of all income sources before taxes |
| Total Taxes | Federal + State + FICA + Local + Property |
| Net Income | Gross Income − Total Taxes |
| Total Expenses | Sum of all active expense events |
| Net Cash Flow | Net Income − Total Expenses |
| Savings / Drawdown | Positive = savings contribution, Negative = asset withdrawal |

---

## 2. Input Dependencies

This tab does not have its own input controls. It reads from:

| Dependency | Source | Purpose |
|-----------|--------|---------|
| `incomes[]` | Plan Tab | All active income events for each year |
| `expenses[]` | Plan Tab | All active expense events for each year |
| `taxCalculation` | Tax Engine (Module 6) | Federal, state, FICA, local tax amounts |
| `withdrawalStrategy` | Plan Tab | Determines drawdown source ordering |
| `spendingConfig` | Plan Tab | Determines what counts as "spending" |
| `accounts[]` | Current Finances | Account balances for contribution/withdrawal logic |
| `planYear` | Simulation Engine | Current year being visualized |

---

## 3. Output Data Structure

### 3.1 Per-Year Cash Flow Record
```typescript
interface CashFlowYear {
  year: number;
  
  // Inflows
  inflows: {
    wageIncome: { primary: number; spouse: number };
    investmentIncome: number;    // Dividends, interest
    withdrawalIncome: number;    // Drawdown from accounts
    socialSecurity: number;
    pensionIncome: number;
    otherIncome: number;
    totalGrossIncome: number;
  };

  // Taxes
  taxes: {
    federalIncomeTax: number;
    stateIncomeTax: number;
    ficaTax: number;
    localIncomeTax: number;
    propertyTax: number;
    capitalGainsTax: number;
    totalTaxes: number;
  };

  // Outflows
  outflows: {
    housing: number;           // Rent or mortgage payment
    livingExpenses: number;
    healthcare: number;
    children: number;
    discretionary: number;
    lumpSumExpenses: number;
    debtPayments: number;
    totalExpenses: number;
  };

  // Net
  netIncome: number;           // totalGrossIncome - totalTaxes
  netCashFlow: number;         // netIncome - totalExpenses
  savingsContribution: number; // Positive if surplus
  drawdownAmount: number;      // Positive if deficit
}
```

### 3.2 Full Cash Flow Output
```typescript
interface CashFlowOutput {
  years: CashFlowYear[];
  summaryMetrics: {
    lifetimeGrossIncome: number;
    lifetimeTotalTaxes: number;
    lifetimeTotalExpenses: number;
    lifetimeNetSavings: number;
    averageAnnualExpenses: number;
    peakExpenseYear: { year: number; amount: number };
  };
}
```

---

## 4. Calculation Logic

### 4.1 Annual Cash Flow Sequence
For each year $t$:

1. **Sum Inflows**:
$$I_t = \sum_{j} \text{IncomeEvent}_j(t)$$

2. **Calculate Taxes** (delegated to Tax Engine):
$$T_t = f_{\text{tax}}(I_t, \text{filingStatus}, \text{state}, \text{deductions})$$

3. **Sum Outflows**:
$$E_t = \sum_{k} \text{ExpenseEvent}_k(t) + \text{DebtPayments}(t)$$

4. **Compute Net Cash Flow**:
$$\text{NCF}_t = I_t - T_t - E_t$$

5. **Route Surplus/Deficit**:
   *   If $\text{NCF}_t > 0$: Allocate to savings/investment accounts per contribution priority
   *   If $\text{NCF}_t < 0$: Withdraw from accounts per `withdrawalStrategy` ordering

### 4.2 Sankey Band Width Calculation
Each band's pixel width is proportional to its dollar share:
$$\text{bandWidth}_i = \frac{\text{amount}_i}{\text{totalFlow}} \times \text{diagramHeight}$$

---

## 5. Interactions & Controls

| Control | Type | Behavior |
|---------|------|----------|
| Year Selector | Slider / Dropdown | Scrubs the Sankey diagram to display a specific year's flows |
| Hover on Band | Tooltip | Shows: category name, dollar amount, % of total inflow/outflow |
| Click on Band | Highlight + Detail | Highlights the full flow path from source to destination |
| Toggle Table View | Button | Expands/collapses the tabular cash flow summary below the diagram |

---

## 6. Rendering Requirements

*   **Sankey Library**: Use a library like D3-Sankey, or build custom SVG paths with cubic Bézier curves
*   **Responsive**: Diagram must reflow for viewport widths from 768px to 1920px
*   **Animation**: Smooth transitions when changing years (bands should morph/resize with easing)
*   **Color coding**: Must be consistent with the global design system color tokens (teal for income, amber for expenses, red for taxes)
