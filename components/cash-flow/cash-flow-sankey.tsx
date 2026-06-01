'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/utils/format';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { rgbToHsl, hslToRgb } from '@/lib/utils/color';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { GitMerge } from 'lucide-react';

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
  sourceCategoryId?: string;
  value?: number;
  percentage?: number;
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

const VIBRANT_COLORS = [
  '#3b82f6',  // blue
  '#10b981',  // green
  '#f59e0b',  // amber
  '#ef4444',  // red
  '#8b5cf6',  // purple
  '#ec4899',  // pink
  '#06b6d4',  // cyan
  '#f97316',  // orange
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

function buildSankeyData(
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

  // Sort and limit income categories to 20 items
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

  // Sort and limit expense categories to 20 items
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

  // ── Income side ──────────────────────────────────────────────────────────
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

    // Sort parent groups by total amount descending to maintain a predictable vertical layout
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
    // Flat: all income categories connect directly to hub
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

  // Hub node
  if (incomeCategories.length > 0 || expenseCategories.length > 0 || totalIncome > 0 || totalExpenses > 0) {
    nodes.push({ id: hubId, label: 'Available Funds', color: VIBRANT_COLORS[2], value: totalIncome, percentage: 100 });
  }

  // ── Expense side ─────────────────────────────────────────────────────────
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

    // Sort parent groups by total amount descending to maintain a predictable vertical layout
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
          value: cat.amount,
          percentage: totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0,
        });
        links.push({ source: parentNodeId, target: childNodeId, value: cat.amount });
      });

      const totalForParent = expenseParentTotals.get(parentId) || 0;
      links.push({ source: hubId, target: parentNodeId, value: totalForParent });
    });
  } else {
    // Flat: hub connects directly to all expense categories
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




  return { nodes, links };
}

// ── Custom node ────────────────────────────────────────────────────────────────
// showPercentages is passed in so the label updates when the toggle changes.
// The node data already has `percentage` baked in from buildSankeyData.
const SankeyCustomNode = ({
  x,
  y,
  width,
  height,
  payload,
  onClick,
  hoveredNode,
  setHoveredNode,
  showPercentages,
  isMobile,
  nodes,
  columnMetrics,
  columnOffsets,
}: any) => {
  const isRightSide = !payload.sourceLinks || payload.sourceLinks.length === 0;
  const isDimmed = hoveredNode !== null && hoveredNode !== payload.id;

  const rawLabel = payload.label ?? payload.name ?? '';
  const isMobileSize = isMobile;
  const maxLabelLen = isMobileSize ? 8 : 22;
  let label = rawLabel.length > maxLabelLen ? `${rawLabel.slice(0, maxLabelLen)}..` : rawLabel;

  const valueLabel = showPercentages && payload.percentage !== undefined
    ? `${payload.percentage.toFixed(1)}%`
    : payload.value !== undefined
      ? formatCurrency(payload.value)
      : '';

  // Get vertical offset to center this node's column
  const nodeIdx = nodes.findIndex((n: any) => n.id === payload.id);
  const colIndex = columnMetrics?.columns[nodeIdx] ?? -1;
  const offset = colIndex >= 0 ? (columnOffsets[colIndex] ?? 0) : 0;
  const shiftedY = y + offset;

  // Suppress redundant leaf labels if the leaf has the same name as its parent
  const isLeaf = colIndex === 0 || colIndex === 4;
  if (isLeaf) {
    const parentCol = colIndex === 0 ? 1 : 3;
    const hasSameNamedParent = nodes.some((n: any, idx: number) => {
      const col = columnMetrics?.columns[idx];
      return col === parentCol && (n.label === rawLabel || n.name === rawLabel);
    });
    if (hasSameNamedParent) {
      label = '';
    }
  }

  return (
    <g
      onMouseEnter={() => setHoveredNode(payload.id)}
      onMouseLeave={() => setHoveredNode(null)}
      onClick={() => onClick && onClick(payload.id)}
      className="cursor-pointer"
    >
      <rect
        x={x}
        y={shiftedY}
        width={width}
        height={height}
        fill={payload.color || 'var(--color-primary)'}
        rx={4}
        fillOpacity={isDimmed ? 0.3 : 0.95}
        stroke="none"
      />
      {/* Name label */}
      <text
        x={isRightSide ? x - 8 : x + width + 8}
        y={shiftedY + height / 2 - (valueLabel ? 6 : 0)}
        textAnchor={isRightSide ? 'end' : 'start'}
        dominantBaseline="central"
        fontSize={isMobileSize ? 8 : 10}
        fontWeight={600}
        fill="currentColor"
        className="fill-foreground select-none"
        style={{ opacity: isDimmed ? 0.3 : 1 }}
      >
        {label}
      </text>
      {/* Value / percentage sub-label */}
      {valueLabel && (
        <text
          x={isRightSide ? x - 8 : x + width + 8}
          y={shiftedY + height / 2 + 7}
          textAnchor={isRightSide ? 'end' : 'start'}
          dominantBaseline="central"
          fontSize={isMobileSize ? 7 : 9}
          fill="currentColor"
          className="fill-muted-foreground select-none"
          style={{ opacity: isDimmed ? 0.3 : 0.75 }}
        >
          {valueLabel}
        </text>
      )}
    </g>
  );
};

// ── Custom link ────────────────────────────────────────────────────────────────
// Recharts Sankey passes: sourceX, sourceY, targetX, targetY, linkWidth,
// payload (with source/target node objects), index.
// sy / ty / dy are NOT passed — those are Nivo-specific props that caused the
// links to render NaN paths in the original implementation.
const SankeyCustomLink = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  linkWidth,
  index,
  payload,
  onClick,
  hoveredNode,
  nodes,
  columnMetrics,
  columnOffsets,
}: any) => {
  const gradId = `link-grad-${index}`;

  // Get column indices for source and target
  const sourceIdx = nodes.findIndex((n: any) => n.id === payload.source.id);
  const targetIdx = nodes.findIndex((n: any) => n.id === payload.target.id);

  const sourceCol = columnMetrics?.columns[sourceIdx] ?? -1;
  const targetCol = columnMetrics?.columns[targetIdx] ?? -1;

  const sourceOffset = sourceCol >= 0 ? (columnOffsets[sourceCol] ?? 0) : 0;
  const targetOffset = targetCol >= 0 ? (columnOffsets[targetCol] ?? 0) : 0;

  const shiftedSourceY = sourceY + sourceOffset;
  const shiftedTargetY = targetY + targetOffset;

  // Cubic bezier: control points at 1/2 x distance for smooth S-curve
  const midX = (sourceX + targetX) / 2;
  const halfW = linkWidth / 2;

  const path = [
    `M ${sourceX},${shiftedSourceY - halfW}`,
    `C ${midX},${shiftedSourceY - halfW} ${midX},${shiftedTargetY - halfW} ${targetX},${shiftedTargetY - halfW}`,
    `L ${targetX},${shiftedTargetY + halfW}`,
    `C ${midX},${shiftedTargetY + halfW} ${midX},${shiftedSourceY + halfW} ${sourceX},${shiftedSourceY + halfW}`,
    'Z',
  ].join(' ');

  const sourceColor = payload?.source?.color || '#94a3b8';
  const targetColor = payload?.target?.color || '#94a3b8';

  const sourceId = payload?.source?.id;
  const targetId = payload?.target?.id;
  const isDimmed = hoveredNode !== null && sourceId !== hoveredNode && targetId !== hoveredNode;
  const opacity = isDimmed ? 0.08 : 0.45;

  return (
    <g
      onClick={() => onClick && onClick(sourceId, targetId)}
      className="cursor-pointer"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={sourceColor} stopOpacity={opacity} />
          <stop offset="100%" stopColor={targetColor} stopOpacity={opacity} />
        </linearGradient>
      </defs>
      <path d={path} fill={`url(#${gradId})`} stroke="none" />
    </g>
  );
};

// ── Main component ─────────────────────────────────────────────────────────────
export function CashFlowSankey() {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('cashFlowSankey');
  const [showFilters, setShowFilters] = useState(false);
  const router = useRouter();
  const currentMonth = getCurrentMonth();
  const [timeframe, setTimeframe] = usePersistentState<TimeRange>('runway:sankey:timeframe', '1m');
  const [month, setMonth] = usePersistentState<string>('runway:sankey:month', currentMonth);
  const [sankeyData, setSankeyData] = useState<SankeyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allAccounts, setAllAccounts] = useState<AccountData[]>([]);
  const [excludedAccountIds, setExcludedAccountIds] = useState<Set<string>>(new Set());
  const [allCategoryInfo, setAllCategoryInfo] = useState<CategoryInfo[]>([]);
  // showParents is permanently true (always show category groups)
  const showParents = true;
  // showPercentages is purely a display toggle — no data refetch needed.
  // It is passed directly into the node renderer and tooltip.
  const [showPercentages, setShowPercentages] = useState<boolean>(false);
  const [accountFilterOpen, setAccountFilterOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [themeVersion, setThemeVersion] = useState(0);
  const accountFilterRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    fetch('/api/accounts')
      .then((r) => r.ok ? r.json() : [])
      .then((json) => setAllAccounts(Array.isArray(json) ? json : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.json())
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

  // Rebuild sankey colors when theme changes
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

  const getAccountIdsParam = (excluded: Set<string>, accounts: AccountData[]): string => {
    if (excluded.size === 0 || excluded.size >= accounts.length) return '';
    const included = accounts.filter((a) => !excluded.has(a.id));
    return included.length > 0 ? `&accountIds=${included.map((a) => a.id).join(',')}` : '';
  };

  // Refetch whenever timeframe, month, accounts filter, or grouping mode changes.
  // showPercentages is intentionally NOT a dep — it only affects rendering, not data.
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const range = getMonthRange(timeframe, month);
        const acctParam = getAccountIdsParam(excludedAccountIds, allAccounts);

        let categories: CategoryData[];
        let totalIncome = 0;
        let totalExpenses = 0;

        if (timeframe === '1m') {
          const categoriesRes = await fetch(
            `/api/cash-flow/categories?month=${range.start}${acctParam}`
          );
          if (!categoriesRes.ok) throw new Error('Failed to fetch sankey data');
          categories = await categoriesRes.json();
        } else {
          const range2 = getMonthRange(timeframe, month);
          const res = await fetch(`/api/cash-flow/categories?startMonth=${range2.start}&endMonth=${range2.end}${acctParam}`);
          if (!res.ok) throw new Error('Failed to fetch sankey data');
          categories = await res.json();
        }

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

    // Don't fetch until category info has loaded (needed for parent grouping)
    if (allCategoryInfo.length > 0 || allAccounts.length >= 0) {
      fetchData();
    }
  }, [timeframe, month, excludedAccountIds, allAccounts, allCategoryInfo]);

  const toggleAccount = (accountId: string) => {
    setExcludedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const getNodeCategoryId = (nodeId: string): string | undefined =>
    (() => {
      const node = sankeyData?.nodes.find((n) => n.id === nodeId);
      return node?.sourceCategoryId || node?.categoryId;
    })();

  const navigateToTransactions = (categoryIds: string) => {
    const range = getMonthRange(timeframe, month);
    const startDate = `${range.start}-01`;
    const [ey, em] = range.end.split('-').map(Number);
    const lastDay = new Date(ey, em, 0).getDate();
    const endDate = `${range.end}-${String(lastDay).padStart(2, '0')}`;
    router.push(`/transactions?startDate=${startDate}&endDate=${endDate}&categoryIds=${categoryIds}`);
  };

  const handleNodeClick = useCallback((nodeId: string) => {
    if (nodeId === '__available_funds__' || nodeId === '__savings__') return;
    const categoryId = getNodeCategoryId(nodeId);
    if (categoryId) navigateToTransactions(categoryId);
  }, [sankeyData, timeframe, month]);

  const handleLinkClick = useCallback((sourceId: string, targetId: string) => {
    const s = getNodeCategoryId(sourceId);
    const t = getNodeCategoryId(targetId);
    const ids = [s, t].filter(Boolean).join(',');
    if (ids) navigateToTransactions(ids);
  }, [sankeyData, timeframe, month]);

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
    if (nextStr <= currentMonth) setMonth(nextStr);
  };

  const isNextDisabled = (() => {
    const [y, m] = month.split('-').map(Number);
    const next = new Date(y, m - 1, 1);
    next.setMonth(next.getMonth() + 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}` > currentMonth;
  })();

  const monthLabel = new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const showMonthNav = timeframe === '1m';

  // Convert named-id links → index-based links that Recharts Sankey requires
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

  // Compute column index and totals for each column to support centering layout
  const columnMetrics = useMemo(() => {
    if (!processedData || processedData.nodes.length === 0) return null;

    const nodes = processedData.nodes;
    const links = processedData.links;

    // Topological sorting via BFS to assign columns (0-indexed rank)
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
      ? { top: 15, right: 65, bottom: 15, left: 65 }
      : { top: 20, right: 160, bottom: 20, left: 160 }
  ), [isMobile]);

  const chartHeight = showParents ? 620 : 460;
  const usableHeight = chartHeight - margin.top - margin.bottom;

  const nodePadding = isMobile
    ? (showParents ? 12 : 16)
    : (showParents ? 20 : 28);

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

  // Stabilize Sankey child elements to avoid recomputing layout on every render
  // NOTE: must be before early returns to maintain consistent hook order
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
    />
  ), [handleNodeClick, hoveredNode, setHoveredNode, showPercentages, themeVersion, isMobile, processedData.nodes, columnMetrics, columnOffsets]);

  const sankeyLink = useMemo(() => (
    <SankeyCustomLink
      onClick={handleLinkClick}
      hoveredNode={hoveredNode}
      nodes={processedData.nodes}
      columnMetrics={columnMetrics}
      columnOffsets={columnOffsets}
    />
  ), [handleLinkClick, hoveredNode, themeVersion, processedData.nodes, columnMetrics, columnOffsets]);

  const sankeyTooltip = useMemo(() => (
    <Tooltip
      content={({ active, payload }) => {
        if (!active || !payload || !payload.length) return null;
        const data = payload[0].payload;

        const isLink = data.source && typeof data.source === 'object' && data.target && typeof data.target === 'object';

        if (isLink) {
          const linkValue = data.value;
          const sourceNode = data.source;
          const targetNode = data.target;
          const sourceTotal = sourceNode.value || 0;
          const targetTotal = targetNode.value || 0;
          const pctOfSource = sourceTotal > 0 ? (linkValue / sourceTotal) * 100 : 0;
          const pctOfTarget = targetTotal > 0 ? (linkValue / targetTotal) * 100 : 0;

          return (
            <ChartTooltip>
              <TooltipHeader>{(sourceNode.label ?? sourceNode.name)} → {(targetNode.label ?? targetNode.name)}</TooltipHeader>
              <TooltipRow label="Amount" value={formatCurrency(linkValue)} />
              {showPercentages && (
                <>
                  <TooltipRow label="Of Source" value={`${pctOfSource.toFixed(1)}%`} />
                  <TooltipRow label="Of Target" value={`${pctOfTarget.toFixed(1)}%`} />
                </>
              )}
            </ChartTooltip>
          );
        } else {
          const displayValue = showPercentages && data.percentage !== undefined
            ? `${data.percentage.toFixed(1)}%`
            : formatCurrency(data.value);
          return (
            <ChartTooltip>
              <TooltipHeader>{data.label ?? data.name}</TooltipHeader>
              <TooltipRow label={showPercentages ? 'Percentage' : 'Total'} value={displayValue} />
              {showPercentages && data.value !== undefined && (
                <TooltipRow label="Amount" value={formatCurrency(data.value)} />
              )}
            </ChartTooltip>
          );
        }
      }}
    />
  ), [showPercentages, themeVersion]);

  // ── Loading / error / empty states ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title="Cash Flow Sankey"
        />
        {!isCollapsed && <LoadingSpinner category="sankey" className="h-[450px]" />}
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title="Cash Flow Sankey"
        />
        {!isCollapsed && (
          <div className="p-5">
            <ChartEmptyState variant="error" error={error} />
          </div>
        )}
      </div>
    );
  }

  const allAccountsExcluded = allAccounts.length > 0 && excludedAccountIds.size >= allAccounts.length;

  const filteredAccounts = allAccounts.filter(
    (a) => !accountSearch || a.name.toLowerCase().includes(accountSearch.toLowerCase()),
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <GitMerge className="w-4 h-4 text-primary" /> Cash Flow Sankey
          </h3>
        }
      />

      {!isCollapsed && (
        <>
          <CollapsibleFilterPanel
            isOpen={showFilters}
            onToggle={() => setShowFilters(!showFilters)}
            feedback={
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                  {timeframe.toUpperCase()}{timeframe !== 'all' ? ` (${monthLabel})` : ''}
                </span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                  {showPercentages ? '%' : '$'}
                </span>
                {excludedAccountIds.size > 0 && (
                  <span className="bg-chart-3/15 text-chart-3 border border-chart-3/25 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                    {allAccounts.length - excludedAccountIds.size} ACCOUNTS
                  </span>
                )}
              </div>
            }
          >
            <div className="space-y-4">
              {/* Row 1: Time Range and Navigation */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-muted/20 border border-border/20 rounded-xl">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Timeframe</span>
                  <TimeRangeFilter
                    value={timeframe}
                    presets={[
                      { label: '1M', value: '1m' },
                      { label: '3M', value: '3m' },
                      { label: '6M', value: '6m' },
                      { label: '1Y', value: '1y' },
                      { label: 'YTD', value: 'ytd' },
                      { label: 'All', value: 'all' },
                    ]}
                    onChange={(tf) => setTimeframe(tf)}
                  />
                </div>
                {showMonthNav && (
                  <div className="flex items-center gap-2">
                    <button onClick={prevMonth} className="px-2 py-0.5 rounded-md text-xs bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all" type="button">
                      &larr;
                    </button>
                    <span className="text-xs font-medium text-foreground min-w-[120px] text-center">{monthLabel}</span>
                    <button
                      onClick={nextMonth}
                      disabled={isNextDisabled}
                      className={`px-2 py-0.5 rounded-md text-xs transition-all ${
                        isNextDisabled
                          ? 'bg-muted/50 text-muted-foreground/30 cursor-not-allowed'
                          : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                      }`}
                      type="button"
                    >
                      &rarr;
                    </button>
                  </div>
                )}
              </div>

              {/* Row 2: Metric Toggle and Accounts Selection */}
              <div className="flex flex-wrap items-center gap-4 p-3 bg-muted/30 border border-border/30 rounded-xl">
                {/* Percentage switch */}
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Show Percentage</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <span className="text-[10px] text-muted-foreground font-semibold">{showPercentages ? '%' : '$'}</span>
                    <button
                      onClick={() => setShowPercentages((v) => !v)}
                      className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
                        showPercentages ? 'bg-primary' : 'bg-muted-foreground/30'
                      }`}
                      type="button"
                    >
                      <span
                        className={`inline-block h-3 w-3 rounded-full bg-background transition-transform ${
                          showPercentages ? 'translate-x-[14px]' : 'translate-x-[2px]'
                        }`}
                      />
                    </button>
                  </label>
                </div>

                {/* Account filter dropdown */}
                {allAccounts.length > 0 && (
                  <div className="relative flex items-center gap-1.5 border-l border-border/30 pl-4" ref={accountFilterRef}>
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Filtered Accounts</span>
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
                      <div className="absolute top-full left-0 mt-1 w-52 bg-card border border-border rounded-lg shadow-lg z-50 max-h-64 flex flex-col">
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
                                    filteredAccounts.forEach((a) => allSelected ? next.add(a.id) : next.delete(a.id));
                                    setExcludedAccountIds(next);
                                  }}
                                  className="rounded border-border bg-background text-primary focus:ring-ring"
                                />
                                Select All
                              </label>
                              {filteredAccounts.map((acc) => (
                                <label key={acc.id} className="flex items-center gap-2 px-2 py-1.5 text-[10px] text-foreground/80 hover:bg-muted rounded cursor-pointer">
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
          </CollapsibleFilterPanel>

          {/* Chart */}
          <div className={showParents ? 'h-[620px]' : 'h-[460px]'}>
            <div className="financial-chart h-full w-full overflow-x-auto overflow-y-hidden">
              <div className="min-w-max h-full px-2 pb-2">
                {processedData.nodes.length > 0 && processedData.links.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                    <Sankey
                      data={processedData}
                      node={sankeyNode}
                      link={sankeyLink}
                      iterations={0}
                      nodePadding={nodePadding}
                      nodeWidth={isMobile ? 12 : (showParents ? 20 : 24)}
                      margin={margin}
                      align="left"
                    >
                      {sankeyTooltip}
                    </Sankey>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[400px] flex items-center justify-center">
                    <ChartEmptyState
                      variant={allAccountsExcluded ? 'empty' : 'nodata'}
                      description={allAccountsExcluded ? 'All accounts are excluded. Adjust your filters.' : 'No data available for sankey diagram'}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
