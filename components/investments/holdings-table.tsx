'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import {
  Search,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Info,
  Landmark,
  RefreshCw,
  Download,
  X,
  Check,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { QuoteData } from '@/app/api/investments/quotes/route';

interface Holding {
  accountId: string;
  accountName: string;
  institutionName: string;
  securityId: string;
  ticker: string | null;
  name: string;
  quantity: number;
  price: number;
  value: number;
  costBasis: number | null;
  unrealizedGainLoss: number | null;
  unrealizedReturnPct: number | null;
  portfolioWeight: number;
  currency: string;
}

interface Account {
  id: string;
  name: string;
  institution: string | null;
  updatedAt?: string;
}

interface HoldingsTableProps {
  holdings: Holding[];
  accounts: Account[];
  quotes?: QuoteData[];
  onSelectHolding?: (holding: Holding) => void;
}

type SortField = 'security' | 'account' | 'value' | 'gainLoss' | 'weight' | 'dayChange';
type SortDirection = 'asc' | 'desc';
type AssetTypeFilter = 'all' | 'Stock' | 'ETF' | 'Mutual Fund' | 'Cash' | 'Other';

// Ticker heuristics for Asset Class/Type
function getAssetType(ticker: string | null, name: string): 'Stock' | 'ETF' | 'Mutual Fund' | 'Cash' | 'Other' {
  if (!ticker) return 'Other';
  const t = ticker.toUpperCase();
  if (t === 'CASH' || t.includes('USD') || name.toLowerCase().includes('cash') || name.toLowerCase().includes('money market')) {
    return 'Cash';
  }
  if (t.length === 5 && t.endsWith('X')) {
    return 'Mutual Fund';
  }
  const knownETFs = ['SPY', 'VOO', 'VTI', 'QQQ', 'IWM', 'BND', 'VXUS', 'VEA', 'VWO', 'AGG', 'SCHD', 'JEPI', 'VUG', 'VYM', 'IEFA', 'IJR'];
  if (knownETFs.includes(t)) {
    return 'ETF';
  }
  if (name.toLowerCase().includes('etf') || name.toLowerCase().includes('trust') || name.toLowerCase().includes('index') || name.toLowerCase().includes('s&p 500')) {
    return 'ETF';
  }
  return 'Stock';
}

function formatRelativeTime(dateStr?: string) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  } catch {
    return '';
  }
}

export function HoldingsTable({ holdings, accounts, quotes = [], onSelectHolding }: HoldingsTableProps) {
  const [search, setSearch] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set()); // empty Set means all
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  const [selectedAssetType, setSelectedAssetType] = useState<AssetTypeFilter>('all');
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const toggleRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(event.target as Node)) {
        setAccountDropdownOpen(false);
      }
    }
    if (accountDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [accountDropdownOpen]);

  // Map quotes for easy lookup
  const quotesMap = useMemo(() => {
    const map = new Map<string, QuoteData>();
    for (const q of quotes) {
      if (q.ticker) {
        map.set(q.ticker.toUpperCase(), q);
      }
    }
    return map;
  }, [quotes]);

  // Total portfolio value recalculated with live quotes
  const totalLivePortfolioValue = useMemo(() => {
    return holdings.reduce((sum, h) => {
      const q = h.ticker ? quotesMap.get(h.ticker.toUpperCase()) : null;
      const val = q?.price ? q.price * h.quantity : h.value;
      return sum + val;
    }, 0);
  }, [holdings, quotesMap]);

  // Filter accounts that actually have holdings to keep the filter clean
  const accountsWithHoldings = useMemo(() => {
    const activeIds = new Set(holdings.map((h) => h.accountId));
    return accounts.filter((acc) => activeIds.has(acc.id));
  }, [accounts, holdings]);

  // Stats per account for the dropdown summary
  const accountHoldingStats = useMemo(() => {
    const map: Record<string, { count: number; value: number }> = {};
    for (const h of holdings) {
      const q = h.ticker ? quotesMap.get(h.ticker.toUpperCase()) : null;
      const val = q?.price ? q.price * h.quantity : h.value;
      if (!map[h.accountId]) {
        map[h.accountId] = { count: 0, value: 0 };
      }
      map[h.accountId].count += 1;
      map[h.accountId].value += val;
    }
    return map;
  }, [holdings, quotesMap]);

  // Filtered accounts list inside the dropdown search
  const filteredAccountsList = useMemo(() => {
    if (!accountSearch.trim()) return accountsWithHoldings;
    const q = accountSearch.toLowerCase();
    return accountsWithHoldings.filter(
      (a) => a.name.toLowerCase().includes(q) || (a.institution && a.institution.toLowerCase().includes(q))
    );
  }, [accountsWithHoldings, accountSearch]);

  // Toggle single account selection
  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) => {
      const allIds = accountsWithHoldings.map((a) => a.id);
      if (prev.size === 0) {
        const next = new Set(allIds);
        next.delete(id);
        return next;
      }
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (next.size === 0) {
          return new Set(['__none__']);
        }
      } else {
        next.delete('__none__');
        next.add(id);
        if (next.size === allIds.length) {
          return new Set(); // Reset to "all"
        }
      }
      return next;
    });
  };

  // Label for account dropdown trigger button
  const selectedAccountLabel = useMemo(() => {
    if (selectedAccountIds.size === 0 || selectedAccountIds.size === accountsWithHoldings.length) {
      return `All Accounts (${accountsWithHoldings.length})`;
    }
    if (selectedAccountIds.size === 1 && !selectedAccountIds.has('__none__')) {
      const singleId = Array.from(selectedAccountIds)[0];
      const acc = accountsWithHoldings.find((a) => a.id === singleId);
      if (acc) {
        return acc.institution ? `${acc.institution} - ${acc.name}` : acc.name;
      }
    }
    if (selectedAccountIds.has('__none__')) {
      return 'No Accounts Selected';
    }
    return `${selectedAccountIds.size} of ${accountsWithHoldings.length} Accounts`;
  }, [selectedAccountIds, accountsWithHoldings]);

  // Apply search, account, and asset type filters
  const filteredHoldings = useMemo(() => {
    return holdings.filter((h) => {
      const matchesSearch =
        (h.ticker?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
        h.name.toLowerCase().includes(search.toLowerCase());
      
      const isAccountMatch =
        selectedAccountIds.size === 0 || selectedAccountIds.has(h.accountId);

      const assetType = getAssetType(h.ticker, h.name);
      const matchesAssetType =
        selectedAssetType === 'all' || assetType === selectedAssetType;

      return matchesSearch && isAccountMatch && matchesAssetType;
    });
  }, [holdings, search, selectedAccountIds, selectedAssetType]);

  // Apply dynamic live sorting
  const sortedHoldings = useMemo(() => {
    const sorted = [...filteredHoldings];
    sorted.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      const qA = a.ticker ? quotesMap.get(a.ticker.toUpperCase()) : null;
      const qB = b.ticker ? quotesMap.get(b.ticker.toUpperCase()) : null;
      const liveValA = qA?.price ? qA.price * a.quantity : a.value;
      const liveValB = qB?.price ? qB.price * b.quantity : b.value;

      switch (sortField) {
        case 'security':
          valA = a.ticker || a.name;
          valB = b.ticker || b.name;
          return sortDirection === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        case 'account':
          valA = `${a.institutionName} ${a.accountName}`;
          valB = `${b.institutionName} ${b.accountName}`;
          return sortDirection === 'asc'
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        case 'value':
          valA = liveValA;
          valB = liveValB;
          break;
        case 'weight':
          valA = totalLivePortfolioValue > 0 ? (liveValA / totalLivePortfolioValue) * 100 : a.portfolioWeight;
          valB = totalLivePortfolioValue > 0 ? (liveValB / totalLivePortfolioValue) * 100 : b.portfolioWeight;
          break;
        case 'gainLoss': {
          const costA = a.costBasis;
          const costB = b.costBasis;
          valA = costA != null && costA > 0 ? liveValA - costA : (a.unrealizedGainLoss ?? -Infinity);
          valB = costB != null && costB > 0 ? liveValB - costB : (b.unrealizedGainLoss ?? -Infinity);
          break;
        }
        case 'dayChange': {
          valA = qA?.changePercent !== undefined && qA?.changePercent !== null ? qA.changePercent : -9999;
          valB = qB?.changePercent !== undefined && qB?.changePercent !== null ? qB.changePercent : -9999;
          break;
        }
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredHoldings, sortField, sortDirection, quotesMap, totalLivePortfolioValue]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc'); // Default to desc
    }
  };

  const exportToCsv = () => {
    const headers = [
      'Ticker',
      'Security Name',
      'Asset Type',
      'Brokerage Account',
      'Quantity',
      'Price',
      'Day Change %',
      'Total Value',
      'Cost Basis',
      'Unrealized Gain/Loss',
      'Return %',
      'Portfolio Weight %',
    ];
    const rows = sortedHoldings.map((h) => {
      const q = h.ticker ? quotesMap.get(h.ticker.toUpperCase()) : null;
      const price = q?.price ?? h.price;
      const val = q?.price ? q.price * h.quantity : h.value;
      const cost = h.costBasis;
      const gain = cost != null && cost > 0 ? val - cost : '';
      const retPct = cost != null && cost > 0 ? ((val - cost) / cost) * 100 : '';
      const weight = totalLivePortfolioValue > 0 ? ((val / totalLivePortfolioValue) * 100).toFixed(2) : h.portfolioWeight.toFixed(2);

      return [
        h.ticker || '',
        `"${h.name.replace(/"/g, '""')}"`,
        getAssetType(h.ticker, h.name),
        `"${h.institutionName} - ${h.accountName}"`,
        h.quantity,
        price,
        q?.changePercent != null ? q.changePercent.toFixed(2) : '',
        val.toFixed(2),
        cost != null ? cost.toFixed(2) : '',
        typeof gain === 'number' ? gain.toFixed(2) : '',
        retPct !== '' ? Number(retPct).toFixed(2) : '',
        weight,
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Holdings-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const SortHeader = ({ field, label, align = 'left' }: { field: SortField; label: string; align?: 'left' | 'right' }) => {
    const isCurrent = sortField === field;
    return (
      <button
        onClick={() => handleSort(field)}
        className={`flex items-center gap-1 font-semibold hover:text-foreground transition-colors focus:outline-none py-1 select-none w-full ${
          align === 'right' ? 'justify-end text-right' : 'justify-start text-left'
        }`}
      >
        <span>{label}</span>
        {isCurrent ? (
          sortDirection === 'asc' ? (
            <ChevronUp className="w-3 h-3 text-primary shrink-0" />
          ) : (
            <ChevronDown className="w-3 h-3 text-primary shrink-0" />
          )
        ) : (
          <ChevronsUpDown className="w-3 h-3 text-muted-foreground/30 shrink-0" />
        )}
      </button>
    );
  };

  const assetTypeOptions: { value: AssetTypeFilter; label: string }[] = [
    { value: 'all', label: 'All Assets' },
    { value: 'Stock', label: 'Stocks' },
    { value: 'ETF', label: 'ETFs' },
    { value: 'Mutual Fund', label: 'Mutual Funds' },
    { value: 'Cash', label: 'Cash' },
  ];

  return (
    <div className="@container space-y-4">
      {/* Filters & Actions Bar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col @lg:flex-row gap-2.5 items-stretch @lg:items-center justify-between">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1 min-w-0">
            {/* Search Input */}
            <div className="relative w-full sm:w-64 shrink-0">
              <Search className="w-4 h-4 text-muted-foreground/60 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by ticker or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 text-xs bg-muted/40 border border-border rounded-lg placeholder-muted-foreground/60 focus:outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Action Controls (Right): Account Selector + Export CSV */}
          <div className="flex items-center gap-2 shrink-0 justify-end flex-wrap sm:flex-nowrap">
            {/* Account Checkbox Dropdown Selector */}
            {accountsWithHoldings.length > 0 && (
              <div className="relative shrink-0" ref={accountDropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setAccountDropdownOpen(!accountDropdownOpen);
                    setAccountSearch('');
                  }}
                  className={`flex items-center justify-between sm:justify-start gap-2 px-3 py-1.5 text-xs border rounded-lg transition-all font-medium cursor-pointer select-none w-full sm:w-auto ${
                    selectedAccountIds.size > 0 && selectedAccountIds.size < accountsWithHoldings.length
                      ? 'bg-primary/10 border-primary/40 text-primary hover:bg-primary/15'
                      : 'bg-muted/40 hover:bg-muted/70 border-border text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Landmark className="w-3.5 h-3.5 opacity-70 shrink-0" />
                    <span className="truncate max-w-[150px] sm:max-w-[180px] text-left">
                      {selectedAccountLabel}
                    </span>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 opacity-60 transition-transform duration-200 shrink-0 ${accountDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {accountDropdownOpen && (
                  <div className="absolute right-0 top-full mt-1.5 w-full sm:w-80 bg-card border border-border rounded-xl shadow-xl z-50 p-2.5 space-y-2 animate-in fade-in zoom-in-95 duration-150">
                    {/* Search inside dropdown */}
                    <div className="relative flex items-center bg-muted/40 border border-border rounded-lg px-2.5 py-1">
                      <Search className="w-3.5 h-3.5 text-muted-foreground/70 mr-1.5 shrink-0 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search accounts..."
                        value={accountSearch}
                        onChange={(e) => setAccountSearch(e.target.value)}
                        className="bg-transparent border-none text-xs text-foreground placeholder-muted-foreground/60 focus:outline-none w-full"
                        autoFocus
                      />
                      {accountSearch && (
                        <button
                          type="button"
                          onClick={() => setAccountSearch('')}
                          className="text-muted-foreground hover:text-foreground text-xs p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {/* Quick Select Actions */}
                    <div className="flex items-center justify-between text-[11px] px-1 text-muted-foreground border-b border-border/30 pb-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedAccountIds(new Set())}
                        className="font-semibold text-primary hover:underline cursor-pointer"
                      >
                        Select All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedAccountIds(new Set(['__none__']))}
                        className="font-medium hover:text-destructive cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>

                    {/* Account Items List with Checkboxes */}
                    <div className="max-h-60 overflow-y-auto space-y-0.5 pr-0.5 scrollbar-thin">
                      {filteredAccountsList.length === 0 ? (
                        <div className="p-3 text-xs text-muted-foreground text-center italic">
                          No accounts match "{accountSearch}"
                        </div>
                      ) : (
                        filteredAccountsList.map((acc) => {
                          const isChecked = selectedAccountIds.size === 0 || selectedAccountIds.has(acc.id);
                          const count = accountHoldingStats[acc.id]?.count ?? 0;
                          const value = accountHoldingStats[acc.id]?.value ?? 0;

                          return (
                            <div
                              key={acc.id}
                              onClick={() => toggleAccount(acc.id)}
                              className="group flex items-center justify-between gap-2 p-2 hover:bg-muted/50 rounded-lg cursor-pointer transition-colors text-xs select-none"
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}} // Click handled by parent div
                                  className="w-3.5 h-3.5 rounded border-border text-primary accent-primary cursor-pointer shrink-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <div className="font-semibold text-foreground truncate" title={acc.name}>
                                    {acc.name}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground truncate">
                                    {acc.institution || 'Brokerage'} · {count} {count === 1 ? 'asset' : 'assets'} ({formatCurrency(value)})
                                  </div>
                                </div>
                              </div>

                              {/* Quick 'Only' button */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedAccountIds(new Set([acc.id]));
                                }}
                                className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 text-[9px] font-semibold bg-muted hover:bg-primary hover:text-primary-foreground text-muted-foreground rounded transition-all shrink-0 cursor-pointer"
                                title="Show only this account"
                              >
                                Only
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Export CSV Button */}
            <button
              onClick={exportToCsv}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-muted/40 hover:bg-muted/75 border border-border rounded-lg transition-colors text-muted-foreground hover:text-foreground font-medium shrink-0"
              title="Export holdings to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Asset Class Filter Chips Bar */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1 border-t border-border/40">
          {assetTypeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSelectedAssetType(opt.value)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all shrink-0 ${
                selectedAssetType === opt.value
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/60'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table Container (Container >= 640px / @md) */}
      <div className="hidden @md:block overflow-x-auto border border-border/40 rounded-xl bg-card">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-muted/15 border-b border-border/40 text-muted-foreground/80">
              <th className="p-3 font-semibold min-w-[150px]">
                <SortHeader field="security" label="Asset / Security" />
              </th>
              <th className="p-3 font-semibold min-w-[140px]">
                <SortHeader field="account" label="Brokerage Account" />
              </th>
              <th className="p-3 font-semibold text-right w-[10%]">Price / Qty</th>
              <th className="p-3 font-semibold text-right w-[10%]">
                <SortHeader field="dayChange" label="Today" align="right" />
              </th>
              <th className="p-3 font-semibold text-center w-[12%] min-w-[90px]">
                <span className="text-muted-foreground font-semibold">52w Range</span>
              </th>
              <th className="p-3 font-semibold text-right w-[12%]">
                <SortHeader field="value" label="Value" align="right" />
              </th>
              <th className="p-3 font-semibold text-right w-[15%]">
                <SortHeader field="gainLoss" label="Return" align="right" />
              </th>
              <th className="p-3 font-semibold text-right w-[8%]">
                <SortHeader field="weight" label="Weight" align="right" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {sortedHoldings.length > 0 ? (
              sortedHoldings.map((h, idx) => {
                const assetType = getAssetType(h.ticker, h.name);

                // Fetch live quote stats and calculate live value and live returns
                const quote = h.ticker ? quotesMap.get(h.ticker.toUpperCase()) : null;
                const price = quote?.price ?? h.price;
                const value = quote?.price && h.quantity ? quote.price * h.quantity : h.value;
                const cost = h.costBasis;
                const hasReturn = cost !== null && cost > 0;
                const gainLoss = hasReturn ? value - cost : h.unrealizedGainLoss;
                const returnPct = hasReturn && cost > 0 ? (gainLoss! / cost) * 100 : h.unrealizedReturnPct;
                const isReturnPositive = gainLoss != null ? gainLoss >= 0 : false;

                const dayChangePct = quote?.changePercent;
                const dayChangeVal = quote?.change;
                const high52 = quote?.high52;
                const low52 = quote?.low52;
                const isDayChangePositive = dayChangePct != null ? dayChangePct >= 0 : null;

                const weight = totalLivePortfolioValue > 0
                  ? (value / totalLivePortfolioValue) * 100
                  : h.portfolioWeight;

                // Find corresponding account for sync time
                const acc = accounts.find((a) => a.id === h.accountId);
                const relativeSync = acc?.updatedAt ? formatRelativeTime(acc.updatedAt) : '';

                // Calculate where current price sits in 52-week range
                let rangePct = 50;
                if (high52 && low52 && high52 > low52 && price) {
                  rangePct = ((price - low52) / (high52 - low52)) * 100;
                  rangePct = Math.max(0, Math.min(100, rangePct));
                }

                return (
                  <tr
                    key={`${h.accountId}-${h.securityId}-${idx}`}
                    onClick={() => onSelectHolding?.(h)}
                    className="hover:bg-muted/15 transition-colors cursor-pointer group"
                  >
                    {/* Ticker / Name */}
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {h.ticker && (
                            <span className="px-1.5 py-0.5 font-mono text-[9px] font-bold rounded bg-primary/10 text-primary border border-primary/20 leading-none">
                              {h.ticker}
                            </span>
                          )}
                          <span className="font-semibold text-foreground group-hover:text-primary transition-colors truncate max-w-[130px] sm:max-w-[160px]" title={h.name}>
                            {h.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] px-1 py-0.5 bg-muted/60 text-muted-foreground rounded border border-border/40 font-medium">
                            {assetType}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Account */}
                    <td className="p-3 text-muted-foreground">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 truncate max-w-[140px]">
                          <Landmark className="w-3.5 h-3.5 opacity-60 shrink-0 text-muted-foreground" />
                          <span className="truncate text-[11px]" title={`${h.institutionName} - ${h.accountName}`}>
                            {h.institutionName ? `${h.institutionName} - ${h.accountName}` : h.accountName}
                          </span>
                        </div>
                        {relativeSync && (
                          <div className="flex items-center gap-1 text-[9px] text-muted-foreground/60">
                            <RefreshCw className="w-2.5 h-2.5 opacity-70 shrink-0" />
                            <span>Synced {relativeSync}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Price / Qty */}
                    <td className="p-3 text-right text-muted-foreground font-mono">
                      <div className="flex flex-col">
                        <span className="text-foreground blur-number font-semibold">{formatCurrency(price)}</span>
                        <span className="text-[10px] tabular-nums">× {(h.quantity ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                      </div>
                    </td>

                    {/* Today Day Change */}
                    <td className="p-3 text-right font-mono">
                      {dayChangePct != null ? (
                        <div className="flex flex-col items-end">
                          <span className={`font-semibold text-[11px] ${isDayChangePositive ? 'text-chart-1' : 'text-destructive'}`}>
                            {isDayChangePositive ? '+' : ''}
                            {dayChangePct.toFixed(2)}%
                          </span>
                          <span className={`text-[9px] text-muted-foreground/65`}>
                            {isDayChangePositive ? '+' : ''}
                            {formatCurrency(dayChangeVal ?? 0)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>

                    {/* 52-week range bar */}
                    <td className="p-3 text-center vertical-middle">
                      {low52 && high52 ? (
                        <div className="flex flex-col items-center justify-center gap-1 min-w-[80px]">
                          <div className="relative w-full h-1 bg-muted rounded-full">
                            <div
                              className="absolute w-2 h-2 -top-0.5 rounded-full bg-primary border border-background shadow-xs"
                              style={{ left: `calc(${rangePct}% - 4px)` }}
                            />
                          </div>
                          <div className="flex justify-between w-full text-[9px] text-muted-foreground/60 font-mono">
                            <span className="blur-number">${low52.toFixed(0)}</span>
                            <span className="blur-number">${high52.toFixed(0)}</span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>

                    {/* Value */}
                    <td className="p-3 text-right font-mono font-bold text-foreground blur-number">
                      {formatCurrency(value)}
                    </td>

                    {/* Return */}
                    <td className="p-3 text-right font-mono">
                      {hasReturn && gainLoss != null && returnPct != null ? (
                        <div className="flex flex-col items-end">
                          <span className={`font-semibold text-[11px] blur-number ${isReturnPositive ? 'text-chart-1' : 'text-destructive'}`}>
                            {isReturnPositive ? '+' : ''}
                            {formatCurrency(gainLoss)}
                          </span>
                          <span className={`text-[10px] font-semibold ${isReturnPositive ? 'text-chart-1' : 'text-destructive'}`}>
                            {isReturnPositive ? '↑' : '↓'}
                            {returnPct.toFixed(2)}%
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1 text-muted-foreground/40">
                          <span>—</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button className="focus:outline-none" onClick={(e) => e.stopPropagation()}>
                                  <Info className="w-3.5 h-3.5 text-muted-foreground/60 hover:text-foreground cursor-pointer" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-[200px] text-xs font-sans">
                                Cost basis is not reported by your brokerage for this asset.
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      )}
                    </td>

                    {/* Weight */}
                    <td className="p-3 text-right text-muted-foreground font-mono tabular-nums">
                      {(weight ?? 0).toFixed(1)}%
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted-foreground/60 italic">
                  {holdings.length === 0 
                    ? 'No holdings synced for these investment accounts.' 
                    : 'No holdings match the active search or filter criteria.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Accordion / List Card View (Container < 640px / @md:hidden) */}
      <div className="block @md:hidden space-y-2.5">
        {sortedHoldings.length > 0 ? (
          sortedHoldings.map((h, idx) => {
            const rowId = `${h.accountId}-${h.securityId}-${idx}`;
            const isExpanded = expandedRow === rowId;
            const assetType = getAssetType(h.ticker, h.name);

            const quote = h.ticker ? quotesMap.get(h.ticker.toUpperCase()) : null;
            const price = quote?.price ?? h.price;
            const value = quote?.price && h.quantity ? quote.price * h.quantity : h.value;
            const cost = h.costBasis;
            const hasReturn = cost !== null && cost > 0;
            const gainLoss = hasReturn ? value - cost : h.unrealizedGainLoss;
            const returnPct = hasReturn && cost > 0 ? (gainLoss! / cost) * 100 : h.unrealizedReturnPct;
            const isReturnPositive = gainLoss != null ? gainLoss >= 0 : false;

            const dayChangePct = quote?.changePercent;
            const dayChangeVal = quote?.change;
            const high52 = quote?.high52;
            const low52 = quote?.low52;
            const isDayChangePositive = dayChangePct != null ? dayChangePct >= 0 : null;

            const weight = totalLivePortfolioValue > 0
              ? (value / totalLivePortfolioValue) * 100
              : (h.portfolioWeight ?? 0);

            const acc = accounts.find((a) => a.id === h.accountId);
            const relativeSync = acc?.updatedAt ? formatRelativeTime(acc.updatedAt) : '';

            let rangePct = 50;
            if (high52 && low52 && high52 > low52 && price) {
              rangePct = ((price - low52) / (high52 - low52)) * 100;
              rangePct = Math.max(0, Math.min(100, rangePct));
            }

            return (
              <div
                key={rowId}
                className="bg-card border border-border rounded-xl p-3.5 flex flex-col gap-2 hover:border-primary/20 transition-all duration-200 cursor-pointer active:bg-muted/10"
                onClick={() => {
                  if (onSelectHolding) {
                    onSelectHolding(h);
                  } else {
                    toggleRow(rowId);
                  }
                }}
              >
                {/* Header Row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {h.ticker && (
                        <span className="px-1.5 py-0.5 font-mono text-[9px] font-bold rounded bg-primary/10 text-primary border border-primary/20 leading-none">
                          {h.ticker}
                        </span>
                      )}
                      <span className="font-semibold text-foreground truncate max-w-[170px]" title={h.name}>
                        {h.name}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5">
                      <span className="px-1 py-0.5 bg-muted text-muted-foreground rounded border border-border/40 font-medium">
                        {assetType}
                      </span>
                    </div>
                  </div>
                  {/* Value & Return Right-aligned */}
                  <div className="text-right shrink-0">
                    <div className="font-bold text-foreground blur-number text-sm">{formatCurrency(value)}</div>
                    {hasReturn && returnPct != null ? (
                      <span className={`text-[10px] font-semibold flex items-center justify-end gap-0.5 ${isReturnPositive ? 'text-chart-1' : 'text-destructive'}`}>
                        {isReturnPositive ? '▲' : '▼'}
                        {returnPct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/50">No return data</span>
                    )}
                  </div>
                </div>

                {/* Expanded Accordion details */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border/40 grid grid-cols-2 gap-y-2.5 gap-x-4 text-[11px] text-muted-foreground animate-in fade-in slide-in-from-top-1 duration-200">
                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Quantity / Price</span>
                      <span className="font-mono text-foreground font-semibold blur-number">
                        {(h.quantity ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })} @ {formatCurrency(price)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Portfolio Weight</span>
                      <span className="font-mono text-foreground font-semibold">
                        {(weight ?? 0).toFixed(1)}% of total
                      </span>
                    </div>

                    <div>
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Today's Performance</span>
                      {dayChangePct != null ? (
                        <span className={`font-semibold font-mono ${isDayChangePositive ? 'text-chart-1' : 'text-destructive'}`}>
                          {isDayChangePositive ? '+' : ''}{dayChangePct.toFixed(2)}% ({formatCurrency(dayChangeVal ?? 0)})
                        </span>
                      ) : (
                        <span>—</span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Account / Institution</span>
                      <span className="text-foreground font-medium truncate max-w-[130px] inline-block font-sans" title={`${h.institutionName} - ${h.accountName}`}>
                        {h.institutionName ? `${h.institutionName}` : h.accountName}
                      </span>
                    </div>

                    {low52 && high52 ? (
                      <div className="col-span-2 pt-1">
                        <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-1">52-Week Price Range</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono blur-number">${low52.toFixed(0)}</span>
                          <div className="flex-1 h-1 bg-muted rounded-full relative">
                            <div
                              className="absolute w-2 h-2 -top-0.5 rounded-full bg-primary border border-background shadow-xs"
                              style={{ left: `calc(${rangePct}% - 4px)` }}
                            />
                          </div>
                          <span className="font-mono blur-number">${high52.toFixed(0)}</span>
                        </div>
                      </div>
                    ) : null}

                    {relativeSync && (
                      <div className="col-span-2 pt-1 border-t border-border/20 text-[9px] flex items-center gap-1">
                        <RefreshCw className="w-2.5 h-2.5 opacity-60" />
                        <span>Account Synced {relativeSync}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-muted-foreground/60 italic border border-border/40 rounded-xl bg-card">
            {holdings.length === 0 
              ? 'No holdings synced for these investment accounts.' 
              : 'No holdings match the active search or filter criteria.'}
          </div>
        )}
      </div>
    </div>
  );
}
