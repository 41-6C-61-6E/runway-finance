'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Columns2, Sparkles, X, Search, Plus, Settings2, Eye, EyeOff } from 'lucide-react';
import type { VisibilityState } from '@tanstack/react-table';
import { getTypesByGroup, ACCOUNT_GROUP_MAP } from '@/lib/constants/account-types';
import { Spinner } from '@/components/ui/loading-spinner';
import { ActionButton } from '@/components/ui/action-button';
import { ALL_COLUMNS, COLUMN_LABELS } from './table/column-constants';

type FilterState = {
  accountId: string | null;
  accountIds: string | null;
  accountTypes: string | null;
  categoryId: string | null;
  categoryIds: string | null;
  tagId: string | null;
  tagIds: string | null;
  accountTagIds: string | null;
  search: string | null;
  type: string | null;
  startDate: string | null;
  endDate: string | null;
  pending: string | null;
  reviewed: string | null;
  minAmount: string | null;
  maxAmount: string | null;
  categorizedByAi: string | null;
};

import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { Select } from '@/components/ui/select';
import { MultiSelectDropdown } from './filters/multi-select-dropdown';
import { CategoryFilterDropdown } from './filters/category-filter-dropdown';
import { AccountFilterDropdown } from './filters/account-filter-dropdown';

export interface TransactionPreset {
  id: string;
  name: string;
  filters: Partial<FilterState>;
  isCustom?: boolean;
}

interface FilterBarProps {
  filters: FilterState;
  onChange: (key: keyof FilterState, value: string | null) => void;
  onClearAll: () => void;
  customPresets: TransactionPreset[];
  onApplyPreset: (preset: TransactionPreset) => void;
  onSavePreset: (name: string) => void;
  onDeletePreset: (id: string) => void;
  compactView?: boolean;
  onCompactViewChange?: (compact: boolean) => void;
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (visibility: VisibilityState) => void;
  onAddTransaction?: () => void;
  pendingAiCount?: number;
  aiSuggestionsDismissed?: boolean;
  onAiSuggestionsDismissed?: (dismissed: boolean) => void;
  onOpenAiSuggestions?: () => void;
  analysisRunning?: boolean;
  analysisProcessed?: number;
  analysisTotal?: number;
}

type Account = {
  id: string;
  name: string;
  type: string;
  institution: string | null;
};

type Category = {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
  isIncome: boolean;
};

type TagItem = {
  id: string;
  name: string;
  color: string;
};


const DEFAULT_PRESETS: TransactionPreset[] = [
  { id: 'all', name: 'All', filters: {} },
  { id: 'banking', name: 'Banking', filters: { accountTypes: ACCOUNT_GROUP_MAP.BANKING.join(',') } },
  { id: 'investments', name: 'Investments', filters: { accountTypes: ACCOUNT_GROUP_MAP.INVESTMENTS.join(',') } },
  { id: 'credit', name: 'Credit', filters: { accountTypes: ACCOUNT_GROUP_MAP.CREDIT.join(',') } },
  { id: 'assets', name: 'Assets', filters: { accountTypes: ACCOUNT_GROUP_MAP.ASSETS.join(',') } },
];

export default function FilterBar({ 
  filters, 
  onChange, 
  onClearAll,
  customPresets = [],
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
  compactView,
  onCompactViewChange,
  columnVisibility,
  onColumnVisibilityChange,
  onAddTransaction,
  pendingAiCount,
  aiSuggestionsDismissed,
  onAiSuggestionsDismissed,
  onOpenAiSuggestions,
  analysisRunning,
  analysisProcessed,
  analysisTotal,
}: FilterBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSavingView, setIsSavingView] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);

  const allPresets = useMemo(() => {
    return [...DEFAULT_PRESETS, ...(customPresets || [])];
  }, [customPresets]);

  const isPresetActive = useCallback((preset: TransactionPreset) => {
    const filterKeys = [
      'accountId', 'accountIds', 'accountTypes', 'categoryId', 'categoryIds',
      'tagId', 'tagIds', 'accountTagIds', 'search', 'type', 'startDate', 'endDate', 'pending',
      'reviewed', 'minAmount', 'maxAmount', 'categorizedByAi'
    ] as (keyof FilterState)[];
    
    for (const key of filterKeys) {
      const currentVal = filters[key] ?? null;
      const presetVal = preset.filters[key] ?? null;
      if (currentVal !== presetVal) return false;
    }
    return true;
  }, [filters]);

  const [datePreset, setDatePreset] = useState(() => {
    if (filters.startDate || filters.endDate) return 'custom';
    return 'all';
  });
  const [customStartDate, setCustomStartDate] = useState(filters.startDate ?? '');
  const [customEndDate, setCustomEndDate] = useState(filters.endDate ?? '');
  const [search, setSearch] = useState(filters.search ?? '');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [tagIdsOpen, setTagIdsOpen] = useState(false);
  const [accountTagIdsOpen, setAccountTagIdsOpen] = useState(false);
  const [accountTypesOpen, setAccountTypesOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [accountTagSearch, setAccountTagSearch] = useState('');
  const tagIdsRef = useRef<HTMLDivElement>(null);
  const accountTagIdsRef = useRef<HTMLDivElement>(null);
  const accountTypesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/accounts?includeVirtual=true', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    fetch('/api/categories', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    fetch('/api/tags', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setTags(Array.isArray(data) ? data : []))
      .catch(() => setTags([]));
  }, []);

  // Synchronize internal search state with filters.search when filters prop changes
  useEffect(() => {
    setSearch(filters.search ?? '');
  }, [filters.search]);

  // Synchronize custom dates when parent filters change
  useEffect(() => {
    setCustomStartDate(filters.startDate ?? '');
  }, [filters.startDate]);

  useEffect(() => {
    setCustomEndDate(filters.endDate ?? '');
  }, [filters.endDate]);

  // Sync datePreset state with parent filters
  useEffect(() => {
    if (!filters.startDate && !filters.endDate) {
      setDatePreset('all');
    } else {
      const start = filters.startDate;
      const end = filters.endDate;
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      
      const thisMonthFirst = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const lastMonthFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const lastMonthLast = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      const last3mFirst = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split('T')[0];
      const last6mFirst = new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split('T')[0];
      const thisYearFirst = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];

      if (start === thisMonthFirst && end === today) {
        setDatePreset('this-month');
      } else if (start === lastMonthFirst && end === lastMonthLast) {
        setDatePreset('last-month');
      } else if (start === last3mFirst && end === today) {
        setDatePreset('last-3m');
      } else if (start === last6mFirst && end === today) {
        setDatePreset('last-6m');
      } else if (start === thisYearFirst && end === today) {
        setDatePreset('this-year');
      } else {
        setDatePreset('custom');
      }
    }
  }, [filters.startDate, filters.endDate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange('search', search || null);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, onChange]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (tagIdsRef.current && !tagIdsRef.current.contains(e.target as Node)) {
        setTagIdsOpen(false);
        setTagSearch('');
      }
      if (accountTagIdsRef.current && !accountTagIdsRef.current.contains(e.target as Node)) {
        setAccountTagIdsOpen(false);
        setAccountTagSearch('');
      }
      if (accountTypesRef.current && !accountTypesRef.current.contains(e.target as Node)) {
        setAccountTypesOpen(false);
      }
      if (columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setShowColumnMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const applyDatePreset = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    let start = '';
    let end = today;

    switch (preset) {
      case 'this-month': {
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        start = first.toISOString().split('T')[0];
        break;
      }
      case 'last-month': {
        const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const last = new Date(now.getFullYear(), now.getMonth(), 0);
        start = first.toISOString().split('T')[0];
        end = last.toISOString().split('T')[0];
        break;
      }
      case 'last-3m': {
        const first = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        start = first.toISOString().split('T')[0];
        break;
      }
      case 'last-6m': {
        const first = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        start = first.toISOString().split('T')[0];
        break;
      }
      case 'this-year': {
        const first = new Date(now.getFullYear(), 0, 1);
        start = first.toISOString().split('T')[0];
        break;
      }
      case 'all':
        onChange('startDate', null);
        onChange('endDate', null);
        return;
      case 'custom':
        return;
    }

    onChange('startDate', start || null);
    onChange('endDate', end || null);
  };

  const parents = categories.filter((c) => !c.parentId || c.parentId === null);
  const getChildren = (parentId: string) => categories.filter((c) => c.parentId === parentId);

  const selectedAccountIds = useMemo(() => {
    return (filters.accountIds ? filters.accountIds.split(',') : filters.accountId ? [filters.accountId] : []).filter(Boolean);
  }, [filters.accountIds, filters.accountId]);

  const selectedCategoryIds = useMemo(() => {
    return (filters.categoryIds ? filters.categoryIds.split(',') : filters.categoryId ? [filters.categoryId] : []).filter(Boolean);
  }, [filters.categoryIds, filters.categoryId]);

  const selectedAccountTypes = (filters.accountTypes ?? '').split(',').filter(Boolean);

  const selectedTagIds = useMemo(() => {
    return (filters.tagIds ? filters.tagIds.split(',') : filters.tagId ? [filters.tagId] : []).filter(Boolean);
  }, [filters.tagIds, filters.tagId]);

  const selectedAccountTagIds = (filters.accountTagIds ?? '').split(',').filter(Boolean);

  const handleAccountIdsChange = useCallback((values: string[]) => {
    onChange('accountIds', values.length > 0 ? values.join(',') : null);
    if (filters.accountId) {
      onChange('accountId', null);
    }
  }, [onChange, filters.accountId]);

  const handleCategoryIdsChange = useCallback((values: string[]) => {
    onChange('categoryIds', values.length > 0 ? values.join(',') : null);
    if (filters.categoryId) {
      onChange('categoryId', null);
    }
  }, [onChange, filters.categoryId]);

  const handleTagIdsChange = useCallback((values: string[]) => {
    onChange('tagIds', values.length > 0 ? values.join(',') : null);
    if (filters.tagId) {
      onChange('tagId', null);
    }
  }, [onChange, filters.tagId]);

  const handleAccountTagIdsChange = useCallback((values: string[]) => {
    onChange('accountTagIds', values.length > 0 ? values.join(',') : null);
  }, [onChange]);

  const handleAccountTypesChange = useCallback((values: string[]) => {
    onChange('accountTypes', values.length > 0 ? values.join(',') : null);
  }, [onChange]);

  const accountItems = accounts.map((a) => ({
    id: a.id,
    label: a.institution ? `${a.name} (${a.institution})` : a.name,
  }));

  const categoryItems = parents.flatMap((parent) => {
    const children = getChildren(parent.id);
    if (children.length > 0) {
      return [
        { id: parent.id, label: parent.name },
        ...children.map((child) => ({
          id: child.id,
          label: `${parent.name} › ${child.name}`,
        })),
      ];
    }
    return [{ id: parent.id, label: parent.name }];
  });
  categoryItems.unshift({ id: 'uncategorized', label: 'Uncategorized' });

  const groupedAccountTypes = getTypesByGroup();

  const activePills = useMemo(() => {
    const pills: string[] = [];
    if (datePreset !== 'all') {
      if (datePreset === 'custom') {
        const start = filters.startDate ? new Date(filters.startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        const end = filters.endDate ? new Date(filters.endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
        pills.push(start && end ? `${start}–${end}` : 'Custom Date');
      } else {
        const label = datePreset === 'this-month' ? 'This Month' :
                      datePreset === 'last-month' ? 'Last Month' :
                      datePreset === 'last-3m' ? 'Last 3M' :
                      datePreset === 'last-6m' ? 'Last 6M' :
                      datePreset === 'this-year' ? 'This Year' : datePreset;
        pills.push(label);
      }
    }
    if (selectedAccountTypes.length > 0) pills.push(`Types (${selectedAccountTypes.length})`);
    if (selectedAccountIds.length > 0) pills.push(`Accounts (${selectedAccountIds.length})`);
    if (selectedCategoryIds.length > 0) pills.push(`Categories (${selectedCategoryIds.length})`);
    if (selectedTagIds.length > 0) pills.push(`Tags (${selectedTagIds.length})`);
    if (selectedAccountTagIds.length > 0) pills.push(`Account Tags (${selectedAccountTagIds.length})`);
    if (filters.minAmount || filters.maxAmount) pills.push('Amount');
    if (filters.pending === 'true') pills.push('Pending');
    if (filters.type) pills.push(filters.type === 'income' ? 'Income' : 'Expense');
    if (filters.categorizedByAi === 'true') pills.push('AI');
    return pills;
  }, [selectedAccountTypes, selectedAccountIds, selectedCategoryIds, selectedTagIds, selectedAccountTagIds, filters, datePreset]);

  const hasActiveFilters = useMemo(() => {
    return activePills.length > 0 || Boolean(search && search.trim() !== '') || Boolean(filters.search && filters.search.trim() !== '');
  }, [activePills, search, filters.search]);

  const activeFilterCount = useMemo(() => {
    return activePills.length + (search.trim() ? 1 : 0);
  }, [activePills, search]);

  return (
    <div className="overflow-visible">
      {/* Unified Filter & Table Action Bar */}
      <CollapsibleFilterPanel
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        activeFilterCount={activeFilterCount}
        actions={
          hasActiveFilters ? (
            <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
              <span className="hidden sm:inline-flex items-center gap-1 text-caption font-semibold text-primary bg-primary/10 border border-primary/20 px-2 h-8 rounded-lg shadow-xs">
                Filtered
              </span>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setCustomStartDate('');
                  setCustomEndDate('');
                  onClearAll();
                }}
                className="flex items-center justify-center gap-1 px-2 h-8 rounded-lg text-xs font-semibold bg-background hover:bg-muted text-muted-foreground hover:text-foreground border border-border/80 transition-colors cursor-pointer shadow-xs min-touch-target-inline"
                title="Clear all filters"
                aria-label="Clear all filters"
              >
                <X size={13} className="text-muted-foreground shrink-0" />
                <span className="hidden sm:inline">Clear</span>
              </button>
            </div>
          ) : null
        }
        feedbackItems={activePills.map((pill) => (
          <span
            key={pill}
            className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-micro font-semibold uppercase tracking-wider animate-in fade-in duration-150"
          >
            {pill}
          </span>
        ))}
        className="px-3 sm:px-4 py-2 bg-muted/10 border-b border-border rounded-t-xl"
        contentClassName="mt-2.5 pt-2.5 pb-1 px-0 bg-transparent border-0 border-t border-border/60 rounded-none space-y-2.5"
        centerContent={
          <div className="relative flex-1 max-w-md min-w-[80px] sm:min-w-[140px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search transactions..."
              className="w-full h-8 pl-8 pr-7 bg-background border border-border/80 rounded-lg text-foreground text-xs sm:text-sm placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-shadow"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground rounded-full cursor-pointer"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        }
        rightActions={
          <div className="flex items-center gap-1.5 sm:gap-2">
            {analysisRunning && onOpenAiSuggestions && (
              <button
                type="button"
                onClick={onOpenAiSuggestions}
                title="View analysis progress"
                className="flex items-center gap-1.5 px-2.5 h-8 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                <Spinner size="sm" className="text-primary" />
                <span className="hidden sm:inline">
                  {analysisTotal !== undefined && analysisTotal > 0
                    ? `Analyzing… ${analysisProcessed ?? 0}/${analysisTotal}`
                    : 'AI analysis in progress'}
                </span>
              </button>
            )}
            {pendingAiCount !== undefined && pendingAiCount > 0 && !aiSuggestionsDismissed && onOpenAiSuggestions && (
              <button
                type="button"
                onClick={onOpenAiSuggestions}
                className="flex items-center gap-1.5 px-2.5 h-8 text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-lg transition-colors shadow-xs cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="hidden sm:inline">
                  {`${pendingAiCount} suggestion${pendingAiCount !== 1 ? 's' : ''}`}
                </span>
                <span className="sm:hidden">{pendingAiCount}</span>
                <span className="w-px h-3 bg-primary/25 mx-0.5" />
                <span
                  role="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onAiSuggestionsDismissed?.(true);
                  }}
                  className="p-0.5 hover:bg-primary/20 rounded text-primary transition-colors cursor-pointer flex items-center justify-center"
                  aria-label="Dismiss AI suggestions"
                >
                  <X className="h-3 w-3" />
                </span>
              </button>
            )}
            {!compactView && columnVisibility && onColumnVisibilityChange && (
              <div className="hidden md:block relative" ref={columnMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowColumnMenu(!showColumnMenu)}
                  className="flex items-center gap-1.5 px-2.5 h-8 text-xs font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-muted border border-border/80 rounded-lg transition-colors shadow-xs cursor-pointer"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  <span>Columns</span>
                </button>
                {showColumnMenu && (
                  <div className="absolute right-0 top-full mt-1.5 w-44 bg-card border border-border rounded-lg shadow-xl z-50 py-1">
                    <div className="px-3 py-1.5 text-micro font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60">
                      Toggle columns
                    </div>
                    {ALL_COLUMNS.map((colId) => {
                      const isVisible = columnVisibility[colId] !== false;
                      return (
                        <button
                          type="button"
                          key={colId}
                          onClick={() => {
                            onColumnVisibilityChange({
                              ...columnVisibility,
                              [colId]: !isVisible,
                            });
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground/80 hover:bg-muted transition-colors cursor-pointer"
                        >
                          {isVisible ? (
                            <EyeOff className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <Eye className="h-3 w-3 text-muted-foreground/50" />
                          )}
                          <span className={isVisible ? '' : 'opacity-50'}>
                            {COLUMN_LABELS[colId]}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {onCompactViewChange && (
              <button
                type="button"
                onClick={() => onCompactViewChange(!compactView)}
                className="hidden md:flex items-center gap-1.5 px-2.5 h-8 text-xs font-semibold text-muted-foreground hover:text-foreground bg-background hover:bg-muted border border-border/80 rounded-lg transition-colors shadow-xs cursor-pointer"
                title={compactView ? 'Switch to detailed view' : 'Switch to compact view'}
              >
                <Columns2 className="h-3.5 w-3.5" />
                <span>{compactView ? 'Detailed' : 'Compact'}</span>
              </button>
            )}
            {onAddTransaction && (
              <ActionButton
                onClick={onAddTransaction}
                icon={Plus}
                size="sm"
                className="min-touch-target-inline"
              >
                <span className="sm:hidden">Add</span>
                <span className="hidden sm:inline">Add Transaction</span>
              </ActionButton>
            )}
          </div>
        }
      >
        <div className="space-y-2.5">
          {/* Row 1: Filter Dimensions & Amount Range */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Date Preset Selector */}
            <div className="relative z-30">
              <Select
                className={`h-8 text-xs font-medium rounded-lg px-2.5 ${
                  datePreset !== 'all'
                    ? 'bg-primary/15 border-primary/50 text-primary shadow-xs'
                    : 'bg-background border-border/80 text-foreground hover:bg-muted/60'
                }`}
                value={datePreset}
                onChange={(e) => applyDatePreset(e.target.value)}
              >
                <option value="all">All Time</option>
                <option value="this-month">This Month</option>
                <option value="last-month">Last Month</option>
                <option value="last-3m">Last 3 Months</option>
                <option value="last-6m">Last 6 Months</option>
                <option value="this-year">This Year</option>
                <option value="custom">Custom Range</option>
              </Select>
            </div>

            {/* Inline Custom Date Range */}
            {datePreset === 'custom' && (
              <div className="flex flex-wrap items-center gap-1.5">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="h-8 px-2 bg-background border border-border/80 rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-shadow"
                />
                <span className="text-xs text-muted-foreground">–</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="h-8 px-2 bg-background border border-border/80 rounded-lg text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => {
                    onChange('startDate', customStartDate || null);
                    onChange('endDate', customEndDate || null);
                  }}
                  className="h-8 px-2.5 bg-primary text-primary-foreground text-xs font-medium rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Apply
                </button>
              </div>
            )}

            {/* Account Types - Grouped */}
            <div className="relative z-30" ref={accountTypesRef}>
              <button
                type="button"
                onClick={() => setAccountTypesOpen(!accountTypesOpen)}
                className={`h-8 px-2.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  selectedAccountTypes.length > 0
                    ? 'bg-primary/15 border border-primary/50 text-primary shadow-xs'
                    : 'bg-background border border-border/80 text-foreground hover:bg-muted/60 hover:border-border'
                }`}
              >
                <span>Type</span>
                {selectedAccountTypes.length > 0 && (
                  <span className="px-1.5 py-0.5 text-micro font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center leading-none">
                    {selectedAccountTypes.length}
                  </span>
                )}
                <svg className={`h-3.5 w-3.5 transition-transform ${accountTypesOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {accountTypesOpen && (
                <div className="absolute top-full left-0 mt-2 w-52 bg-card border border-border rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                  {groupedAccountTypes.map((group) => {
                    const groupValues = group.types.map((t) => t.value);
                    const isAllSelected = groupValues.every((v) => selectedAccountTypes.includes(v));

                    const toggleGroup = () => {
                      if (isAllSelected) {
                        handleAccountTypesChange(selectedAccountTypes.filter((v) => !groupValues.includes(v)));
                      } else {
                        const combined = Array.from(new Set([...selectedAccountTypes, ...groupValues]));
                        handleAccountTypesChange(combined);
                      }
                    };

                    return (
                      <div key={group.group}>
                        <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border/50">
                          <span className="text-micro font-bold text-muted-foreground uppercase tracking-widest">
                            {group.group}
                          </span>
                          <button
                            type="button"
                            onClick={toggleGroup}
                            className="text-micro font-semibold text-primary hover:underline cursor-pointer"
                          >
                            {isAllSelected ? 'Deselect' : 'Select'}
                          </button>
                        </div>
                        {group.types.map((t) => (
                          <label
                            key={t.value}
                            className="flex items-center gap-3 px-3 py-2 text-sm text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                          >
                            <input
                              type="checkbox"
                              checked={selectedAccountTypes.includes(t.value)}
                              onChange={() => {
                                const next = selectedAccountTypes.includes(t.value)
                                  ? selectedAccountTypes.filter((v) => v !== t.value)
                                  : [...selectedAccountTypes, t.value];
                                handleAccountTypesChange(next);
                              }}
                              className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                            />
                            <span className="text-sm">{t.label}</span>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                  {groupedAccountTypes.length === 0 && (
                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">No account types</div>
                  )}
                </div>
              )}
            </div>

            {/* Accounts Multi-Select */}
            <AccountFilterDropdown
              selectedAccountIds={selectedAccountIds}
              accounts={accounts}
              handleAccountIdsChange={handleAccountIdsChange}
            />

            {/* Categories Multi-Select */}
            <CategoryFilterDropdown
              selectedCategoryIds={selectedCategoryIds}
              categoryItems={categoryItems}
              categories={categories}
              handleCategoryIdsChange={handleCategoryIdsChange}
            />

            {/* Tags Multi-Select */}
            <div className="relative z-30" ref={tagIdsRef}>
              <button
                type="button"
                onClick={() => { setTagIdsOpen(!tagIdsOpen); if (!tagIdsOpen) setTagSearch(''); }}
                className={`h-8 px-2.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  selectedTagIds.length > 0
                    ? 'bg-primary/15 border border-primary/50 text-primary shadow-xs'
                    : 'bg-background border border-border/80 text-foreground hover:bg-muted/60 hover:border-border'
                }`}
              >
                <span>Tags</span>
                {selectedTagIds.length > 0 && (
                  <span className="px-1.5 py-0.5 text-micro font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center leading-none">
                    {selectedTagIds.length}
                  </span>
                )}
                <svg className={`h-3.5 w-3.5 transition-transform ${tagIdsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {tagIdsOpen && (
                <div className="absolute top-full right-0 mt-2 w-52 bg-card border border-border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
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
                    {tags.length === 0 && (
                      <div className="px-3 py-4 text-xs text-muted-foreground text-center">No tags yet</div>
                    )}
                    {tags
                      .filter((t) => !tagSearch || t.name.toLowerCase().includes(tagSearch.toLowerCase()))
                      .map((tag) => (
                        <label
                          key={tag.id}
                          className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTagIds.includes(tag.id)}
                            onChange={() => {
                              const next = selectedTagIds.includes(tag.id)
                                ? selectedTagIds.filter((id) => id !== tag.id)
                                : [...selectedTagIds, tag.id];
                              handleTagIdsChange(next);
                            }}
                            className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="text-sm">{tag.name}</span>
                        </label>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Account Tags Multi-Select */}
            <div className="relative z-30" ref={accountTagIdsRef}>
              <button
                type="button"
                onClick={() => { setAccountTagIdsOpen(!accountTagIdsOpen); if (!accountTagIdsOpen) setAccountTagSearch(''); }}
                className={`h-8 px-2.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  selectedAccountTagIds.length > 0
                    ? 'bg-primary/15 border border-primary/50 text-primary shadow-xs'
                    : 'bg-background border border-border/80 text-foreground hover:bg-muted/60 hover:border-border'
                }`}
              >
                <span>Account Tags</span>
                {selectedAccountTagIds.length > 0 && (
                  <span className="px-1.5 py-0.5 text-micro font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center leading-none">
                    {selectedAccountTagIds.length}
                  </span>
                )}
                <svg className={`h-3.5 w-3.5 transition-transform ${accountTagIdsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {accountTagIdsOpen && (
                <div className="absolute top-full left-0 sm:right-0 sm:left-auto mt-2 w-52 bg-card border border-border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
                  <div className="p-2 border-b border-border/50">
                    <input
                      type="text"
                      value={accountTagSearch}
                      onChange={(e) => setAccountTagSearch(e.target.value)}
                      placeholder="Search account tags..."
                      className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                    />
                  </div>
                  <div className="overflow-y-auto flex-1 p-1">
                    {tags.length === 0 && (
                      <div className="px-3 py-4 text-xs text-muted-foreground text-center">No tags yet</div>
                    )}
                    {tags
                      .filter((t) => !accountTagSearch || t.name.toLowerCase().includes(accountTagSearch.toLowerCase()))
                      .map((tag) => (
                        <label
                          key={tag.id}
                          className="flex items-center gap-2.5 px-3 py-2 text-sm text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                        >
                          <input
                            type="checkbox"
                            checked={selectedAccountTagIds.includes(tag.id)}
                            onChange={() => {
                              const next = selectedAccountTagIds.includes(tag.id)
                                ? selectedAccountTagIds.filter((id) => id !== tag.id)
                                : [...selectedAccountTagIds, tag.id];
                              handleAccountTagIdsChange(next);
                            }}
                            className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="text-sm">{tag.name}</span>
                        </label>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Inline Amount Filter Pill */}
            <div
              className={`inline-flex items-center h-8 px-2.5 rounded-lg border transition-colors gap-1.5 ${
                filters.minAmount || filters.maxAmount
                  ? 'bg-primary/10 border-primary/50'
                  : 'bg-background border-border/80'
              }`}
            >
              <span className="text-micro font-semibold text-muted-foreground uppercase tracking-wider select-none">
                Amount
              </span>
              <input
                type="number"
                placeholder="Min"
                value={filters.minAmount ?? ''}
                onChange={(e) => onChange('minAmount', e.target.value || null)}
                className="w-14 bg-transparent text-foreground text-xs placeholder-muted-foreground/70 focus:outline-none text-right font-mono"
              />
              <span className="text-xs text-muted-foreground/60 select-none">–</span>
              <input
                type="number"
                placeholder="Max"
                value={filters.maxAmount ?? ''}
                onChange={(e) => onChange('maxAmount', e.target.value || null)}
                className="w-14 bg-transparent text-foreground text-xs placeholder-muted-foreground/70 focus:outline-none font-mono"
              />
            </div>
          </div>

          {/* Row 2: Quick Views & Status Toggles */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-2 pt-2 border-t border-border/40">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-micro font-semibold text-muted-foreground uppercase tracking-wider mr-1 select-none">
                Views
              </span>
              {allPresets.map((preset) => {
                const active = isPresetActive(preset);
                return (
                  <button
                    type="button"
                    key={preset.id}
                    onClick={() => onApplyPreset(preset)}
                    className={`group flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium border transition-all cursor-pointer ${
                      active
                        ? 'bg-primary/15 border-primary/50 text-primary shadow-xs'
                        : 'bg-background hover:bg-muted/60 border-border/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span>{preset.name}</span>
                    {preset.isCustom && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePreset(preset.id);
                        }}
                        className="w-3.5 h-3.5 rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive flex items-center justify-center text-micro ml-0.5 opacity-60 group-hover:opacity-100 transition-opacity"
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
                    if (newPresetName.trim()) {
                      onSavePreset(newPresetName.trim());
                      setNewPresetName('');
                      setIsSavingView(false);
                    }
                  }}
                  className="flex items-center gap-1 animate-in fade-in slide-in-from-left-2 duration-200"
                >
                  <input
                    type="text"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="Name this view..."
                    className="h-7 px-2 bg-background border border-input rounded-md text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-28 transition-all"
                    autoFocus
                    required
                  />
                  <button
                    type="submit"
                    className="h-7 px-2 bg-primary text-primary-foreground text-xs font-medium rounded-md hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSavingView(false);
                      setNewPresetName('');
                    }}
                    className="h-7 px-2 bg-muted text-muted-foreground text-xs font-medium rounded-md hover:bg-muted/80 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsSavingView(true)}
                  className="flex items-center gap-1 h-7 px-2 rounded-md text-xs font-semibold border border-dashed border-primary/45 hover:border-primary text-primary hover:bg-primary/5 transition-all cursor-pointer"
                >
                  <span className="text-sm leading-none">+</span> Save View
                </button>
              )}
            </div>

            <div className="h-4 w-px bg-border/60 mx-1 hidden lg:block" />

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-micro font-semibold text-muted-foreground uppercase tracking-wider mr-1 select-none">
                Status
              </span>
              <button
                type="button"
                onClick={() => onChange('type', filters.type === 'income' ? null : 'income')}
                className={`h-7 px-2.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  filters.type === 'income'
                    ? 'border border-chart-1 bg-chart-1/20 text-chart-1 shadow-xs'
                    : 'border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                Income
              </button>
              <button
                type="button"
                onClick={() => onChange('type', filters.type === 'expense' ? null : 'expense')}
                className={`h-7 px-2.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  filters.type === 'expense'
                    ? 'border border-chart-5 bg-chart-5/20 text-chart-5 shadow-xs'
                    : 'border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => onChange('pending', filters.pending === 'true' ? null : 'true')}
                className={`h-7 px-2.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  filters.pending === 'true'
                    ? 'border border-chart-3 bg-chart-3/20 text-chart-3 shadow-xs'
                    : 'border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                Pending
              </button>
              <button
                type="button"
                onClick={() => {
                  const currentCategoryFilter = filters.categoryIds || '';
                  const categoryIds = currentCategoryFilter.split(',').filter(id => id.trim() !== '');
                  if (categoryIds.includes('uncategorized')) {
                    const newCategoryIds = categoryIds.filter(id => id !== 'uncategorized');
                    onChange('categoryIds', newCategoryIds.length > 0 ? newCategoryIds.join(',') : null);
                  } else {
                    const newCategoryIds = [...categoryIds, 'uncategorized'];
                    onChange('categoryIds', newCategoryIds.join(','));
                  }
                }}
                className={`h-7 px-2.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  (filters.categoryIds && filters.categoryIds.includes('uncategorized'))
                    ? 'border border-primary/50 bg-primary/15 text-primary shadow-xs'
                    : 'border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                Uncategorized
              </button>
              <button
                type="button"
                onClick={() => onChange('categorizedByAi', filters.categorizedByAi === 'true' ? null : 'true')}
                className={`h-7 px-2.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                  filters.categorizedByAi === 'true'
                    ? 'border border-primary/50 bg-primary/15 text-primary shadow-xs'
                    : 'border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                AI Categorized
              </button>
            </div>
          </div>
        </div>
      </CollapsibleFilterPanel>
    </div>
  );
}
