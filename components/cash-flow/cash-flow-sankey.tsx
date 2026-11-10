'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { formatPlainPercent } from '@/lib/utils/format';
import { SankeyLabel, computeLabelGutter } from '@/components/charts/sankey/sankey-label';
import { SankeyCustomNode } from '@/components/charts/sankey/sankey-nodes';
import { SankeyCustomLink } from '@/components/charts/sankey/sankey-links';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ChartTimeframeBar } from '@/components/charts/chart-timeframe-bar';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { rgbToHsl, hslToRgb } from '@/lib/utils/color';
import { useDateWindow } from '@/lib/hooks/use-date-window';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import { DateWindowNav } from '@/components/charts/date-window-nav';
import { apiFetch } from '@/lib/utils/api-client';
import { SegPill } from '@/components/ui/seg-pill';
import { ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CategoryData {
  categoryId: string;
  sourceCategoryId?: string;
  side?: 'standard' | 'income' | 'expense';
  categoryName: string;
  categoryColor: string;
  isIncome: boolean;
  amount: number;
  parentId?: string | null;
  parentName?: string | null;
  parentColor?: string | null;
  categoryType?: string;
  expenseParentId?: string | null;
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
  sourceCategoryId?: string;
  value?: number;
  percentage?: number;
  netChange?: number;
  visualImbalance?: number;
  isHub?: boolean;
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

const VIBRANT_COLORS = [
  'var(--color-chart-2)',          // blue
  'var(--color-chart-1)',          // green
  'var(--color-chart-3)',          // yellow
  'var(--color-destructive)',      // red
  'var(--color-chart-5)',          // purple
  'var(--color-chart-4)',          // teal
  'var(--color-chart-synthetic)',  // light green
  'var(--color-status-warning)',   // amber
];

function getThemeType(): 'light' | 'dark' | 'moonlight' {
  if (typeof window === 'undefined') return 'light';
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'dark') return 'dark';
  if (theme === 'moonlight') return 'moonlight';
  return 'light';
}

function vibrantColor(hex: string, isIncome: boolean): string {
  if (!hex || hex.startsWith('var(')) return hex;
  const num = parseInt(hex.replace('#', ''), 16);
  if (isNaN(num)) return hex;
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const [h] = rgbToHsl(r, g, b);

  const theme = getThemeType();
  let s: number, l: number;

  if (theme === 'light') {
    s = 0.55;
    l = 0.55;
  } else if (theme === 'dark') {
    s = 0.5;
    l = 0.6;
  } else {
    s = 0.5;
    l = 0.58;
  }

  const [pr, pg, pb] = hslToRgb(h, s, l);
  return `#${((pr << 16) | (pg << 8) | pb).toString(16).padStart(6, '0')}`;
}

function buildCategoryLookup(allCategoryInfo: CategoryInfo[]): Map<string, CategoryInfo> {
  return new Map(allCategoryInfo.map((c) => [c.id, c]));
}

export function buildSankeyData(
  categories: CategoryData[],
  totalIncome: number,
  totalExpenses: number,
  showParents: boolean,
  categoryLookup: Map<string, CategoryInfo>,
): SankeyData {
  const enriched = categories.map((cat) => {
    const sourceInfo = categoryLookup.get(cat.sourceCategoryId || cat.categoryId);
    const treeParentId = sourceInfo?.parentId || cat.parentId || null;
    const treeParentInfo = treeParentId ? categoryLookup.get(treeParentId) : undefined;

    if (cat.categoryType === 'compound' && cat.side === 'expense') {
      const expenseParentInfo = cat.expenseParentId ? categoryLookup.get(cat.expenseParentId) : undefined;
      return {
        ...cat,
        parentId: cat.expenseParentId || null,
        parentName: expenseParentInfo?.name || cat.parentName || null,
        parentColor: expenseParentInfo?.color || cat.parentColor || null,
      };
    }

    if (treeParentInfo) {
      return {
        ...cat,
        parentId: treeParentId,
        parentName: treeParentInfo.name,
        parentColor: treeParentInfo.color,
      };
    }
    return cat;
  });

  const incomeItems = enriched.filter((c) => c.categoryType !== 'transfer' && c.isIncome && c.amount > 0);
  const expenseItems = enriched.filter((c) => c.categoryType !== 'transfer' && !c.isIncome && c.amount > 0);

  const sortedIncome = incomeItems
    .sort((a, b) => b.amount - a.amount);

  let incomeCategories: CategoryData[] = [];
  if (sortedIncome.length <= 20) {
    incomeCategories = sortedIncome;
  } else {
    const top19 = sortedIncome.slice(0, 19);
    const rest = sortedIncome.slice(19);
    const restAmount = rest.reduce((sum, c) => sum + c.amount, 0);
    const restIds = rest.map((c) => c.sourceCategoryId || c.categoryId).join(',');
    incomeCategories = [
      ...top19,
      { categoryId: restIds, sourceCategoryId: restIds, categoryName: 'Other Income', categoryColor: '#94a3b8', isIncome: true, amount: restAmount, parentId: null, parentName: null, parentColor: null },
    ];
  }

  const sortedExpense = expenseItems
    .sort((a, b) => b.amount - a.amount);

  let expenseCategories: CategoryData[] = [];
  if (sortedExpense.length <= 20) {
    expenseCategories = sortedExpense;
  } else {
    const top19 = sortedExpense.slice(0, 19);
    const rest = sortedExpense.slice(19);
    const restAmount = rest.reduce((sum, c) => sum + c.amount, 0);
    const restIds = rest.map((c) => c.sourceCategoryId || c.categoryId).join(',');
    expenseCategories = [
      ...top19,
      { categoryId: restIds, sourceCategoryId: restIds, categoryName: 'Other Expenses', categoryColor: '#94a3b8', isIncome: false, amount: restAmount, parentId: null, parentName: null, parentColor: null },
    ];
  }

  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];
  const hubId = '__available_funds__';
  const createdParentNodes = new Set<string>();

  if (showParents) {
    const incomeTopLevel = incomeCategories.filter((cat) => !cat.parentId);
    const incomeChildrenOnly = incomeCategories.filter((cat) => cat.parentId);
    const incomeByParent = new Map<string, CategoryData[]>();

    incomeChildrenOnly.forEach((cat) => {
      const pId = cat.parentId!;
      const pName = cat.parentName || cat.categoryName;
      const pColor = cat.parentColor || cat.categoryColor;
      const arr = incomeByParent.get(pId);
      const nextCat = { ...cat, parentId: pId, parentName: pName, parentColor: pColor };
      if (arr) {
        arr.push(nextCat);
      } else {
        incomeByParent.set(pId, [nextCat]);
      }
    });

    const incomeParentTotals = new Map<string, number>();
    incomeByParent.forEach((children, parentId) => {
      incomeParentTotals.set(parentId, children.reduce((sum, c) => sum + c.amount, 0));
    });
    const sortedIncomeParentIds = Array.from(incomeByParent.keys()).sort((a, b) => {
      return (incomeParentTotals.get(b) || 0) - (incomeParentTotals.get(a) || 0);
    });

    incomeTopLevel
      .sort((a, b) => b.amount - a.amount)
      .forEach((cat) => {
        const childNodeId = `inc_${cat.categoryId}`;
        nodes.push({
          id: childNodeId,
          label: cat.categoryName,
          color: vibrantColor(cat.categoryColor, true),
          categoryId: cat.categoryId,
          sourceCategoryId: cat.sourceCategoryId || cat.categoryId,
          value: cat.amount,
          percentage: totalIncome > 0 ? (cat.amount / totalIncome) * 100 : 0,
        });
        links.push({ source: childNodeId, target: hubId, value: cat.amount });
      });

    sortedIncomeParentIds.forEach((parentId) => {
      const children = incomeByParent.get(parentId)!;
      const parentNodeId = `inc_parent_${parentId}`;
      if (!createdParentNodes.has(parentNodeId)) {
        createdParentNodes.add(parentNodeId);
        const first = children[0];
        const childIds = children.map((c) => c.sourceCategoryId || c.categoryId).join(',');
        const parentColor = first.parentColor && first.parentColor !== '#6366f1' ? first.parentColor : VIBRANT_COLORS[0];
        const totalForParent = incomeParentTotals.get(parentId) || 0;
        nodes.push({
          id: parentNodeId,
          label: first.parentName || 'Income',
          color: vibrantColor(parentColor, true),
          categoryId: childIds,
          sourceCategoryId: childIds,
          value: totalForParent,
          percentage: totalIncome > 0 ? (totalForParent / totalIncome) * 100 : 0,
        });
      }

      children.forEach((cat) => {
      const childNodeId = `inc_${cat.categoryId}`;
      nodes.push({
        id: childNodeId,
        label: cat.categoryName,
        color: vibrantColor(cat.categoryColor, true),
        categoryId: cat.categoryId,
        sourceCategoryId: cat.sourceCategoryId || cat.categoryId,
        value: cat.amount,
        percentage: totalIncome > 0 ? (cat.amount / totalIncome) * 100 : 0,
        });
        links.push({ source: childNodeId, target: parentNodeId, value: cat.amount });
      });

      const totalForParent = incomeParentTotals.get(parentId) || 0;
      links.push({ source: parentNodeId, target: hubId, value: totalForParent });
    });
  } else {
    incomeCategories.forEach((cat) => {
      const childNodeId = `inc_${cat.categoryId}`;
      const label = cat.parentName ? `${cat.parentName} › ${cat.categoryName}` : cat.categoryName;
      nodes.push({
        id: childNodeId,
        label,
        color: vibrantColor(cat.categoryColor, true),
        categoryId: cat.categoryId,
        sourceCategoryId: cat.sourceCategoryId || cat.categoryId,
        value: cat.amount,
        percentage: totalIncome > 0 ? (cat.amount / totalIncome) * 100 : 0,
      });
      links.push({ source: childNodeId, target: hubId, value: cat.amount });
    });
  }

  if (incomeCategories.length === 0 && totalIncome > 0) {
    const fallbackId = 'inc_fallback';
    nodes.push({ id: fallbackId, label: 'Income', color: VIBRANT_COLORS[0], value: totalIncome, percentage: 100 });
    links.push({ source: fallbackId, target: hubId, value: totalIncome });
  }

  // When expenses exceed income, add a balancing source node to maintain mass conservation (sum(in) == sum(out))
  if (totalExpenses > totalIncome) {
    const deficit = totalExpenses - totalIncome;
    const deficitId = '__deficit__';
    nodes.push({
      id: deficitId,
      label: 'Savings Drawdown',
      color: '#f59e0b',
      value: deficit,
      percentage: totalExpenses > 0 ? (deficit / totalExpenses) * 100 : 0,
    });
    links.push({ source: deficitId, target: hubId, value: deficit });
  }

  if (incomeCategories.length > 0 || expenseCategories.length > 0 || totalIncome > 0 || totalExpenses > 0) {
    const netChange = totalIncome - totalExpenses;
    nodes.push({
      id: hubId,
      label: 'Available Funds',
      color: '#0ea5e9',
      value: Math.max(totalIncome, totalExpenses),
      percentage: 100,
      netChange,
      visualImbalance: netChange,
      isHub: true,
    });
  }

  if (showParents) {
    const expenseTopLevel = expenseCategories.filter((cat) => !cat.parentId);
    const expenseChildrenOnly = expenseCategories.filter((cat) => cat.parentId);
    const expenseByParent = new Map<string, CategoryData[]>();

    expenseChildrenOnly.forEach((cat) => {
      const pId = cat.parentId!;
      const pName = cat.parentName || cat.categoryName;
      const pColor = cat.parentColor || cat.categoryColor;
      const arr = expenseByParent.get(pId);
      const nextCat = { ...cat, parentId: pId, parentName: pName, parentColor: pColor };
      if (arr) {
        arr.push(nextCat);
      } else {
        expenseByParent.set(pId, [nextCat]);
      }
    });

    const expenseParentTotals = new Map<string, number>();
    expenseByParent.forEach((children, parentId) => {
      expenseParentTotals.set(parentId, children.reduce((sum, c) => sum + c.amount, 0));
    });
    const sortedExpenseParentIds = Array.from(expenseByParent.keys()).sort((a, b) => {
      return (expenseParentTotals.get(b) || 0) - (expenseParentTotals.get(a) || 0);
    });

    expenseTopLevel
      .sort((a, b) => b.amount - a.amount)
      .forEach((cat) => {
        const childNodeId = `exp_${cat.categoryId}`;
        nodes.push({
          id: childNodeId,
          label: cat.categoryName,
          color: vibrantColor(cat.categoryColor, false),
          categoryId: cat.categoryId,
          sourceCategoryId: cat.sourceCategoryId || cat.categoryId,
          value: cat.amount,
          percentage: totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0,
        });
        links.push({ source: hubId, target: childNodeId, value: cat.amount });
      });

    sortedExpenseParentIds.forEach((parentId) => {
      const children = expenseByParent.get(parentId)!;
      const parentNodeId = `exp_parent_${parentId}`;
      if (!createdParentNodes.has(parentNodeId)) {
        createdParentNodes.add(parentNodeId);
        const first = children[0];
        const childIds = children.map((c) => c.sourceCategoryId || c.categoryId).join(',');
        const parentColor = first.parentColor && first.parentColor !== '#6366f1' ? first.parentColor : VIBRANT_COLORS[1];
        const totalForParent = expenseParentTotals.get(parentId) || 0;
        nodes.push({
          id: parentNodeId,
          label: first.parentName || 'Expenses',
          color: vibrantColor(parentColor, false),
          categoryId: childIds,
          sourceCategoryId: childIds,
          value: totalForParent,
          percentage: totalExpenses > 0 ? (totalForParent / totalExpenses) * 100 : 0,
        });
      }

      children.forEach((cat) => {
        const childNodeId = `exp_${cat.categoryId}`;
        nodes.push({
          id: childNodeId,
          label: cat.categoryName,
          color: vibrantColor(cat.categoryColor, false),
          categoryId: cat.categoryId,
          sourceCategoryId: cat.sourceCategoryId || cat.categoryId,
          value: cat.amount,
          percentage: totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0,
        });
        links.push({ source: parentNodeId, target: childNodeId, value: cat.amount });
      });

      const totalForParent = expenseParentTotals.get(parentId) || 0;
      links.push({ source: hubId, target: parentNodeId, value: totalForParent });
    });
  } else {
    expenseCategories.forEach((cat) => {
      const childNodeId = `exp_${cat.categoryId}`;
      const label = cat.parentName ? `${cat.parentName} › ${cat.categoryName}` : cat.categoryName;
      nodes.push({
        id: childNodeId,
        label,
        color: vibrantColor(cat.categoryColor, false),
        categoryId: cat.categoryId,
        sourceCategoryId: cat.sourceCategoryId || cat.categoryId,
        value: cat.amount,
        percentage: totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0,
      });
      links.push({ source: hubId, target: childNodeId, value: cat.amount });
    });
  }

  if (expenseCategories.length === 0 && totalExpenses > 0) {
    const fallbackId = 'exp_fallback';
    nodes.push({ id: fallbackId, label: 'Expenses', color: VIBRANT_COLORS[1], value: totalExpenses, percentage: 100 });
    links.push({ source: hubId, target: fallbackId, value: totalExpenses });
  }

  if (totalIncome > totalExpenses) {
    const surplus = totalIncome - totalExpenses;
    const savingsId = '__savings__';
    nodes.push({
      id: savingsId,
      label: 'Net Savings',
      color: '#10b981',
      value: surplus,
      percentage: totalIncome > 0 ? (surplus / totalIncome) * 100 : 0,
    });
    links.push({ source: hubId, target: savingsId, value: surplus });
  }

  return { nodes, links };
}

export function CashFlowSankey() {

  const router = useRouter();
  const {
    timeframe, setTimeframe,
    windowEnd, setWindowEnd,
    prevWindow, nextWindow, isNextDisabled,
    windowLabel,
    periodOptions,
    showWindowNav,
    dateRange,
  } = useDateWindow('finance:sankey:timeframe', 'finance:sankey:windowEnd', '1m');
  const [sankeyData, setSankeyData] = useState<SankeyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allCategoryInfo, setAllCategoryInfo] = useState<CategoryInfo[]>([]);
  const [isMobile, setIsMobile] = useState(false);
  const [hideParents, setHideParents] = usePersistentState<boolean | null>('finance:sankey:hideParents', null);
  const actualHideParents = hideParents ?? isMobile;
  const showParents = !actualHideParents;
  const showPercentages = false;
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);
  const [chartWidth, setChartWidth] = useState(0);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 4;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(hasOverflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollContainerRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => ro.disconnect();
  }, [checkScroll, chartWidth]);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    apiFetch<CategoryInfo[]>('/api/categories')
      .then((data) => setAllCategoryInfo(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.attributeName === 'data-theme') {
          setThemeVersion((v) => v + 1);
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        let categories: CategoryData[];
        let totalIncome = 0;
        let totalExpenses = 0;

        categories = await apiFetch<CategoryData[]>(
          `/api/cash-flow/categories?startDate=${dateRange.start}&endDate=${dateRange.end}`
        );

        totalIncome = categories
          .filter((c) => c.isIncome && c.amount > 0)
          .reduce((s, c) => s + c.amount, 0);
        totalExpenses = categories
          .filter((c) => !c.isIncome && c.amount > 0)
          .reduce((s, c) => s + c.amount, 0);

        const categoryLookup = buildCategoryLookup(allCategoryInfo);
        const data = buildSankeyData(categories, totalIncome, totalExpenses, showParents, categoryLookup);
        setSankeyData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    if (allCategoryInfo.length > 0) {
      fetchData();
    } else {
      // still fetch even if categories empty after first load? allow empty lookup
      fetchData();
    }
  }, [timeframe, windowEnd, allCategoryInfo, showParents, dateRange.start, dateRange.end]);

  const getNodeCategoryId = (nodeId: string): string | undefined =>
    (() => {
      const node = sankeyData?.nodes.find((n) => n.id === nodeId);
      return node?.sourceCategoryId || node?.categoryId;
    })();

  const navigateToTransactions = (categoryIds: string) => {
    router.push(`/transactions?startDate=${dateRange.start}&endDate=${dateRange.end}&categoryIds=${categoryIds}&pending=false`);
  };

  const handleNodeClick = useCallback((nodeId: string) => {
    if (nodeId === '__available_funds__' || nodeId === '__savings__' || nodeId === '__deficit__') return;
    const categoryId = getNodeCategoryId(nodeId);
    if (categoryId) navigateToTransactions(categoryId);
  }, [sankeyData, dateRange]);

  const handleLinkClick = useCallback((sourceId: string, targetId: string) => {
    const s = getNodeCategoryId(sourceId);
    const t = getNodeCategoryId(targetId);
    const ids = [s, t].filter(Boolean).join(',');
    if (ids) navigateToTransactions(ids);
  }, [sankeyData, dateRange]);

  const processedData = useMemo(() => {
    if (!sankeyData) return { nodes: [], links: [] };

    const nodes = sankeyData.nodes.map((n) => ({ ...n, name: n.label || n.id }));

    const links = sankeyData.links
      .map((l) => {
        const sourceIndex = nodes.findIndex((n) => n.id === l.source);
        const targetIndex = nodes.findIndex((n) => n.id === l.target);
        return { source: sourceIndex, target: targetIndex, value: l.value };
      })
      .filter((l) => l.source !== -1 && l.target !== -1 && l.value > 0);

    return { nodes, links };
  }, [sankeyData, themeVersion]);

  const columnMetrics = useMemo(() => {
    if (!processedData || processedData.nodes.length === 0) return null;

    const nodes = processedData.nodes;
    const links = processedData.links;

    const columns = new Array(nodes.length).fill(-1);
    const incomingCount = new Array(nodes.length).fill(0);
    links.forEach((l) => {
      incomingCount[l.target]++;
    });

    const queue: number[] = [];
    nodes.forEach((n, idx) => {
      if (incomingCount[idx] === 0) {
        columns[idx] = 0;
        queue.push(idx);
      }
    });

    while (queue.length > 0) {
      const u = queue.shift()!;
      links.forEach((l) => {
        if (l.source === u) {
          if (columns[l.target] < columns[u] + 1) {
            columns[l.target] = columns[u] + 1;
            queue.push(l.target);
          }
        }
      });
    }

    const maxCol = Math.max(...columns);
    const metrics = Array.from({ length: maxCol + 1 }, () => ({
      count: 0,
      totalValue: 0,
    }));

    nodes.forEach((node, idx) => {
      const col = columns[idx];
      if (col >= 0) {
        metrics[col].count++;
        metrics[col].totalValue += node.value || 0;
      }
    });

    return { columns, metrics };
  }, [processedData]);

  const margin = useMemo(() => (
    isMobile
      ? { top: 15, right: 140, bottom: 15, left: 110 }
      : { top: 20, right: 160, bottom: 20, left: 160 }
  ), [isMobile]);

  const nodePadding = isMobile
    ? (showParents ? 12 : 16)
    : (showParents ? 20 : 28);

  const sankeyNodeWidth = isMobile ? 12 : (showParents ? 20 : 24);

  const chartHeight = useMemo(() => {
    if (!columnMetrics || columnMetrics.metrics.length === 0) {
      return showParents ? 620 : 460;
    }
    const maxNodes = Math.max(...columnMetrics.metrics.map((m) => m.count));
    const minNodeHeight = isMobile ? 14 : 18;
    const requiredUsableHeight = maxNodes * minNodeHeight + (maxNodes - 1) * nodePadding;
    const verticalMargin = margin.top + margin.bottom;
    const calculatedHeight = requiredUsableHeight + verticalMargin;
    const minHeight = showParents ? 620 : 460;
    return Math.max(minHeight, calculatedHeight);
  }, [columnMetrics, showParents, isMobile, nodePadding, margin]);

  const usableHeight = chartHeight - margin.top - margin.bottom;

  const scale = useMemo(() => {
    if (!columnMetrics || columnMetrics.metrics.length === 0) return 0;

    let minScale = Infinity;
    columnMetrics.metrics.forEach((metric) => {
      if (metric.totalValue > 0) {
        const padding = (metric.count - 1) * nodePadding;
        const colScale = Math.max(0, usableHeight - padding) / metric.totalValue;
        if (colScale < minScale) {
          minScale = colScale;
        }
      }
    });

    return minScale === Infinity ? 0 : minScale;
  }, [columnMetrics, usableHeight, nodePadding]);

  const columnOffsets = useMemo(() => {
    if (!columnMetrics || scale === 0) return [];

    return columnMetrics.metrics.map((metric) => {
      const columnHeight = metric.totalValue * scale + (metric.count - 1) * nodePadding;
      return (usableHeight - columnHeight) / 2;
    });
  }, [columnMetrics, scale, usableHeight, nodePadding]);

  const columnLeftXs = useMemo(() => {
    if (chartWidth <= 0 || !columnMetrics) return null;
    const contentW = chartWidth - margin.left - margin.right;
    const maxDepth = Math.max(1, columnMetrics.metrics.length - 1);
    if (contentW <= 0) return null;
    const childWidth = (contentW - sankeyNodeWidth) / maxDepth;
    return Array.from({ length: maxDepth + 1 }, (_, d) => margin.left + d * childWidth);
  }, [chartWidth, margin, columnMetrics, sankeyNodeWidth]);

  const sankeyNode = useMemo(() => (
    <SankeyCustomNode
      onClick={handleNodeClick}
      hoveredNode={hoveredNode}
      setHoveredNode={setHoveredNode}
      showPercentages={showPercentages}
      isMobile={isMobile}
      nodes={processedData.nodes}
      columnMetrics={columnMetrics}
      columnOffsets={columnOffsets}
      margin={margin}
      usableHeight={usableHeight}
      chartWidth={chartWidth}
      columnLeftXs={columnLeftXs}
    />
  ), [handleNodeClick, hoveredNode, setHoveredNode, showPercentages, themeVersion, isMobile, processedData.nodes, columnMetrics, columnOffsets, margin, usableHeight, chartWidth, columnLeftXs]);

  const sankeyLink = useMemo(() => (
    <SankeyCustomLink
      onClick={handleLinkClick}
      hoveredNode={hoveredNode}
      nodes={processedData.nodes}
      columnMetrics={columnMetrics}
      columnOffsets={columnOffsets}
      margin={margin}
      usableHeight={usableHeight}
    />
  ), [handleLinkClick, hoveredNode, themeVersion, processedData.nodes, columnMetrics, columnOffsets, margin, usableHeight]);

  const sankeyTooltip = useMemo(() => (
    <Tooltip
      isAnimationActive={false}
      content={(props: any) => {
          const { active, payload, coordinate } = props;
          const x = coordinate?.x;
          const y = coordinate?.y;
        if (!active || !payload || !payload.length) return null;
        const data = payload[0].payload;

        const isLink = data.source && typeof data.source === 'object' && data.target && typeof data.target === 'object';

        if (isLink) {
          const linkValue = data.value;
          const sourceNode = data.source;
          const targetNode = data.target;

          return (
            <ChartTooltip x={x} y={y} containerRef={chartContainerRef}>
              <TooltipHeader>{(sourceNode.label ?? sourceNode.name)} → {(targetNode.label ?? targetNode.name)}</TooltipHeader>
              <TooltipRow label="Amount" value={formatCurrency(linkValue)} />
            </ChartTooltip>
          );
        } else {
          const rawData = payload[0].payload;
          const data = processedData.nodes.find((n: any) => n.name === rawData.name) || rawData;

          if (data.isHub) {
            return (
              <ChartTooltip x={x} y={y} containerRef={chartContainerRef}>
                <TooltipHeader>{data.label ?? data.name}</TooltipHeader>
                <TooltipRow label="Net Change" value={formatCurrency(data.netChange)} color={data.netChange >= 0 ? '#10b981' : '#ef4444'} />
                <TooltipRow label="Total Flow" value={formatCurrency(data.value)} />
              </ChartTooltip>
            );
          }
          const displayValue = formatCurrency(data.value);
          return (
            <ChartTooltip x={x} y={y} containerRef={chartContainerRef}>
              <TooltipHeader>{data.label ?? data.name}</TooltipHeader>
              <TooltipRow label="Total" value={displayValue} />
            </ChartTooltip>
          );
        }
      }}
    />
  ), [showPercentages, themeVersion, sankeyData, processedData]);

  const colCount = columnMetrics?.metrics.length || (showParents ? 4 : 3);
  const minChartWidthClass = colCount >= 4 ? 'min-w-[760px] md:min-w-full' : 'min-w-[640px] md:min-w-full';

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div className="px-3 sm:px-5 py-3 flex flex-wrap items-center justify-center gap-2 border-b border-border bg-muted/20">
        <SegPill
          options={[{ id: 'grouped', label: 'Grouped' }, { id: 'flat', label: 'Flat' }]}
          value={showParents ? 'grouped' : 'flat'}
          onChange={(v) => setHideParents(v === 'flat')}
          aria-label="Grouping"
        />
      </div>
      <ChartTimeframeBar value={timeframe} onChange={setTimeframe} windowNav={showWindowNav ? <DateWindowNav prev={prevWindow} next={nextWindow} nextDisabled={isNextDisabled} label={windowLabel} options={periodOptions} currentValue={windowEnd} onSelect={setWindowEnd} timeframe={timeframe} /> : undefined} />

      <div className="relative w-full overflow-hidden">
        <div
          ref={scrollContainerRef}
          onScroll={checkScroll}
          className="h-full w-full overflow-x-auto overflow-y-hidden scroll-contain-x touch-pan-x overscroll-x-contain"
        >
          <div
            ref={chartContainerRef}
            style={{ height: chartHeight }}
            className={cn('h-full px-2 pb-2 w-full', minChartWidthClass)}
          >
            {loading ? (
              <LoadingSpinner category="sankey" className="h-[400px]" />
            ) : error ? (
              <div className="h-[400px] flex items-center justify-center">
                <ChartEmptyState variant="error" error={error} />
              </div>
            ) : processedData.nodes.length > 0 && processedData.links.length > 0 ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
                initialDimension={{ width: 100, height: 100 }}
                onResize={(w: number) => setChartWidth((prev) => (prev === w ? prev : w))}
              >
                <Sankey
                  data={processedData}
                  node={sankeyNode}
                  link={sankeyLink}
                  iterations={0}
                  nodePadding={nodePadding}
                  nodeWidth={sankeyNodeWidth}
                  margin={margin}
                  align="left"
                >
                  {sankeyTooltip}
                </Sankey>
              </ResponsiveContainer>
            ) : (
              <div className="h-[400px] flex items-center justify-center">
                <ChartEmptyState
                  variant="nodata"
                  description="No data available for sankey diagram"
                />
              </div>
            )}
          </div>
        </div>
        {canScrollLeft && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-card to-transparent z-10"
          />
        )}
        {canScrollRight && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent z-10"
          />
        )}
      </div>
      {(canScrollLeft || canScrollRight) && (
        <div className="md:hidden flex items-center justify-center gap-1.5 py-1 text-micro text-muted-foreground select-none">
          <ArrowLeftRight className="w-3 h-3 text-muted-foreground/60" />
          <span>Swipe chart horizontally to explore flows</span>
        </div>
      )}
    </div>
  );
}
