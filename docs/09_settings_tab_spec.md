# Spec: Settings Tab (Plan Assumptions & Configurations)

> **Location**: Current Projections → Settings tab (ninth tab)
> **Purpose**: Manage plan-level growth rates, tax structures, milestones, calculation methodologies, and simulation behaviors that dictate the projection engine's math.

---

## 1. Visual Layout

The Settings tab contains plan-level configurations organized into 7 horizontal sub-tabs, each identified by an icon and text label:

1.  **Milestones**
2.  **Rates**
3.  **Dividends**
4.  **Bonds**
5.  **Tax**
6.  **Metrics**
7.  **Other**

Clicking a sub-tab displays a card-based settings view with toggle switches, sliders, number inputs, and select fields.

---

## 2. Detailed Configurations per Sub-Tab

### 2.1 Milestones Sub-Tab

![Milestones Settings](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/settings_milestones_overview.png)

Defines ages/years of key life transitions and liquid net worth target multiplier:
*   **Retirement Milestone**: The target retirement age (default 60). This age is a trigger point for spending shifts, withdrawal strategy activation, and pension/Social Security start eligibility.
*   **Life Expectancy Milestone**: The age at which the simulation terminates (default 100).
*   **FI Target Multiplier**: The liquid net worth multiplier used to calculate the "Financial Independence" target amount, relative to current annual spending (default 25x).

### 2.2 Rates Sub-Tab

Switches the simulation returns engine between three modes:

#### A. Fixed Returns Mode

![Fixed Rates Settings](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/settings_rates_fixed.png)

*   **Inflation Rate**: Constant annual inflation rate (default 3.0%).
*   **Benefit COLA Modifier**: Cost Of Living Adjustment offset applied to Social Security or pension benefits (default 0.0%).
*   **Stocks Returns**:
    *   *Growth Rate*: default 6.0%.
    *   *Dividend Yield*: default 2.5%.
    *   *Derived Real Return*: Calculated as:
        $$\text{Real Return} = \frac{1 + \text{Growth} + \text{Yield}}{1 + \text{Inflation}} - 1 = \frac{1.085}{1.03} - 1 = 5.34\%$$
*   **Bonds Returns**:
    *   *Growth Rate*: default 1.5%.
    *   *Yield*: default 3.5%.
    *   *Derived Real Return*: Calculated as:
        $$\text{Real Return} = \frac{1 + \text{Growth} + \text{Yield}}{1 + \text{Inflation}} - 1 = \frac{1.05}{1.03} - 1 = 1.94\%$$

#### B. Historical Returns Mode

![Historical Rates Settings](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/settings_rates_historical.png)

*   **Historical Sequence**:
    *   *Start Year*: Dropdown list select, default 1928.
    *   *Loopback Year*: Dropdown list select, default 1928 (the year the engine loops back to if the simulation timeline exceeds historical limits).
*   **Return Modifiers**: Allow adjusting historical baseline indices:
    *   *Inflation Modifier*: default 0.0%.
    *   *Benefit COLA Modifier*: default 0.0%.
    *   *Stocks Growth Rate Modifier*: default 0.0%.
    *   *Stocks Dividend Yield Modifier*: default 0.0%.
    *   *Bonds Growth Rate Modifier*: default 0.0%.
    *   *Bonds Yield Modifier*: default 0.0%.

#### C. Advanced Returns Mode
*   **Randomized Normal Returns (Monte Carlo)**: Define mean ($\mu$), standard deviation ($\sigma$), and correlation coefficients between asset classes (Cash, Equity, Real Estate, Crypto).

### 2.3 Dividends Sub-Tab

![Dividends Settings](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/settings_dividends.png)

Customizes assumptions for dividend yields and reinvestment behavior:
*   **Dividend Reinvestment**: Dropdown selection (choices: `Always` (default)).
*   **Stock Dividend Tax Composition**: Slider and textbox controls:
    *   *Qualified Dividends*: default 100% (taxed at long-term capital gains tax rates).
    *   *Ordinary Dividends*: default 0% (taxed at progressive ordinary income tax rates).

### 2.4 Bonds Sub-Tab

![Bonds Settings](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/settings_bonds.png)

*   **Bond Allocation Mode**: Button toggles between `None` (default) and `Portfolio Allocation`.
*   **Portfolio Allocation Options**:
    *   *Target Portfolio Bond Allocation*: Target allocation percentages per age (plot editor).
    *   *Bond Location*: Buttons to select `Distribute Evenly` or `Prioritize Accounts`.
    *   *Bond Priority Order*: Drag-and-drop rank list of accounts (default priority: Roth IRA, 401(k)/403(b), HSA, Taxable Investments).
    *   *Bond Income Composition*: Tax-treatment sliders (range 0 to 100):
        *   *Municipal Bonds*: default 0% (exempt from federal and state income tax).
        *   *Treasury / Government*: default 0% (exempt from state/local tax; taxable at federal level).
        *   *Other (Corporate, High-Yield)*: default 100% (fully taxable at ordinary rates).

### 2.5 Tax Sub-Tab

![Tax Settings](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/settings_tax_filing_status.png)

Customizes filing type (Joint vs. Separate), withholding rates, and custom assumptions:
*   **Filing Status**: Card toggle between *Married Filing Jointly* and *Married Filing Separately* (or Single).
*   **Withholding Defaults**:
    *   *Tax-Deferred*: Default 20% withholding rate on traditional distributions.
    *   *Taxable*: Default 10% withholding rate on taxable distributions.
*   **Modifiers**:
    *   *Income Tax Modifier*: Slider and textbox input, default 0.0% (range -20% to 20%).
    *   *Capital Gains Tax Modifier*: Slider and textbox input, default 0.0% (range -20% to 20%).

### 2.6 Metrics Sub-Tab

![Metrics Settings](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/settings_metrics.png)

Customizes what is counted as spending and net legacy calculations:
*   **Effective Tax Rate Calculations**:
    *   *Income definition*: Configure whether Return of Capital, Non-Taxable Sale Proceeds, or Tax-Free Distributions are counted in the ETR denominator.
    *   *Tax definition*: Configure whether Local Income Tax or Property Tax are counted in the ETR numerator.
*   **Spending definition**: Toggles whether principal mortgage payments, debt paydowns, or taxes count as "annual spending" metrics.
*   **Net Legacy Calculations**: E.g. step-up in basis assumptions, estate liquidation friction costs.

### 2.7 Other Sub-Tab

![Other Settings](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/settings_other.png)

*   **Year Alignment**: Dropdown selection (default `Calendar year`, disabled by default unless overridden).
*   **Override Year Alignment**: Checkbox, default unchecked.

---

## 3. Data Models

```typescript
type ReturnsMode = "fixed" | "historical" | "advanced";
type TaxFilingStatus = "single" | "married_jointly" | "married_separately";

interface PlanSettings {
  planId: string;
  milestones: {
    retirementAge: number;
    lifeExpectancyAge: number;
    fiTargetMultiplier: number;
  };
  rates: {
    mode: ReturnsMode;
    fixed: {
      stocksGrowth: number; // default 6.0
      stocksDividend: number; // default 2.5
      bondsGrowth: number; // default 1.5
      bondsYield: number; // default 3.5
      inflation: number; // default 3.0
      benefitColaModifier: number; // default 0.0
    };
    historical: {
      startYear: number;
      loopbackYear: number;
      modifiers: {
        inflation: number;
        benefitCola: number;
        stocksGrowth: number;
        stocksYield: number;
        bondsGrowth: number;
        bondsYield: number;
      };
    };
  };
  dividends: {
    reinvest: "always" | "never" | "custom";
    qualifiedRatio: number; // default 1.0 (100% qualified)
  };
  bonds: {
    mode: "none" | "portfolio_allocation";
    allocationPercent?: number;
    locationRules?: "distribute_evenly" | "prioritize";
    priorityOrder?: string[]; // E.g. ["roth", "deferred", "hsa", "taxable"]
    composition: {
      municipal: number; // default 0
      treasury: number; // default 0
      corporate: number; // default 100
    };
  };
  tax: {
    filingStatus: TaxFilingStatus;
    withholdingDeferred: number; // default 20%
    withholdingTaxable: number; // default 10%
    incomeTaxModifier: number; // default 0.0
    capGainsTaxModifier: number; // default 0.0
  };
  metrics: {
    etrNumeratorIncludesLocalTax: boolean;
    etrNumeratorIncludesPropertyTax: boolean;
    etrDenominatorIncludesReturnOfCapital: boolean;
    etrDenominatorIncludesNonTaxableSales: boolean;
    spendingIncludesMortgagePrincipal: boolean;
    spendingIncludesDebtPaydowns: boolean;
  };
  other: {
    overrideYearAlignment: boolean;
    alignToCalendarYear: boolean;
  };
}
```
