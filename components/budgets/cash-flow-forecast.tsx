'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ForecastChart } from '@/components/cash-flow/forecast-chart';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import { TrendingUp, TrendingDown, BarChart3, Table2 } from 'lucide-react';
import { EstimatePill } from '@/components/ui/estimate-pill';
import { useCardCollapsed } from '@/lib/hooks/use-card-collapsed';
import { CollapsibleCardHeader } from '@/components/ui/collapsible-card-header';
import { CollapsibleFilterPanel } from '@/components/ui/collapsible-filter-panel';

type ForecastMode = 'historical' | 'budget' | 'hybrid';

interface AccountForecast {
  accountId: string;
  accountName: string;
  startingBalance: number;
  projectedBalance: number;
  inflows: number;
  outflows: number;
}

interface ForecastMonth {
  month: string;
  label: string;
  accounts: AccountForecast[];
}

interface ForecastAccount {
  id: string;
  name: string;
  balance: number;
  type: string;
}

interface ChartSeries {
  id: string;
  data: Array<{ x: string; y: number }>;
}

interface ForecastConfig {
  forecastMode: string;
  lookbackMonths: number;
  accountType: string;
}

interface ForecastData {
  forecast: ForecastMonth[];
  accounts: ForecastAccount[];
  historical: ChartSeries[];
  config: ForecastConfig;
}

const MODE_LABELS: Record<ForecastMode, string> = {
  historical: 'Historical Averages',
  budget: 'Budget Only',
  hybrid: 'Hybrid (Budget + History)',
};

const MODE_DESCRIPTIONS: Record<ForecastMode, string> = {
  historical: 'Project based on actual average inflows/outflows over the lookback period',
  budget: 'Project based solely on budgeted amounts linked to each account',
  hybrid: 'Use budget amount if a category has one, otherwise use historical average',
};

export function CashFlowForecast() {
  const [isCollapsed, setIsCollapsed] = useCardCollapsed('cashFlowForecast');
  const [showFilters, setShowFilters] = useState(false);
  const { isEnabled } = useSyntheticData();
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');

  const showCashFlowProjections = isEnabled('cashFlowProjections');

  useEffect(() => {
    if (!showCashFlowProjections) {
      setViewMode('chart');
    }
  }, [showCashFlowProjections]);

  // Config state
  const [forecastMode, setForecastMode] = useState<ForecastMode>('hybrid');
  const [lookbackMonths, setLookbackMonths] = useState(3);
  const [forecastMonths, setForecastMonths] = useState(6);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [allAccounts, setAllAccounts] = useState<ForecastAccount[]>([]);
  const [accountFilter, setAccountFilter] = useState<'all' | 'selected'>('all');
  const accountsLoaded = useRef(false);
  const selectedIdsRef = useRef<Set<string>>(new Set<string>());
  const allAccountsRef = useRef<ForecastAccount[]>([]);

  const fetchForecast = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        months: String(forecastMonths),
        forecastMode,
        lookbackMonths: String(lookbackMonths),
      });
      if (accountFilter === 'selected' && selectedIdsRef.current.size > 0) {
        params.set('accountIds', Array.from(selectedIdsRef.current).join(','));
      }
      if (accountFilter === 'all') {
        params.set('accountType', 'banking');
      }

      const res = await fetch(`/api/budgets/forecast?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch forecast');
      const json = await res.json();
      setData(json);
      if (!accountsLoaded.current && json.accounts) {
        accountsLoaded.current = true;
        const ids: Set<string> = new Set(json.accounts.map((a: ForecastAccount) => a.id));
        selectedIdsRef.current = ids;
        allAccountsRef.current = json.accounts;
        setAllAccounts(json.accounts);
        setSelectedAccountIds(ids);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch forecast');
    } finally {
      setLoading(false);
    }
  }, [forecastMode, lookbackMonths, forecastMonths, accountFilter]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      selectedIdsRef.current = next;
      return next;
    });
  };

  const loadingSpinner = (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Cash Flow Forecast
          </h3>
        }
      />
      {!isCollapsed && <LoadingSpinner category="forecast" className="h-[200px]" />}
    </div>
  );

  if (loading && !data) {
    return loadingSpinner;
  }

  if (error && !data) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title="Cash Flow Forecast"
        />
        {!isCollapsed && (
          <div className="p-3 sm:p-5">
            <ChartEmptyState variant="error" error={error} />
          </div>
        )}
      </div>
    );
  }

  if (!data || data.accounts.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm">
        <CollapsibleCardHeader
          isCollapsed={isCollapsed}
          onToggle={setIsCollapsed}
          title="Cash Flow Forecast"
        />
        {!isCollapsed && (
          <div className="p-3 sm:p-5">
            <ChartEmptyState variant="nodata" description="No banking accounts available. Add accounts or link budgets to see projections." />
          </div>
        )}
      </div>
    );
  }

  const chartData = data.historical || [];
  
  // Return null if projections are disabled and there's no historical data
  if (!showCashFlowProjections && (!data || data.historical.length === 0)) {
    return null;
  }

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm relative">
      <CollapsibleCardHeader
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        title={
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" /> Cash Flow Forecast
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
                  Mode: {MODE_LABELS[forecastMode]}
                </span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                  Lookback: {lookbackMonths}M
                </span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                  Forecast: {forecastMonths}M
                </span>
                <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider">
                  View: {viewMode.toUpperCase()}
                </span>
                {showCashFlowProjections && <EstimatePill />}
              </div>
            }
          >
            <div className="space-y-4">
              {/* Row 1: Mode Selector & Date Params */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-muted/20 border border-border/20 rounded-xl">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Forecast Mode</span>
                  <div className="flex bg-muted border border-border/30 rounded-lg p-0.5">
                    {(Object.keys(MODE_LABELS) as ForecastMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setForecastMode(mode)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                          forecastMode === mode
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                        title={MODE_DESCRIPTIONS[mode]}
                        type="button"
                      >
                        {MODE_LABELS[mode]}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lookback</span>
                    <select
                      value={lookbackMonths}
                      onChange={(e) => setLookbackMonths(Number(e.target.value))}
                      className="px-2 py-1 rounded bg-background border border-input text-xs text-foreground font-medium cursor-pointer"
                    >
                      <option value={1}>1 Month</option>
                      <option value={3}>3 Months</option>
                      <option value={6}>6 Months</option>
                      <option value={12}>12 Months</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Forecast</span>
                    <select
                      value={forecastMonths}
                      onChange={(e) => setForecastMonths(Number(e.target.value))}
                      className="px-2 py-1 rounded bg-background border border-input text-xs text-foreground font-medium cursor-pointer"
                    >
                      <option value={3}>3 Months</option>
                      <option value={6}>6 Months</option>
                      <option value={12}>12 Months</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Row 2: View toggle & Account filters */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-muted/30 border border-border/30 rounded-xl">
                <div className="flex items-center gap-3">
                  {showCashFlowProjections && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Display View</span>
                      <div className="flex bg-muted border border-border/30 rounded-lg p-0.5">
                        <button
                          onClick={() => setViewMode('table')}
                          className={`px-2 py-1 rounded text-xs font-medium transition-all flex items-center gap-1 ${
                            viewMode === 'table'
                              ? 'bg-card text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          type="button"
                        >
                          <Table2 className="w-3 h-3" />
                          Table
                        </button>
                        <button
                          onClick={() => setViewMode('chart')}
                          className={`px-2 py-1 rounded text-xs font-medium transition-all flex items-center gap-1 ${
                            viewMode === 'chart'
                              ? 'bg-card text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          type="button"
                        >
                          <BarChart3 className="w-3 h-3" />
                          Chart
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-1">Accounts</span>
                  <select
                    value={accountFilter}
                    onChange={(e) => setAccountFilter(e.target.value as 'all' | 'selected')}
                    className="px-2 py-1 rounded bg-background border border-input text-xs text-foreground font-medium cursor-pointer"
                  >
                    <option value="all">All Banking Accounts</option>
                    <option value="selected">Selected Accounts</option>
                  </select>
                </div>
              </div>

              {/* Account selection chips (when 'selected' mode) */}
              {accountFilter === 'selected' && allAccounts.length > 0 && (
                <div className="p-3 bg-muted/20 border border-border/20 rounded-xl flex flex-wrap gap-1.5">
                  {allAccounts.map((acc) => (
                    <button
                      key={acc.id}
                      onClick={() => toggleAccount(acc.id)}
                      className={`px-2.5 py-1 rounded text-[10px] font-semibold border transition-all ${
                        selectedAccountIds.has(acc.id)
                          ? 'bg-primary/15 border-primary/50 text-primary shadow-sm'
                          : 'bg-background hover:bg-muted border-border/50 text-muted-foreground hover:text-foreground'
                      }`}
                      type="button"
                    >
                      {acc.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CollapsibleFilterPanel>

          {/* Chart View */}
          {viewMode === 'chart' && chartData.length > 0 && (
            <div className="p-3 sm:p-5 h-[300px]">
              <ForecastChart data={chartData} showProjections={showCashFlowProjections} />
            </div>
          )}

          {/* Table View */}
          {viewMode === 'table' && showCashFlowProjections && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground bg-muted/20">
                    <th className="px-4 py-3 font-semibold">Account</th>
                    <th className="px-4 py-3 font-semibold text-right">Current Balance</th>
                    {data.forecast.map((m) => (
                      <th key={m.month} className="px-4 py-3 font-semibold text-right min-w-[100px]">{m.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allAccounts.filter((acc) => accountFilter === 'all' || selectedAccountIds.has(acc.id)).map((acct) => (
                    <tr key={acct.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{acct.name}</div>
                        <div className="text-[10px] text-muted-foreground capitalize">
                          {acct.type}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-foreground blur-number">{formatCurrency(acct.balance)}</td>
                      {data.forecast.map((m) => {
                        const proj = m.accounts.find((a) => a.accountId === acct.id);
                        if (!proj) return <td key={m.month} className="px-4 py-3 text-right text-muted-foreground">-</td>;
                        return (
                          <td key={m.month} className="px-4 py-3 text-right font-mono text-foreground">
                            {formatCurrency(proj.projectedBalance)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="px-5 py-2.5 border-t border-border">
            <p className="text-[10px] text-muted-foreground">
              Mode: {MODE_LABELS[forecastMode]}, lookback: {lookbackMonths}mo, forecast: {forecastMonths}mo.
              Credit card spending is budgeted at transaction time. Actual cash outflow occurs when the CC bill is paid.
            </p>
          </div>
        </>
      )}
    </div>
  );
}