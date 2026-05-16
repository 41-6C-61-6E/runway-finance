'use client';

import { useState, useEffect, useRef } from 'react';
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
  parentId?: string | null;
  parentName?: string | null;
  parentColor?: string | null;
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

interface CategoryInfo {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
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

function buildParentLookup(allCategoryInfo: CategoryInfo[]): Map<string, { parentId: string; parentName: string; parentColor: string }> {
  const lookup = new Map<string, { parentId: string; parentName: string; parentColor: string }>();
  const byId = new Map<string, CategoryInfo>();
  allCategoryInfo.forEach((c) => byId.set(c.id, c));
  allCategoryInfo.forEach((cat) => {
    if (cat.parentId) {
      const parent = byId.get(cat.parentId);
      if (parent) {
        lookup.set(cat.id, { parentId: cat.parentId, parentName: parent.name, parentColor: parent.color });
      }
    }
  });
  return lookup;
}

function buildSankeyData(
  categories: CategoryData[],
  totalIncome: number,
  totalExpenses: number,
  showParents: boolean,
  parentLookup: Map<string, { parentId: string; parentName: string; parentColor: string }>,
): SankeyData {
  const enriched = categories.map((cat) => {
    const parentInfo = parentLookup.get(cat.categoryId);
    if (parentInfo) {
      return { ...cat, parentId: parentInfo.parentId, parentName: parentInfo.parentName, parentColor: parentInfo.parentColor };
    }
    return cat;
  });

  const incomeCategories = enriched.filter((c) => c.isIncome && c.amount > 0);
  const expenseCategories = enriched.filter((c) => !c.isIncome && c.amount > 0);
  const savings = Math.max(0, totalIncome - totalExpenses);

  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];
  const hubId = '__available_funds__';
  const createdParentNodes = new Set<string>();

  if (showParents) {
    const incomeByParent = new Map<string, CategoryData[]>();
    const incomeNoParent: CategoryData[] = [];

    incomeCategories.forEach((cat) => {
      if (cat.parentId) {
        const arr = incomeByParent.get(cat.parentId);
        if (arr) arr.push(cat);
        else incomeByParent.set(cat.parentId, [cat]);
      } else {
        incomeNoParent.push(cat);
      }
    });

    incomeByParent.forEach((children, parentId) => {
      const parentNodeId = `inc_parent_${parentId}`;
      if (!createdParentNodes.has(parentNodeId)) {
        createdParentNodes.add(parentNodeId);
        const first = children[0];
        const childIds = children.map((c) => c.categoryId).join(',');
        const parentColor = first.parentColor && first.parentColor !== '#6366f1' ? first.parentColor : FALLBACK_COLORS[0];
        nodes.push({
          id: parentNodeId,
          label: first.parentName || 'Income',
          color: boostColor(parentColor),
          categoryId: childIds,
        });
      }

      let totalForParent = 0;
      children.forEach((cat) => {
        const childNodeId = `inc_${cat.categoryId}`;
        nodes.push({
          id: childNodeId,
          label: cat.categoryName,
          color: boostColor(cat.categoryColor),
          categoryId: cat.categoryId,
        });
        links.push({ source: childNodeId, target: parentNodeId, value: cat.amount });
        totalForParent += cat.amount;
      });

      links.push({ source: parentNodeId, target: hubId, value: totalForParent });
    });

    incomeNoParent.forEach((cat) => {
      const childNodeId = `inc_${cat.categoryId}`;
      nodes.push({
        id: childNodeId,
        label: cat.categoryName,
        color: boostColor(cat.categoryColor),
        categoryId: cat.categoryId,
      });
      links.push({ source: childNodeId, target: hubId, value: cat.amount });
    });
  } else {
    incomeCategories.forEach((cat) => {
      const childNodeId = `inc_${cat.categoryId}`;
      const label = cat.parentName ? `${cat.parentName} › ${cat.categoryName}` : cat.categoryName;
      nodes.push({
        id: childNodeId,
        label,
        color: boostColor(cat.categoryColor),
        categoryId: cat.categoryId,
      });
      links.push({ source: childNodeId, target: hubId, value: cat.amount });
    });
  }

  if (incomeCategories.length === 0 && totalIncome > 0) {
    const fallbackId = 'inc_fallback';
    nodes.push({ id: fallbackId, label: 'Income', color: FALLBACK_COLORS[0] });
    links.push({ source: fallbackId, target: hubId, value: totalIncome });
  }

  if (totalIncome > 0) {
    nodes.push({ id: hubId, label: 'Available Funds', color: FALLBACK_COLORS[2] });
  }

  if (showParents) {
    const expenseByParent = new Map<string, CategoryData[]>();
    const expenseNoParent: CategoryData[] = [];

    expenseCategories.forEach((cat) => {
      if (cat.parentId) {
        const arr = expenseByParent.get(cat.parentId);
        if (arr) arr.push(cat);
        else expenseByParent.set(cat.parentId, [cat]);
      } else {
        expenseNoParent.push(cat);
      }
    });

    expenseByParent.forEach((children, parentId) => {
      const parentNodeId = `exp_parent_${parentId}`;
      if (!createdParentNodes.has(parentNodeId)) {
        createdParentNodes.add(parentNodeId);
        const first = children[0];
        const childIds = children.map((c) => c.categoryId).join(',');
        const parentColor = first.parentColor && first.parentColor !== '#6366f1' ? first.parentColor : FALLBACK_COLORS[1];
        nodes.push({
          id: parentNodeId,
          label: first.parentName || 'Expenses',
          color: boostColor(parentColor),
          categoryId: childIds,
        });
      }

      let totalForParent = 0;
      children.forEach((cat) => {
        const childNodeId = `exp_${cat.categoryId}`;
        nodes.push({
          id: childNodeId,
          label: cat.categoryName,
          color: boostColor(cat.categoryColor),
          categoryId: cat.categoryId,
        });
        links.push({ source: parentNodeId, target: childNodeId, value: cat.amount });
        totalForParent += cat.amount;
      });

      links.push({ source: hubId, target: parentNodeId, value: totalForParent });
    });

    expenseNoParent.forEach((cat) => {
      const childNodeId = `exp_${cat.categoryId}`;
      nodes.push({
        id: childNodeId,
        label: cat.categoryName,
        color: boostColor(cat.categoryColor),
        categoryId: cat.categoryId,
      });
      links.push({ source: hubId, target: childNodeId, value: cat.amount });
    });
  } else {
    expenseCategories.forEach((cat) => {
      const childNodeId = `exp_${cat.categoryId}`;
      const label = cat.parentName ? `${cat.parentName} › ${cat.categoryName}` : cat.categoryName;
      nodes.push({
        id: childNodeId,
        label,
        color: boostColor(cat.categoryColor),
        categoryId: cat.categoryId,
      });
      links.push({ source: hubId, target: childNodeId, value: cat.amount });
    });
  }

  if (expenseCategories.length === 0 && totalExpenses > 0) {
    const fallbackId = 'exp_fallback';
    nodes.push({ id: fallbackId, label: 'Expenses', color: FALLBACK_COLORS[1] });
    links.push({ source: hubId, target: fallbackId, value: totalExpenses });
  }

  if (savings > 0) {
    const savingsId = '__savings__';
    nodes.push({ id: savingsId, label: 'Savings', color: FALLBACK_COLORS[2] });
    links.push({ source: hubId, target: savingsId, value: savings });
  }

  return { nodes, links };
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
  const [allCategoryInfo, setAllCategoryInfo] = useState<CategoryInfo[]>([]);
  const [showParents, setShowParents] = useState(true);
  const [accountFilterOpen, setAccountFilterOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const accountFilterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timeframe !== '1m') {
      setMonth(getCurrentMonth());
    }
  }, [timeframe]);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await fetch('/api/accounts');
        if (!res.ok) return;
        const json = await res.json();
        setAllAccounts(json);
        setExcludedAccountIds(new Set());
      } catch {
        // Silently fail
      }
    };
    fetchAccounts();
  }, []);

  useEffect(() => {
    fetch('/api/categories')
      .then((res) => res.json())
      .then((data) => setAllCategoryInfo(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (accountFilterRef.current && !accountFilterRef.current.contains(e.target as Node)) {
        setAccountFilterOpen(false);
        setAccountSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleAccount = (accountId: string) => {
    setExcludedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

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

        const parentLookup = buildParentLookup(allCategoryInfo);
        const data = buildSankeyData(categories, totalIncome, totalExpenses, showParents, parentLookup);
        setSankeyData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [timeframe, month, excludedAccountIds, allAccounts, allCategoryInfo, showParents]);

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
        <div className="h-[450px] flex items-center justify-center text-muted-foreground">
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

  const filteredAccounts = allAccounts.filter(
    (a) => !accountSearch || a.name.toLowerCase().includes(accountSearch.toLowerCase()),
  );

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2 flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-foreground">Cash Flow Sankey</h3>
        <div className="flex items-center gap-3">
          {/* Parent categories toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer">
            <span className="text-[10px] text-muted-foreground">Groups</span>
            <button
              onClick={() => setShowParents(!showParents)}
              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                showParents ? 'bg-primary' : 'bg-muted-foreground/30'
              }`}
            >
              <span
                className={`inline-block h-3 w-3 rounded-full bg-background transition-transform ${
                  showParents ? 'translate-x-[14px]' : 'translate-x-[2px]'
                }`}
              />
            </button>
          </label>
          {/* Account filter dropdown */}
          {allAccounts.length > 0 && (
            <div className="relative" ref={accountFilterRef}>
              <button
                type="button"
                onClick={() => { setAccountFilterOpen(!accountFilterOpen); setAccountSearch(''); }}
                className="px-2.5 py-1 bg-background border border-input rounded-lg text-foreground text-[10px] focus:outline-none focus:ring-2 focus:ring-ring flex items-center gap-1.5 whitespace-nowrap"
              >
                <span>Accounts{excludedAccountIds.size > 0 ? ` (${allAccounts.length - excludedAccountIds.size})` : ''}</span>
                <svg className={`h-3 w-3 transition-transform text-muted-foreground ${accountFilterOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {accountFilterOpen && (
                <div className="absolute top-full right-0 mt-1 w-52 bg-card border border-border rounded-lg shadow-lg z-50 max-h-64 flex flex-col">
                  <div className="p-2 border-b border-border">
                    <input
                      type="text"
                      value={accountSearch}
                      onChange={(e) => setAccountSearch(e.target.value)}
                      placeholder="Search accounts..."
                      className="w-full px-2 py-1 bg-background border border-input rounded text-[10px] text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  <div className="overflow-y-auto flex-1 p-1">
                    {filteredAccounts.length === 0 ? (
                      <div className="px-2 py-3 text-[10px] text-muted-foreground text-center">No results</div>
                    ) : (
                      <>
                        <label className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-foreground/80 hover:bg-muted rounded cursor-pointer font-medium">
                          <input
                            type="checkbox"
                            checked={filteredAccounts.every((a) => !excludedAccountIds.has(a.id))}
                            onChange={() => {
                              const allSelected = filteredAccounts.every((a) => !excludedAccountIds.has(a.id));
                              const next = new Set(excludedAccountIds);
                              if (allSelected) {
                                filteredAccounts.forEach((a) => next.add(a.id));
                              } else {
                                filteredAccounts.forEach((a) => next.delete(a.id));
                              }
                              setExcludedAccountIds(next);
                            }}
                            className="rounded border-border bg-background text-primary focus:ring-ring"
                          />
                          Select All
                        </label>
                        {filteredAccounts.map((acc) => (
                          <label
                            key={acc.id}
                            className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-foreground/80 hover:bg-muted rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={!excludedAccountIds.has(acc.id)}
                              onChange={() => toggleAccount(acc.id)}
                              className="rounded border-border bg-background text-primary focus:ring-ring"
                            />
                            {acc.name}
                          </label>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
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
      <div className={showParents ? 'h-[550px]' : 'h-[400px]'}>
        <div className="financial-chart h-full px-2 pb-2">
          <ResponsiveSankey
            data={sankeyData}
            label="label"
            margin={{ top: 20, right: 120, bottom: 20, left: 120 }}
            align="justify"
            colors={node => (node as unknown as { color: string }).color}
            nodeOpacity={1}
            nodeHoverOthersOpacity={0.6}
            nodeThickness={showParents ? 20 : 24}
            nodeSpacing={showParents ? 22 : 28}
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
