'use client';

import { Switch } from '@/components/ui/switch';
import { AppTabs } from '@/components/ui/app-tabs';
import { SectionHeading } from '@/components/ui/section-heading';
import { useChartVisibility, CHARTS } from '@/lib/hooks/use-chart-visibility';

import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import { useImportedData } from '@/lib/hooks/use-imported-data';
import { useChartDefaults, type ChartTimeRange, type ChartTypeOption } from '@/lib/hooks/use-chart-defaults';
import { useMarketDataForSnapshots } from '@/lib/hooks/use-market-data-snapshots';
import { Check, Database, RefreshCw, AlertTriangle, Play, HelpCircle } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

const TIME_RANGE_OPTIONS: { value: ChartTimeRange; label: string }[] = [
  { value: '1m', label: '1M' },
  { value: '3m', label: '3M' },
  { value: '6m', label: '6M' },
  { value: '1y', label: '1Y' },
  { value: '5y', label: '5Y' },
  { value: 'ytd', label: 'YTD' },
  { value: 'all', label: 'All' },
];

const CHART_TYPE_OPTIONS: { value: ChartTypeOption; label: string }[] = [
  { value: 'line', label: 'Line' },
  { value: 'bar', label: 'Bar' },
];

const MODULES = [
  {
    key: 'netWorth' as const,
    label: 'Net Worth & Standard Accounts',
    description: 'Estimated daily balance snapshots fill gaps between confirmed snapshots for depository (checking/savings) and credit card accounts. Synthetic snapshots are generated from your transaction history. Disabling hides estimated data points, showing only confirmed snapshots.',
  },
  {
    key: 'investments' as const,
    label: 'Investments',
    description: 'Estimated daily balance snapshots fill gaps between confirmed snapshots for investment and brokerage accounts. Synthetic snapshots are generated from your transaction history. Disabling hides estimated data points, showing only confirmed snapshots.',
  },
  {
    key: 'realEstate' as const,
    label: 'Real Estate',
    description: 'Historical property values are estimated using the FHFA Housing Price Index, and mortgage paydown is simulated via amortization schedules. Snapshots are automatically regenerated when you add or edit a property, vehicle, or mortgage. When enabled, estimated values appear with dashed lines in real estate charts. Disabling hides estimated data, showing only imported snapshots.',
  },
];

const IMPORTED_MODULES = [
  {
    key: 'netWorth' as const,
    label: 'Net Worth & Standard Accounts',
    description: 'Imported account snapshots and transactions for depository and credit card accounts included in net worth calculations. Disabling this hides imported balance data from net worth charts.',
  },
  {
    key: 'investments' as const,
    label: 'Investments',
    description: 'Imported account snapshots and transactions for investment and brokerage accounts. Disabling this hides imported balance data from investment charts.',
  },
  {
    key: 'realEstate' as const,
    label: 'Real Estate',
    description: 'Imported account snapshots for real estate accounts. Disabling this hides imported property snapshots from real estate charts.',
  },
];

export default function AnalyticsTab() {
  const { visibility, loading: visLoading, updateVisibility } = useChartVisibility();
  const { settings, loading: synthLoading, isEnabled, updateSettings } = useSyntheticData();
  const { settings: importSettings, loading: importLoading, isEnabled: isImportEnabled, updateSettings: updateImportSettings } = useImportedData();
  const { defaults, loading: defaultsLoading, updateDefaults } = useChartDefaults();
  const { enabled: useMarketDataEnabled, loading: marketDataLoading, updateEnabled: updateUseMarketData } = useMarketDataForSnapshots();
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'data'>('general');

  const [recalcStatus, setRecalcStatus] = useState<any>(null);
  const [recalcLoading, setRecalcLoading] = useState(false);

  const fetchRecalcStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics/recalculate-snapshots', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRecalcStatus(data.status);
        return data.status;
      }
    } catch (err) {
      console.error('Failed to fetch recalculation status', err);
    }
    return null;
  }, []);

  useEffect(() => {
    fetchRecalcStatus();
  }, [fetchRecalcStatus]);

  useEffect(() => {
    if (recalcStatus?.status === 'running') {
      const timer = setInterval(async () => {
        const status = await fetchRecalcStatus();
        if (status && status.status !== 'running') {
          clearInterval(timer);
        }
      }, 2000);
      return () => clearInterval(timer);
    }
  }, [recalcStatus?.status, fetchRecalcStatus]);

  const handleTriggerRecalc = async (type = 'netWorth') => {
    setRecalcLoading(true);
    try {
      const res = await fetch(`/api/analytics/recalculate-snapshots?type=${type}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setRecalcStatus(data.status || { status: 'running' });
        fetchRecalcStatus();
      }
    } catch (err) {
      console.error('Failed to trigger recalculation', err);
    } finally {
      setRecalcLoading(false);
    }
  };

  const loading = visLoading || synthLoading || importLoading || defaultsLoading || marketDataLoading;

  if (loading) {
    return <div className="text-muted-foreground py-4">Loading...</div>;
  }

  return (
    <div>
      {/* Sub-Tabs */}
      <AppTabs
        tabs={[
          { id: 'general', label: 'General' },
          { id: 'data', label: 'Data' },
        ]}
        activeTab={activeSubTab}
        onChange={(tab) => setActiveSubTab(tab as any)}
        fullWidth
        size="sm"
        className="mb-6"
      />


      {/* Tab: General */}
      {activeSubTab === 'general' && (
        <div className="space-y-8">
          {/* ── Chart Defaults ──────────────────────────────────────────────── */}
          <div>
            <SectionHeading className="mb-1">Chart Defaults</SectionHeading>
            <p className="text-xs text-muted-foreground mb-4">
              Choose default view options for all charts. These can be changed per-chart when viewing.
            </p>

            <div className="space-y-6">
              {/* Default Time Range */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Default Time Range</h3>
                <div className="flex flex-wrap gap-1.5">
                  {TIME_RANGE_OPTIONS.map((opt) => {
                    const isActive = defaults.defaultTimeRange === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateDefaults({ defaultTimeRange: opt.value })}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                          isActive
                            ? 'border-foreground bg-muted/50 text-foreground'
                            : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Default Chart Type */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Default Chart Type</h3>
                <div className="flex gap-2">
                  {CHART_TYPE_OPTIONS.map((opt) => {
                    const isActive = defaults.defaultChartType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => updateDefaults({ defaultChartType: opt.value })}
                        className={`flex-1 flex items-center justify-center gap-1.5 p-2.5 text-sm font-medium rounded-lg border transition-all ${
                          isActive
                            ? 'border-foreground bg-muted/50 text-foreground'
                            : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                        }`}
                      >
                        <span className="w-4 h-0.5 rounded-full bg-current" style={opt.value === 'bar' ? { height: '0.375rem', width: '0.125rem' } : undefined} />
                        {opt.label}
                        {isActive && <Check className="w-3.5 h-3.5 text-primary" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* ── Forecasting & Projections Defaults ──────────────────────── */}
          <div>
            <SectionHeading className="mb-1">Forecasting &amp; Projections</SectionHeading>
            <p className="text-xs text-muted-foreground mb-4">
              Configure baseline projection algorithms and lookback horizons for cash flow and account balance forecasts.
            </p>

            <div className="space-y-6">
              {/* Forecast Mode */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Forecast Calculation Mode</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { value: 'hybrid' as const, label: 'Hybrid', desc: 'Blends recurring bills, active budgets & history' },
                    { value: 'budget' as const, label: 'Budget-Driven', desc: 'Projects forward strictly from operating budget targets' },
                    { value: 'historical' as const, label: 'Historical Trend', desc: 'Extrapolates recent monthly cash flow run-rates' },
                  ].map((mode) => {
                    const isActive = defaults.forecastMode === mode.value;
                    return (
                      <button
                        key={mode.value}
                        type="button"
                        onClick={() => updateDefaults({ forecastMode: mode.value })}
                        className={`flex flex-col items-start p-3 text-left rounded-lg border transition-all ${
                          isActive
                            ? 'border-foreground bg-muted/50 shadow-sm'
                            : 'border-border hover:border-foreground/30 hover:bg-muted/20'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className="text-xs font-semibold text-foreground">{mode.label}</span>
                          {isActive && <Check className="w-3.5 h-3.5 text-primary" />}
                        </div>
                        <span className="text-[11px] text-muted-foreground leading-snug">{mode.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Forecast Lookback Horizon */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground">Historical Lookback Window</h3>
                  <span className="text-xs font-semibold text-primary">{defaults.forecastLookbackMonths} {defaults.forecastLookbackMonths === 1 ? 'Month' : 'Months'}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Number of prior months evaluated to compute average historical spending and income run-rates.
                </p>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max="24"
                    step="1"
                    value={defaults.forecastLookbackMonths}
                    onChange={(e) => updateDefaults({ forecastLookbackMonths: Number(e.target.value) })}
                    className="flex-1 accent-primary cursor-pointer"
                  />
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={defaults.forecastLookbackMonths}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(24, Number(e.target.value) || 1));
                      updateDefaults({ forecastLookbackMonths: val });
                    }}
                    className="w-16 px-2 py-1 bg-background border border-input rounded text-foreground text-xs text-center font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ── Chart Visibility ─────────────────────────────────────────── */}
          <div>
            <SectionHeading className="mb-1">Chart Visibility</SectionHeading>
            <p className="text-xs text-muted-foreground mb-6">
              Toggle charts on or off per page. Hidden charts will not be displayed.
            </p>

            <div className="space-y-8">
              {(Object.entries(CHARTS) as [string, { label: string; charts: Record<string, string> }][]).map(
                ([pageKey, page]) => (
                  <div key={pageKey}>
                    <h3 className="text-sm font-semibold text-foreground mb-3">{page.label}</h3>
                    <div className="space-y-2">
                      {Object.entries(page.charts).map(([chartId, chartLabel]) => {
                        const visible = visibility[chartId] !== false;
                        return (
                          <div
                            key={chartId}
                            className="flex items-center justify-between p-3 bg-muted/30 border border-border rounded-lg"
                          >
                            <span className="text-sm text-foreground">{chartLabel}</span>
                            <Switch
                              checked={visible}
                              onCheckedChange={(checked) => updateVisibility(chartId, checked)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Data Sources */}
      {activeSubTab === 'data' && (
        <div className="space-y-8">
          {/* ── Automatic Data Refresh ────────────────────────────────────── */}
          <div className="p-4 bg-info border border-info-border rounded-lg">
            <h2 className="text-sm font-semibold text-foreground mb-2">
              Automatic Data Refresh
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Most data is refreshed automatically &mdash; no manual action is needed for day-to-day operation:
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
              <li>
                <strong className="text-foreground/80">Syncing your accounts</strong> &mdash; each sync
                creates current-day balance snapshots, backfills synthetic historical snapshots from
                your transaction history, and rebuilds cash flow &amp; category spending summaries.
              </li>
              <li>
                <strong className="text-foreground/80">Adding or editing accounts</strong> &mdash;
                model-based estimates (real estate, vehicles, mortgages) are regenerated automatically.
              </li>
              <li>
                <strong className="text-foreground/80">Creating or editing transactions</strong> &mdash;
                cash flow summaries and category breakdowns are recalculated immediately.
              </li>
              <li>
                <strong className="text-foreground/80">Importing data via CSV</strong> &mdash; synthetic
                snapshots are regenerated, the net worth table is rebuilt, and all summaries are updated.
              </li>
            </ul>
          </div>

          {/* ── Synthetic & Estimated Data ─────────────────────────────────── */}
          <div>
            <SectionHeading className="mb-1">Synthetic &amp; Estimated Data</SectionHeading>
            <p className="text-xs text-muted-foreground mb-4">
              Synthetic or estimated data fills in gaps where no live snapshot from your financial institution
              is available. When enabled, estimated values appear with dashed lines and &ldquo;estimated&rdquo;
              labels in charts. Disabling a module hides those data points entirely, showing only confirmed
              data from your accounts. All synthetic data is automatically regenerated on each account sync
              and on server restart &mdash; no manual recalculation is needed.
            </p>

            <div className="space-y-2">
              {MODULES.map((mod) => {
                const moduleEnabled = isEnabled(mod.key);
                return (
                  <div
                    key={mod.key}
                    className="p-3 bg-muted/30 border border-border rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-foreground">{mod.label}</span>
                      <Switch
                        checked={moduleEnabled}
                        onCheckedChange={(checked) => updateSettings({ [mod.key]: checked })}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{mod.description}</p>
                    {!moduleEnabled && (
                      <p className="text-[10px] text-chart-3 italic mt-1">
                        Estimated data hidden for {mod.label.toLowerCase()}.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Market-data estimation toggle */}
            <div className="mt-4 p-3 bg-muted/30 border border-border rounded-lg">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-foreground">Estimate investment accounts using market data</span>
                <Switch
                  checked={useMarketDataEnabled}
                  onCheckedChange={updateUseMarketData}
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When enabled, historical daily balances of investment accounts are estimated using available holdings positions and Yahoo Finance market price history. If disabled or when holdings are missing, the system falls back to transaction cash-flow balances.
              </p>
            </div>
          </div>

          {/* ── Imported Data ─────────────────────────────────────────────── */}
          <div>
            <SectionHeading className="mb-1">Imported Data</SectionHeading>
            <p className="text-xs text-muted-foreground mb-4">
              Data imported via CSV files can be toggled on or off per module. Disabling a module hides
              all imported data points from that area while keeping the data in the database.
            </p>

            <div className="space-y-2">
              {IMPORTED_MODULES.map((mod) => {
                const moduleEnabled = isImportEnabled(mod.key);
                return (
                  <div
                    key={mod.key}
                    className="p-3 bg-muted/30 border border-border rounded-lg"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">{mod.label}</span>
                      </div>
                      <Switch
                        checked={moduleEnabled}
                        onCheckedChange={(checked) => updateImportSettings({ [mod.key]: checked })}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{mod.description}</p>
                    {!moduleEnabled && (
                      <p className="text-[10px] text-chart-3 italic mt-1">
                        Imported data hidden for {mod.label.toLowerCase()}.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Manual Snapshot Recalculation ───────────────────────────────── */}
          <div className="border-t border-border/60 pt-6">
            <SectionHeading className="mb-1">Manual Data Recalculation</SectionHeading>
            <p className="text-xs text-muted-foreground mb-4">
              If your charts or summaries appear out of sync, you can trigger a full historical recalculation.
              This process runs in the background and yields execution threads to keep the application responsive.
            </p>

            <div className="p-4 bg-muted/30 border border-border rounded-lg space-y-4">
              {recalcStatus && (
                <div className="text-xs space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">Status:</span>
                    {recalcStatus.status === 'running' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium animate-pulse">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Running ({recalcStatus.processedUsers}/{recalcStatus.totalUsers} users)
                      </span>
                    )}
                    {recalcStatus.status === 'completed' && (
                      <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 font-medium">
                        Completed
                      </span>
                    )}
                    {recalcStatus.status === 'failed' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
                        <AlertTriangle className="w-3 h-3" />
                        Failed
                      </span>
                    )}
                    {recalcStatus.status === 'idle' && (
                      <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                        Idle
                      </span>
                    )}
                  </div>

                  {recalcStatus.status === 'running' && (
                    <div className="space-y-1.5">
                      <div className="w-full bg-muted border border-border/40 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{
                            width: `${
                              recalcStatus.totalUsers > 0
                                ? (recalcStatus.processedUsers / recalcStatus.totalUsers) * 100
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Yielding thread cycles. Recalculation will finish momentarily.
                      </p>
                    </div>
                  )}

                  {recalcStatus.startedAt && (
                    <p className="text-muted-foreground">
                      Started: <span className="text-foreground">{new Date(recalcStatus.startedAt).toLocaleString()}</span>
                    </p>
                  )}
                  {recalcStatus.completedAt && (
                    <p className="text-muted-foreground">
                      Finished: <span className="text-foreground">{new Date(recalcStatus.completedAt).toLocaleString()}</span>
                    </p>
                  )}

                  {recalcStatus.errors && recalcStatus.errors.length > 0 && (
                    <details className="mt-2 text-destructive border border-destructive/20 rounded bg-destructive/5 p-2 max-h-40 overflow-y-auto">
                      <summary className="cursor-pointer font-semibold select-none">
                        View errors ({recalcStatus.errors.length})
                      </summary>
                      <ul className="list-disc pl-4 mt-1 space-y-1 font-mono text-[10px] leading-normal select-text">
                        {recalcStatus.errors.map((err: string, i: number) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2.5 pt-2 border-t border-border/50">
                <button
                  type="button"
                  disabled={recalcLoading || recalcStatus?.status === 'running'}
                  onClick={() => handleTriggerRecalc('netWorth')}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  {recalcStatus?.status === 'running' ? 'Recalculating...' : 'Recalculate Net Worth'}
                </button>
                <button
                  type="button"
                  disabled={recalcLoading || recalcStatus?.status === 'running'}
                  onClick={() => handleTriggerRecalc('summaries')}
                  className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
                >
                  Recalculate Summaries
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}