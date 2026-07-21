# Spec: Estate Tab (Estate Settlement Engine)

> **Location**: Current Projections → Estate tab (eighth/final tab)
> **Purpose**: Model the estate distribution at the end of the planning horizon, calculating tax drag, liquidation costs, probate fees, and the net inheritance passed to heirs.

---

## 1. Visual Layout

### 1.1 Primary View — Estate Waterfall

![Estate View](/Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/estate.png)

The Estate tab displays a **waterfall/funnel visualization** showing how the gross estate value is reduced by various drags to arrive at the net legacy:

```
┌─────────────────────────────────┐
│   Gross Estate: $3,190,000      │
├─────────────────────────────────┤
│ - Tax-Deferred Drag:  -$180,000 │  (401k/IRA taxes)
│ - Taxable Acct Drag:  -$0       │  (stepped-up basis)
│ - Real Estate Drag:   -$37,500  │  (6% liquidation)
│ - Admin/Probate:      -$31,900  │  (1% admin cost)
│ - Charitable Gifts:   -$50,000  │
├─────────────────────────────────┤
│   Net Legacy: $2,890,600        │
└─────────────────────────────────┘
```

### 1.2 Estate Settlement Settings Panel

![Estate Settings](/Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/plan_estate_settling_config.png)

A side panel or collapsible section with configurable parameters:

| Setting | Control Type | Range | Default |
|---------|-------------|-------|---------|
| Heir Flat Income Tax Rate | Slider | 0–50% | 25% |
| Step-Up Basis on Taxable | Toggle | boolean | `true` |
| Real Estate Liquidation Cost | Slider | 0–15% | 6% |
| Administrative/Probate Cost | Slider | 0–10% | 1% |
| Charitable Giving Amount | Currency input | >= $0 | $0 |
| Charitable Allocation Strategy | Dropdown | `"tax_inefficient_first"` \| `"proportional"` \| `"manual"` | `"tax_inefficient_first"` |

### 1.3 Account-Level Breakdown Table

Below the waterfall, a detailed table shows the drag applied to each individual account:

| Account | Type | Gross Value | Drag Applied | Drag % | Net to Heirs |
|---------|------|-------------|-------------|--------|-------------|
| 401k (You) | Tax-Deferred | $520,000 | $130,000 | 25% | $390,000 |
| 401k (Spouse) | Tax-Deferred | $200,000 | $50,000 | 25% | $150,000 |
| Roth IRA (You) | Tax-Exempt | $450,000 | $0 | 0% | $450,000 |
| Roth IRA (Spouse) | Tax-Exempt | $280,000 | $0 | 0% | $280,000 |
| Taxable Brokerage | Taxable | $680,000 | $0 | 0% | $680,000 |
| House | Real Asset | $625,000 | $37,500 | 6% | $587,500 |
| Cash/Savings | Savings | $435,000 | $0 | 0% | $435,000 |

---

## 2. Data Models

### 2.1 Estate Configuration (Inputs)
```typescript
interface EstateConfig {
  heirFlatIncomeTaxRate: number;      // 0–0.50 (decimal)
  stepUpBasis: boolean;
  realEstateLiquidationRate: number;  // 0–0.15 (decimal)
  administrativeCostRate: number;     // 0–0.10 (decimal)
  charitableGiving: number;           // Dollar amount
  charitableAllocationStrategy: "tax_inefficient_first" | "proportional" | "manual";
  manualCharitableAllocations?: Array<{ accountId: string; amount: number }>;
}
```

### 2.2 Account Estate Record
```typescript
interface AccountEstateRecord {
  accountId: string;
  accountName: string;
  accountType: "savings" | "taxable" | "tax_deferred" | "roth" | "real_asset";
  owner: "primary" | "spouse" | "joint";
  
  grossValue: number;           // Account value at end of plan
  costBasis?: number;           // For taxable accounts (for capital gains calc)
  
  dragAmount: number;           // Total drag on this account
  dragPercentage: number;       // dragAmount / grossValue
  dragBreakdown: {
    incomeTaxDrag: number;      // For tax-deferred accounts
    capitalGainsDrag: number;   // For taxable accounts (if no step-up)
    liquidationDrag: number;    // For real assets
    charitableAllocation: number; // Portion allocated to charity
  };
  
  netToHeirs: number;           // grossValue - dragAmount
}
```

### 2.3 Estate Output
```typescript
interface EstateOutput {
  grossEstateValue: number;
  
  totalDrag: {
    taxDeferredDrag: number;
    taxableAccountDrag: number;
    realEstateDrag: number;
    administrativeDrag: number;
    charitableGiving: number;
    totalDragAmount: number;
    totalDragPercentage: number;   // totalDragAmount / grossEstateValue
  };
  
  netLegacy: number;              // grossEstateValue - totalDragAmount
  
  accounts: AccountEstateRecord[];
  
  // Summary metrics
  effectiveEstateTaxRate: number;  // totalDragAmount / grossEstateValue
}
```

---

## 3. Calculation Logic

### 3.1 Tax-Deferred Account Drag (401k, Traditional IRA)
Heirs must pay income tax on inherited tax-deferred balances:
$$\text{drag}_{\text{deferred}} = \text{balance} \times \text{heirFlatIncomeTaxRate}$$

> [!NOTE]
> This uses a simplified flat rate rather than modeling the heir's actual marginal brackets, since the heir's income is unknown.

### 3.2 Taxable Account Drag (Brokerage, Crypto)

**If `stepUpBasis` is `true`** (default):
$$\text{drag}_{\text{taxable}} = \$0$$
The cost basis is "stepped up" to fair market value at death, eliminating unrealized capital gains.

**If `stepUpBasis` is `false`**:
$$\text{unrealizedGain} = \text{currentValue} - \text{costBasis}$$
$$\text{drag}_{\text{taxable}} = \text{unrealizedGain} \times \text{heirCapitalGainsRate}$$

### 3.3 Tax-Exempt Account Drag (Roth IRA, Roth 401k)
$$\text{drag}_{\text{roth}} = \$0$$
Roth accounts pass to heirs completely tax-free.

### 3.4 Real Estate Liquidation Drag
$$\text{drag}_{\text{realEstate}} = \text{realEstateValue} \times \text{liquidationRate}$$
Covers real estate agent commissions, closing costs, and transaction fees.

### 3.5 Administrative & Probate Drag
$$\text{drag}_{\text{admin}} = \text{grossEstateValue} \times \text{administrativeCostRate}$$
Covers attorney fees, probate court costs, executor fees, and settlement expenses.

### 3.6 Charitable Giving Allocation
When charitable giving is configured:

**Tax-Inefficient First Strategy** (default):
1. Allocate charitable gifts from Tax-Deferred accounts first (saves heir income tax)
2. Then from Taxable accounts (saves heir capital gains tax)
3. Then from Roth accounts last (no tax benefit from donating)

$$\text{charityFromDeferred} = \min(\text{charitableAmount}, \text{totalDeferredBalance})$$
$$\text{remaining} = \text{charitableAmount} - \text{charityFromDeferred}$$
$$\text{charityFromTaxable} = \min(\text{remaining}, \text{totalTaxableBalance})$$
*...and so on*

### 3.7 Net Legacy
$$\text{netLegacy} = \text{grossEstate} - \text{drag}_{\text{deferred}} - \text{drag}_{\text{taxable}} - \text{drag}_{\text{realEstate}} - \text{drag}_{\text{admin}} - \text{charitableGiving}$$

### 3.8 Effective Estate Drag Rate
$$\text{estateDragRate} = \frac{\text{totalDragAmount}}{\text{grossEstateValue}} \times 100\%$$

---

## 4. Input Dependencies

| Dependency | Source | Purpose |
|-----------|--------|---------|
| End-of-plan account balances | Simulation Engine (final year) | Gross values for each account |
| Account types & cost bases | Current Finances | Determine drag rules per account |
| Estate assumptions | Plan Tab (left panel) | Settlement configuration parameters |
| Real estate values | Current Finances | Apply liquidation rate |

---

## 5. Interactions & Controls

| Control | Type | Behavior |
|---------|------|----------|
| Heir Tax Rate Slider | Slider | Adjusts flat income tax rate; recalculates drag in real-time |
| Step-Up Basis Toggle | Toggle switch | Toggles capital gains drag on taxable accounts |
| Liquidation Rate Slider | Slider | Adjusts real estate selling cost percentage |
| Admin Cost Slider | Slider | Adjusts probate/admin cost percentage |
| Charitable Amount Input | Currency input | Sets total charitable giving; recalculates allocation |
| Allocation Strategy Dropdown | Dropdown | Changes how charity is allocated across accounts |
| Account Table Hover | Tooltip | Shows detailed drag breakdown for the hovered account |
| Export | Button | Download estate breakdown as PDF or CSV |

---

## 6. Waterfall Chart Rendering

*   **Chart type**: Horizontal or vertical waterfall bar chart
*   **Bars**: 
    *   Starting bar (green): Gross Estate Value
    *   Drag bars (red/coral): Each drag component, shown as downward steps
    *   Final bar (teal): Net Legacy
*   **Labels**: Dollar amounts and percentages on each bar
*   **Animation**: Bars should animate in sequentially when the tab is first opened
*   **Responsive**: Must work at viewport widths from 768px to 1920px
