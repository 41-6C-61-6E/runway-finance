# Spec: Today Tab (Current Finances Balance Sheet)

> **Location**: Main Sidebar → Today (or Current Finances)
> **Purpose**: Manage the user's starting baseline financial profile. It acts as the balance sheet configuration engine, tracking cash savings, tax-advantaged and taxable investments, depreciating or appreciating real assets, linked liabilities, unsecured debt obligations, and demographic information.

---

## 1. Visual Layout & Header Donut Cards

The Today tab displays three top-level donut charts providing an instant aggregation of the baseline financials:
1.  **Net Worth Donut**: Displays the total net worth (Assets minus Liabilities, e.g., `$1.24M`) in bold center text.
2.  **Assets Donut**: Displays the total value of all assets (e.g., `$1.34M`) divided into segments representing Cash, Taxable, Tax-Deferred, and Real Assets.
3.  **Liabilities Donut**: Displays the total outstanding debt balances (e.g., `$101.5K`) representing mortgages, car loans, and student loans.

Below these charts, a horizontal **Category Selector Tab Bar** navigates between the balance sheet categories:
*   `$60K Savings` (with piggy bank icon)
*   `$628K Investments` (with chart icon)
*   `$547K Real Assets` (with home/car icon)
*   `$0 Unsecured Debts` (with credit card / graduation cap icon)
*   `About You` (with user profile icon)

---

## 2. Category Views & Form Fields

### 2.1 Savings Category View

![Savings view](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/current_finances.png)
*   *Alternative Capture (List expansion)*: [Savings Accounts List](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/today_add_savings_modal.png)

Displays a vertical list of savings and cash accounts. Each card displays:
*   *Icon*: Green circle piggy bank icon.
*   *Title*: Account name (editable text header, e.g., "Savings").
*   *Balance Input*: Currency number field (labeled "Balance").
*   *Owner Dropdown*: Dropdown selector (labeled "Owner") displaying the owner's avatar and name (`"You"` | `"Spouse"` | `"Joint"`).
*   *Add Button*: A centered outlined button labeled `+ Add Savings` at the bottom of the list.

### 2.2 Investments Category View

![Investments view](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/today_cost_basis_modal.png)

Displays a list of retirement, brokerage, and cryptocurrency accounts:
*   *Icon*: Blue circle bar chart icon.
*   *Title*: Account type (e.g., "401k/403b", "Taxable Investments", "Roth IRA").
*   *Balance Input*: Labeled "Balance" showing currency value.
*   *Owner Dropdown*: Labeled "Owner".
*   *Cost Basis Selector (Taxable & Crypto only)*:
    *   Displays a label on the right: `Cost: $X,XXX` (e.g., `Cost: $47,500`).
    *   Features a gear icon button (`v-btn icon`) next to it. Clicking it exposes advanced cost basis inputs to set baseline unrealized capital gains.

### 2.3 Real Assets Category View

![Real Assets view](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/today_real_assets.png)

Real assets (like property or vehicles) have a multi-row structured layout to collect linked loans:
*   *Row 1 (Asset Info)*:
    *   **Purchase Price**: Currency input (original purchase price, used for capital gains/depreciation calculations).
    *   **Current Value**: Currency input (current market value).
    *   **Owner**: Dropdown (`"You"` | `"Spouse"` | `"Joint"`).
*   *Row 2 (Loan Status)*:
    *   **Status**: Dropdown selecting `"Owned"` or `"Financed"`.
    *   If `"Financed"` is active, the row expands to show:
        *   **Current Loan Balance**: Currency input.
        *   **Annual Percentage Rate**: Percentage input (labeled "4.5%").
*   *Row 3 (Financing Details)*:
    *   **Interest**: Dropdown selecting `"Simple"` or `"Compound"`.
    *   **Monthly Payment**: Currency input representing monthly debt service.
    *   **Years to pay off**: Text label calculated on the fly showing the loan amortization term remaining (e.g., `Years to pay off: 2`).

### 2.4 Unsecured Debts Category View

![Unsecured Debts view](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/today_add_unsecured_debt_modal.png)

Displays standalone liabilities (such as student loans or medical debt):
*   *Row 1*:
    *   **Balance**: Outstanding debt balance.
    *   **Annual Percentage Rate**: Interest APR percentage.
    *   **Owner**: Dropdown.
*   *Row 2*:
    *   **Interest**: Dropdown (`"Simple"` | `"Compound"`).
    *   **Compounding**: Frequency dropdown (`"Daily"` | `"Monthly"` | `"Yearly"`).
    *   **Monthly Payment**: Scheduled monthly paydown.
*   *Row 3*:
    *   **Years to pay off**: Calculated payoff duration.

---

## 3. "Add Account" Selection Modals

When clicking the `+ Add [Category]` button, a dim overlay dialog presents specific account subtypes:

### 3.1 Add Investments Modal

![Add Investments Overlay](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/today_add_investments_modal.png)

Lists choices to initialize account settings:
1.  **Taxable Investments** (Standard brokerage)
2.  **Individual Retirement Accounts** (Traditional/Roth IRAs)
3.  **Employer Retirement Accounts** (Traditional/Roth 401k or 403b)
4.  **Cryptocurrency** (Applies specific capital gains logic)
5.  **HSA** (Health Savings Account with qualified medical spending rules)
6.  **529 Plan** (College savings account)

### 3.2 Add Real Assets Modal

![Add Real Asset Overlay](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/today_add_real_assets_modal.png)

Lists asset categories to establish depreciation/appreciation rates:
1.  **House** (Primary Residence)
2.  **Car** (Vehicles with default 8% depreciation rates)
3.  **Rental Property** (Real estate generating active rental income)
4.  **Commercial Property**
5.  **Land**
6.  **Building**
7.  **Motorcycle** / **Boat**
8.  **Jewelry** / **Precious Metals**
9.  **Furniture** / **Instruments**

### 3.3 Add Unsecured Debt Modal

![Add Unsecured Debt Overlay](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/today_add_unsecured_debt_modal.png)

Lists debt structures:
1.  **Personal Loan**
2.  **Student Loan** (Optional grace periods or specialized consolidation rules)
3.  **Medical Debt**
4.  **Credit Card Debt**
5.  **Other Debt**

---

## 4. Business Logic & Calculations

### 4.1 Years to Pay Off Amortized Loans

For financed real assets or unsecured debts, the remaining payoff duration in years ($Y$) is calculated from the balance ($B$), the monthly payment ($P$), and the annual interest rate ($APR$):

Let $r = \frac{APR}{100 \times 12}$ be the monthly interest rate:
*   If $r = 0$ (0% interest loan):
    $$Y = \frac{B}{P \times 12}$$
*   If $r > 0$ and $P \leq B \times r$ (payment does not cover monthly interest accrue):
    $$Y = \infty \quad \text{(Label: "Never")}$$
*   If $r > 0$ and $P > B \times r$:
    $$n = -\frac{\ln\left(1 - \frac{B \times r}{P}\right)}{\ln(1 + r)}$$
    $$Y = \text{round}\left(\frac{n}{12}, 1\right)$$

### 4.2 Cost Basis and Capital Gains Ratio
For taxable brokerage and cryptocurrency accounts, the unrealized gains ratio ($G_{\text{ratio}}$) determines the taxable component of any subsequent liquidations during projections:
$$G_{\text{ratio}} = \frac{\text{Balance} - \text{Cost Basis}}{\text{Balance}}$$

---

## 5. Unified Types & Schemas

```typescript
export interface SavingsAccount {
  id: string;
  name: string;
  owner: "primary" | "spouse" | "joint";
  balance: number;
}

export interface InvestmentAccount {
  id: string;
  name: string;
  owner: "primary" | "spouse" | "joint";
  type: "taxable" | "ira_traditional" | "ira_roth" | "employer_deferred" | "employer_roth" | "hsa" | "crypto" | "529";
  balance: number;
  costBasis: number; // For taxable and crypto
}

export interface RealAsset {
  id: string;
  name: string;
  type: "house" | "car" | "rental" | "commercial" | "land" | "building" | "motorcycle" | "boat" | "jewelry" | "metals" | "furniture" | "instruments";
  purchasePrice: number;
  currentValue: number;
  owner: "primary" | "spouse" | "joint";
  status: "owned" | "financed";
  loan?: {
    balance: number;
    apr: number;
    interestType: "simple" | "compound";
    monthlyPayment: number;
  };
}

export interface UnsecuredDebt {
  id: string;
  name: string;
  type: "personal" | "student" | "medical" | "credit_card" | "other";
  balance: number;
  apr: number;
  owner: "primary" | "spouse" | "joint";
  interestType: "simple" | "compound";
  compoundingFrequency: "daily" | "monthly" | "yearly";
  monthlyPayment: number;
}
```
