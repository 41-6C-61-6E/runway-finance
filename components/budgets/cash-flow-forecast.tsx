'use client';

import { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '@/lib/utils/format';
import { ChartEmptyState } from '@/components/charts/chart-empty-state';
import { ForecastChart } from '@/components/cash-flow/forecast-chart';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import { TrendingUp, TrendingDown, BarChart3, Table2 } from 'lucide-react';

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
  const { isEnabled } = useSyntheticData();
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');

  // Config state
  const [forecastMode, setForecastMode] = useState<ForecastMode>('hybrid');
  const [lookbackMonths, setLookbackMonths] = useState(3);
  const [forecastMonths, setForecastMonths] = useState(6);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [allAccounts, setAllAccounts] = useState<ForecastAccount[]>([]);
  const [accountFilter, setAccountFilter] = useState<'all' | 'selected'>('all');

  const fetchForecast = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        months: String(forecastMonths),
        forecastMode,
        lookbackMonths: String(lookbackMonths),
      });
      if (accountFilter === 'selected' && selectedAccountIds.size > 0) {
        params.set('accountIds', Array.from(selectedAccountIds).join(','));
      }
      if (accountFilter === 'all') {
        params.set('accountType', 'banking');
      }

      const res = await fetch(`/api/budgets/forecast?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch forecast');
      const json = await res.json();
      setData(json);
      if (allAccounts.length === 0 && json.accounts) {
        setAllAccounts(json.accounts);
        setSelectedAccountIds(new Set(json.accounts.map((a: ForecastAccount) => a.id)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch forecast');
    } finally {
      setLoading(false);
    }
  }, [forecastMode, lookbackMonths, forecastMonths, accountFilter, selectedAccountIds, allAccounts.length]);

  useEffect(() => {
    fetchForecast();
  }, [fetchForecast]);

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadingSpinner = (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-2">
        <h3 className="text-sm font-semibold text-foreground">Cash Flow Forecast</h3>
      </div>
      <div className="h-[200px] flex items-center justify-center text-muted-foreground">
        <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
      </div>
    </div>
  );

  if (loading && !data) {
    return loadingSpinner;
  }

  if (error && !data) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Cash Flow Forecast</h3>
        <ChartEmptyState variant="error" error={error} />
      </div>
    );
  }

  if (!data || data.accounts.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl shadow-sm p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Cash Flow Forecast</h3>
        <ChartEmptyState variant="nodata" description="No banking accounts available. Add accounts or link budgets to see projections." />
      </div>
    );
  }

  const chartData = data.historical || [];

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm">
      <div className="p-5 pb-3">
        <h3 className="text-sm font-semibold text-foreground">Cash Flow Forecast</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Projected account balances based on {forecastMode === 'historical' ? 'historical averages' : forecastMode === 'budget' ? 'budgeted amounts' : 'budgets and historical data'}
        </p>
      </div>

      {/* Config Bar */}
      <div className="px-5 pb-4 flex flex-wrap items-center gap-3 border-b border-border">
        {/* Mode Selector */}
        <div className="flex flex-wrap gap-1">
          {(Object.keys(MODE_LABELS) as ForecastMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setForecastMode(mode)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                forecastMode === mode
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
              title={MODE_DESCRIPTIONS[mode]}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-border" />

        {/* Lookback Months */}
        <select
          value={lookbackMonths}
          onChange={(e) => setLookbackMonths(Number(e.target.value))}
          className="px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground border-0 cursor-pointer"
        >
          <option value={1}>1mo lookback</option>
          <option value={3}>3mo lookback</option>
          <option value={6}>6mo lookback</option>
          <option value={12}>12mo lookback</option>
        </select>

        {/* Forecast Months */}
        <select
          value={forecastMonths}
          onChange={(e) => setForecastMonths(Number(e.target.value))}
          className="px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground border-0 cursor-pointer"
        >
          <option value={3}>3mo forecast</option>
          <option value={6}>6mo forecast</option>
          <option value={12}>12mo forecast</option>
        </select>

        <div className="w-px h-5 bg-border" />

        {/* View toggle */}
        <div className="flex gap-1">
          <button
            onClick={() => setViewMode('table')}
            className={`px-2 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
              viewMode === 'table'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            <Table2 className="w-3 h-3" />
            Table
          </button>
          <button
            onClick={() => setViewMode('chart')}
            className={`px-2 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
              viewMode === 'chart'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            <BarChart3 className="w-3 h-3" />
            Chart
          </button>
        </div>

        {/* Account filter */}
        <div className="w-px h-5 bg-border" />
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value as 'all' | 'selected')}
          className="px-2 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground border-0 cursor-pointer"
        >
          <option value="all">All Banking Accounts</option>
          <option value="selected">Selected Accounts</option>
        </select>
      </div>

      {/* Account selection chips (when 'selected' mode) */}
      {accountFilter === 'selected' && allAccounts.length > 0 && (
        <div className="px-5 py-2 border-b border-border flex flex-wrap gap-1.5">
          {allAccounts.map((acc) => (
            <button
              key={acc.id}
              onClick={() => toggleAccount(acc.id)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${
                selectedAccountIds.has(acc.id)
                  ? 'bg-primary/20 text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent'
              }`}
            >
              {acc.name}
            </button>
          ))}
        </div>
      )}

      {/* Chart View */}
      {viewMode === 'chart' && chartData.length > 0 && (
        <div className="pt-3 px-2">
          <ForecastChart data={chartData} showProjections={isEnabled('cashFlowProjections')} />
          <div className="px-3 pb-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-foreground inline-block" />
              Actual
            </div>
            {isEnabled('cashFlowProjections') && (
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-foreground inline-block" style={{ background: 'none', borderTop: '1px dashed var(--color-muted-foreground)' }} />
                Projected
              </div>
            )}
          </div>
        </div>
      )}

      {viewMode === 'chart' && chartData.length === 0 && !loading && (
        <div className="h-[200px]">
          <ChartEmptyState variant="nodata" description="Not enough historical data for chart. Sync your accounts to see balance history." />
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <>
          {loading && (
            <div className="h-[200px] flex items-center justify-center text-muted-foreground">
              <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" />
            </div>
          )}
          {!loading && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border">
                    <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground">Account</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">Current</th>
                    {data.forecast.map((m) => (
                      <th key={m.month} className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground">{m.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="border-t border-border">
                  {data.accounts.map((acct) => (
                    <tr key={acct.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-foreground font-medium">{acct.name}</span>
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-muted text-muted-foreground capitalize">{acct.type}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-foreground blur-number">{formatCurrency(acct.balance)}</td>
                      {data.forecast.map((m) => {
                        const proj = m.accounts.find((a) => a.accountId === acct.id);
                        if (!proj) return <td key={m.month} className="px-4 py-3 text-right font-mono text-muted-foreground/50">&mdash;</td>;
                        const isPositive = proj.projectedBalance >= 0;
                        return (
                          <td key={m.month} className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {isPositive ? (
                                <TrendingUp className="w-3 h-3 text-chart-2" />
                              ) : (
                                <TrendingDown className="w-3 h-3 text-destructive" />
                              )}
                              <span className={`font-mono blur-number ${
                                proj.projectedBalance >= proj.startingBalance ? 'text-chart-2' : 'text-destructive'
                              }`}>
                                {formatCurrency(proj.projectedBalance)}
                              </span>
                            </div>
                            <div className="text-[9px] text-muted-foreground/50">
                              {proj.inflows > 0 || proj.outflows > 0
                                ? `${formatCurrency(proj.inflows)} in / ${formatCurrency(proj.outflows)} out`
                                : 'No projections'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <div className="px-5 py-2.5 border-t border-border">
        <p className="text-[10px] text-muted-foreground">
          Mode: {MODE_LABELS[forecastMode]}, lookback: {lookbackMonths}mo, forecast: {forecastMonths}mo.
          Credit card spending is budgeted at transaction time. Actual cash outflow occurs when the CC bill is paid.
        </p>
      </div>
    </div>
  );
}