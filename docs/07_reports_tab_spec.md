# Spec: Reports Tab (Tabular Projections & Charts Engine)

> **Location**: Current Projections → Reports tab (seventh tab)
> **Purpose**: Render the full year-by-year financial simulation as an interactive split view containing customizable charts on top, a spreadsheet-style data grid below, preset filters, display tuning sliders, and multi-format exports.

---

## 1. Visual Layout & Modes

```carousel
![Reports Grid Overview](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_tab_overview.png)
<!-- slide -->
![Explore View](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_explore_view.png)
<!-- slide -->
![Explore Metric Filter](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_explore_column_filter_expanded.png)
<!-- slide -->
![Summary Preset Table](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_table_summary.png)
```

The Reports tab uses a split-screen dashboard:
1. **Control Toolbar (Top)**: Quick toggle buttons, preset selectors, display config, and export utilities.
    *   *Reference Image (Toolbar Layout)*: [Reports Overview](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports.png) or [Toolbar Button Focus](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_toolbar_button_146.png)
2. **Chart Area (Middle)**: Highly interactive visualization showing active metric curves (e.g. Net Worth line or stacked spending) with timeline milestones.
    *   *Reference Image (Chart View)*: [Net Worth Chart Area](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_chart_net_worth.png) or [Net Worth Plot](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_chart_net_worth_plot.png)
3. **Data Grid (Bottom)**: A scrollable, high-performance financial spreadsheet detailing annual rows.
    *   *Reference Image (Spreadsheet Grid)*: [Plan Reports Grid](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/plan_reports_grid.png)

### 1.1 Toolbar Components
*   **Explore Toggle Button**: Activates custom ad-hoc metrics selection mode.
    *   *Reference Image*: [Explore Active Menu](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_explore_menu.png) or [Column Checkbox Selector](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/plan_reports_column_selector.png)
*   **Tables Presets Select Menu**: Selects from pre-defined table configurations. Selecting an option updates the active button label (e.g. `Summary`) and updates the table columns.
    *   *Reference Images*: [Tables Selector Menu](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_tables_menu.png) or [Table Dropdown Open](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_table_menu.png)
*   **Plots Presets Select Menu**: Selects from pre-defined chart configurations. Selecting an option updates the active button label (e.g. `Net Worth`) and shifts the chart type/metrics.
    *   *Reference Images*: [Plots Selector Menu](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_plots_menu.png), [Plots Dropdown Open](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_plots_view.png), [Plot Menu State 1](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_plot_menu_open_1.png), or [Plot Menu State 2](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_plot_menu_open_2.png)
*   **Tuning Slider Icon Button**: Toggles the **Display Options** slide-out card.
    *   *Reference Image*: [Display Options Panel](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_display_options.png)
*   **Maximize Icon Button**: Fits the reports tab into full-screen view.
*   **Export/Download Icon Button**: Opens the export file menu.
*   **Options Vertical Dots Button**: Opens utility resets.

---

## 2. Built-in Plots Catalog

ProjectionLab maps specific financial components to pre-configured plot groups. Toggling these changes the chart structure and sets default checkboxes for the legend.

### 2.1 Plot Presets

| Plot Preset | Chart Style | Default Legend/Series Elements | Screenshot Asset |
|-------------|-------------|--------------------------------|------------------|
| **Net Worth** | Line | Net Worth, Liquid Net Worth, Spouse Assets, You Assets, Debt, Equity in Real Assets, Cash, Tax-Free Investments, Tax-Deferred Investments, Taxable Investments, Cryptocurrency | [reports_plot_net_worth.png](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_plot_net_worth.png) |
| **Stacked Net Worth** | Stacked Area / Stacked Bar | Net Worth (line overlay), Debt, Equity in Real Assets, Cash, Tax-Free Investments, Tax-Deferred Investments, Taxable Investments, Cryptocurrency | [reports_plot_stacked_net_worth.png](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_plot_stacked_net_worth.png) |
| **Income** | Stacked Area / Bar | Total (line overlay), Wage Income, Employer Contributions, Ordinary Investment Income, Tax-Free Distributions, RMDs, Tax-Deferred Distributions, Capital Gains Income | [reports_plot_income.png](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_plot_income.png) |
| **Expenses** | Stacked Area / Bar | Total (line overlay), Living Expenses, House, Dependent, Health Care, Vacation, Medical Expenses, Car, Emergency, Tax Return Payment, Medicare, IRMAA | [reports_plot_expenses.png](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_plot_expenses.png) |
| **Spending** | Stacked Area / Bar | Total (line overlay), Living Expenses, House, Dependent, Health Care, Vacation, Medical Expenses, Car, Emergency, Medicare, IRMAA | [reports_plot_spending.png](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_plot_spending.png) |
| **Spending Overview** | Stacked Area / Bar | Total (line overlay), Discretionary Spending, Essential Spending | [reports_plot_spending_overview.png](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_plot_spending_overview.png) |
| **Discretionary Spending** | Stacked Area / Bar | Total (line overlay), Vacation (and other user-defined flexible items) | [reports_plot_discretionary_spending.png](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_plot_discretionary_spending.png) |
| **Essential Spending** | Stacked Area / Bar | Total (line overlay), Living Expenses, House, Dependent, Health Care, Medical Expenses, Car, Emergency, Medicare, IRMAA | [reports_plot_essential_spending.png](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_plot_essential_spending.png) |
| **Spending Flex** | Bar | Total | [reports_plot_spending_flex.png](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_plot_spending_flex.png) |
| **Taxes** | Stacked Area / Bar | Total (line overlay), Federal Income Tax, FICA Tax, Capital Gains Tax, NIIT, State Income Tax, California SDI, Property Tax, IRMAA | [reports_plot_taxes.png](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_plot_taxes.png) |
| **Savings Rate** | Bar / Line | Savings Rate (%) | [reports_plot_savings_rate.png](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_plot_savings_rate.png) |

---

## 3. Table Presets Catalog

Table presets adjust the column layout of the year-by-year spreadsheet grid.

### 3.1 Preset Grid Mappings

#### 1. Summary Preset
Loads high-level plan statistics.
*   **Columns**: `Year`, `Net Worth`, `Liquid Net Worth`, `Income`, `Expenses`, `Taxes`, `Effective Tax Rate`, `Savings Rate`, `Withdrawals`, `Withdrawal Rate`, `Contributions`, `Transfers`
*   **Screenshot**: [reports_table_summary.png](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_table_summary.png)

#### 2. Rates Preset
Logs active inflation, asset returns, and internal growth indices for that calendar year.
*   **Columns**: `Year`, `Plan Stock Growth Rate`, `Plan Stock Dividend Yield`, `Plan Inflation Rate`, `Total Investment Growth`, `Growth: Cash`, `Growth: Tax-Free Investments`, `Growth: Tax-Deferred Investments`, `Growth: Taxable Investments`, `Growth: Cryptocurrency`
*   **Screenshot**: [reports_table_rates.png](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_table_rates.png)

#### 3. Income Preset
Details job earnings, employer contributions, distributions, and realized asset gains.
*   **Columns**: `Year`, `Income`, `My Job`, `Spouse's Job`, `Employer Match: 401k/403b (You)`, `Employer Match: 401k/403b (Spouse)`, `Savings Yield`, `HSA`, `RMD: 401k/403b (You)`, `RMD: 401k/403b (Spouse)`, `401k/403b (You)`, `401k/403b (Spouse)`, `Stock Dividends`, `Realized Gain: Cryptocurrency`, `Realized Gain: Taxable Investments`
*   **Screenshot**: [reports_table_income.png](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_table_income.png)

---

## 4. Display Tuning & Settings Panel

Triggered by the slider button, this panel renders a menu of styling and scaling overrides:

```carousel
![Inflation Settings](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_display_options_inflation.png)
<!-- slide -->
![Time Range Settings](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_display_options_timerange.png)
<!-- slide -->
![Appearance Options](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_display_options_appearance.png)
<!-- slide -->
![Y-Axis Scale](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_display_options_yaxis.png)
<!-- slide -->
![X-Labels Settings](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_display_options_xlabels.png)
```

### 4.1 Configuration Matrix

| Accordion Section | Option Name | Option Type | Behavior / Logic Description |
|-------------------|-------------|-------------|------------------------------|
| **INFLATION** | Show projections in | Dropdown | `Today's Currency` (values adjusted for inflation) vs `Future Currency` (raw nominal future-value figures). |
| **TIME RANGE** | View range | Dropdown | Focus on `Full Plan`, `Pre-Retirement`, `Retirement Window`, or a custom year range slider. |
| **APPEARANCE** | Rounded Bars | Toggle Switch | Applies CSS `border-radius: 8px 8px 0 0` on bar elements when rendering stacked bar charts. |
| **APPEARANCE** | Thick Bars | Toggle Switch | Increases the bar width/spacing ratio of Chart.js/Highcharts elements. |
| **APPEARANCE** | Show Every Tick | Toggle Switch | Forces the X-axis grid lines to print every single calendar year, preventing auto-skips. |
| **APPEARANCE** | Reset Appearance | Button | Reverts toggles to defaults. |
| **Y-AXIS** | Scale Style | Button Group | Toggles the Y-axis scale between `Linear` and `Logarithmic`. Log scale is vital for long-term compound growth curves. |
| **Y-AXIS** | Prefer Starting at Zero | Toggle Switch | When true, forces Y-axis minimum bounds to `$0` instead of dynamically cropping to the plan's low point. |
| **X-LABELS** | Label Format | Dropdown | Determines label formatting: `Your Age` (integer age), `Calendar Year` (e.g. 2045), or `Both` (e.g., "2045 (Age 66)"). |

---

## 5. File Export & Options Actions

```carousel
![Export Menu Open](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_export_menu.png)
<!-- slide -->
![Three Dots Menu Open](file:///Users/alanracek/Documents/antigravity/lucid-rutherford/projectionlab_research/reports_threedots_menu.png)
```

*   **Export Menu**:
    *   `CSV`: Downloads a comma-separated text file of the active grid layout, respecting columns and sorting.
    *   `JSON`: Outputs the full simulation result payload containing the complete raw state sequence.
    *   `PDF`: Triggers a stylized print preview designed via CSS media query `@media print` that styles the chart and table on clean grid sheets.
*   **Utility Resets (Three-Dots)**:
    *   `Reset Chart Height`: Restores the chart height ratio to standard layout sizing.
    *   `Reset Plot Config`: Clears active checkbox lists and resets all built-in plot legend choices to standard configurations.

---

## 6. Implementation Strategies

### 6.1 State Management (State Sync Schema)

To build this tab efficiently, keep the simulation engine data isolated from the grid configuration. The components share the active report view state:

```typescript
type ViewMode = 'explore' | 'preset_table' | 'preset_plot';

interface ReportsViewState {
  mode: ViewMode;
  activePresetName: string; // E.g., 'Summary' (Table) or 'Net Worth' (Plot)
  
  // Custom selection under 'Explore' mode
  customSelectedMetrics: string[]; 
  
  // Active checklist for legend checkboxes
  activePlotSeries: Record<string, boolean>; // Series key -> visible (boolean)
  
  // Display Options
  inflationAdjusted: boolean;
  timeRange: { startYear: number; endYear: number };
  roundedBars: boolean;
  thickBars: boolean;
  showEveryTick: boolean;
  scaleType: 'linear' | 'logarithmic';
  forceZeroYAxis: boolean;
  xAxisLabelFormat: 'age' | 'year' | 'both';
}
```

### 6.2 Grid Formatting
*   **Virtual Scroll**: The grid should be virtualized (e.g. using `tanstack-virtual` or a CSS grid height buffer) to support infinite horizontal scroll.
*   **Legend Color Mappings**: The circle icon color must match the corresponding line chart border color. Toggle click changes the `activePlotSeries[key]` state and triggers a chart render cycle.
