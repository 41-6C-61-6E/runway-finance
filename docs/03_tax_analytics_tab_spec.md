# Spec: Tax Analytics Tab

> **Location**: Current Projections → Tax Analytics tab (third tab)
> **Purpose**: Provide deep visibility into the tax implications of the financial plan — lifetime metrics, year-by-year breakdowns, marginal bracket utilization, and tax strategy comparisons.

---

## 1. Visual Layout

### 1.1 Sub-Tab Navigation
The Tax Analytics tab contains its own internal sub-tabs:

| Sub-Tab | Purpose |
|---------|---------|
| **Lifetime Metrics** | High-level aggregate tax statistics across the full plan |
| **Year-by-Year** | Tabular breakdown of taxes paid per year |
| **Marginal Brackets** | Visual bracket utilization chart |
| **Tax Strategy** | Compare different tax approaches (Roth conversions, etc.) |

### 1.2 Screenshots
````carousel
![Tax Brackets View](/Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/plan_tax_brackets_view.png)
<!-- slide -->
![Compare Strategies](/Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/temp_compare_whatif.png)
````

---

## 2. Sub-Tab: Lifetime Metrics

### 2.1 Displayed Widgets (Summary Cards)

| Metric | Definition | Sample Value |
|--------|-----------|--------------|
| **Average ETR** | Mean Effective Tax Rate across all plan years | 13.07% |
| **Lifetime Taxes** | Cumulative total of all taxes paid | $1.51M |
| **Lifetime Income** | Cumulative total of all gross income | $11.55M |
| **Average Drawdown Rate** | Mean annual withdrawal rate during drawdown years | 5.80% |
| **Net Legacy** | Projected estate value at end of plan | $2.89M |

### 2.2 ETR Calculation (Configurable)
$$\text{ETR}_t = \frac{\text{Total Taxes}_t}{\text{Total Income}_t}$$

What counts as "Total Taxes" and "Total Income" is governed by the ETR Overrides in the Plan tab settings panel:

```typescript
interface ETRCalculation {
  // Numerator components
  federalIncomeTax: number;
  stateIncomeTax: number;
  ficaTax: number;
  capitalGainsTax: number;
  localIncomeTax?: number;     // Optional via toggle
  propertyTax?: number;        // Optional via toggle

  // Denominator components
  wageIncome: number;
  investmentIncome: number;
  socialSecurityIncome: number;
  returnOfCapital?: number;          // Optional via toggle
  nonTaxableSaleProceeds?: number;   // Optional via toggle
  taxFreeDistributions?: number;     // Optional via toggle
}
```

---

## 3. Sub-Tab: Year-by-Year

### 3.1 Table Columns

| Column | Type | Description |
|--------|------|-------------|
| Year | Integer | Projection year |
| Age (You) | Integer | Primary owner's age |
| Age (Spouse) | Integer | Spouse's age |
| Gross Income | Currency | Total income before taxes |
| Federal Tax | Currency | Federal income tax |
| State Tax | Currency | State income tax |
| FICA | Currency | Social Security + Medicare taxes |
| Capital Gains Tax | Currency | Long-term and short-term cap gains |
| Total Taxes | Currency | Sum of all tax components |
| ETR | Percentage | Effective tax rate for that year |
| Net Income | Currency | Gross Income − Total Taxes |

### 3.2 Data Model
```typescript
interface TaxYearRow {
  year: number;
  primaryAge: number;
  spouseAge?: number;
  grossIncome: number;
  federalTax: number;
  stateTax: number;
  ficaTax: number;
  capitalGainsTax: number;
  localTax: number;
  propertyTax: number;
  totalTaxes: number;
  effectiveTaxRate: number;
  netIncome: number;
}
```

---

## 4. Sub-Tab: Marginal Brackets

### 4.1 Visualization
An interactive **stacked bar chart** or **waterfall chart** showing how the user's taxable income fills each federal bracket:

```
Bracket     Rate    Amount Filled    Tax Owed
───────────────────────────────────────────────
$0–$23,200      10%     $23,200        $2,320
$23,201–$94,300  12%    $71,100        $8,532
$94,301–$201,050 22%    $106,750      $23,485
$201,051–$383,900 24%   $48,950       $11,748
$383,901+        32%    $0             $0
```

### 4.2 Input Dependencies
*   `taxableIncome` from the simulation engine
*   `filingStatus`: Single, Married Filing Jointly, etc.
*   `federalBrackets[]`: Year-adjusted bracket thresholds (inflation-indexed)
*   `stateBrackets[]`: State-specific bracket thresholds
*   `standardDeduction`: Inflation-adjusted standard deduction amount

### 4.3 Data Model
```typescript
interface TaxBracket {
  lowerBound: number;
  upperBound: number;   // Infinity for top bracket
  rate: number;          // Decimal (e.g., 0.22 for 22%)
}

interface BracketUtilization {
  bracket: TaxBracket;
  amountFilled: number;
  taxOwed: number;
}

interface MarginalBracketView {
  year: number;
  filingStatus: "single" | "married_filing_jointly" | "married_filing_separately" | "head_of_household";
  taxableIncome: number;
  standardDeduction: number;
  federalBrackets: BracketUtilization[];
  stateBrackets: BracketUtilization[];
  totalFederalTax: number;
  totalStateTax: number;
  marginalRate: number;   // The highest bracket rate the user reaches
}
```

### 4.4 Bracket Fill Calculation
For each bracket $i$ (ordered by threshold):
$$\text{amountFilled}_i = \max(0, \min(\text{taxableIncome}, \text{upperBound}_i) - \text{lowerBound}_i)$$
$$\text{taxOwed}_i = \text{amountFilled}_i \times \text{rate}_i$$
$$\text{totalTax} = \sum_{i} \text{taxOwed}_i$$

---

## 5. Sub-Tab: Tax Strategy Comparison

### 5.1 Purpose
Compare the tax efficiency of different withdrawal and conversion strategies side-by-side.

### 5.2 Comparison Options
Users can compare scenarios such as:
*   **Baseline** vs. **Roth Conversion Ladder**: Convert traditional IRA/401k balances to Roth in low-income years
*   **Baseline** vs. **Accelerated Drawdown**: Draw down tax-deferred accounts earlier to stay in lower brackets
*   **Baseline** vs. **Delayed Social Security**: Push SS to age 70 for higher benefit

### 5.3 Displayed Metrics (Side-by-Side Cards)

| Metric | Baseline | Strategy B |
|--------|---------|------------|
| Lifetime Taxes | $1.51M | $1.38M |
| Average ETR | 13.07% | 11.95% |
| Net Legacy | $2.89M | $3.02M |
| Success Rate | 95.92% | 96.50% |

### 5.4 Data Model
```typescript
interface TaxStrategyComparison {
  scenarios: Array<{
    name: string;
    description: string;
    lifetimeTaxes: number;
    averageETR: number;
    netLegacy: number;
    successRate: number;
    yearByYear: TaxYearRow[];
  }>;
}
```

---

## 6. Calculation Engine Dependencies

| Dependency | Source | Purpose |
|-----------|--------|---------|
| `grossIncome` per year | Simulation Engine | Compute taxable income |
| `filingStatus` | About You | Select correct brackets |
| `state` | About You | Apply state tax brackets |
| `standardDeduction` | Tax Tables | Subtract from AGI |
| `etrOverrides` | Plan Tab | Toggle income/tax components |
| `capitalGains` per year | Simulation Engine | Apply cap gains rates |
| `socialSecurityIncome` | Plan Events | Determine taxable SS portion |

---

## 7. Key Formulas

### 7.1 FICA Tax
$$\text{FICA} = \min(\text{wages}, \text{SSLimit}) \times 0.062 + \text{wages} \times 0.0145$$
*   Additional Medicare tax of 0.9% applies on wages above $200K (single) / $250K (MFJ)

### 7.2 Capital Gains Tax
$$\text{gainRatio} = \frac{\text{currentValue} - \text{costBasis}}{\text{currentValue}}$$
$$\text{taxableGain} = \text{withdrawalAmount} \times \text{gainRatio}$$
*   Long-term gains use preferential rates: 0%, 15%, or 20% based on income level
*   Short-term gains taxed as ordinary income

### 7.3 Social Security Taxation
Up to 85% of Social Security benefits may be taxable depending on "combined income":
$$\text{combinedIncome} = \text{AGI} + \text{nonTaxableInterest} + \frac{\text{SSBenefit}}{2}$$

| Combined Income (MFJ) | SS Taxable Portion |
|----------------------|-------------------|
| < $32,000 | 0% |
| $32,000–$44,000 | Up to 50% |
| > $44,000 | Up to 85% |
