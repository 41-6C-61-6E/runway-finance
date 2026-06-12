'use client';

import { Switch } from '@/components/ui/switch';
import { useChartVisibility, CHARTS } from '@/lib/hooks/use-chart-visibility';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import { useImportedData } from '@/lib/hooks/use-imported-data';
import { useChartDefaults, type ChartTimeRange, type ChartTypeOption } from '@/lib/hooks/use-chart-defaults';
import { useShowMath } from '@/lib/hooks/use-show-math';
import { useMarketDataForSnapshots } from '@/lib/hooks/use-market-data-snapshots';
import { Check, Calculator, Database } from 'lucide-react';
import { useState } from 'react';

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
  const { enabled: showMathEnabled, loading: mathLoading, updateEnabled: updateShowMath } = useShowMath();
  const { enabled: useMarketDataEnabled, loading: marketDataLoading, updateEnabled: updateUseMarketData } = useMarketDataForSnapshots();
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'data' | 'charts'>('general');

  const loading = visLoading || synthLoading || importLoading || defaultsLoading || mathLoading || marketDataLoading;

  if (loading) {
    return <div className="text-muted-foreground py-4">Loading...</div>;
  }

  return (
    <div>
      {/* Sub-Tabs */}
      <div className="flex flex-wrap rounded-lg bg-card border border-border mb-6 overflow-hidden">
        {([
          { key: 'general' as const, label: 'General' },
          { key: 'data' as const, label: 'Data Sources' },
          { key: 'charts' as const, label: 'Chart Visibility' },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={`flex-1 min-w-0 px-2 sm:px-4 py-2 text-[11px] sm:text-sm font-medium transition-colors border ${
              activeSubTab === tab.key
                ? 'bg-primary text-primary-foreground border-primary/30'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted border-border/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: General */}
      {activeSubTab === 'general' && (
        <div className="space-y-8">
          {/* ── Show the Math ──────────────────────────────────────────────── */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Show the Math</h2>
            <p className="text-xs text-muted-foreground mb-4">
              When enabled, displays a description of the logic and math used to calculate
              each analytics card&rsquo;s values below the card.
            </p>
            <div className="flex items-center justify-between gap-3 p-3 bg-muted/30 border border-border rounded-lg">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Calculator className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-foreground">Show math explanations on cards</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Explains the formulas and data sources behind each chart and summary card.
                  </p>
                </div>
              </div>
              <Switch
                checked={showMathEnabled}
                onCheckedChange={updateShowMath}
              />
            </div>
          </div>

          {/* ── Chart Defaults ──────────────────────────────────────────────── */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-1">Chart Defaults</h2>
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
            <h2 className="text-lg font-semibold text-foreground mb-1">Synthetic &amp; Estimated Data</h2>
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
            <h2 className="text-lg font-semibold text-foreground mb-1">Imported Data</h2>
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
        </div>
      )}

      {/* Tab: Chart Visibility */}
      {activeSubTab === 'charts' && (
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1">Chart Visibility</h2>
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
      )}
    </div>
  );
}