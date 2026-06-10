'use client';

import { useState, useMemo } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { Search, ChevronDown, ChevronUp, ChevronsUpDown, Info, Landmark } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
}

interface HoldingsTableProps {
  holdings: Holding[];
  accounts: Account[];
}

type SortField = 'security' | 'account' | 'value' | 'gainLoss' | 'weight';
type SortDirection = 'asc' | 'desc';

export function HoldingsTable({ holdings, accounts }: HoldingsTableProps) {
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  const [sortField, setSortField] = useState<SortField>('value');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

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
          // Handle null cost basis (sort them to the bottom)
          valA = a.unrealizedGainLoss !== null ? a.unrealizedGainLoss : -Infinity;
          valB = b.unrealizedGainLoss !== null ? b.unrealizedGainLoss : -Infinity;
          break;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredHoldings, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc'); // Default to desc for values
    }
  };

  const SortHeader = ({ field, label, align = 'left' }: { field: SortField; label: string; align?: 'left' | 'right' }) => {
    const isCurrent = sortField === field;
    return (
      <button
        onClick={() => handleSort(field)}
        className={`flex items-center gap-1.5 font-semibold hover:text-foreground transition-colors focus:outline-none py-2 select-none w-full ${
          align === 'right' ? 'justify-end text-right' : 'justify-start text-left'
        }`}
      >
        <span>{label}</span>
        {isCurrent ? (
          sortDirection === 'asc' ? (
            <ChevronUp className="w-3.5 h-3.5 text-primary shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-primary shrink-0" />
          )
        ) : (
          <ChevronsUpDown className="w-3 h-3 text-muted-foreground/40 shrink-0" />
        )}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search className="w-4 h-4 text-muted-foreground/60 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by ticker or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-muted/40 border border-border rounded-lg placeholder-muted-foreground/60 focus:outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Account Filter */}
        {accountsWithHoldings.length > 0 && (
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <span className="text-xs text-muted-foreground shrink-0">Account:</span>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="bg-muted/40 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary max-w-[200px]"
            >
              <option value="all">All Accounts</option>
              {accountsWithHoldings.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.institution ? `${acc.institution} - ${acc.name}` : acc.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Table Container */}
      <div className="overflow-x-auto border border-border/40 rounded-xl">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-muted/15 border-b border-border/40 text-muted-foreground/80">
              <th className="p-3 font-semibold w-[24%]">
                <SortHeader field="security" label="Asset / Security" />
              </th>
              <th className="p-3 font-semibold w-[22%]">
                <SortHeader field="account" label="Brokerage Account" />
              </th>
              <th className="p-3 font-semibold text-right w-[11%]">Price / Qty</th>
              <th className="p-3 font-semibold text-right w-[13%]">
                <SortHeader field="value" label="Current Value" align="right" />
              </th>
              <th className="p-3 font-semibold text-right w-[18%]">
                <SortHeader field="gainLoss" label="Unrealized Return" align="right" />
              </th>
              <th className="p-3 font-semibold text-right w-[12%]">
                <SortHeader field="weight" label="Portfolio %" align="right" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {sortedHoldings.length > 0 ? (
              sortedHoldings.map((h, idx) => {
                const hasReturn = h.unrealizedGainLoss !== null && h.costBasis !== null && h.costBasis > 0;
                const isReturnPositive = h.unrealizedGainLoss ? h.unrealizedGainLoss >= 0 : false;

                return (
                  <tr key={`${h.accountId}-${h.securityId}-${idx}`} className="hover:bg-muted/10 transition-colors">
                    {/* Ticker / Name */}
                    <td className="p-3">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          {h.ticker && (
                            <span className="px-1.5 py-0.5 font-mono text-[10px] font-bold rounded bg-primary/10 text-primary border border-primary/20 leading-none">
                              {h.ticker}
                            </span>
                          )}
                          <span className="font-semibold text-foreground truncate max-w-[140px]" title={h.name}>
                            {h.name}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Account */}
                    <td className="p-3 text-muted-foreground">
                      <div className="flex items-center gap-1.5 truncate max-w-[150px]">
                        <Landmark className="w-3.5 h-3.5 opacity-60 shrink-0" />
                        <span className="truncate" title={`${h.institutionName} - ${h.accountName}`}>
                          {h.institutionName ? `${h.institutionName} - ${h.accountName}` : h.accountName}
                        </span>
                      </div>
                    </td>

                    {/* Price / Qty */}
                    <td className="p-3 text-right text-muted-foreground font-mono">
                      <div className="flex flex-col">
                        <span className="text-foreground blur-number">{formatCurrency(h.price)}</span>
                        <span className="text-[10px] tabular-nums">× {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                      </div>
                    </td>

                    {/* Value */}
                    <td className="p-3 text-right font-mono font-bold text-foreground blur-number">
                      {formatCurrency(h.value)}
                    </td>

                    {/* Return */}
                    <td className="p-3 text-right font-mono">
                      {hasReturn ? (
                        <div className="flex flex-col items-end">
                          <span className={`font-semibold blur-number ${isReturnPositive ? 'text-chart-1' : 'text-destructive'}`}>
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
                <td colSpan={6} className="p-8 text-center text-muted-foreground/60 italic">
                  {holdings.length === 0 
                    ? 'No holdings synced for these investment accounts.' 
                    : 'No holdings match the active search or filter criteria.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
