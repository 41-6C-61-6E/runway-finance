'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Activity } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { ChartTypeSelector } from '@/components/charts/chart-type-selector';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { ChartTooltip, TooltipRow, TooltipHeader } from '@/components/charts/chart-tooltip';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { DateWindowNav } from '@/components/charts/date-window-nav';
import { useDateWindow } from '@/lib/hooks/use-date-window';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import { useUserSettings } from '@/components/user-settings-provider';
import { isAssetAccount } from '@/lib/utils/account-scope';
import { formatCurrency } from '@/lib/utils/format';
import { formatSafeUTCDate } from '@/lib/utils/date';
import { formatChartYAxisCurrency, formatChartXAxisDate, getChartXTicksUnified } from '@/lib/utils/chart-format';
import {
  type Account,
  type TagItem,
  type ChartPreset,
  type ChartType,
  type GroupingMode,
  DEFAULT_PRESETS,
  getHierarchy,
  getSeriesColor,
} from './account-types';

const setOptions = {
  serialize: (s: Set<string>) => JSON.stringify(Array.from(s)),
  deserialize: (raw: string) => new Set<string>(JSON.parse(raw)),
};

const getTimeframeIndices = (data: any[], range: TimeRange): [number, number] => {
  if (data.length === 0) return [0, 0];
  const lastIdx = data.length - 1;
  const lastDateStr = data[lastIdx].date;
  const lastDate = new Date(lastDateStr + 'T00:00:00Z');

  let startDate = new Date(lastDate);
  switch (range) {
    case '1m':
      startDate.setUTCMonth(startDate.getUTCMonth() - 1);
      break;
    case '3m':
      startDate.setUTCMonth(startDate.getUTCMonth() - 3);
      break;
    case '6m':
      startDate.setUTCMonth(startDate.getUTCMonth() - 6);
      break;
    case '1y':
      startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
      break;
    case '5y':
      startDate.setUTCFullYear(startDate.getUTCFullYear() - 5);
      break;
    case 'ytd':
      startDate = new Date(Date.UTC(lastDate.getUTCFullYear(), 0, 1));
      break;
    case 'all':
    default:
      return [0, lastIdx];
  }

  const startStr = startDate.toISOString().split('T')[0];
  let startIdx = data.findIndex((d) => d.date >= startStr);
  if (startIdx === -1) startIdx = 0;
  return [startIdx, lastIdx];
};

interface AccountHistoryChartProps {
  filteredAllAccounts: Account[];
  allTags: TagItem[];
  historyData: any[];
  reportableAccounts: any[];
  historyLoading: boolean;
  isMobile: boolean;
}

export default function AccountHistoryChart({
  filteredAllAccounts,
  allTags,
  historyData,
  reportableAccounts,
  historyLoading,
  isMobile,
}: AccountHistoryChartProps) {
  const settingsContext = useUserSettings();
  const showLegendTags = settingsContext?.settings?.accountTagVisibility?.legend !== false;

  const {
    timeframe, setTimeframe,
    windowEnd, setWindowEnd,
    prevWindow, nextWindow, isNextDisabled,
    windowLabel,
    periodOptions,
    showWindowNav,
    dateRange: windowDateRange,
  } = useDateWindow('finance:accounts:timeframe', 'finance:accounts:windowEnd', '1m');

  const [chartType, setChartType] = usePersistentState<ChartType>('finance:accounts:chartType', 'line');
  const [groupMode, setGroupMode] = usePersistentState<GroupingMode>('finance:accounts:groupMode', 'type');
  const isCollapsed = false;
  const [showHistoryFilters, setShowHistoryFilters] = useState(false);

  // Viewport pan/zoom state
  const [viewStart, setViewStart] = useState<number | null>(null);
  const [viewEnd, setViewEnd] = useState<number | null>(null);

  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartViewStart = useRef(0);
  const dragStartViewEnd = useRef(0);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const isZooming = useRef(false);
  const [isDraggingCursor, setIsDraggingCursor] = useState(false);

  // Dropdown filter selections
  const [selectedGroups, setSelectedGroups] = usePersistentState<Set<string>>('finance:accounts:selectedGroups', new Set(), setOptions);
  const [selectedTypes, setSelectedTypes] = usePersistentState<Set<string>>('finance:accounts:selectedTypes', new Set(), setOptions);
  const [selectedAccounts, setSelectedAccounts] = usePersistentState<Set<string>>('finance:accounts:selectedAccounts', new Set(), setOptions);
  const [selectedTags, setSelectedTags] = usePersistentState<Set<string>>('finance:accounts:selectedTags', new Set(), setOptions);

  // Quick view presets
  const [customPresets, setCustomPresets] = usePersistentState<ChartPreset[]>('finance:accounts:customPresets', []);
  const [isSavingView, setIsSavingView] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  const allPresets = useMemo(() => {
    return [...DEFAULT_PRESETS, ...(customPresets || [])];
  }, [customPresets]);

  const handleApplyPreset = useCallback((preset: ChartPreset) => {
    setTimeframe(preset.timeframe);
    setChartType(preset.chartType);
    setGroupMode(preset.groupMode);
    setSelectedGroups(new Set(preset.selectedGroups || []));
    setSelectedTypes(new Set(preset.selectedTypes || []));
    setSelectedAccounts(new Set(preset.selectedAccounts || []));
    setSelectedTags(new Set(preset.selectedTags || []));
  }, [setTimeframe, setChartType, setGroupMode, setSelectedGroups, setSelectedTypes, setSelectedAccounts, setSelectedTags]);

  const handleSaveCurrentView = useCallback((name: string) => {
    if (!name.trim()) return;
    const newPreset: ChartPreset = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      timeframe,
      chartType,
      groupMode,
      selectedGroups: Array.from(selectedGroups),
      selectedTypes: Array.from(selectedTypes),
      selectedAccounts: Array.from(selectedAccounts),
      selectedTags: Array.from(selectedTags),
      isCustom: true,
    };
    setCustomPresets((prev) => [...(prev || []), newPreset]);
    setIsSavingView(false);
    setNewPresetName('');
  }, [timeframe, chartType, groupMode, selectedGroups, selectedTypes, selectedAccounts, selectedTags, setCustomPresets]);

  const handleDeletePreset = useCallback((id: string) => {
    setCustomPresets((prev) => (prev || []).filter((p) => p.id !== id));
  }, [setCustomPresets]);

  const isPresetActive = useCallback((preset: ChartPreset) => {
    if (preset.timeframe !== timeframe) return false;
    if (preset.chartType !== chartType) return false;
    if (preset.groupMode !== groupMode) return false;
    
    const presetGroups = preset.selectedGroups || [];
    if (presetGroups.length !== selectedGroups.size) return false;
    for (const g of presetGroups) {
      if (!selectedGroups.has(g)) return false;
    }
    
    const presetTypes = preset.selectedTypes || [];
    if (presetTypes.length !== selectedTypes.size) return false;
    for (const t of presetTypes) {
      if (!selectedTypes.has(t)) return false;
    }
    
    const presetAccounts = preset.selectedAccounts || [];
    if (presetAccounts.length !== selectedAccounts.size) return false;
    for (const a of presetAccounts) {
      if (!selectedAccounts.has(a)) return false;
    }

    const presetTags = preset.selectedTags || [];
    if (presetTags.length !== selectedTags.size) return false;
    for (const t of presetTags) {
      if (!selectedTags.has(t)) return false;
    }
    return true;
  }, [timeframe, chartType, groupMode, selectedGroups, selectedTypes, selectedAccounts, selectedTags]);

  // Dropdown open states & search filter
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  const [typeSearch, setTypeSearch] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');

  const groupsRef = useRef<HTMLDivElement>(null);
  const typesRef = useRef<HTMLDivElement>(null);
  const accountsRef = useRef<HTMLDivElement>(null);
  const tagsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (groupsRef.current && !groupsRef.current.contains(e.target as Node)) {
        setGroupsOpen(false);
      }
      if (typesRef.current && !typesRef.current.contains(e.target as Node)) {
        setTypesOpen(false);
        setTypeSearch('');
      }
      if (accountsRef.current && !accountsRef.current.contains(e.target as Node)) {
        setAccountsOpen(false);
        setAccountSearch('');
      }
      if (tagsRef.current && !tagsRef.current.contains(e.target as Node)) {
        setTagsOpen(false);
        setTagSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availableGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const acc of filteredAllAccounts) {
      if (acc.isHidden) continue;
      groups.add(getHierarchy(acc.type).group);
    }
    return Array.from(groups).sort();
  }, [filteredAllAccounts]);

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    for (const acc of filteredAllAccounts) {
      if (acc.isHidden) continue;
      types.add(getHierarchy(acc.type).subGroup);
    }
    return Array.from(types).sort();
  }, [filteredAllAccounts]);

  const availableAccounts = useMemo(() => {
    const list = filteredAllAccounts.filter((acc) => !acc.isHidden);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredAllAccounts]);

  const uniqueSeriesKeys = useMemo(() => {
    if (reportableAccounts.length === 0) return [];
    const keys = new Set<string>();
    for (const acc of reportableAccounts) {
      if (groupMode === 'group') {
        keys.add(getHierarchy(acc.type).group);
      } else if (groupMode === 'type') {
        keys.add(getHierarchy(acc.type).subGroup);
      } else {
        keys.add(acc.id);
      }
    }
    return Array.from(keys);
  }, [reportableAccounts, groupMode]);

  const selectedSeriesKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const acc of reportableAccounts) {
      const hierarchy = getHierarchy(acc.type);
      if (selectedGroups.size > 0 && !selectedGroups.has(hierarchy.group)) continue;
      if (selectedTypes.size > 0 && !selectedTypes.has(hierarchy.subGroup)) continue;
      if (selectedAccounts.size > 0 && !selectedAccounts.has(acc.id)) continue;
      if (selectedTags.size > 0) {
        const accTags = acc.tags || [];
        const hasMatchingTag = accTags.some((t: any) => selectedTags.has(t.id));
        if (!hasMatchingTag) continue;
      }

      if (groupMode === 'group') {
        keys.add(hierarchy.group);
      } else if (groupMode === 'type') {
        keys.add(hierarchy.subGroup);
      } else {
        keys.add(acc.id);
      }
    }
    return keys;
  }, [reportableAccounts, selectedGroups, selectedTypes, selectedAccounts, selectedTags, groupMode]);

  const isAssetSeries = useCallback((key: string) => {
    if (groupMode === 'account') {
      const acc = reportableAccounts.find((a) => a.id === key);
      return acc ? isAssetAccount(acc.type) : true;
    } else if (groupMode === 'type') {
      const acc = reportableAccounts.find((a) => getHierarchy(a.type).subGroup === key);
      return acc ? isAssetAccount(acc.type) : true;
    } else {
      const acc = reportableAccounts.find((a) => getHierarchy(a.type).group === key);
      return acc ? isAssetAccount(acc.type) : true;
    }
  }, [reportableAccounts, groupMode]);

  const seriesInfoMap = useMemo(() => {
    const map = new Map<string, { label: string; color: string; isAsset: boolean; tags?: { id: string; name: string; color: string }[] }>();
    const sortedKeys = [...uniqueSeriesKeys].sort((a, b) => {
      const aAsset = isAssetSeries(a);
      const bAsset = isAssetSeries(b);
      if (aAsset && !bAsset) return -1;
      if (!aAsset && bAsset) return 1;
      return a.localeCompare(b);
    });

    let assetIndex = 0;
    let liabilityIndex = 0;
    sortedKeys.forEach((key) => {
      const isAsset = isAssetSeries(key);
      const index = isAsset ? assetIndex++ : liabilityIndex++;
      let label = key;
      let tags: { id: string; name: string; color: string }[] | undefined;
      if (groupMode === 'account') {
        const acc = reportableAccounts.find((a) => a.id === key);
        label = acc ? acc.name : key;
        tags = acc?.tags;
      }
      const color = getSeriesColor(key, groupMode, index, isAsset);
      map.set(key, { label, color, isAsset, tags });
    });

    return map;
  }, [uniqueSeriesKeys, groupMode, reportableAccounts, isAssetSeries]);

  const { rechartsData, activeAssets, activeLiabilities } = useMemo(() => {
    if (historyData.length === 0) {
      return { rechartsData: [], activeAssets: [], activeLiabilities: [] };
    }

    const seriesAccountsMap = new Map<string, Account[]>();
    for (const acc of reportableAccounts) {
      let key = '';
      if (groupMode === 'group') key = getHierarchy(acc.type).group;
      else if (groupMode === 'type') key = getHierarchy(acc.type).subGroup;
      else key = acc.id;

      if (selectedSeriesKeys.has(key)) {
        if (!seriesAccountsMap.has(key)) seriesAccountsMap.set(key, []);
        seriesAccountsMap.get(key)!.push(acc);
      }
    }

    const processedPoints = historyData.map((d) => {
      const point: Record<string, any> = { date: d.date };
      let totalAssets = 0;
      let totalLiabilities = 0;
      let anySelectedHasData = false;

      selectedSeriesKeys.forEach((key) => {
        const accs = seriesAccountsMap.get(key) || [];
        let sum = 0;
        let hasData = false;
        accs.forEach((acc) => {
          const val = d[acc.id];
          if (val !== undefined) {
            sum += val;
            hasData = true;
          }
        });

        if (hasData) {
          point[key] = sum;
          anySelectedHasData = true;
          if (isAssetSeries(key)) {
            totalAssets += sum;
          } else {
            totalLiabilities += sum;
          }
        }
      });

      point.netWorth = totalAssets - totalLiabilities;
      point.totalAssets = totalAssets;
      point.totalLiabilities = totalLiabilities;
      point._hasData = anySelectedHasData;
      return point;
    });

    const activeKeys = Array.from(seriesAccountsMap.keys());
    const activeAssets = activeKeys.filter((k) => isAssetSeries(k)).sort((a, b) => {
      const latestPoint = processedPoints[processedPoints.length - 1] || {};
      return (latestPoint[b] || 0) - (latestPoint[a] || 0);
    });
    const activeLiabilities = activeKeys.filter((k) => !isAssetSeries(k)).sort((a, b) => {
      const latestPoint = processedPoints[processedPoints.length - 1] || {};
      return (latestPoint[b] || 0) - (latestPoint[a] || 0);
    });

    const rechartsDataRaw = processedPoints.map((d) => {
      const row: Record<string, any> = {
        date: d.date,
        netWorth: d.netWorth,
        totalAssets: d.totalAssets,
        totalLiabilities: -d.totalLiabilities,
      };
      selectedSeriesKeys.forEach((k) => {
        const val = d[k];
        if (val !== undefined) {
          row[k] = isAssetSeries(k) ? val : -val;
        }
      });
      row._hasData = d._hasData;
      return row;
    });

    selectedSeriesKeys.forEach((k) => {
      let lastNonZeroIdx = -1;
      for (let i = rechartsDataRaw.length - 1; i >= 0; i--) {
        const val = rechartsDataRaw[i][k];
        if (val !== undefined && val !== 0) {
          lastNonZeroIdx = i;
          break;
        }
      }
      if (lastNonZeroIdx !== -1) {
        for (let i = lastNonZeroIdx + 1; i < rechartsDataRaw.length; i++) {
          if (rechartsDataRaw[i][k] !== undefined) {
            rechartsDataRaw[i][k] = undefined;
          }
        }
      } else {
        for (let i = 0; i < rechartsDataRaw.length; i++) {
          if (rechartsDataRaw[i][k] !== undefined) {
            rechartsDataRaw[i][k] = undefined;
          }
        }
      }
    });

    let startIdx = 0;
    const firstDataIdx = rechartsDataRaw.findIndex((d) => d._hasData);
    if (firstDataIdx !== -1) {
      startIdx = firstDataIdx;
    }
    const rechartsData = rechartsDataRaw.slice(startIdx);

    return {
      rechartsData,
      activeAssets,
      activeLiabilities,
    };
  }, [historyData, reportableAccounts, groupMode, selectedSeriesKeys, isAssetSeries]);

  const [defaultStart, defaultEnd] = useMemo(() => {
    if (rechartsData.length === 0) return [0, 0];
    if (timeframe === 'all') return [0, rechartsData.length - 1];
    const startStr = windowDateRange.start;
    const endStr = windowDateRange.end;
    const sIdx = rechartsData.findIndex((d: any) => d.date >= startStr);
    if (sIdx === -1) return [0, -1];
    let eIdx = rechartsData.length - 1;
    for (let i = rechartsData.length - 1; i >= 0; i--) {
      if (rechartsData[i].date <= endStr) { eIdx = i; break; }
    }
    return [sIdx, eIdx];
  }, [rechartsData, timeframe, windowDateRange.start, windowDateRange.end]);

  const currentViewStart = viewStart ?? defaultStart;
  const currentViewEnd = viewEnd ?? defaultEnd;

  const [windowWidth, setWindowWidth] = useState<number>(1200);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWindowWidth(window.innerWidth);
      const handleResize = () => setWindowWidth(window.innerWidth);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  const maxPoints = useMemo(() => {
    const isBar = chartType === 'bar';
    if (!isBar) {
      if (windowWidth < 768) return 30;
      if (windowWidth < 1024) return 60;
      return 100;
    }

    let limit = 30;
    if (timeframe === '1m') limit = 31;
    else if (timeframe === '3m') limit = 30;
    else if (timeframe === '6m') limit = 26;
    else if (timeframe === '1y' || timeframe === 'ytd') limit = 24;
    else if (timeframe === '5y') limit = 30;
    else limit = 30;

    if (windowWidth < 768) return Math.min(limit, 15);
    if (windowWidth < 1024) return Math.min(limit, 22);
    return limit;
  }, [windowWidth, chartType, timeframe]);

  const visibleData = useMemo(() => {
    if (rechartsData.length === 0) return [];
    const rawVisible = rechartsData.slice(currentViewStart, currentViewEnd + 1);
    if (rawVisible.length > maxPoints) {
      const sampled: typeof rawVisible = [];
      const len = rawVisible.length;
      for (let i = 0; i < maxPoints; i++) {
        const index = Math.min(Math.floor((i * (len - 1)) / (maxPoints - 1)), len - 1);
        sampled.push(rawVisible[index]);
      }
      return sampled;
    }
    return rawVisible;
  }, [rechartsData, currentViewStart, currentViewEnd, maxPoints]);

  useEffect(() => {
    if (isZooming.current) {
      isZooming.current = false;
      return;
    }
    setViewStart(null);
    setViewEnd(null);
  }, [timeframe]);

  const { minVal, maxVal } = useMemo(() => {
    if (visibleData.length === 0) return { minVal: 0, maxVal: 1000 };
    const allValues = visibleData.flatMap((d) => {
      const vals: number[] = [d.netWorth, d.totalAssets, d.totalLiabilities];
      selectedSeriesKeys.forEach((k) => {
        if (d[k] !== undefined) vals.push(d[k]);
      });
      return vals;
    });

    const rawMax = Math.max(...allValues, 1000);
    const rawMin = Math.min(...allValues, 0);
    const crossesZero = rawMin < 0;

    if (crossesZero) {
      const range = rawMax - rawMin;
      const pad = range * 0.12 || 500;
      return { minVal: rawMin - pad, maxVal: rawMax + pad };
    }

    const dataMin = Math.min(...allValues);
    const range = rawMax - (dataMin > 0 ? dataMin : 0);
    const pad = Math.max(range * 0.08, range < 100 ? 50 : range * 0.08);
    const minValue = dataMin > 0 ? Math.max(0, dataMin - pad) : 0;
    const maxValue = rawMax + pad;
    return { minVal: minValue, maxVal: maxValue };
  }, [visibleData, selectedSeriesKeys]);

  const yAxisWidth = useMemo(() => {
    const step = (maxVal - minVal) / 4;
    const ticks = [0, 1, 2, 3, 4].map((i) => minVal + step * i);
    let maxLength = 0;
    for (const v of ticks) {
      const absV = Math.abs(v);
      const sign = v < 0 ? '-' : '';
      let formatted = '';
        formatted = formatChartYAxisCurrency(v, minVal, maxVal);
      if (formatted.length > maxLength) maxLength = formatted.length;
    }
    return Math.max(35, Math.ceil(maxLength * 7.5 + 8));
  }, [minVal, maxVal]);

  const xAxisTicks = useMemo(() => {
    return getChartXTicksUnified(visibleData, timeframe, isMobile, 'date');
  }, [visibleData, timeframe, isMobile]);

  const handleChartMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0 || rechartsData.length === 0) return;
    isDragging.current = true;
    setIsDraggingCursor(true);
    dragStartX.current = e.clientX;
    dragStartViewStart.current = currentViewStart;
    dragStartViewEnd.current = currentViewEnd;
  }, [rechartsData.length, currentViewStart, currentViewEnd]);

  const handleChartMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStartX.current;
    const containerWidth = chartContainerRef.current?.clientWidth ?? 1;
    const windowSize = dragStartViewEnd.current - dragStartViewStart.current;
    if (windowSize <= 0) return;

    const pointsPerPixel = windowSize / containerWidth;
    const delta = Math.round(-dx * pointsPerPixel);
    const totalPoints = rechartsData.length;

    const maxStart = Math.max(0, totalPoints - windowSize - 1);
    const newStart = Math.max(0, Math.min(maxStart, dragStartViewStart.current + delta));
    const newEnd = Math.min(totalPoints - 1, newStart + windowSize);
    setViewStart(newStart);
    setViewEnd(newEnd);
  }, [rechartsData.length]);

  const handleChartMouseUp = useCallback(() => {
    isDragging.current = false;
    setIsDraggingCursor(false);
  }, []);

  const handleChartDoubleClick = useCallback((e: React.MouseEvent) => {
    const container = chartContainerRef.current;
    if (!container || visibleData.length === 0) return;

    const rect = container.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, relX / rect.width));
    const idx = Math.round(fraction * (visibleData.length - 1));
    const clickedDate = String(visibleData[idx]?.date ?? '');

    const zoomMap: Record<TimeRange, TimeRange> = {
      all: '5y',
      '5y': '1y',
      '365d': '6m',
      '1y': '6m',
      '6m': '3m',
      '3m': '1m',
      '1m': '30d',
      '30d': '7d',
      '7d': '7d',
      '1d': '1d',
      ytd: '3m',
      '1d_discrete': '1d_discrete',
      '7d_discrete': '7d_discrete',
    };
    const nextTimeframe = zoomMap[timeframe];
    if (nextTimeframe === timeframe) return;

    const fullIdx = rechartsData.findIndex((d) => d.date === clickedDate);
    if (fullIdx === -1) return;

    const [nextStart, nextEnd] = getTimeframeIndices(rechartsData, nextTimeframe);
    const windowSize = nextEnd - nextStart;
    const half = Math.floor(windowSize / 2);
    const newStart = Math.max(0, Math.min(rechartsData.length - windowSize - 1, fullIdx - half));
    const newEnd = Math.min(rechartsData.length - 1, newStart + windowSize);

    isZooming.current = true;
    setViewStart(newStart);
    setViewEnd(newEnd);
    setTimeframe(nextTimeframe);
  }, [visibleData, timeframe, rechartsData, setTimeframe]);

  const isPanned = viewStart !== null || viewEnd !== null;

  const handleGroupModeChange = useCallback((mode: GroupingMode) => {
    setGroupMode(mode);
    setSelectedGroups(new Set());
    setSelectedTypes(new Set());
    setSelectedAccounts(new Set());
    setGroupsOpen(false);
    setTypesOpen(false);
    setAccountsOpen(false);
  }, [setGroupMode, setSelectedGroups, setSelectedTypes, setSelectedAccounts]);

  const CustomTooltip = useCallback(({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const point = payload[0].payload;
    const dateStr = point.date;

    const formatPointDate = (d: string) => formatSafeUTCDate(d, {
      month: 'short',
      day: 'numeric',
      year: '2-digit',
    });

    const activeKeys = Array.from(selectedSeriesKeys);
    const activeAssets = activeKeys.filter((k) => isAssetSeries(k) && Math.abs(point[k] || 0) > 0);
    const activeLiabilities = activeKeys.filter((k) => !isAssetSeries(k) && Math.abs(point[k] || 0) > 0);

    return (
      <ChartTooltip>
        <TooltipHeader>{formatPointDate(String(dateStr))}</TooltipHeader>
        <TooltipRow
          label="Total"
          value={formatCurrency(point.netWorth)}
          color="var(--color-primary)"
        />

        {activeAssets.length > 0 && (
          <div className="mt-2 border-t border-border/40 pt-1.5">
            <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-1 tracking-wider">Assets</div>
            {activeAssets.map((key) => {
              const info = seriesInfoMap.get(key);
              return (
                <TooltipRow
                  key={key}
                  label={info?.label || key}
                  value={formatCurrency(Math.abs(point[key] || 0))}
                  color={info?.color || 'var(--color-chart-1)'}
                />
              );
            })}
          </div>
        )}

        {activeLiabilities.length > 0 && (
          <div className="mt-2 border-t border-border/40 pt-1.5">
            <div className="text-[9px] font-semibold text-muted-foreground uppercase mb-1 tracking-wider">Liabilities</div>
            {activeLiabilities.map((key) => {
              const info = seriesInfoMap.get(key);
              return (
                <TooltipRow
                  key={key}
                  label={info?.label || key}
                  value={formatCurrency(Math.abs(point[key] || 0))}
                  color={info?.color || 'var(--color-destructive)'}
                />
              );
            })}
          </div>
        )}
      </ChartTooltip>
    );
  }, [selectedSeriesKeys, isAssetSeries, seriesInfoMap]);

  return (
    <Card className="bg-card/40 backdrop-blur-md border-border/60 shadow-sm overflow-hidden">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        title={
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary shrink-0" />
            <span>Balance History</span>
          </div>
        }
      />
      {!isCollapsed && (
        <>
          <CollapsibleFilterPanel
            isOpen={showHistoryFilters}
            onToggle={() => setShowHistoryFilters(!showHistoryFilters)}
            feedback={
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                  {timeframe === '1d_discrete' ? '1D' : (timeframe === '7d_discrete' ? '7D' : timeframe.toUpperCase())}
                </span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                  {chartType === 'line' ? 'Area' : 'Bar'}
                </span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                  BY {groupMode.toUpperCase()}
                </span>
                {(selectedGroups.size > 0 || selectedTypes.size > 0 || selectedAccounts.size > 0) && (
                  <span className="bg-chart-3/15 text-chart-3 border border-chart-3/25 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                    FILTERED
                  </span>
                )}
              </div>
            }
            rightActions={
              showWindowNav && (
                <DateWindowNav
                  prev={prevWindow}
                  next={nextWindow}
                  nextDisabled={isNextDisabled}
                  label={windowLabel}
                  options={periodOptions}
                  currentValue={windowEnd}
                  onSelect={setWindowEnd}
                  timeframe={timeframe}
                />
              )
            }
          >
            <div className="space-y-4">
              {/* Timeframe & Chart Style Row */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-muted/20 border border-border/20 rounded-xl">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Timeframe</span>
                  <TimeRangeFilter value={timeframe} onChange={setTimeframe} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Style</span>
                  <ChartTypeSelector 
                    value={chartType} 
                    options={[
                      { value: 'line', label: 'Area' },
                      { value: 'bar', label: 'Bar' }
                    ]} 
                    onChange={(t) => setChartType(t as ChartType)} 
                  />
                </div>
              </div>

              {/* Quick Views Presets */}
              <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/20 border border-border/20 rounded-xl">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mr-1 select-none">
                  <svg className="w-3.5 h-3.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  Quick Views
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {allPresets.map((preset) => {
                    const active = isPresetActive(preset);
                    return (
                      <button
                        type="button"
                        key={preset.id}
                        onClick={() => handleApplyPreset(preset)}
                        className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                          active
                            ? 'bg-primary/15 border-primary/50 text-primary shadow-sm'
                            : 'bg-background hover:bg-muted border-border/50 text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <span>{preset.name}</span>
                        {preset.isCustom && (
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePreset(preset.id);
                            }}
                            className="w-3.5 h-3.5 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive flex items-center justify-center text-[10px] ml-0.5 opacity-60 group-hover:opacity-100 transition-opacity"
                            title="Delete view"
                          >
                            &times;
                          </span>
                        )}
                      </button>
                    );
                  })}

                  {/* Save Current View Form */}
                  {isSavingView ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSaveCurrentView(newPresetName);
                      }}
                      className="flex items-center gap-1 animate-in fade-in slide-in-from-left-2 duration-200"
                    >
                      <input
                        type="text"
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        placeholder="Name this view..."
                        className="px-2.5 py-1 bg-background border border-input rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-32 transition-all"
                        autoFocus
                        required
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:opacity-90 transition-opacity"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsSavingView(false);
                          setNewPresetName('');
                        }}
                        className="px-2.5 py-1 bg-muted text-muted-foreground text-xs font-medium rounded-lg hover:bg-muted/80 transition-colors"
                      >
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsSavingView(true)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-dashed border-primary/45 hover:border-primary text-primary hover:bg-primary/5 transition-all"
                    >
                      <span className="text-[14px] leading-none">+</span> Save View
                    </button>
                  )}
                </div>
              </div>

              {/* Chart Controls / Groupings & Contextual Filters */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3 bg-muted/30 border border-border/30 rounded-xl">
                {/* Mode Pill Selector */}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-2">Group By</span>
                    <div className="flex bg-muted/80 border border-border/30 rounded-lg p-0.5">
                      {(['group', 'type', 'account'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() => handleGroupModeChange(mode)}
                          className={`px-3 py-1 text-xs font-semibold rounded-md capitalize transition-all ${
                            groupMode === mode
                              ? 'bg-card text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {mode === 'type' ? 'Type' : mode}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Filter Dropdown for the selected group mode */}
                <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                  {groupMode === 'group' && (
                    <div className="relative z-30" ref={groupsRef}>
                      <button
                        type="button"
                        onClick={() => setGroupsOpen(!groupsOpen)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                          selectedGroups.size > 0
                            ? 'bg-primary/15 border border-primary text-primary'
                            : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
                        }`}
                      >
                        <span>Group</span>
                        {selectedGroups.size > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center">
                            {selectedGroups.size}
                          </span>
                        )}
                        <svg className={`h-3 w-3 transition-transform ${groupsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {groupsOpen && (
                        <div className="absolute top-full right-0 mt-2 w-52 bg-card border border-border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
                          <div className="overflow-y-auto flex-1 p-1">
                            <label className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
                              <input
                                type="checkbox"
                                checked={selectedGroups.size === availableGroups.length && availableGroups.length > 0}
                                onChange={() => {
                                  if (selectedGroups.size === availableGroups.length) {
                                    setSelectedGroups(new Set());
                                  } else {
                                    setSelectedGroups(new Set(availableGroups));
                                  }
                                }}
                                className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                              />
                              Select All
                            </label>
                            {availableGroups.map((group) => (
                              <label
                                key={group}
                                className="flex items-center gap-2 px-3 py-2 text-[11px] text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedGroups.has(group)}
                                  onChange={() => {
                                    const next = new Set(selectedGroups);
                                    if (next.has(group)) {
                                      next.delete(group);
                                    } else {
                                      next.add(group);
                                    }
                                    setSelectedGroups(next);
                                  }}
                                  className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                />
                                <span>{group}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {groupMode === 'type' && (
                    <div className="relative z-30" ref={typesRef}>
                      <button
                        type="button"
                        onClick={() => setTypesOpen(!typesOpen)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                          selectedTypes.size > 0
                            ? 'bg-primary/15 border border-primary text-primary'
                            : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
                        }`}
                      >
                        <span>Type</span>
                        {selectedTypes.size > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center">
                            {selectedTypes.size}
                          </span>
                        )}
                        <svg className={`h-3 w-3 transition-transform ${typesOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {typesOpen && (
                        <div className="absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
                          <div className="p-2 border-b border-border/50">
                            <input
                              type="text"
                              value={typeSearch}
                              onChange={(e) => setTypeSearch(e.target.value)}
                              placeholder="Search types..."
                              className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                            />
                          </div>
                          <div className="overflow-y-auto flex-1 p-1">
                            <label className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
                              <input
                                type="checkbox"
                                checked={selectedTypes.size === availableTypes.length && availableTypes.length > 0}
                                onChange={() => {
                                  if (selectedTypes.size === availableTypes.length) {
                                    setSelectedTypes(new Set());
                                  } else {
                                    setSelectedTypes(new Set(availableTypes));
                                  }
                                }}
                                className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                              />
                              Select All
                            </label>
                            {availableTypes
                              .filter((t) => !typeSearch || t.toLowerCase().includes(typeSearch.toLowerCase()))
                              .map((type) => (
                                <label
                                  key={type}
                                  className="flex items-center gap-2 px-3 py-2 text-[11px] text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedTypes.has(type)}
                                    onChange={() => {
                                      const next = new Set(selectedTypes);
                                      if (next.has(type)) {
                                        next.delete(type);
                                      } else {
                                        next.add(type);
                                      }
                                      setSelectedTypes(next);
                                    }}
                                    className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                  />
                                  <span>{type}</span>
                                </label>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {groupMode === 'account' && (
                    <div className="relative z-30" ref={accountsRef}>
                      <button
                        type="button"
                        onClick={() => setAccountsOpen(!accountsOpen)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                          selectedAccounts.size > 0
                            ? 'bg-primary/15 border border-primary text-primary'
                            : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
                        }`}
                      >
                        <span>Account</span>
                        {selectedAccounts.size > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center">
                            {selectedAccounts.size}
                          </span>
                        )}
                        <svg className={`h-3 w-3 transition-transform ${accountsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {accountsOpen && (
                        <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
                          <div className="p-2 border-b border-border/50">
                            <input
                              type="text"
                              value={accountSearch}
                              onChange={(e) => setAccountSearch(e.target.value)}
                              placeholder="Search accounts..."
                              className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                            />
                          </div>
                          <div className="overflow-y-auto flex-1 p-1">
                            <label className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
                              <input
                                type="checkbox"
                                checked={selectedAccounts.size === availableAccounts.length && availableAccounts.length > 0}
                                onChange={() => {
                                  if (selectedAccounts.size === availableAccounts.length) {
                                    setSelectedAccounts(new Set());
                                  } else {
                                    setSelectedAccounts(new Set(availableAccounts.map((a) => a.id)));
                                  }
                                }}
                                className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                              />
                              Select All
                            </label>
                            {availableAccounts
                              .filter((a) => !accountSearch || a.name.toLowerCase().includes(accountSearch.toLowerCase()) || (a.institution && a.institution.toLowerCase().includes(accountSearch.toLowerCase())))
                              .map((acc) => (
                                <label
                                  key={acc.id}
                                  className="flex items-center gap-3 px-3 py-2 text-[11px] text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedAccounts.has(acc.id)}
                                    onChange={() => {
                                      const next = new Set(selectedAccounts);
                                      if (next.has(acc.id)) {
                                        next.delete(acc.id);
                                      } else {
                                        next.add(acc.id);
                                      }
                                      setSelectedAccounts(next);
                                    }}
                                    className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                  />
                                  <div className="text-left">
                                    <p className="font-medium text-foreground">{acc.name}</p>
                                    {acc.institution && <p className="text-[10px] text-muted-foreground">{acc.institution}</p>}
                                  </div>
                                </label>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tags Filter */}
                  <div className="relative z-30" ref={tagsRef}>
                    <button
                      type="button"
                      onClick={() => setTagsOpen(!tagsOpen)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                        selectedTags.size > 0
                          ? 'bg-primary/15 border border-primary text-primary'
                          : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
                      }`}
                    >
                      <span>Tags</span>
                      {selectedTags.size > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center">
                          {selectedTags.size}
                        </span>
                      )}
                      <svg className={`h-3 w-3 transition-transform ${tagsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {tagsOpen && (
                      <div className="absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
                        <div className="p-2 border-b border-border/50">
                          <input
                            type="text"
                            value={tagSearch}
                            onChange={(e) => setTagSearch(e.target.value)}
                            placeholder="Search tags..."
                            className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                          />
                        </div>
                        <div className="overflow-y-auto flex-1 p-1">
                          <label className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
                            <input
                              type="checkbox"
                              checked={selectedTags.size === allTags.length && allTags.length > 0}
                              onChange={() => {
                                if (selectedTags.size === allTags.length) {
                                  setSelectedTags(new Set());
                                } else {
                                  setSelectedTags(new Set(allTags.map((t) => t.id)));
                                }
                              }}
                              className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                            />
                            Select All
                          </label>
                          {allTags
                            .filter((t) => !tagSearch || t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                            .map((tag) => (
                              <label
                                key={tag.id}
                                className="flex items-center gap-3 px-3 py-2 text-[11px] text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedTags.has(tag.id)}
                                  onChange={() => {
                                    const next = new Set(selectedTags);
                                    if (next.has(tag.id)) {
                                      next.delete(tag.id);
                                    } else {
                                      next.add(tag.id);
                                    }
                                    setSelectedTags(next);
                                  }}
                                  className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                />
                                <div className="flex items-center gap-2">
                                  <div 
                                    className="w-2.5 h-2.5 rounded-full" 
                                    style={{ backgroundColor: tag.color }}
                                  />
                                  <span className="font-medium text-foreground">{tag.name}</span>
                                </div>
                              </label>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Reset/Clear button */}
                  {(selectedGroups.size > 0 || selectedTypes.size > 0 || selectedAccounts.size > 0 || selectedTags.size > 0) && (
                    <button
                      onClick={() => {
                        setSelectedGroups(new Set());
                        setSelectedTypes(new Set());
                        setSelectedAccounts(new Set());
                        setSelectedTags(new Set());
                      }}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-muted/40 border border-border/20 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              </div>
            </div>
          </CollapsibleFilterPanel>

          <CardContent className="p-2 sm:p-5">
            <div className="h-[380px] w-full relative">
              {historyLoading ? (
                <div className="absolute inset-0 flex items-center justify-center bg-card/20 backdrop-blur-[1px]">
                  <LoadingSpinner category="analysis" />
                </div>
              ) : reportableAccounts.length === 0 ? (
                <ChartEmptyState 
                  variant="nodata" 
                  description="Connect a SimpleFIN or Plaid link first to import account balances and generate trends." 
                />
              ) : historyData.length < 2 ? (
                <ChartEmptyState variant="insufficient" />
              ) : selectedSeriesKeys.size === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center bg-muted/10 border border-dashed border-border/40 rounded-xl">
                  <p className="text-xs text-muted-foreground">Select one or more filters above to render the chart.</p>
                </div>
              ) : visibleData.length === 0 ? (
                <ChartEmptyState variant="empty" title="No data for this period" description="No account data exists for the selected time range. Try a different date range or adjust your filters." />
              ) : (
                <div className="flex flex-col md:flex-row gap-4 h-full w-full">
                  {/* Chart Area */}
                  <div
                    ref={chartContainerRef}
                    className="flex-1 min-w-0 h-full relative select-none"
                    style={{ cursor: isDraggingCursor ? 'grabbing' : 'grab' }}
                    onMouseDown={handleChartMouseDown}
                    onMouseMove={handleChartMouseMove}
                    onMouseUp={handleChartMouseUp}
                    onMouseLeave={handleChartMouseUp}
                    onDoubleClick={handleChartDoubleClick}
                  >
                    <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 100, height: 100 }}>
                      {chartType === 'bar' ? (
                        <BarChart
                          data={visibleData}
                          stackOffset="sign"
                          margin={{ top: 15, right: 20, left: 10, bottom: 5 }}
                          barCategoryGap="20%"
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                          <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={{ stroke: 'var(--color-border)' }}
                            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                            ticks={xAxisTicks}
                            tickFormatter={(d) => formatChartXAxisDate(d, timeframe, { isMonthly: timeframe !== '1m' })}
                            minTickGap={30}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={{ stroke: 'var(--color-border)' }}
                            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                            domain={[minVal, maxVal]}
                            width={yAxisWidth}
                            ticks={(() => {
                              const step = (maxVal - minVal) / 4;
                              return [0, 1, 2, 3, 4].map((i) => minVal + step * i);
                            })()}
                            tickFormatter={(v: number) => formatChartYAxisCurrency(v, minVal, maxVal)}
                          />
                          <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
                          <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--color-border)', opacity: 0.15 }} wrapperStyle={{ zIndex: 50 }} />
                          
                          {activeAssets.map((key) => {
                            const info = seriesInfoMap.get(key);
                            return (
                              <Bar
                                key={key}
                                dataKey={key}
                                stackId="stack"
                                fill={info?.color || 'var(--color-chart-1)'}
                                radius={[0, 0, 0, 0]}
                                maxBarSize={32}
                              />
                            );
                          })}

                          {activeLiabilities.map((key) => {
                            const info = seriesInfoMap.get(key);
                            return (
                              <Bar
                                key={key}
                                dataKey={key}
                                stackId="stack"
                                fill={info?.color || 'var(--color-destructive)'}
                                radius={[0, 0, 0, 0]}
                                maxBarSize={32}
                              />
                            );
                          })}
                        </BarChart>
                      ) : (
                        <ComposedChart
                          data={visibleData}
                          stackOffset="sign"
                          margin={{ top: 15, right: 20, left: 10, bottom: 5 }}
                        >
                          <defs>
                            {[...activeAssets, ...activeLiabilities].map((key) => {
                              const info = seriesInfoMap.get(key);
                              const color = info?.color || (activeAssets.includes(key) ? 'var(--color-chart-1)' : 'var(--color-destructive)');
                              const id = `gradient-${key.replace(/[^a-zA-Z0-9]/g, '-')}`;
                              return (
                                <linearGradient key={key} id={id} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor={color} stopOpacity={0.45} />
                                  <stop offset="95%" stopColor={color} stopOpacity={0.08} />
                                </linearGradient>
                              );
                            })}
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                          <XAxis
                            dataKey="date"
                            tickLine={false}
                            axisLine={{ stroke: 'var(--color-border)' }}
                            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                            ticks={xAxisTicks}
                            tickFormatter={(d) => formatChartXAxisDate(d, timeframe, { isMonthly: timeframe !== '1m' })}
                            minTickGap={30}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={{ stroke: 'var(--color-border)' }}
                            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }}
                            domain={[minVal, maxVal]}
                            width={yAxisWidth}
                            ticks={(() => {
                              const step = (maxVal - minVal) / 4;
                              return [0, 1, 2, 3, 4].map((i) => minVal + step * i);
                            })()}
                            tickFormatter={(v: number) => formatChartYAxisCurrency(v, minVal, maxVal)}
                          />
                          <ReferenceLine y={0} stroke="var(--color-border)" strokeWidth={1} />
                          <RechartsTooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--color-ring)', strokeWidth: 1, strokeDasharray: '2 2' }} />
                          
                          {activeAssets.map((key) => {
                            const info = seriesInfoMap.get(key);
                            return (
                              <Area
                                key={key}
                                type="monotone"
                                dataKey={key}
                                stackId="stack"
                                stroke={info?.color || 'var(--color-chart-1)'}
                                strokeWidth={2}
                                fill={`url(#gradient-${key.replace(/[^a-zA-Z0-9]/g, '-')})`}
                                dot={false}
                              />
                            );
                          })}

                          {activeLiabilities.map((key) => {
                            const info = seriesInfoMap.get(key);
                            return (
                              <Area
                                key={key}
                                type="monotone"
                                dataKey={key}
                                stackId="stack"
                                stroke={info?.color || 'var(--color-destructive)'}
                                strokeWidth={2}
                                fill={`url(#gradient-${key.replace(/[^a-zA-Z0-9]/g, '-')})`}
                                dot={false}
                              />
                            );
                          })}
                        </ComposedChart>
                      )}
                    </ResponsiveContainer>

                    {isPanned && (
                      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-2 z-20">
                        <button
                          className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 border border-primary/40 text-primary hover:bg-primary/25 transition-colors pointer-events-auto"
                          onClick={() => { setViewStart(null); setViewEnd(null); }}
                          title="Reset to full view"
                        >
                          Reset View
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Legend Column */}
                  <div className="w-full md:w-56 flex-shrink-0 flex flex-col justify-start border-t md:border-t-0 md:border-l border-border/20 pt-3 md:pt-0 md:pl-4 overflow-y-auto max-h-[120px] md:max-h-full gap-3">
                    {activeAssets.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                          Assets ({activeAssets.length})
                        </span>
                        <div className="space-y-1.5">
                          {activeAssets.map((key) => {
                            const info = seriesInfoMap.get(key);
                            return (
                              <div key={key} className="flex items-center gap-2 text-xs text-foreground/80 hover:text-foreground transition-colors">
                                <span 
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: info?.color || 'var(--color-chart-1)' }}
                                />
                                <span className="truncate" title={info?.label || key}>
                                  {info?.label || key}
                                </span>
                                {showLegendTags && info?.tags && info.tags.length > 0 && (
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {info.tags.map((tag) => (
                                      <span
                                        key={tag.id}
                                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: tag.color }}
                                        title={tag.name}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    
                    {activeLiabilities.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                          Liabilities ({activeLiabilities.length})
                        </span>
                        <div className="space-y-1.5">
                          {activeLiabilities.map((key) => {
                            const info = seriesInfoMap.get(key);
                            return (
                              <div key={key} className="flex items-center gap-2 text-xs text-foreground/80 hover:text-foreground transition-colors">
                                <span 
                                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: info?.color || 'var(--color-destructive)' }}
                                />
                                <span className="truncate" title={info?.label || key}>
                                  {info?.label || key}
                                </span>
                                {showLegendTags && info?.tags && info.tags.length > 0 && (
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    {info.tags.map((tag) => (
                                      <span
                                        key={tag.id}
                                        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: tag.color }}
                                        title={tag.name}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </>
      )}
    </Card>
  );
}
