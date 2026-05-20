'use client';

import { Switch } from '@/components/ui/switch';
import { useChartVisibility, CHARTS } from '@/lib/hooks/use-chart-visibility';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import { useChartDefaults, type ChartTimeRange, type ChartTypeOption } from '@/lib/hooks/use-chart-defaults';
import { useShowMath } from '@/lib/hooks/use-show-math';
import { Check, Calculator, RefreshCw } from 'lucide-react';

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
    label: 'Net Worth',
    description: 'Estimated balance snapshots are generated from your transaction history to fill in days where no automatic snapshot was taken by your financial institution. Disabling this shows only dates with confirmed snapshots.',
  },
  {
    key: 'realEstate' as const,
    label: 'Real Estate',
    description: 'When adding a property manually, historical values are estimated using the FHFA Housing Price Index. Mortgage paydown is estimated using amortization schedules. Disabling this shows only balance snapshots you have manually entered or synced.',
  },
  {
    key: 'cashFlowProjections' as const,
    label: 'Cash Flow Projections',
    description: 'Future income and expense projections are calculated from your budgets and historical spending patterns. Disabling this removes projected future data from charts.',
  },
];

import { useState } from 'react';

export default function AnalyticsTab() {
  const { visibility, loading: visLoading, updateVisibility } = useChartVisibility();
  const { settings, loading: synthLoading, isEnabled, updateSettings } = useSyntheticData();
  const { defaults, loading: defaultsLoading, updateDefaults } = useChartDefaults();
  const { enabled: showMathEnabled, loading: mathLoading, updateEnabled: updateShowMath } = useShowMath();
  const [recalculating, setRecalculating] = useState(false);
  const [recalcResult, setRecalcResult] = useState<{
    success: boolean;
    message: string;
    stats?: {
      accountsProcessed: number;
      syntheticSnapshotsCreated: number;
      skippedRealSnapshots: number;
      errorsEncountered: number;
    };
  } | null>(null);

  const handleRecalculate = async () => {
    setRecalculating(true);
    setRecalcResult(null);
    try {
      const res = await fetch('/api/analytics/recalculate-snapshots', { method: 'POST' });
      const data = await res.json();
      setRecalcResult(data);
    } catch (error: any) {
      setRecalcResult({ success: false, message: error.message || 'Failed to recalculate snapshots' });
    } finally {
      setRecalculating(false);
    }
  };

  const loading = visLoading || synthLoading || defaultsLoading || mathLoading;

  if (loading) {
    return <div className="text-muted-foreground py-4">Loading...</div>;
  }

  return (
    <div className="space-y-10">      {/* ── Show the Math ──────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Show the Math</h2>
        <p className="text-xs text-muted-foreground mb-4">
          When enabled, displays a description of the logic and math used to calculate
          each analytics card&rsquo;s values below the card.
        </p>
        <div className="flex items-center justify-between p-3 bg-muted/30 border border-border rounded-lg">
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4 text-muted-foreground" />
            <div>
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
      {/* ── Synthetic & Estimated Data ─────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Synthetic &amp; Estimated Data</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Synthetic or estimated data fills in gaps where no live snapshot from your financial institution
          is available. When enabled, estimated values appear with dashed lines and &ldquo;estimated&rdquo;
          labels in charts. Disabling a module hides those data points entirely, showing only confirmed
          data from your accounts.
        </p>

        {/* Module Toggles */}
        <div className="space-y-2">
          {MODULES.map((mod) => {
            const moduleEnabled = isEnabled(mod.key);
            const individuallyChecked = settings[mod.key] !== false;
            return (
              <div
                key={mod.key}
                className="p-3 bg-muted/30 border border-border rounded-lg"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{mod.label}</span>
                    <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 rounded uppercase tracking-wider">BETA</span>
                  </div>
                  <Switch
                    checked={moduleEnabled}
                    onCheckedChange={(checked) => updateSettings({ [mod.key]: checked })}
                  />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{mod.description}</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-1">
                  ⚠ BETA: This feature is under development and data may not be accurate.
                </p>
                {individuallyChecked === false && (
                  <p className="text-[10px] text-chart-3 italic mt-1">
                    Estimated data hidden for {mod.label.toLowerCase()}.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Recalculate Button */}
        <div className="mt-4">
          <button
            type="button"
            disabled={recalculating}
            onClick={handleRecalculate}
            className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? 'animate-spin' : ''}`} />
            {recalculating ? 'Recalculating...' : 'Recalculate Synthetic & Estimated Data'}
          </button>

          {recalcResult && (
            <div className={`mt-3 p-3 rounded-lg border text-xs ${
              recalcResult.success
                ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-300'
                : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-300'
            }`}>
              <p className="font-medium">{recalcResult.message}</p>
              {recalcResult.stats && (
                <ul className="mt-1 space-y-0.5">
                  <li>Accounts processed: {recalcResult.stats.accountsProcessed}</li>
                  <li>Synthetic snapshots created: {recalcResult.stats.syntheticSnapshotsCreated}</li>
                  <li>Real snapshots skipped: {recalcResult.stats.skippedRealSnapshots}</li>
                  {recalcResult.stats.errorsEncountered > 0 && (
                    <li className="text-red-600 dark:text-red-400">Errors: {recalcResult.stats.errorsEncountered}</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Chart Defaults ──────────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Chart Defaults</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Choose default view options for all charts. These can be changed per-chart when viewing.
        </p>

        <div className="space-y-4">
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

      {/* ── Chart Visibility ───────────────────────────────────────────── */}
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
    </div>
  );
}
