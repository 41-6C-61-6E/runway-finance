'use client';

import React, { useState, useMemo, useCallback, useRef, Fragment, useEffect } from 'react';
import Link from 'next/link';
import { 
  ChevronRight, 
  ChevronDown, 
  Landmark, 
  Plus, 
  AlertCircle, 
  AlertTriangle,
  Search,
  X
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';
import { TimeRangeFilter, type TimeRange } from '@/components/charts/chart-filters';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Sparkline } from '@/components/ui/sparkline';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';
import { useAccountSubheadings } from '@/lib/hooks/use-account-subheadings';
import { isLiabilityAccount } from '@/lib/utils/account-scope';
import { formatCurrency, formatPercent } from '@/lib/utils/format';
import { getPreciseDateRange } from '@/lib/utils/date-window';
import { AccountTransactions } from '@/components/features/accounts/AccountTransactions';
import AccountDetailPanel from '@/components/features/accounts/AccountDetailPanel';
import GroupDetailPanel from '@/components/features/accounts/GroupDetailPanel';
import {
  type Account,
  type TagItem,
  GROUP_ORDER,
  getHierarchy,
} from './account-types';

const setOptions = {
  serialize: (s: Set<string>) => JSON.stringify(Array.from(s)),
  deserialize: (raw: string) => new Set<string>(JSON.parse(raw)),
};

interface AccountHierarchyTreeProps {
  filteredAllAccounts: Account[];
  allTags: TagItem[];
  historyData: any[];
  accountsLoading: boolean;
  targetAccountId?: string | null;
}

export default function AccountHierarchyTree({
  filteredAllAccounts,
  allTags,
  historyData,
  accountsLoading,
  targetAccountId,
}: AccountHierarchyTreeProps) {
  const { hideSubheadings } = useAccountSubheadings();
  const hierarchyCollapsed = false;
  const [showHierarchyFilters, setShowHierarchyFilters] = useState(false);
  const [hierarchyTimeframe, setHierarchyTimeframe] = usePersistentState<TimeRange>('finance:accounts:hierarchyTimeframe', '1m');

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedSubgroups, setExpandedSubgroups] = useState<Record<string, boolean>>({});
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const [hierarchySelectedGroups, setHierarchySelectedGroups] = usePersistentState<Set<string>>('finance:accounts:hierarchySelectedGroups', new Set(), setOptions);
  const [hierarchySelectedTypes, setHierarchySelectedTypes] = usePersistentState<Set<string>>('finance:accounts:hierarchySelectedTypes', new Set(), setOptions);
  const [hierarchySelectedAccounts, setHierarchySelectedAccounts] = usePersistentState<Set<string>>('finance:accounts:hierarchySelectedAccounts', new Set(), setOptions);
  const [hierarchySelectedTags, setHierarchySelectedTags] = usePersistentState<Set<string>>('finance:accounts:hierarchySelectedTags', new Set(), setOptions);

  const [hierarchyGroupsOpen, setHierarchyGroupsOpen] = useState(false);
  const [hierarchyTypesOpen, setHierarchyTypesOpen] = useState(false);
  const [hierarchyAccountsOpen, setHierarchyAccountsOpen] = useState(false);
  const [hierarchyTagsOpen, setHierarchyTagsOpen] = useState(false);

  const [hierarchyTypeSearch, setHierarchyTypeSearch] = useState('');
  const [hierarchyAccountSearch, setHierarchyAccountSearch] = useState('');
  const [hierarchyTagSearch, setHierarchyTagSearch] = useState('');

  // Quick search (transient, not persisted) — matches name, institution, or tag
  const [searchQuery, setSearchQuery] = useState('');

  const hierarchyGroupsRef = useRef<HTMLDivElement>(null);
  const hierarchyTypesRef = useRef<HTMLDivElement>(null);
  const hierarchyAccountsRef = useRef<HTMLDivElement>(null);
  const hierarchyTagsRef = useRef<HTMLDivElement>(null);
  const pendingMobileAccountScrollRef = useRef<string | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (hierarchyGroupsRef.current && !hierarchyGroupsRef.current.contains(e.target as Node)) {
        setHierarchyGroupsOpen(false);
      }
      if (hierarchyTypesRef.current && !hierarchyTypesRef.current.contains(e.target as Node)) {
        setHierarchyTypesOpen(false);
        setHierarchyTypeSearch('');
      }
      if (hierarchyAccountsRef.current && !hierarchyAccountsRef.current.contains(e.target as Node)) {
        setHierarchyAccountsOpen(false);
        setHierarchyAccountSearch('');
      }
      if (hierarchyTagsRef.current && !hierarchyTagsRef.current.contains(e.target as Node)) {
        setHierarchyTagsOpen(false);
        setHierarchyTagSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!targetAccountId) return;
    setExpandedAccounts({ [targetAccountId]: true });
    setSelectedGroup(null);

    if (filteredAllAccounts && filteredAllAccounts.length > 0) {
      const acc = filteredAllAccounts.find((a) => a.id === targetAccountId);
      if (acc) {
        const { group, subGroup } = getHierarchy(acc.type);
        setExpandedGroups((prev) => ({ ...prev, [group]: true }));
        setExpandedSubgroups((prev) => ({ ...prev, [`${group}::${subGroup}`]: true }));
      }
    }

    const timer = setTimeout(() => {
      const el = document.getElementById(`account-row-${targetAccountId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [targetAccountId, filteredAllAccounts]);

  const hierarchyAvailableGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const acc of filteredAllAccounts) {
      if (acc.isHidden) continue;
      groups.add(getHierarchy(acc.type).group);
    }
    return Array.from(groups).sort();
  }, [filteredAllAccounts]);

  const hierarchyAvailableTypes = useMemo(() => {
    const types = new Set<string>();
    for (const acc of filteredAllAccounts) {
      if (acc.isHidden) continue;
      types.add(getHierarchy(acc.type).subGroup);
    }
    return Array.from(types).sort();
  }, [filteredAllAccounts]);

  const hierarchyAvailableAccounts = useMemo(() => {
    const list = filteredAllAccounts.filter((acc) => !acc.isHidden);
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredAllAccounts]);

  const getTrendStats = useCallback((accs: Account[]) => {
    if (historyData.length === 0) {
      const current = accs.reduce((sum, a) => sum + parseFloat(String(a.balance)), 0);
      return {
        current,
        starting: current,
        change: 0,
        percentChange: 0,
        historyPoints: [],
        isPositive: true,
      };
    }

    const firstAcc = accs[0];
    const isLiab = firstAcc ? isLiabilityAccount(firstAcc.type) : false;
    const range = getPreciseDateRange(hierarchyTimeframe);
    let startIdx = 0;
    let endIdx = historyData.length - 1;

    if (hierarchyTimeframe !== 'all') {
      const startStr = range.start;
      const endStr = range.end;

      const foundStart = historyData.findIndex((d) => d.date >= startStr);
      if (foundStart !== -1) startIdx = foundStart;
      
      let foundEnd = historyData.length - 1;
      for (let i = historyData.length - 1; i >= 0; i--) {
        if (historyData[i].date <= endStr) {
          foundEnd = i;
          break;
        }
      }
      endIdx = foundEnd;
    }

    const slicedHistory = historyData.slice(startIdx, endIdx + 1);
    const points = slicedHistory.map((d) => {
      let sum = 0;
      for (const acc of accs) {
        sum += (d[acc.id] ?? 0);
      }
      return sum;
    });

    const starting = points.length > 0 ? Math.abs(points[0]) : 0;
    const current = points.length > 0 ? Math.abs(points[points.length - 1]) : 0;

    let change = 0;
    let percentChange = 0;
    let isPositive = true;

    if (isLiab) {
      change = current - starting;
      percentChange = starting !== 0 ? (change / starting) * 100 : 0;
      isPositive = change <= 0;
    } else {
      change = current - starting;
      percentChange = starting !== 0 ? (change / starting) * 100 : 0;
      isPositive = change >= 0;
    }

    return {
      current,
      starting,
      change,
      percentChange,
      historyPoints: points,
      isPositive,
    };
  }, [historyData, hierarchyTimeframe]);

  const formatChange = (change: number, percentChange: number, isLiab: boolean) => {
    const absChange = Math.abs(change);
    const textVal = formatCurrency(absChange);
    const textPct = formatPercent(percentChange);
    const isGood = isLiab ? change <= 0 : change >= 0;

    const sign = change > 0 ? '+' : change < 0 ? '-' : '';
    return {
      text: `${sign}${textVal} (${textPct})`,
      isPositive: isGood,
    };
  };

  const treeHierarchy = useMemo(() => {
    const map = new Map<string, Map<string, Account[]>>();
    const q = searchQuery.toLowerCase().trim();

    for (const acc of filteredAllAccounts) {
      if (acc.isHidden) continue;
      const { group, subGroup } = getHierarchy(acc.type);

      if (hierarchySelectedGroups.size > 0 && !hierarchySelectedGroups.has(group)) continue;
      if (hierarchySelectedTypes.size > 0 && !hierarchySelectedTypes.has(subGroup)) continue;
      if (hierarchySelectedAccounts.size > 0 && !hierarchySelectedAccounts.has(acc.id)) continue;
      if (hierarchySelectedTags.size > 0) {
        const accTags = acc.tags || [];
        const hasMatchingTag = accTags.some((t: any) => hierarchySelectedTags.has(t.id));
        if (!hasMatchingTag) continue;
      }
      if (q) {
        const matchesName = acc.name.toLowerCase().includes(q);
        const matchesInstitution = acc.institution ? acc.institution.toLowerCase().includes(q) : false;
        const matchesTag = (acc.tags || []).some((t) => t.name.toLowerCase().includes(q));
        if (!matchesName && !matchesInstitution && !matchesTag) continue;
      }

      if (!map.has(group)) map.set(group, new Map());
      const subMap = map.get(group)!;
      if (!subMap.has(subGroup)) subMap.set(subGroup, []);
      subMap.get(subGroup)!.push(acc);
    }

    for (const subMap of map.values()) {
      for (const [subGroup, accs] of subMap.entries()) {
        subMap.set(subGroup, [...accs].sort((a, b) => {
          const balanceA = a.balance || 0;
          const balanceB = b.balance || 0;
          return Math.abs(balanceB) - Math.abs(balanceA);
        }));
      }
    }

    return map;
  }, [filteredAllAccounts, hierarchySelectedGroups, hierarchySelectedTypes, hierarchySelectedAccounts, hierarchySelectedTags, searchQuery]);

  const sortedGroups = useMemo(() => {
    return Array.from(treeHierarchy.keys()).sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a);
      const bi = GROUP_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [treeHierarchy]);

  // Count of accounts actually visible after all filters + search
  const visibleAccountCount = useMemo(() => {
    let count = 0;
    for (const subMap of treeHierarchy.values()) {
      for (const accs of subMap.values()) count += accs.length;
    }
    return count;
  }, [treeHierarchy]);

  const hasActiveFilters =
    hierarchySelectedGroups.size > 0 ||
    hierarchySelectedTypes.size > 0 ||
    hierarchySelectedAccounts.size > 0 ||
    hierarchySelectedTags.size > 0;

  const clearAllFilters = useCallback(() => {
    setHierarchySelectedGroups(new Set());
    setHierarchySelectedTypes(new Set());
    setHierarchySelectedAccounts(new Set());
    setHierarchySelectedTags(new Set());
    setSearchQuery('');
  }, [setHierarchySelectedGroups, setHierarchySelectedTypes, setHierarchySelectedAccounts, setHierarchySelectedTags]);

  // Selected account (single-select via expandedAccounts) — drives the desktop side panel
  const selectedAccount = useMemo(() => {
    const selectedId = Object.keys(expandedAccounts).find((id) => expandedAccounts[id]);
    if (!selectedId) return null;
    return filteredAllAccounts.find((a) => a.id === selectedId) || null;
  }, [expandedAccounts, filteredAllAccounts]);

    // Selected group — drives the desktop side panel (mutually exclusive with account selection)
    const selectedGroupAccounts = useMemo(() => {
      if (!selectedGroup) return null;
      const subMap = treeHierarchy.get(selectedGroup);
      if (!subMap) return null;
      const accs: Account[] = [];
      subMap.forEach((accsInGroup) => accs.push(...accsInGroup));
      return accs;
    }, [selectedGroup, treeHierarchy]);

  // Group heading click: select the group (drives the detail panel at all viewports)
  const handleGroupSelect = useCallback((group: string) => {
    setSelectedGroup(group);
    setExpandedAccounts({});
  }, []);

  const handleAccountSelect = useCallback((accountId: string, isExpanded: boolean) => {
    if (!isExpanded && window.innerWidth < 1024) {
      pendingMobileAccountScrollRef.current = accountId;
    }
    setSelectedGroup(null);
    setExpandedAccounts(isExpanded ? {} : { [accountId]: true });
  }, []);

  // Selecting an account can remove a tall combined panel above it. Once the
  // new account detail has been laid out, keep its row at the top of the view
  // so the detail the user opened stays visible on mobile.
  useEffect(() => {
    const accountId = pendingMobileAccountScrollRef.current;
    if (!accountId || !expandedAccounts[accountId] || selectedGroup) return;

    pendingMobileAccountScrollRef.current = null;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`account-row-${accountId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [expandedAccounts, selectedGroup]);

  // Selected-group detail (combined chart) — below lg it renders inline under the group heading,
  // identical to how an account's transaction card opens under its row; at lg+ it fills the side column
  const groupDetailPanel =
    selectedGroup && selectedGroupAccounts ? (
      <GroupDetailPanel
        group={selectedGroup}
        accounts={selectedGroupAccounts}
        historyData={historyData}
        hierarchyTimeframe={hierarchyTimeframe}
        onClose={() => setSelectedGroup(null)}
      />
    ) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
      <Card className="@container lg:col-span-5 bg-card/40 backdrop-blur-md border-border/60 shadow-sm overflow-hidden">
      <CollapsibleCardHeader
        isCollapsed={hierarchyCollapsed}
        title={
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary shrink-0" />
            <span>Accounts</span>
          </div>
        }
      />
      {!hierarchyCollapsed && (
        <>
          {accountsLoading ? (
            <CardContent className="p-2 sm:p-5">
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            </CardContent>
          ) : filteredAllAccounts.length === 0 ? (
            <CardContent className="p-2 sm:p-5">
              <div className="p-12 text-center border border-dashed border-border/40 rounded-xl">
                <p className="text-muted-foreground text-sm mb-4">No accounts linked yet.</p>
                <Link
                  href="/settings?tab=accounts"
                  className="px-5 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-90 transition-all flex items-center gap-2 mx-auto w-fit"
                >
                  <Plus className="w-4 h-4" /> Link Institution
                </Link>
              </div>
            </CardContent>
          ) : visibleAccountCount === 0 ? (
            <CardContent className="p-2 sm:p-5">
              <div className="py-12 text-center border border-dashed border-border/40 rounded-xl space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                  <Search className="w-6 h-6" />
                </div>
                <h3 className="font-semibold text-base text-foreground">No accounts match</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  {searchQuery.trim()
                    ? `No accounts match "${searchQuery.trim()}" with the current filters.`
                    : 'No accounts match the current filters.'}
                </p>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:opacity-90 transition-all mx-auto w-fit"
                >
                  Clear Search & Filters
                </button>
              </div>
            </CardContent>
          ) : (
            <>
              <CollapsibleFilterPanel
                isOpen={showHierarchyFilters}
                onToggle={() => setShowHierarchyFilters(!showHierarchyFilters)}
                centerContent={
                  <div className="relative w-full max-w-xs">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search accounts, institutions, tags..."
                      className="h-8 w-full pl-8 pr-7 bg-background border border-border rounded-lg text-xs sm:text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-1 focus:ring-ring transition-colors"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                }
                feedbackItems={[
                  <span key="count" className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                    Showing {visibleAccountCount} Accounts
                  </span>,
                  <span key="timeframe" className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                    {hierarchyTimeframe.toUpperCase()}
                  </span>,
                  hasActiveFilters && (
                    <span key="filtered" className="bg-chart-3/15 text-chart-3 border border-chart-3/25 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                      FILTERED
                    </span>
                  ),
                ].filter(Boolean) as React.ReactNode[]}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Timeframe</span>
                    <TimeRangeFilter value={hierarchyTimeframe} onChange={setHierarchyTimeframe} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5">
                    {/* Group Dropdown */}
                    <div className="relative z-30" ref={hierarchyGroupsRef}>
                      <button
                        type="button"
                        onClick={() => setHierarchyGroupsOpen(!hierarchyGroupsOpen)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                          hierarchySelectedGroups.size > 0
                            ? 'bg-primary/15 border border-primary text-primary'
                            : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
                        }`}
                      >
                        <span>Group</span>
                        {hierarchySelectedGroups.size > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center">
                            {hierarchySelectedGroups.size}
                          </span>
                        )}
                        <ChevronDown className={`h-3 w-3 transition-transform ${hierarchyGroupsOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {hierarchyGroupsOpen && (
                        <div className="absolute top-full right-0 mt-2 w-52 bg-card border border-border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
                          <div className="overflow-y-auto flex-1 p-1">
                            <label className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
                              <input
                                type="checkbox"
                                checked={hierarchySelectedGroups.size === hierarchyAvailableGroups.length && hierarchyAvailableGroups.length > 0}
                                onChange={() => {
                                  if (hierarchySelectedGroups.size === hierarchyAvailableGroups.length) {
                                    setHierarchySelectedGroups(new Set());
                                  } else {
                                    setHierarchySelectedGroups(new Set(hierarchyAvailableGroups));
                                  }
                                }}
                                className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                              />
                              Select All
                            </label>
                            {hierarchyAvailableGroups.map((group) => (
                              <label
                                key={group}
                                className="flex items-center gap-2 px-3 py-2 text-[11px] text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                              >
                                <input
                                  type="checkbox"
                                  checked={hierarchySelectedGroups.has(group)}
                                  onChange={() => {
                                    const next = new Set(hierarchySelectedGroups);
                                    if (next.has(group)) next.delete(group);
                                    else next.add(group);
                                    setHierarchySelectedGroups(next);
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

                    {/* Type Dropdown */}
                    <div className="relative z-30" ref={hierarchyTypesRef}>
                      <button
                        type="button"
                        onClick={() => setHierarchyTypesOpen(!hierarchyTypesOpen)}
                        className={`px-3 py-1.5 min-h-8 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                          hierarchySelectedTypes.size > 0
                            ? 'bg-primary/15 border border-primary text-primary'
                            : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
                        }`}
                      >
                        <span>Type</span>
                        {hierarchySelectedTypes.size > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center">
                            {hierarchySelectedTypes.size}
                          </span>
                        )}
                        <ChevronDown className={`h-3 w-3 transition-transform ${hierarchyTypesOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {hierarchyTypesOpen && (
                        <div className="absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
                          <div className="p-2 border-b border-border/50">
                            <input
                              type="text"
                              value={hierarchyTypeSearch}
                              onChange={(e) => setHierarchyTypeSearch(e.target.value)}
                              placeholder="Search types..."
                              className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                            />
                          </div>
                          <div className="overflow-y-auto flex-1 p-1">
                            <label className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
                              <input
                                type="checkbox"
                                checked={hierarchySelectedTypes.size === hierarchyAvailableTypes.length && hierarchyAvailableTypes.length > 0}
                                onChange={() => {
                                  if (hierarchySelectedTypes.size === hierarchyAvailableTypes.length) {
                                    setHierarchySelectedTypes(new Set());
                                  } else {
                                    setHierarchySelectedTypes(new Set(hierarchyAvailableTypes));
                                  }
                                }}
                                className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                              />
                              Select All
                            </label>
                            {hierarchyAvailableTypes
                              .filter((t) => !hierarchyTypeSearch || t.toLowerCase().includes(hierarchyTypeSearch.toLowerCase()))
                              .map((type) => (
                                <label
                                  key={type}
                                  className="flex items-center gap-2 px-3 py-2 text-[11px] text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                                >
                                  <input
                                    type="checkbox"
                                    checked={hierarchySelectedTypes.has(type)}
                                    onChange={() => {
                                      const next = new Set(hierarchySelectedTypes);
                                      if (next.has(type)) next.delete(type);
                                      else next.add(type);
                                      setHierarchySelectedTypes(next);
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

                    {/* Account Dropdown */}
                    <div className="relative z-30" ref={hierarchyAccountsRef}>
                      <button
                        type="button"
                        onClick={() => setHierarchyAccountsOpen(!hierarchyAccountsOpen)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                          hierarchySelectedAccounts.size > 0
                            ? 'bg-primary/15 border border-primary text-primary'
                            : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
                        }`}
                      >
                        <span>Account</span>
                        {hierarchySelectedAccounts.size > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center">
                            {hierarchySelectedAccounts.size}
                          </span>
                        )}
                        <ChevronDown className={`h-3 w-3 transition-transform ${hierarchyAccountsOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {hierarchyAccountsOpen && (
                        <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
                          <div className="p-2 border-b border-border/50">
                            <input
                              type="text"
                              value={hierarchyAccountSearch}
                              onChange={(e) => setHierarchyAccountSearch(e.target.value)}
                              placeholder="Search accounts..."
                              className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                            />
                          </div>
                          <div className="overflow-y-auto flex-1 p-1">
                            <label className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
                              <input
                                type="checkbox"
                                checked={hierarchySelectedAccounts.size === hierarchyAvailableAccounts.length && hierarchyAvailableAccounts.length > 0}
                                onChange={() => {
                                  if (hierarchySelectedAccounts.size === hierarchyAvailableAccounts.length) {
                                    setHierarchySelectedAccounts(new Set());
                                  } else {
                                    setHierarchySelectedAccounts(new Set(hierarchyAvailableAccounts.map((a) => a.id)));
                                  }
                                }}
                                className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                              />
                              Select All
                            </label>
                            {hierarchyAvailableAccounts
                              .filter((a) => !hierarchyAccountSearch || a.name.toLowerCase().includes(hierarchyAccountSearch.toLowerCase()) || (a.institution && a.institution.toLowerCase().includes(hierarchyAccountSearch.toLowerCase())))
                              .map((acc) => (
                                <label
                                  key={acc.id}
                                  className="flex items-center gap-3 px-3 py-2 text-[11px] text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                                >
                                  <input
                                    type="checkbox"
                                    checked={hierarchySelectedAccounts.has(acc.id)}
                                    onChange={() => {
                                      const next = new Set(hierarchySelectedAccounts);
                                      if (next.has(acc.id)) next.delete(acc.id);
                                      else next.add(acc.id);
                                      setHierarchySelectedAccounts(next);
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

                    {/* Tags Dropdown */}
                    <div className="relative z-30" ref={hierarchyTagsRef}>
                      <button
                        type="button"
                        onClick={() => setHierarchyTagsOpen(!hierarchyTagsOpen)}
                        className={`px-3 py-1.5 min-h-8 rounded-lg text-xs font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                          hierarchySelectedTags.size > 0
                            ? 'bg-primary/15 border border-primary text-primary'
                            : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
                        }`}
                      >
                        <span>Tags</span>
                        {hierarchySelectedTags.size > 0 && (
                          <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-primary/25 text-primary rounded-full min-w-[18px] text-center">
                            {hierarchySelectedTags.size}
                          </span>
                        )}
                        <ChevronDown className={`h-3 w-3 transition-transform ${hierarchyTagsOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {hierarchyTagsOpen && (
                        <div className="absolute top-full right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-xl z-50 max-h-72 flex flex-col">
                          <div className="p-2 border-b border-border/50">
                            <input
                              type="text"
                              value={hierarchyTagSearch}
                              onChange={(e) => setHierarchyTagSearch(e.target.value)}
                              placeholder="Search tags..."
                              className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                            />
                          </div>
                          <div className="overflow-y-auto flex-1 p-1">
                            <label className="flex items-center gap-2 px-3 py-2 text-xs text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
                              <input
                                type="checkbox"
                                checked={hierarchySelectedTags.size === allTags.length && allTags.length > 0}
                                onChange={() => {
                                  if (hierarchySelectedTags.size === allTags.length) {
                                    setHierarchySelectedTags(new Set());
                                  } else {
                                    setHierarchySelectedTags(new Set(allTags.map((t) => t.id)));
                                  }
                                }}
                                className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                              />
                              Select All
                            </label>
                            {allTags
                              .filter((t) => !hierarchyTagSearch || t.name.toLowerCase().includes(hierarchyTagSearch.toLowerCase()))
                              .map((tag) => (
                                <label
                                  key={tag.id}
                                  className="flex items-center gap-3 px-3 py-2 text-[11px] text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                                >
                                  <input
                                    type="checkbox"
                                    checked={hierarchySelectedTags.has(tag.id)}
                                    onChange={() => {
                                      const next = new Set(hierarchySelectedTags);
                                      if (next.has(tag.id)) next.delete(tag.id);
                                      else next.add(tag.id);
                                      setHierarchySelectedTags(next);
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

                    {/* Reset button */}
                    {(hierarchySelectedGroups.size > 0 || hierarchySelectedTypes.size > 0 || hierarchySelectedAccounts.size > 0 || hierarchySelectedTags.size > 0) && (
                      <button
                        onClick={() => {
                          setHierarchySelectedGroups(new Set());
                          setHierarchySelectedTypes(new Set());
                          setHierarchySelectedAccounts(new Set());
                          setHierarchySelectedTags(new Set());
                        }}
                        className="px-2.5 py-1 text-xs font-semibold rounded bg-muted/40 border border-border/20 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                </div>
              </CollapsibleFilterPanel>

              <div className="border-t border-border/10" />
              <div className="divide-y divide-border/10">
                {sortedGroups.map((group) => {
                  const subMap = treeHierarchy.get(group);
                  if (!subMap) return null;
                  
                  const groupAccounts: Account[] = [];
                  subMap.forEach((accs) => groupAccounts.push(...accs));
                  const groupStats = getTrendStats(groupAccounts);
                  const isGroupExpanded = expandedGroups[group] ?? true;
                  const isGroupSelected = selectedGroup === group;

                  return (
                    <div key={group} className="divide-y divide-border/10">
                        {/* Group section. When selected (below lg) the heading becomes the top row of a
                            card and the combined detail nests inside — the same treatment an expanded
                            account row gets */}
                        <div
                          className={`min-w-0 divide-y divide-border/10 ${
                            isGroupSelected
                              ? 'bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground lg:bg-transparent lg:border-0 lg:rounded-none lg:shadow-none lg:text-inherit'
                              : ''
                          }`}
                        >
                        {/* Group Header Row */}
                        <div 
                          onClick={() => {
                            handleGroupSelect(group);
                          }}
                          className={`w-full flex items-center justify-between px-0 ${isGroupSelected ? 'py-2.5 sm:py-3.5' : 'py-3.5'} ${isGroupSelected ? 'bg-primary/10 hover:bg-primary/15' : 'bg-muted/40 hover:bg-muted/60'} transition-colors cursor-pointer select-none`}
                        >
                        <div className="flex items-center min-w-0 flex-1 pl-4 sm:pl-6">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                                // Collapsing closes the open combined detail, like closing an account's card
                                if (isGroupExpanded) setSelectedGroup(null);
                              setExpandedGroups((prev) => ({ ...prev, [group]: !isGroupExpanded }));
                            }}
                            className="-m-2.5 p-2.5 w-11 h-11 mr-1 sm:mr-2 flex-shrink-0 flex items-center justify-center rounded hover:bg-muted/80 transition-colors"
                            aria-label={isGroupExpanded ? `Collapse ${group}` : `Expand ${group}`}
                          >
                            {isGroupExpanded ? (
                              <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground flex-shrink-0" />
                            )}
                          </button>
                          <span className={`text-sm sm:text-base font-bold truncate ${isGroupSelected ? 'text-primary' : 'text-foreground'}`}>{group}</span>
                        </div>

                        {/* Group Sparkline */}
                        <div className="hidden @md:flex flex-shrink-0 w-32 justify-center items-center mx-4">
                          <Sparkline 
                            data={groupStats.historyPoints} 
                            isPositive={groupStats.isPositive} 
                            width={90}
                            height={20}
                          />
                        </div>

                        <div className="flex-shrink-0 w-28 sm:w-36 text-right pr-4 sm:pr-6">
                          <p className="font-mono text-sm sm:text-base font-bold text-foreground blur-number">
                            {formatCurrency(groupStats.current)}
                          </p>
                        </div>
                      </div>

                        {/* Narrow viewports: selected group's combined chart opens inline under the heading,
                            identical to how an account's transaction card opens under its row */}
                        {isGroupSelected && (
                          <div id="hierarchy-group-detail-inline" className="lg:hidden px-2 py-2.5 sm:px-3 sm:py-3">
                            {groupDetailPanel}
                          </div>
                        )}

                      {/* Subgroups & Accounts */}
                      {isGroupExpanded && (
                        <div className="divide-y divide-border/10 bg-card/5">
                          {(() => {
                            if (hideSubheadings) {
                              const flatAccs: Array<{ acc: Account; subgroup: string }> = [];
                              for (const [subgroup, accs] of subMap.entries()) {
                                for (const acc of accs) {
                                  flatAccs.push({ acc, subgroup });
                                }
                              }
                              flatAccs.sort((a, b) => {
                                const balanceA = a.acc.balance || 0;
                                const balanceB = b.acc.balance || 0;
                                return Math.abs(balanceB) - Math.abs(balanceA);
                              });
                              return flatAccs.map(({ acc, subgroup }) => {
                                const accStats = getTrendStats([acc]);
                                const isAccExpanded = expandedAccounts[acc.id] ?? false;
                                const row = (
                                    <div 
                                      id={`account-row-${acc.id}`}
                                      onClick={() => handleAccountSelect(acc.id, isAccExpanded)}
                                      className={`w-full flex items-center justify-between px-0 py-2.5 transition-all cursor-pointer select-none ${
                                        isAccExpanded 
                                          ? 'bg-primary/10 hover:bg-primary/15 font-medium' 
                                          : 'hover:bg-muted/10'
                                      } ${
                                        acc.isHidden || acc.isExcludedFromNetWorth ? 'opacity-50 hover:opacity-100' : ''
                                      }`}
                                    >
                                      <div className="flex items-center min-w-0 flex-1 pl-4 sm:pl-8">
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="text-xs sm:text-sm font-semibold text-foreground truncate">{acc.name}</span>
                                            {acc.syncStatus && acc.syncStatus.status !== 'ok' && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Link 
                                                    href="/settings?tab=accounts&sub=automatic"
                                                    className="flex-shrink-0 cursor-pointer"
                                                    onClick={(e) => e.stopPropagation()}
                                                  >
                                                    {acc.syncStatus.status === 'error' ? (
                                                      <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                                                    ) : (
                                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                    )}
                                                  </Link>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="max-w-[240px]">
                                                  <p className="font-semibold text-xs sm:text-sm">{acc.syncStatus.status === 'error' ? 'Connection Error' : 'Sync Warning'}</p>
                                                  <p className="text-[11px] text-muted-foreground mt-0.5">{acc.syncStatus.reason}</p>
                                                  <Link 
                                                    href="/settings?tab=accounts&sub=automatic"
                                                    className="text-[10px] text-primary hover:underline mt-1 font-semibold block"
                                                    onClick={(e) => e.stopPropagation()}
                                                  >
                                                    Click to investigate in settings
                                                  </Link>
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                            {acc.isHidden && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <span className="text-[9px] sm:text-[10px] font-bold text-destructive bg-destructive/10 px-1 rounded cursor-help">Hidden</span>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="text-xs">
                                                  This account is hidden from lists and summaries
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                            {acc.isExcludedFromNetWorth && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <span className="text-[9px] sm:text-[10px] font-bold text-orange-500 bg-orange-500/10 px-1 rounded cursor-help">Excluded</span>
                                                </TooltipTrigger>
                                                <TooltipContent side="top" className="text-xs">
                                                  Excluded from Net Worth totals
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                            {acc.tags && acc.tags.length > 0 && (
                                              <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                                                {acc.tags.map((tag) => (
                                                  <Tooltip key={tag.id}>
                                                    <TooltipTrigger asChild>
                                                      <span
                                                        className="px-1.5 py-0.2 rounded-full text-[8px] sm:text-[9px] font-medium border cursor-help"
                                                        style={{
                                                          backgroundColor: `${tag.color}15`,
                                                          color: tag.color,
                                                          borderColor: `${tag.color}30`
                                                        }}
                                                      >
                                                        #{tag.name}
                                                      </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top" className="text-xs">
                                                      Account Tag: #{tag.name}
                                                    </TooltipContent>
                                                  </Tooltip>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                          <span className="text-[10px] sm:text-xs text-muted-foreground truncate block">
                                            {acc.institution || 'Unknown Institution'} · {subgroup}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="hidden @md:flex flex-shrink-0 w-32 justify-center items-center mx-4">
                                        {!isAccExpanded && (
                                        <Sparkline 
                                          data={acc.isHidden || acc.isExcludedFromNetWorth ? [] : accStats.historyPoints} 
                                          isPositive={accStats.isPositive} 
                                          width={90}
                                          height={20}
                                        />
                                        )}
                                      </div>

                                      <div className="flex-shrink-0 w-28 sm:w-36 text-right pr-4 sm:pr-6">
                                        <p className="font-mono text-xs sm:text-sm font-bold text-foreground blur-number">
                                          {formatCurrency(acc.balance)}
                                        </p>
                                      </div>
                                    </div>
                                );

                                return (
                                  <Fragment key={acc.id}>
                                    {isAccExpanded ? (
                                      <div className="bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground lg:bg-transparent lg:border-0 lg:rounded-none lg:shadow-none lg:text-inherit">
                                        {row}
                                        <div className="lg:hidden">
                                          <AccountTransactions
                                            accountId={acc.id}
                                            historyData={historyData}
                                            isLiability={isLiabilityAccount(acc.type)}
                                            hierarchyTimeframe={hierarchyTimeframe}
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      row
                                    )}
                                  </Fragment>
                                );
                              });
                            }

                            return Array.from(subMap.entries()).map(([subgroup, accs]) => {
                              const subStats = getTrendStats(accs);

                              if (accs.length > 1) {
                                const subKey = `${group}::${subgroup}`;
                                const isSubExpanded = expandedSubgroups[subKey] ?? true;

                                return (
                                  <Fragment key={subgroup}>
                                    <div
                                      onClick={() => setExpandedSubgroups((prev) => ({ ...prev, [subKey]: !isSubExpanded }))}
                                      className="w-full flex items-center justify-between px-0 py-2.5 bg-muted/10 hover:bg-muted/20 cursor-pointer select-none transition-colors"
                                    >
                                      <div className="flex items-center min-w-0 flex-1 pl-4 sm:pl-8">
                                        <div className="w-4 sm:w-5 mr-1 sm:mr-2 flex-shrink-0 flex items-center justify-center">
                                          {isSubExpanded ? (
                                            <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground/80 flex-shrink-0" />
                                          ) : (
                                            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground/80 flex-shrink-0" />
                                          )}
                                        </div>
                                        <span className="text-xs sm:text-sm font-semibold text-muted-foreground truncate">{subgroup}</span>
                                        <span className="text-[10px] sm:text-xs text-muted-foreground/50 ml-1">({accs.length})</span>
                                      </div>

                                      <div className="hidden @md:flex flex-shrink-0 w-32 justify-center items-center mx-4">
                                        <Sparkline 
                                          data={subStats.historyPoints} 
                                          isPositive={subStats.isPositive} 
                                          width={90}
                                          height={20}
                                        />
                                      </div>

                                      <div className="flex-shrink-0 w-28 sm:w-36 text-right pr-4 sm:pr-6">
                                        <p className="font-mono text-xs sm:text-sm font-bold text-muted-foreground blur-number">
                                          {formatCurrency(subStats.current)}
                                        </p>
                                      </div>
                                    </div>

                                    {isSubExpanded && accs.map((acc) => {
                                      const accStats = getTrendStats([acc]);
                                      const isAccExpanded = expandedAccounts[acc.id] ?? false;

                                      const row = (
                                          <div 
                                            id={`account-row-${acc.id}`}
                                          onClick={() => handleAccountSelect(acc.id, isAccExpanded)}
                                            className={`w-full flex items-center justify-between px-0 py-2 transition-all cursor-pointer select-none ${
                                              isAccExpanded 
                                                ? 'bg-primary/10 hover:bg-primary/15 font-medium' 
                                                : 'hover:bg-muted/10'
                                            } ${
                                              acc.isHidden || acc.isExcludedFromNetWorth ? 'opacity-50 hover:opacity-100' : ''
                                            }`}
                                          >
                                            <div className="flex items-center min-w-0 flex-1 pl-4 sm:pl-12">
                                              <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="text-xs sm:text-sm font-semibold text-foreground truncate">{acc.name}</span>
                                                  {acc.syncStatus && acc.syncStatus.status !== 'ok' && (
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <Link 
                                                          href="/settings?tab=accounts&sub=automatic"
                                                          className="flex-shrink-0 cursor-pointer"
                                                          onClick={(e) => e.stopPropagation()}
                                                        >
                                                          {acc.syncStatus.status === 'error' ? (
                                                            <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                                                          ) : (
                                                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                          )}
                                                        </Link>
                                                      </TooltipTrigger>
                                                      <TooltipContent side="top" className="max-w-[240px]">
                                                        <p className="font-semibold text-xs sm:text-sm">{acc.syncStatus.status === 'error' ? 'Connection Error' : 'Sync Warning'}</p>
                                                        <p className="text-[11px] text-muted-foreground mt-0.5">{acc.syncStatus.reason}</p>
                                                        <Link 
                                                          href="/settings?tab=accounts&sub=automatic"
                                                          className="text-[10px] text-primary hover:underline mt-1 font-semibold block"
                                                          onClick={(e) => e.stopPropagation()}
                                                        >
                                                          Click to investigate in settings
                                                        </Link>
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  )}
                                                  {acc.isHidden && (
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <span className="text-[9px] sm:text-[10px] font-bold text-destructive bg-destructive/10 px-1 rounded cursor-help">Hidden</span>
                                                      </TooltipTrigger>
                                                      <TooltipContent side="top" className="text-xs">
                                                        This account is hidden from lists and summaries
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  )}
                                                  {acc.isExcludedFromNetWorth && (
                                                    <Tooltip>
                                                      <TooltipTrigger asChild>
                                                        <span className="text-[9px] sm:text-[10px] font-bold text-orange-500 bg-orange-500/10 px-1 rounded cursor-help">Excluded</span>
                                                      </TooltipTrigger>
                                                      <TooltipContent side="top" className="text-xs">
                                                        Excluded from Net Worth totals
                                                      </TooltipContent>
                                                    </Tooltip>
                                                  )}
                                                  {acc.tags && acc.tags.length > 0 && (
                                                    <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                                                      {acc.tags.map((tag) => (
                                                        <Tooltip key={tag.id}>
                                                          <TooltipTrigger asChild>
                                                            <span
                                                              className="px-1.5 py-0.2 rounded-full text-[8px] sm:text-[9px] font-medium border cursor-help"
                                                              style={{
                                                                backgroundColor: `${tag.color}15`,
                                                                color: tag.color,
                                                                borderColor: `${tag.color}30`
                                                              }}
                                                            >
                                                              #{tag.name}
                                                            </span>
                                                          </TooltipTrigger>
                                                          <TooltipContent side="top" className="text-xs">
                                                            Account Tag: #{tag.name}
                                                          </TooltipContent>
                                                        </Tooltip>
                                                      ))}
                                                    </div>
                                                  )}
                                                </div>
                                                <span className="text-[10px] sm:text-xs text-muted-foreground truncate block">{acc.institution || 'Unknown Institution'}</span>
                                              </div>
                                            </div>

                                            <div className="hidden @md:flex flex-shrink-0 w-32 justify-center items-center mx-4">
                                              {!isAccExpanded && (
                                              <Sparkline 
                                                data={acc.isHidden || acc.isExcludedFromNetWorth ? [] : accStats.historyPoints} 
                                                isPositive={accStats.isPositive} 
                                                width={90}
                                                height={20}
                                              />
                                              )}
                                            </div>

                                            <div className="flex-shrink-0 w-28 sm:w-36 text-right pr-4 sm:pr-6">
                                              <p className="font-mono text-xs sm:text-sm font-bold text-foreground blur-number">
                                                {formatCurrency(acc.balance)}
                                              </p>
                                            </div>
                                          </div>
                                      );

                                      return (
                                        <Fragment key={acc.id}>
                                          {isAccExpanded ? (
                                            <div className="bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground lg:bg-transparent lg:border-0 lg:rounded-none lg:shadow-none lg:text-inherit">
                                              {row}
                                              <div className="lg:hidden">
                                                <AccountTransactions
                                                  accountId={acc.id}
                                                  historyData={historyData}
                                                  isLiability={isLiabilityAccount(acc.type)}
                                                  hierarchyTimeframe={hierarchyTimeframe}
                                                />
                                              </div>
                                            </div>
                                          ) : (
                                            row
                                          )}
                                        </Fragment>
                                      );
                                    })}
                                  </Fragment>
                                );
                              }

                              const singleAcc = accs[0];
                              if (!singleAcc) return null;
                              const accStats = getTrendStats([singleAcc]);
                              const isAccExpanded = expandedAccounts[singleAcc.id] ?? false;

                              const row = (
                                  <div 
                                    id={`account-row-${singleAcc.id}`}
                                    onClick={() => handleAccountSelect(singleAcc.id, isAccExpanded)}
                                    className={`w-full flex items-center justify-between px-0 py-2.5 transition-all cursor-pointer select-none ${
                                      isAccExpanded 
                                        ? 'bg-primary/10 hover:bg-primary/15 font-medium' 
                                        : 'hover:bg-muted/10'
                                    } ${
                                      singleAcc.isHidden || singleAcc.isExcludedFromNetWorth ? 'opacity-50 hover:opacity-100' : ''
                                    }`}
                                  >
                                    <div className="flex items-center min-w-0 flex-1 pl-4 sm:pl-8">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-xs sm:text-sm font-semibold text-foreground truncate">{singleAcc.name}</span>
                                          {singleAcc.syncStatus && singleAcc.syncStatus.status !== 'ok' && (
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Link 
                                                  href="/settings?tab=accounts&sub=automatic"
                                                  className="flex-shrink-0 cursor-pointer"
                                                  onClick={(e) => e.stopPropagation()}
                                                >
                                                  {singleAcc.syncStatus.status === 'error' ? (
                                                    <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                                                  ) : (
                                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                                  )}
                                                </Link>
                                              </TooltipTrigger>
                                              <TooltipContent side="top" className="max-w-[240px]">
                                                <p className="font-semibold text-xs sm:text-sm">{singleAcc.syncStatus.status === 'error' ? 'Connection Error' : 'Sync Warning'}</p>
                                                <p className="text-[11px] text-muted-foreground mt-0.5">{singleAcc.syncStatus.reason}</p>
                                                <Link 
                                                  href="/settings?tab=accounts&sub=automatic"
                                                  className="text-[10px] text-primary hover:underline mt-1 font-semibold block"
                                                  onClick={(e) => e.stopPropagation()}
                                                >
                                                  Click to investigate in settings
                                                </Link>
                                              </TooltipContent>
                                            </Tooltip>
                                          )}
                                          {singleAcc.isHidden && (
                                            <span className="text-[9px] sm:text-[10px] font-bold text-destructive bg-destructive/10 px-1 rounded">Hidden</span>
                                          )}
                                          {singleAcc.isExcludedFromNetWorth && (
                                            <span className="text-[9px] sm:text-[10px] font-bold text-orange-500 bg-orange-500/10 px-1 rounded">Excluded</span>
                                          )}
                                          {singleAcc.tags && singleAcc.tags.length > 0 && (
                                            <div className="flex items-center gap-1 flex-shrink-0 flex-wrap">
                                              {singleAcc.tags.map((tag) => (
                                                <span
                                                  key={tag.id}
                                                  className="px-1.5 py-0.2 rounded-full text-[8px] sm:text-[9px] font-medium border"
                                                  style={{
                                                    backgroundColor: `${tag.color}15`,
                                                    color: tag.color,
                                                    borderColor: `${tag.color}30`
                                                  }}
                                                >
                                                  #{tag.name}
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                        <span className="text-[10px] sm:text-xs text-muted-foreground truncate block">
                                          {singleAcc.institution || 'Unknown Institution'} · {subgroup}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="hidden @md:flex flex-shrink-0 w-32 justify-center items-center mx-4">
                                      {!isAccExpanded && (
                                      <Sparkline 
                                        data={singleAcc.isHidden || singleAcc.isExcludedFromNetWorth ? [] : accStats.historyPoints} 
                                        isPositive={accStats.isPositive} 
                                        width={90}
                                        height={20}
                                      />
                                      )}
                                    </div>

                                    <div className="flex-shrink-0 w-28 sm:w-36 text-right pr-4 sm:pr-6">
                                      <p className="font-mono text-xs sm:text-sm font-bold text-foreground blur-number">
                                        {formatCurrency(singleAcc.balance)}
                                      </p>
                                    </div>
                                  </div>
                              );

                              return (
                                <Fragment key={singleAcc.id}>
                                  {isAccExpanded ? (
                                    <div className="bg-sidebar border border-sidebar-border rounded-2xl shadow-sm overflow-hidden text-sidebar-foreground lg:bg-transparent lg:border-0 lg:rounded-none lg:shadow-none lg:text-inherit">
                                      {row}
                                      <div className="lg:hidden">
                                        <AccountTransactions
                                          accountId={singleAcc.id}
                                          historyData={historyData}
                                          isLiability={isLiabilityAccount(singleAcc.type)}
                                          hierarchyTimeframe={hierarchyTimeframe}
                                        />
                                      </div>
                                    </div>
                                  ) : (
                                    row
                                  )}
                                </Fragment>
                              );
                            });
                          })()}
                        </div>
                      )}
                        </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
      </Card>

      {/* Desktop side panel: selected group or account detail (2/3 width) */}
      <div className="hidden lg:block lg:col-span-7 sticky top-[84px] max-h-[calc(100vh-100px)] overflow-y-auto">
        {groupDetailPanel ?? (
          <AccountDetailPanel
            account={selectedAccount}
            historyData={historyData}
            hierarchyTimeframe={hierarchyTimeframe}
            onClose={() => setExpandedAccounts({})}
          />
        )}
      </div>
    </div>
  );
}
