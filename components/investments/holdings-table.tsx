'use client';

import { useState, useMemo } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import {
  Search,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Info,
  Landmark,
  Eye,
  EyeOff,
  RefreshCw,
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
}

type SortField = 'security' | 'account' | 'value' | 'gainLoss' | 'weight' | 'dayChange';
type SortDirection = 'asc' | 'desc';

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

// Ticker heuristics for Sector
function getSector(ticker: string | null): string {
  if (!ticker) return '—';
  const t = ticker.toUpperCase();
  
  const tech = ['AAPL', 'MSFT', 'GOOG', 'GOOGL', 'NVDA', 'AMD', 'CRM', 'INTC', 'CSCO', 'ADBE', 'ORCL', 'QCOM', 'ASML', 'AVGO'];
  const consumerCyc = ['AMZN', 'TSLA', 'HD', 'NKE', 'MCD', 'SBUX', 'LOW', 'TJX', 'F', 'GM'];
  const financial = ['JPM', 'BAC', 'WFC', 'MS', 'GS', 'C', 'AXP', 'V', 'MA', 'BLK', 'BRK.B', 'BRK.A', 'SCHW'];
  const health = ['JNJ', 'UNH', 'PFE', 'ABBV', 'MRK', 'LLY', 'TMO', 'ABT', 'DHR', 'BMY', 'GILD', 'AMGN'];
  const energy = ['XOM', 'CVX', 'COP', 'SLB', 'EOG', 'MPC', 'PSX'];
  const consumerDef = ['PG', 'KO', 'PEP', 'WMT', 'COST', 'PM', 'MO', 'TGT', 'EL', 'CL'];
  const ind = ['CAT', 'HON', 'GE', 'UNP', 'UPS', 'FDX', 'LMT', 'RTX', 'BA', 'DE'];
  const utilities = ['NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC'];
  const realEstate = ['PLD', 'AMT', 'CCI', 'EQIX', 'O', 'WY'];
  const telecom = ['T', 'VZ', 'TMUS', 'CMCSA'];
  
  if (tech.includes(t)) return 'Technology';
  if (consumerCyc.includes(t)) return 'Consumer Cyclical';
  if (financial.includes(t)) return 'Financial Services';
  if (health.includes(t)) return 'Healthcare';
  if (energy.includes(t)) return 'Energy';
  if (consumerDef.includes(t)) return 'Consumer Defensive';
  if (ind.includes(t)) return 'Industrials';
  if (utilities.includes(t)) return 'Utilities';
  if (realEstate.includes(t)) return 'Real Estate';
  if (telecom.includes(t)) return 'Communication';
  
  const indexTickers = ['SPY', 'VOO', 'VTI', 'QQQ', 'IWM', 'VXUS', 'VEA', 'VWO', 'AGG', 'BND', 'SCHD', 'SCHF', 'IVV'];
  if (indexTickers.includes(t)) return 'Broad Index';
  
  return '—';
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

export function HoldingsTable({ holdings, accounts, quotes = [] }: HoldingsTableProps) {
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showSector, setShowSector] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const toggleRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

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

  // Filter accounts that actually have holdings to keep the filter clean
  const accountsWithHoldings = useMemo(() => {
    const activeIds = new Set(holdings.map((h) => h.accountId));
    return accounts.filter((acc) => activeIds.has(acc.id));
  }, [accounts, holdings]);

  // Apply search and account filters
  const filteredHoldings = useMemo(() => {
    return holdings.filter((h) => {
      const matchesSearch =
        (h.ticker?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
        h.name.toLowerCase().includes(search.toLowerCase());
      
      const matchesAccount =
        selectedAccountId === 'all' || h.accountId === selectedAccountId;

      return matchesSearch && matchesAccount;
    });
  }, [holdings, search, selectedAccountId]);

  // Apply sorting
  const sortedHoldings = useMemo(() => {
    const sorted = [...filteredHoldings];
    sorted.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

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
          valA = a.value;
          valB = b.value;
          break;
        case 'weight':
          valA = a.portfolioWeight;
          valB = b.portfolioWeight;
          break;
        case 'gainLoss':
          valA = a.unrealizedGainLoss !== null ? a.unrealizedGainLoss : -Infinity;
          valB = b.unrealizedGainLoss !== null ? b.unrealizedGainLoss : -Infinity;
          break;
        case 'dayChange': {
          const qA = a.ticker ? quotesMap.get(a.ticker.toUpperCase()) : null;
          const qB = b.ticker ? quotesMap.get(b.ticker.toUpperCase()) : null;
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
  }, [filteredHoldings, sortField, sortDirection, quotesMap]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc'); // Default to desc
    }
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

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:max-w-xs">
          <Search className="w-4 h-4 text-muted-foreground/60 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by ticker or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-muted/40 border border-border rounded-lg placeholder-muted-foreground/60 focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Account Tabs and Sector Toggle */}
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-between md:justify-end">
          {/* Segmented Account Filter */}
          {accountsWithHoldings.length > 0 && (
            <div className="flex border-b border-border/60 gap-5 max-w-full overflow-x-auto scrollbar-none pb-0.5 -mb-px">
              <button
                onClick={() => setSelectedAccountId('all')}
                className={`pb-1.5 px-1 text-[10px] sm:text-xs font-semibold whitespace-nowrap transition-all border-b-2 cursor-pointer ${
                  selectedAccountId === 'all'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                All Accounts
              </button>
              {accountsWithHoldings.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => setSelectedAccountId(acc.id)}
                  className={`pb-1.5 px-1 text-[10px] sm:text-xs font-semibold whitespace-nowrap transition-all border-b-2 cursor-pointer ${
                    selectedAccountId === acc.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {acc.institution ? `${acc.institution} - ${acc.name}` : acc.name}
                </button>
              ))}
            </div>
          )}

          {/* Toggle Sector Column Button */}
          <button
            onClick={() => setShowSector(!showSector)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-muted/40 hover:bg-muted/75 border border-border rounded-lg transition-colors text-muted-foreground hover:text-foreground font-medium"
          >
            {showSector ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{showSector ? 'Hide Sector' : 'Show Sector'}</span>
          </button>
        </div>
      </div>

      {/* Table Container */}
      {/* Table Container (Desktop Only) */}
      <div className="hidden md:block overflow-x-auto border border-border/40 rounded-xl bg-card">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-muted/15 border-b border-border/40 text-muted-foreground/80">
              <th className="p-3 font-semibold min-w-[150px]">
                <SortHeader field="security" label="Asset / Security" />
              </th>
              {showSector && (
                <th className="p-3 font-semibold text-left w-[12%]">
                  <span className="text-muted-foreground font-semibold">Sector</span>
                </th>
              )}
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
                const hasReturn = h.unrealizedGainLoss !== null && h.costBasis !== null && h.costBasis > 0;
                const isReturnPositive = h.unrealizedGainLoss ? h.unrealizedGainLoss >= 0 : false;
                const assetType = getAssetType(h.ticker, h.name);
                const sector = getSector(h.ticker);

                // Fetch live quote day change and 52-week stats
                const quote = h.ticker ? quotesMap.get(h.ticker.toUpperCase()) : null;
                const price = quote?.price ?? h.price;
                const value = quote?.price ? quote.price * h.quantity : h.value;
                const dayChangePct = quote?.changePercent;
                const dayChangeVal = quote?.change;
                const high52 = quote?.high52;
                const low52 = quote?.low52;

                const isDayChangePositive = dayChangePct != null ? dayChangePct >= 0 : null;

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
                  <tr key={`${h.accountId}-${h.securityId}-${idx}`} className="hover:bg-muted/10 transition-colors">
                    {/* Ticker / Name */}
                    <td className="p-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {h.ticker && (
                            <span className="px-1.5 py-0.5 font-mono text-[9px] font-bold rounded bg-primary/10 text-primary border border-primary/20 leading-none">
                              {h.ticker}
                            </span>
                          )}
                          <span className="font-semibold text-foreground truncate max-w-[130px] sm:max-w-[160px]" title={h.name}>
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

                    {/* Sector */}
                    {showSector && (
                      <td className="p-3 text-muted-foreground font-medium text-[11px]">
                        {sector}
                      </td>
                    )}

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
                            <RefreshCw className="w-2.5 h-2.5 opacity-70 shrink-0 animate-none" />
                            <span>Synced {relativeSync}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Price / Qty */}
                    <td className="p-3 text-right text-muted-foreground font-mono">
                      <div className="flex flex-col">
                        <span className="text-foreground blur-number font-semibold">{formatCurrency(price)}</span>
                        <span className="text-[10px] tabular-nums">× {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
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
                              className="absolute w-2 h-2 -top-0.5 rounded-full bg-primary border border-background shadow-sm"
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
                      {hasReturn ? (
                        <div className="flex flex-col items-end">
                          <span className={`font-semibold text-[11px] blur-number ${isReturnPositive ? 'text-chart-1' : 'text-destructive'}`}>
                            {isReturnPositive ? '+' : ''}
                            {formatCurrency(h.unrealizedGainLoss!)}
                          </span>
                          <span className={`text-[10px] font-semibold ${isReturnPositive ? 'text-chart-1' : 'text-destructive'}`}>
                            {isReturnPositive ? '↑' : '↓'}
                            {h.unrealizedReturnPct!.toFixed(2)}%
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-1 text-muted-foreground/40">
                          <span>—</span>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button className="focus:outline-none">
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
                      {h.portfolioWeight.toFixed(1)}%
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={showSector ? 9 : 8} className="p-8 text-center text-muted-foreground/60 italic">
                  {holdings.length === 0 
                    ? 'No holdings synced for these investment accounts.' 
                    : 'No holdings match the active search or filter criteria.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Accordion / List Card View (Mobile Only) */}
      <div className="block md:hidden space-y-2.5">
        {sortedHoldings.length > 0 ? (
          sortedHoldings.map((h, idx) => {
            const rowId = `${h.accountId}-${h.securityId}-${idx}`;
            const isExpanded = expandedRow === rowId;
            const hasReturn = h.unrealizedGainLoss !== null && h.costBasis !== null && h.costBasis > 0;
            const isReturnPositive = h.unrealizedGainLoss ? h.unrealizedGainLoss >= 0 : false;
            const assetType = getAssetType(h.ticker, h.name);
            const sector = getSector(h.ticker);

            const quote = h.ticker ? quotesMap.get(h.ticker.toUpperCase()) : null;
            const price = quote?.price ?? h.price;
            const value = quote?.price ? quote.price * h.quantity : h.value;
            const dayChangePct = quote?.changePercent;
            const dayChangeVal = quote?.change;
            const high52 = quote?.high52;
            const low52 = quote?.low52;
            const isDayChangePositive = dayChangePct != null ? dayChangePct >= 0 : null;

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
                onClick={() => toggleRow(rowId)}
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
                      {sector !== '—' && (
                        <span className="text-[10px] opacity-80">{sector}</span>
                      )}
                    </div>
                  </div>
                  {/* Value & Return Right-aligned */}
                  <div className="text-right shrink-0">
                    <div className="font-bold text-foreground blur-number text-sm">{formatCurrency(value)}</div>
                    {hasReturn ? (
                      <span className={`text-[10px] font-semibold flex items-center justify-end gap-0.5 ${isReturnPositive ? 'text-chart-1' : 'text-destructive'}`}>
                        {isReturnPositive ? '▲' : '▼'}
                        {h.unrealizedReturnPct!.toFixed(1)}%
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
                        {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} @ {formatCurrency(price)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[9px] uppercase tracking-wider text-muted-foreground/60 mb-0.5">Portfolio Weight</span>
                      <span className="font-mono text-foreground font-semibold">
                        {h.portfolioWeight.toFixed(1)}% of total
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
                              className="absolute w-2 h-2 -top-0.5 rounded-full bg-primary border border-background shadow-sm"
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
