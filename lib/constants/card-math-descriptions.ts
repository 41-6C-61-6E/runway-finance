export const CARD_MATH: Record<string, { title: string; description: string }> = {
  // ── Net Worth ─────────────────────────────────────────────────
  netWorthSummary: {
    title: 'Net Worth Summary',
    description:
      'Total Assets = sum of all account balances where type is checking, savings, investment, brokerage, retirement, real estate, vehicle, crypto, metals, or other asset. Total Liabilities = sum of absolute balances where type is credit, loan, or mortgage. Net Worth = Total Assets − Total Liabilities. Period-over-period change compares the last two chart snapshots: (current − previous) / previous × 100.',
  },
  netWorthChart: {
    title: 'Net Worth Line Chart',
    description:
      'Plots Total Assets, Total Liabilities, and Net Worth at each snapshot date using account balance snapshots. Missing dates are forward-filled from transaction history. Net Worth = Assets − Liabilities per period.',
  },
  debtToAssetRatio: {
    title: 'Debt-to-Asset Ratio',
    description:
      'Ratio = Total Liabilities / Total Assets. Rating thresholds: < 0.35 Excellent, < 0.45 Good, < 0.55 Fair, < 0.75 Poor, ≥ 0.75 Critical. Donut slices show each category\'s share of total assets or total debt.',
  },
  assetAllocationChart: {
    title: 'Asset Allocation',
    description:
      'Each asset type\'s allocation = (sum of balances for that type / total assets) × 100.',
  },
  accountValuesChart: {
    title: 'Account Values',
    description:
      'Each account\'s balance over time plotted from account snapshots, stacked to show the composition of total assets.',
  },

  // ── Cash Flow ─────────────────────────────────────────────────
  cashFlowSummary: {
    title: 'Cash Flow Summary',
    description:
      'Total Income and Total Expenses are read from the monthly cash flow summary table for the current month. Net Income = Income − Expenses. Savings Rate = Net Income / Income × 100. Change arrows show the month-over-month percentage change vs the previous month.',
  },
  incomeExpenseChart: {
    title: 'Income vs Expense Chart',
    description:
      'Monthly bars/lines plotted from the monthly cash flow table. Each period shows income, expenses, and net cash flow (income − expenses).',
  },
  netIncomeAnalysis: {
    title: 'Net Income Analysis',
    description:
      'Net Income = Total Income − Total Expenses, plotted as a trend over the selected time period.',
  },
  spendingBreakdown: {
    title: 'Spending Breakdown',
    description:
      'Each expense category\'s share = category total for the month / total expenses × 100.',
  },
  budgetVsActual: {
    title: 'Budget vs Actual',
    description:
      'Per category: Remaining = budgeted − actual (for expenses) or actual − budgeted (for income). Percent Used = actual / budgeted × 100.',
  },
  categorySummaries: {
    title: 'Category Summaries',
    description:
      'Lists each income and expense category with its amount. Change vs previous month = current − previous. Percent change = change / previous × 100.',
  },
  cashFlowSankey: {
    title: 'Sankey Diagram',
    description:
      'Income sources flow proportionally to expense categories and savings. Savings = max(0, total income − total expenses). Savings rate = savings / total income × 100.',
  },
  cashFlowForecast: {
    title: 'Cash Flow Forecast',
    description:
      'Three modes: historical (averages actual income/expenses over the lookback period), budget (uses recurring budget amounts), or hybrid (budgets where available, historical averages otherwise). Projected balance = starting balance + inflows − outflows per month.',
  },

  // ── FIRE ──────────────────────────────────────────────────────
  fireMetrics: {
    title: 'FIRE Metrics',
    description:
      'FIRE Number = Target Annual Expenses / Safe Withdrawal Rate. % to FIRE = Current Investable Assets / FIRE Number × 100. Years to FI uses the logarithmic future value formula: ln((needed + annual/rate) / (annual/rate)) / ln(1 + rate), where needed = FIRE Number − current savings and rate = expected return − inflation. If rate ≤ 0, uses linear: (target − current) / annual contributions.',
  },
  fireProjectionChart: {
    title: 'Projection Chart',
    description:
      'Portfolio at year N = current × (1 + rate)^N + annual contributions × ((1 + rate)^N − 1) / rate. Three scenarios: Conservative (rate − 2%), Moderate (rate), Aggressive (rate + 2%). The FIRE number is displayed as a horizontal reference line.',
  },
  fireProgressRing: {
    title: 'Progress Ring',
    description:
      'Percent to FIRE = Current Investable Assets / FIRE Number × 100, displayed as a circular progress indicator.',
  },
  whatIfAnalysis: {
    title: 'What-If Analysis',
    description:
      'Applies the same logarithmic years-to-FI formula across five scenarios: save $500/mo more, save $1,000/mo more, 1% higher returns, 1% lower returns, or retire with $10k less in annual expenses. Each is compared to the baseline.',
  },
  fireScenarios: {
    title: 'Scenarios',
    description:
      'Saved assumption sets (expected return, contributions, expenses, withdrawal rate, etc.) that are loaded into the FIRE calculator and projection formulas.',
  },

  // ── Retirement Planner ────────────────────────────────────────
  retirementInputs: {
    title: 'Assumptions Inputs',
    description:
      'User-configured parameters: retirement age, life expectancy, expected return rate, inflation rate, annual withdrawal, Social Security start age/amount, pension start age/amount, part-time income, rental income, healthcare costs, and legacy goal. These feed into the decumulation model.',
  },
  retirementMetrics: {
    title: 'Retirement Metrics',
    description:
      'Portfolio Runway = years until the portfolio is fully depleted. End Balance = portfolio value at life expectancy. Peak Portfolio = highest balance reached. Total Withdrawn = sum of all inflation-adjusted withdrawals and healthcare costs. Monte Carlo Success = percentage of 1,000 simulations where the ending balance meets or exceeds the legacy goal.',
  },
  retirementRunwayChart: {
    title: 'Runway Chart',
    description:
      'Each year of retirement: inflation factor = (1 + inflation)^years-into-retirement. Withdrawal = annual withdrawal × inflation factor. Income sources (SS, pension, part-time, rental) are all inflated. Net cash flow = total income − withdrawal − healthcare. Investment return = starting balance × expected return rate. Ending balance = starting balance + investment return + net cash flow.',
  },
  retirementMonteCarlo: {
    title: 'Monte Carlo Analysis',
    description:
      'Runs 1,000 simulations with normally distributed annual returns (mean = expected return rate, standard deviation = 10%). Each simulation follows the same decumulation formula with randomized returns. Plots median, 10th percentile (P10), and 90th percentile (P90) paths. Success rate = percentage of simulations ending with balance ≥ legacy goal.',
  },

  // ── Real Estate ───────────────────────────────────────────────
  realEstateSummary: {
    title: 'Real Estate Summary',
    description:
      'Total Value = sum of all property balances. Total Mortgage = sum of absolute mortgage balances. Total Equity = sum of (property value − |mortgage balance|) per property. LTV Ratio = total mortgage / total value × 100.',
  },
  equityOverTimeChart: {
    title: 'Equity Over Time',
    description:
      'Equity = property value − |mortgage balance| at each snapshot date, plotted over time for each property.',
  },
  portfolioAllocationChart: {
    title: 'Portfolio Allocation',
    description:
      'Each property\'s share of total real estate value = property value / total value × 100, shown as a pie chart.',
  },
  propertyCards: {
    title: 'Property Cards',
    description:
      'Per property: Equity = value − |mortgage|. LTV = |mortgage| / value × 100. Sale Proceeds = value × 0.92 − |mortgage| (assuming 8% selling costs).',
  },
  mortgagePaydown: {
    title: 'Mortgage Paydown',
    description:
      'Standard amortization: monthly interest = balance × (annual rate / 100 / 12), principal = payment − interest, balance reduces by principal. Extra payment scenarios show accelerated payoff with additional principal contributions.',
  },

  // ── Budgets ───────────────────────────────────────────────────
  budgetSummary: {
    title: 'Budget Summary',
    description:
      'Income: Variance = actual − budgeted, % Achieved = actual / budgeted × 100. Expenses: Remaining = budgeted − actual, % Used = actual / budgeted × 100. All values are summed across budget items of each type.',
  },
  budgetVsActualChart: {
    title: 'Budget vs Actual Chart',
    description:
      'Bar chart comparing budgeted amounts against actual spending per category for the selected period.',
  },
  budgetTable: {
    title: 'Budget Items Table',
    description:
      'Tabular view of each budget item showing: budgeted amount, actual amount, remaining (budgeted − actual for expenses), and percent used (actual / budgeted × 100).',
  },

  // ── Financial Goals ───────────────────────────────────────────
  goalsSummary: {
    title: 'Goals Summary',
    description:
      'Total Target = sum of all goal target amounts. Total Saved = sum of all goal current amounts. Overall Progress = total current / total target × 100 (capped at 100%). By-type breakdown applies the same calculation grouped by goal type.',
  },
  goalsList: {
    title: 'Goals List',
    description:
      'Per goal: Progress = current amount / target amount × 100, shown as a progress bar. Status indicates active, completed, or paused.',
  },
};
