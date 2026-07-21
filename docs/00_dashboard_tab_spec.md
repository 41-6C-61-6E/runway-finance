# Spec: Dashboard Tab

> **Location**: Main Sidebar → Dashboard (primary default landing page)
> **Purpose**: Provide a comprehensive visual snapshot of the user's current net worth, historical growth trend, asset/liability allocations, active projection scenarios, and quick actions to spin off new plans.

---

## 1. Visual Layout & Panels

The Dashboard supports a responsive two-column grid on desktop screens and reflows into a single stacked column on tablet and mobile viewports.

### 1.1 Desktop Layout Architecture

| Panel | Width | Content / Widgets |
|---|---|---|
| **Left Main Panel** | ~60% width | Giant Net Worth display, All-Time Change percentage, interactive Net Worth Trend Line Chart, and Timeframe Zoom selectors. |
| **Right Side Panel** | ~40% width | Side-by-side vertical lists summarizing **Assets** (categorized with custom icons and color-coded tags) and **Liabilities** (mortgages, car loans, credit cards). |
| **Bottom Grid** | 100% width | "Plans for the Future" section displaying interactive Plan Cards (Current Projections, plan2, etc.) and an "Add Plan" template card. |

### 1.2 Widget Detailed Design

#### A. Net Worth Summary Display
*   **Selector Dropdown**: A small selector button labeled "NET WORTH" with a downward arrow (`v-icon`).
*   **Total Amount**: Large, high-impact bold typography (`text-h3` or equivalent) displaying aggregate net worth (e.g., `$1.24M`).
*   **All-Time Change Badge**: Color-coded change badge displaying the absolute and percentage change from the oldest logged progress point to today:
    *   *Green text + Up Arrow*: If change is positive (e.g., `▲ $785K (174.44%)`).
    *   *Red text + Down Arrow*: If change is negative.
*   *Reference Image*: ![Dashboard View](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/dashboard_view.png)

#### B. Net Worth Trend Chart
*   **Type**: Semi-filled area/line chart with a smooth curved line.
*   **Chart Line Color**: Teal/Green family (`#2CD5C4` or equivalent) matching net worth accrual colors.
*   **Gridlines**: Thin horizontal dashed gridlines displaying currency increments (e.g., $600K, $800K, $1M, $1.2M).
*   **Zoom Timeframe Buttons**: Horizontal button group centered below the chart:
    *   `1M` (1 month)
    *   `3M` (3 months)
    *   `1Y` (1 year)
    *   `5Y` (5 years)
    *   `10Y` (10 years)
    *   `ALL` (All-Time, highlighted by default)

#### C. Assets Allocation List (Right Column)
*   **Header**: "ASSETS" in uppercase gray text with the total asset value (e.g., `$1.34M`) in bold white text.
*   **Rows**: List of current asset items. Each item displays:
    *   *Category Icon*: Custom color-coded icon indicating type:
        *   `House` (Home icon, blue background)
        *   `401k/403b` (Bar chart icon, light blue background)
        *   `Roth IRA` (Line chart icon, blue background)
        *   `Taxable Investments` (Stock line icon, teal background)
        *   `Savings` (Piggy bank icon, green/teal background)
        *   `Cryptocurrency` (Bitcoin/Crypto icon, purple background)
    *   *Name*: Asset label.
    *   *Value*: Current balance right-aligned (e.g., `$625K`, `$198K`).
*   *Reference Image*: ![Asset List Layout](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/dashboard.png)

#### D. Liabilities Allocation List (Right Column)
*   **Header**: "LIABILITIES" in uppercase gray text with the total liability value (e.g., `$101.5K`) in bold white text.
*   **Rows**: List of current outstanding debt items:
    *   *Category Icon*: Custom color-coded icon indicating type:
        *   `House Loan` (Home icon, blue background)
        *   `My Car Loan` (Car icon, purple background)
    *   *Name*: Liability label.
    *   *Value*: Outstanding balance right-aligned (e.g., `$95K`, `$6.5K`).

#### E. Plans for the Future Grid (Bottom Section)
*   **Header**: "Plans for the Future" on the left, and a plan display filter dropdown (e.g. "Full Plan") on the right.
*   **Plan Cards**: Grid layout containing active projection scenarios:
    *   *Current Projections Card*:
        *   *Header*: Circular blue icon representing line chart, Scenario Name ("Current Projections"), calendar icon with target timeline description ("Now"), notification bell icon with badge counter (e.g., `1` notification for recommended actions), and vertical three-dots actions menu.
        *   *Chart Preview*: Embedded sparkline/area chart showing the long-term net worth curve of this plan.
        *   *Timeline Markers*: Milestone icons overlaying the sparkline chart:
            *   *Blue Flag*: Plan Start Year.
            *   *Green Palm Tree*: Retirement Milestone.
            *   *Pink Palm Tree*: Spouse Retirement Milestone.
            *   *Double Heart / Health Rate Icon*: Life Expectancy Milestone.
    *   *Add Plan Card*:
        *   Dashed card border containing a large "+" icon button, title "Add Plan", and subtitle "Create a new plan" to launch the plan setup wizard.

---

## 2. Data Model & State Schema

The Dashboard UI consolidates state from the Today, Progress, and Plan settings models.

```typescript
interface DashboardAssetItem {
  id: string;
  name: string;
  type: "house" | "retirement_deferred" | "retirement_exempt" | "taxable" | "savings" | "crypto";
  balance: number;
}

interface DashboardLiabilityItem {
  id: string;
  name: string;
  type: "mortgage" | "car_loan" | "credit_card" | "student_loan" | "other";
  balance: number;
}

interface DashboardPlanCard {
  planId: string;
  name: string;
  startLabel: string; // E.g., "Now" or "2026"
  notificationsCount: number;
  timelineChartData: Array<{ year: number; netWorth: number }>;
  milestones: Array<{
    type: "start" | "retirement" | "spouse_retirement" | "life_expectancy";
    year: number;
  }>;
}

interface DashboardState {
  currentNetWorth: number;
  allTimeChange: {
    absolute: number;
    percentage: number;
  };
  historicalTrend: Array<{ date: string; netWorth: number }>;
  assetsTotal: number;
  assets: DashboardAssetItem[];
  liabilitiesTotal: number;
  liabilities: DashboardLiabilityItem[];
  plans: DashboardPlanCard[];
}
```

---

## 3. Business Logic & Calculation Rules

### 3.1 Aggregations
*   **Total Assets**: Sum of all cash accounts, investment balances, and real asset values:
    $$\text{Total Assets} = \sum \text{AssetBalance}_i$$
*   **Total Liabilities**: Sum of all outstanding loan balances and unsecured debt values:
    $$\text{Total Liabilities} = \sum \text{LiabilityBalance}_j$$
*   **Current Net Worth**: Total Assets minus Total Liabilities:
    $$\text{Net Worth} = \text{Total Assets} - \text{Total Liabilities}$$

### 3.2 Trend Calculations
*   **All-Time Net Worth Change**: The delta between the latest progress net worth point $NW_{\text{now}}$ and the oldest available progress point $NW_{\text{initial}}$:
    $$\Delta NW_{\text{absolute}} = NW_{\text{now}} - NW_{\text{initial}}$$
    $$\Delta NW_{\text{percentage}} = \frac{NW_{\text{now}} - NW_{\text{initial}}}{NW_{\text{initial}}} \times 100\%$$

---

## 4. UI Interactions & Controls

| Element | Interaction | Action / System Response |
|---|---|---|
| **NET WORTH Selector** | Click dropdown | Toggle between Net Worth view, Liquid Net Worth view, or Investable Assets view. |
| **Timeframe Zoom Buttons** | Click (e.g. `5Y`) | Filter the chart dates and redraw the SVG net worth curve to fit the selected window. |
| **Asset/Liability Rows** | Click | Navigates the user directly to the **Today** tab and highlights/scrolls to the clicked account. |
| **Plan Card Header Menu** | Click three-dots | Open options: Rename Plan, Copy Plan, Delete Plan, Share Plan. |
| **Plan Card Canvas** | Click | Navigates the user into the **Plan Timeline** of that specific scenario. |
| **Add Plan Card** | Click | Opens a modal prompting for Plan Name, Spouse Inclusion, Birth Years, and Country/State. |
