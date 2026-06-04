export const CARD_MATH: Record<string, { title: string; description: string }> = {
  // ── Net Worth ─────────────────────────────────────────────────
  netWorthSummary: {
    title: 'Net Worth Summary',
    description:
      'Total Assets = sum of all asset account balances (checking, savings, investments, real estate, etc.). Total Liabilities = sum of absolute balances of liability accounts (credit, loans, mortgages). Net Worth = Total Assets − Total Liabilities. Period-over-period change compares the last two chart snapshots: (current − previous) / previous × 100.',
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
  // ── Real Estate ───────────────────────────────────────────────
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


  expenseCategoryTrend: {
    title: 'Top Expense Categories',
    description:
      'Plots the top 5 expense categories by total spending, showing their monthly amounts over the selected time range. Each line represents one category\'s spending trend.',
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
