'use client';

import { useState, useEffect } from 'react';
import { ResponsiveSankey } from '@nivo/sankey';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';

interface CategoryData {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  isIncome: boolean;
  amount: number;
}

interface SummaryData {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  savingsRate: number;
}

interface AccountData {
  id: string;
  name: string;
  type: string;
}

interface SankeyNode {
  id: string;
  label?: string;
  color?: string;
  categoryId?: string;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthRange(timeframe: TimeRange, selectedMonth?: string): { start: string; end: string } {
  const now = new Date();
  const currentYm = getCurrentMonth();

  if (timeframe === '1m') {
    return { start: selectedMonth || currentYm, end: selectedMonth || currentYm };
  }

  let start: Date;
  switch (timeframe) {
    case '3m':
      start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      break;
    case '6m':
      start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      break;
    case '1y':
      start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      break;
    case 'ytd':
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case 'all':
      start = new Date(2000, 0, 1);
      break;
    default:
      start = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return {
    start: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
    end: currentYm,
  };
}

const sankeyTheme = {
  background: 'transparent',
  text: { fill: 'var(--color-foreground)', fontSize: 10 },
  axis: {
    domain: { line: { stroke: 'var(--color-border)', strokeWidth: 1 } },
    ticks: { line: { stroke: 'var(--color-border)' }, text: { fill: 'var(--color-muted-foreground)', fontSize: 10 } },
  },
  grid: { line: { stroke: 'var(--color-border)', strokeDasharray: '3 3' } },
  tooltip: {
    container: {
      background: 'var(--color-card)',
      border: '1px solid var(--color-border)',
      borderRadius: '0.5rem',
      boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
      color: 'var(--color-foreground)',
      fontSize: '10px',
      padding: '8px 12px',
    },
  },
  legends: {
    text: { fill: 'var(--color-muted-foreground)', fontSize: 10 },
  },
  labels: {
    text: { fill: 'var(--color-foreground)', fontSize: 10, fontWeight: 600 },
  },
};

const FALLBACK_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
];

// Ensure a hex color is bright enough to be visible on dark backgrounds
function boostColor(hex: string): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
  if (brightness >= 160) return hex;
  const scale = Math.min(2, 160 / (brightness || 1));
  const nr = Math.min(255, Math.round(r * scale));
  const ng = Math.min(255, Math.round(g * scale));
  const nb = Math.min(255, Math.round(b * scale));
  return `#${((nr << 16) | (ng << 8) | nb).toString(16).padStart(6, '0')}`;
}

export function CashFlowSankey() {
  const router = useRouter();
  const currentMonth = getCurrentMonth();
  const [timeframe, setTimeframe] = useState<TimeRange>('1m');
  const [month, setMonth] = useState(currentMonth);
  const [sankeyData, setSankeyData] = useState<SankeyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allAccounts, setAllAccounts] = useState<AccountData[]>([]);
  const [excludedAccountIds, setExcludedAccountIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (timeframe !== '1m') {
      setMonth(getCurrentMonth());
    }
  }, [timeframe]);

  // Fetch accounts for filtering
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await fetch('/api/accounts?includeHidden=false');
        if (!res.ok) return;
        const json = await res.json();
        setAllAccounts(json);
        // Reset excluded accounts when accounts list changes
        setExcludedAccountIds(new Set());
      } catch {
        // Silently fail - accounts are optional for sankey
      }
    };
    fetchAccounts();
  }, []);

  // Toggle account inclusion/exclusion
  const toggleAccount = (accountId: string) => {
    setExcludedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  // Build account filter query param
  const getAccountIdsParam = (): string => {
    if (excludedAccountIds.size === 0 || excludedAccountIds.size >= allAccounts.length) return '';
    const includedAccounts = allAccounts.filter((a) => !excludedAccountIds.has(a.id));
    return includedAccounts.length > 0 ? `&accountIds=${includedAccounts.map((a) => a.id).join(',')}` : '';
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const range = getMonthRange(timeframe, month);
        const acctParam = getAccountIdsParam();
        let categories: CategoryData[];
        let totalIncome = 0;
        let totalExpenses = 0;

        if (timeframe === '1m') {
          const [categoriesRes, summaryRes] = await Promise.all([
            fetch(`/api/cash-flow/categories?month=${range.start}${acctParam}`),
            fetch('/api/cash-flow/summary'),
          ]);
          if (!categoriesRes.ok) throw new Error('Failed to fetch sankey data');
          categories = await categoriesRes.json();
          if (summaryRes.ok) {
            const summary: SummaryData = await summaryRes.json();
            const catIncome = categories.filter((c) => c.isIncome && c.amount > 0).reduce((s, c) => s + c.amount, 0);
            const catExpenses = categories.filter((c) => !c.isIncome && c.amount > 0).reduce((s, c) => s + c.amount, 0);
            totalIncome = catIncome || summary.totalIncome;
            totalExpenses = catExpenses || summary.totalExpenses;
          }
        } else {
          const res = await fetch(`/api/cash-flow/categories?startMonth=${range.start}&endMonth=${range.end}${acctParam}`);
          if (!res.ok) throw new Error('Failed to fetch sankey data');
          categories = await res.json();
          totalIncome = categories.filter((c) => c.isIncome && c.amount > 0).reduce((s, c) => s + c.amount, 0);
          totalExpenses = categories.filter((c) => !c.isIncome && c.amount > 0).reduce((s, c) => s + c.amount, 0);
        }

        const incomeCategories = categories.filter((c) => c.isIncome && c.amount > 0);
        const expenseCategories = categories.filter((c) => !c.isIncome && c.amount > 0);
        const savings = Math.max(0, totalIncome - totalExpenses);

        const nodes: SankeyNode[] = [];
        const links: SankeyLink[] = [];

        // Hub node — acts as the bridge between income and expenses
        const hubId = '__available_funds__';

        // --- Income column (left side) ---
        if (incomeCategories.length > 0) {
          incomeCategories.forEach((cat) => {
            const nodeId = `inc_${cat.categoryId}`;
            nodes.push({ id: nodeId, label: cat.categoryName, color: boostColor(cat.categoryColor), categoryId: cat.categoryId });
            // Each income category links to the hub with its real total
            links.push({ source: nodeId, target: hubId, value: cat.amount });
          });
        } else if (totalIncome > 0) {
          const fallbackId = 'inc_fallback';
          nodes.push({ id: fallbackId, label: 'Income', color: FALLBACK_COLORS[0] });
          links.push({ source: fallbackId, target: hubId, value: totalIncome });
        }

        // Hub node (middle column)
        if (totalIncome > 0) {
          nodes.push({ id: hubId, label: 'Available Funds', color: FALLBACK_COLORS[2] });
        }

        // --- Expense column (right side) ---
        if (expenseCategories.length > 0) {
          expenseCategories.forEach((cat) => {
            const nodeId = `exp_${cat.categoryId}`;
            nodes.push({ id: nodeId, label: cat.categoryName, color: boostColor(cat.categoryColor), categoryId: cat.categoryId });
            // Hub links to each expense category with its real total
            links.push({ source: hubId, target: nodeId, value: cat.amount });
          });
        } else if (totalExpenses > 0) {
          const fallbackId = 'exp_fallback';
          nodes.push({ id: fallbackId, label: 'Expenses', color: FALLBACK_COLORS[1] });
          links.push({ source: hubId, target: fallbackId, value: totalExpenses });
        }

        // Savings link from hub
        if (savings > 0) {
          const savingsId = '__savings__';
          nodes.push({ id: savingsId, label: 'Savings', color: FALLBACK_COLORS[2] });
          links.push({ source: hubId, target: savingsId, value: savings });
        }

        setSankeyData({ nodes, links });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [timeframe, month, excludedAccountIds, allAccounts]);

  const getNodeCategoryId = (nodeName: string): string | undefined => {
    return sankeyData?.nodes.find((n) => n.id === nodeName)?.categoryId;
  };

  const navigateToTransactions = (categoryIds: string) => {
    const range = getMonthRange(timeframe, month);
    const startDate = `${range.start}-01`;
    const [ey, em] = range.end.split('-').map(Number);
    const lastDay = new Date(ey, em, 0).getDate();
    const endDate = `${range.end}-${String(lastDay).padStart(2, '0')}`;
    router.push(`/transactions?startDate=${startDate}&endDate=${endDate}&categoryIds=${categoryIds}`);
  };

  const handleNodeClick = (nodeId: string) => {
    // Skip non-category hub nodes
    if (nodeId === '__available_funds__' || nodeId === '__savings__') return;
    const categoryId = getNodeCategoryId(nodeId);
    if (categoryId) {
      navigateToTransactions(categoryId);
    }
  };

  const handleLinkClick = (sourceId: string, targetId: string) => {
    const sourceCategoryId = getNodeCategoryId(sourceId);
    const targetCategoryId = getNodeCategoryId(targetId);
    const ids = [sourceCategoryId, targetCategoryId].filter(Boolean).join(',');
    if (ids) {
      navigateToTransactions(ids);
    }
  };

  const prevMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1, 1);
    d.setMonth(d.getMonth() - 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const nextMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const next = new Date(y, m - 1, 1);
    next.setMonth(next.getMonth() + 1);
    const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    if (nextStr <= currentMonth) {
      setMonth(nextStr);
    }
  };

  const isNextDisabled = (() => {
    const [y, m] = month.split('-').map(Number);
    const next = new Date(y, m - 1, 1);
    next.setMonth(next.getMonth() + 1);
    const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
    return nextStr > currentMonth;
  })();

  const monthLabel = new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const showMonthNav = timeframe === '1m';

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <div className="p-5 pb-2">
          <h3 className="text-sm font-semibold text-foreground">Cash Flow Sankey</h3>
        </div>
        <div className="h-[400px] flex items-center justify-center text-muted-foreground">
          <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Cash Flow Sankey</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  const allAccountsExcluded = allAccounts.length > 0 && excludedAccountIds.size >= allAccounts.length;

  if (!sankeyData || sankeyData.nodes.length === 0 || sankeyData.links.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Cash Flow Sankey</h3>
        <ChartEmptyState variant={allAccountsExcluded ? 'empty' : 'nodata'}
          description={allAccountsExcluded ? 'All accounts are excluded. Adjust your filters.' : 'No data available for sankey diagram'} />
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground">Cash Flow Sankey</h3>
      </div>
      <div className="px-5 pb-2 flex items-center justify-between flex-wrap gap-2">
        <TimeRangeFilter value={timeframe} presets={
          [{ label: '1M', value: '1m' }, { label: '3M', value: '3m' }, { label: '6M', value: '6m' }, { label: '1Y', value: '1y' }, { label: 'YTD', value: 'ytd' }, { label: 'All', value: 'all' }]
        } onChange={(tf) => setTimeframe(tf)} />
        {showMonthNav && (
          <div className="flex items-center gap-2">
            <button onClick={prevMonth} className="px-2 py-0.5 rounded-md text-xs bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all">
              &larr;
            </button>
            <span className="text-xs font-medium text-foreground min-w-[120px] text-center">{monthLabel}</span>
            <button onClick={nextMonth} disabled={isNextDisabled} className={`px-2 py-0.5 rounded-md text-xs transition-all ${
              isNextDisabled
                ? 'bg-muted/50 text-muted-foreground/30 cursor-not-allowed'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}>
              &rarr;
            </button>
          </div>
        )}
      </div>
      {/* Account filter pills */}
      {allAccounts.length > 0 && (
        <div className="px-5 pb-2 flex flex-wrap gap-1">
          {allAccounts.map((acc) => {
            const isExcluded = excludedAccountIds.has(acc.id);
            return (
              <button
                key={acc.id}
                onClick={() => toggleAccount(acc.id)}
                className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-all ${
                  isExcluded
                    ? 'border-border/30 text-muted-foreground/30'
                    : 'border-primary/30 text-foreground font-medium bg-primary/5'
                }`}
              >
                {acc.name}
              </button>
            );
          })}
        </div>
      )}
      <div className="h-[400px] px-2 pb-2">
        <div className="financial-chart h-full">
          <ResponsiveSankey
            data={sankeyData}
            margin={{ top: 20, right: 120, bottom: 20, left: 120 }}
            align="justify"
            colors={node => (node as unknown as { color: string }).color}
            nodeOpacity={1}
            nodeHoverOthersOpacity={0.6}
            nodeThickness={24}
            nodeSpacing={28}
            nodeBorderWidth={0}
            linkOpacity={1}
            linkHoverOpacity={1}
            linkContract={0}
            linkBlendMode="normal"
            enableLinkGradient={true}
            labelPosition="outside"
            labelOrientation="horizontal"
            labelPadding={14}
            theme={sankeyTheme}
            onClick={(datum) => {
              const d = datum as { id?: string; source?: { id: string }; target?: { id: string } };
              if (d.source && d.target) {
                handleLinkClick(d.source.id, d.target.id);
              } else if (d.id) {
                handleNodeClick(d.id);
              }
            }}
            nodeTooltip={({ node }) => (
              <ChartTooltip>
                <TooltipHeader>{node.label}</TooltipHeader>
                <TooltipRow label="Total" value={formatCurrency(node.value)} />
              </ChartTooltip>
            )}
            linkTooltip={({ link }) => (
              <ChartTooltip>
                <TooltipHeader>{link.source.label} &rarr; {link.target.label}</TooltipHeader>
                <TooltipRow label="Amount" value={formatCurrency(link.value)} />
              </ChartTooltip>
            )}
            animate={true}
            motionConfig="gentle"
          />
        </div>
      </div>
    </div>
  );
}
