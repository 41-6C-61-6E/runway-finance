'use client';

import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useChartVisibility, CHARTS } from '@/lib/hooks/use-chart-visibility';
import { useSyntheticData } from '@/lib/hooks/use-synthetic-data';
import { useImportedData } from '@/lib/hooks/use-imported-data';
import { useChartDefaults, type ChartTimeRange, type ChartTypeOption } from '@/lib/hooks/use-chart-defaults';
import { useShowMath } from '@/lib/hooks/use-show-math';
import { Check, Calculator, RefreshCw, ChevronDown, ChevronUp, Database } from 'lucide-react';
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
    label: 'Net Worth & Accounts',
    description: 'Estimated daily balance snapshots are generated from your transaction history to fill gaps between confirmed snapshots from your financial institution. Synthetic snapshots are automatically backfilled during each sync. Manual recalibration is useful after importing historical data, correcting past transactions, or changing account settings.',
  },
  {
    key: 'realEstate' as const,
    label: 'Real Estate',
    description: 'Historical property values are estimated using the FHFA Housing Price Index, and mortgage paydown is simulated via amortization schedules. Snapshots are automatically regenerated when you add or edit a property, vehicle, or mortgage. Manual recalculation is useful after updating property details, loan terms, or purchase dates.',
  },
  {
    key: 'cashFlowProjections' as const,
    label: 'Cash Flow Projections',
    description: 'Future income and expense projections are calculated in real-time from your budgets and historical spending patterns. No data is stored — projections are computed on-the-fly whenever charts are viewed. No recalculation is needed.',
  },
];

const IMPORTED_MODULES = [
  {
    key: 'netWorth' as const,
    label: 'Net Worth & Accounts',
    description: 'Imported account snapshots and transactions included in net worth calculations. Disabling this hides imported balance data from net worth charts.',
  },
  {
    key: 'realEstate' as const,
    label: 'Real Estate',
    description: 'Imported account snapshots for real estate accounts. Disabling this hides imported property snapshots from real estate charts.',
  },
  {
    key: 'cashFlowProjections' as const,
    label: 'Cash Flow Projections',
    description: 'Imported transactions included in cash flow analysis. Disabling this excludes imported transactions from cash flow projections and spending charts.',
  },
];

interface ModuleRecalcState {
  recalculating: boolean;
  showConfirm: boolean;
  result: { success: boolean; message: string; stats?: Record<string, number> } | null;
}

const INIT_RECALC: ModuleRecalcState = { recalculating: false, showConfirm: false, result: null };

export default function AnalyticsTab() {
  const { visibility, loading: visLoading, updateVisibility } = useChartVisibility();
  const { settings, loading: synthLoading, isEnabled, updateSettings } = useSyntheticData();
  const { settings: importSettings, loading: importLoading, isEnabled: isImportEnabled, updateSettings: updateImportSettings } = useImportedData();
  const { defaults, loading: defaultsLoading, updateDefaults } = useChartDefaults();
  const { enabled: showMathEnabled, loading: mathLoading, updateEnabled: updateShowMath } = useShowMath();
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
  const [netWorthState, setNetWorthState] = useState<ModuleRecalcState>(INIT_RECALC);
  const [realEstateState, setRealEstateState] = useState<ModuleRecalcState>(INIT_RECALC);
  const [cashFlowState, setCashFlowState] = useState<ModuleRecalcState>(INIT_RECALC);
  const [summariesState, setSummariesState] = useState<ModuleRecalcState>(INIT_RECALC);
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'data' | 'charts'>('general');

  const toggleModuleExpanded = (key: string) => {
    setExpandedModules((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleRecalculate = async (type: string, state: ModuleRecalcState, setState: (s: ModuleRecalcState) => void) => {
    setState({ ...state, recalculating: true, result: null, showConfirm: false });
    try {
      const res = await fetch(`/api/analytics/recalculate-snapshots?type=${type}`, { method: 'POST', credentials: 'include' });
      const data = await res.json();
      setState({ recalculating: false, showConfirm: false, result: data });
    } catch (error: any) {
      setState({ recalculating: false, showConfirm: false, result: { success: false, message: error.message || 'Failed to recalculate snapshots' } });
    }
  };

  const loading = visLoading || synthLoading || importLoading || defaultsLoading || mathLoading;

  if (loading) {
    return <div className="text-muted-foreground py-4">Loading...</div>;
  }

  const moduleState = (key: string): ModuleRecalcState => {
    if (key === 'netWorth') return netWorthState;
    if (key === 'realEstate') return realEstateState;
    return cashFlowState;
  };

  const setModuleState = (key: string) => {
    if (key === 'netWorth') return setNetWorthState;
    if (key === 'realEstate') return setRealEstateState;
    return setCashFlowState;
  };

  const recalcConfirmText = (key: string) => {
    if (key === 'netWorth') {
      return 'This will permanently delete all previously calculated synthetic account snapshots and regenerate them from your transaction history. The net worth chart will also be rebuilt from the updated snapshots. Your actual synced or manually entered snapshots will not be deleted.';
    }
    if (key === 'realEstate') {
      return 'This will permanently delete all estimated property value and mortgage paydown snapshots and regenerate them from your current property and mortgage details. Useful after updating loan terms, correcting a purchase date, adding a new mortgage, or changing property details.';
    }
    return 'Cash flow projections are computed in real-time from your budgets and spending patterns. No stored snapshots need to be recalculated.';
  };

  return (
    <div>
      {/* Sub-Tabs */}
      <div className="flex flex-wrap rounded-lg bg-card border border-border mb-6">
        {([
          { key: 'general' as const, label: 'General' },
          { key: 'data' as const, label: 'Data Sources' },
          { key: 'charts' as const, label: 'Chart Visibility' },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={`flex-1 min-w-0 px-2 sm:px-4 py-2 text-[11px] sm:text-sm font-medium transition-colors ${
              activeSubTab === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
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
          <div className="p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
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
              data from your accounts. Click &ldquo;How this works&rdquo; on each module for details on
              inputs and calculations.
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              <strong className="text-foreground/80">Recalculating</strong> permanently deletes and
              regenerates only <em>synthetic</em> snapshots from scratch. Your actual synced or manually
              entered snapshots are never touched.
            </p>

        {/* Module Toggles */}
        <div className="space-y-2">
          {MODULES.map((mod) => {
            const moduleEnabled = isEnabled(mod.key);
            const individuallyChecked = settings[mod.key] !== false;
            const isExpanded = !!expandedModules[mod.key];
            const state = moduleState(mod.key);
            const setState = setModuleState(mod.key);
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

                {/* Recalculate button + result */}
                <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
                  {mod.key === 'cashFlowProjections' ? (
                    <span className="text-[11px] text-muted-foreground">Computed in real-time &mdash; no stored data</span>
                  ) : (
                    <button
                      type="button"
                      disabled={state.recalculating}
                      onClick={() => setState({ ...state, showConfirm: true })}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-3 h-3 ${state.recalculating ? 'animate-spin' : ''}`} />
                      {state.recalculating ? 'Recalculating...' : 'Recalculate'}
                    </button>
                  )}
                </div>

                {state.result && (
                  <div className={`mt-2 p-2.5 rounded-lg border text-[11px] ${
                    state.result.success
                      ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-300'
                      : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-300'
                  }`}>
                    <p className="font-medium">{state.result.message}</p>
                    {state.result.stats && (
                      <ul className="mt-1 space-y-0.5">
                        <li>Synthetic snapshots created: {state.result.stats.syntheticSnapshotsCreated}</li>
                        {state.result.stats.skippedRealSnapshots !== undefined && (
                          <li>Real snapshots skipped: {state.result.stats.skippedRealSnapshots}</li>
                        )}
                        {state.result.stats.errorsEncountered > 0 && (
                          <li className="text-red-600 dark:text-red-400">Errors: {state.result.stats.errorsEncountered}</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}

                {/* Confirmation dialog per module */}
                <AlertDialog
                  open={state.showConfirm}
                  onOpenChange={(open) => setState({ ...state, showConfirm: open })}
                >
                  <AlertDialogContent className="max-w-md">
                    <AlertDialogHeader>
                      <AlertDialogTitle>Recalculate {mod.label} Data?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {recalcConfirmText(mod.key)}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <button
                        type="button"
                        onClick={() => handleRecalculate(
                          mod.key === 'cashFlowProjections' ? 'cashFlow' : mod.key,
                          state,
                          setState
                        )}
                        className="inline-flex h-9 items-center justify-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90 transition-opacity"
                      >
                        Recalculate
                      </button>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {/* Collapsible details toggle */}
                <button
                  type="button"
                  onClick={() => toggleModuleExpanded(mod.key)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors mt-2"
                >
                  <span>{isExpanded ? 'Hide calculation details' : 'How this works (Inputs & Calculations)'}</span>
                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border/50 text-[11px] text-muted-foreground space-y-3.5 animate-in fade-in slide-in-from-top-1 duration-200">
                    {mod.key === 'netWorth' && (
                      <>
                        <div>
                          <strong className="text-foreground font-semibold">Inputs:</strong>
                          <ul className="list-disc pl-4 mt-1 space-y-1">
                            <li><strong className="text-foreground/80">Real Snapshots:</strong> Confirmed balance snapshots synced from your financial institution or entered manually.</li>
                            <li><strong className="text-foreground/80">Transaction History:</strong> Confirmed daily transactions associated with your accounts.</li>
                          </ul>
                        </div>
                        <div>
                          <strong className="text-foreground font-semibold">Calculations:</strong>
                          <p className="mt-1 leading-relaxed">
                            Uses a <strong className="text-foreground/80">two-pass algorithm</strong> anchored to your earliest real snapshot:
                          </p>
                          <ul className="list-disc pl-4 mt-1 space-y-1">
                            <li><strong className="text-foreground/80">Backward Pass:</strong> Calculates historical balances backward from the first real snapshot using transaction amounts: <code className="text-foreground bg-muted px-1 py-0.5 rounded">Balance_prev = Balance_curr - Transactions</code>.</li>
                            <li><strong className="text-foreground/80">Forward Pass:</strong> Calculates daily balances forward using transaction amounts, anchoring/resetting to any newer real snapshots.</li>
                            <li><strong className="text-foreground/80">Fallback:</strong> If no real snapshots exist, it starts from a $0 balance on your earliest transaction date and projects forward.</li>
                          </ul>
                        </div>
                        <div>
                          <strong className="text-foreground font-semibold">Outputs:</strong>
                          <p className="mt-1">Daily historical snapshots to fill in gaps and construct a continuous balance history for Net Worth & Accounts charts.</p>
                        </div>
                      </>
                    )}
                    {mod.key === 'realEstate' && (
                      <>
                        <div>
                          <strong className="text-foreground font-semibold">Inputs:</strong>
                          <ul className="list-disc pl-4 mt-1 space-y-1">
                            <li><strong className="text-foreground/80">Property Info:</strong> Purchase price, purchase date, current valuation, and zip code.</li>
                            <li><strong className="text-foreground/80">FHFA House Price Index (HPI):</strong> Metropolitan index (via FRED API) matched to your zip code prefix, or a national index fallback.</li>
                            <li><strong className="text-foreground/80">Mortgage Details:</strong> Original loan amount, interest rate, term length, start date, and current balance.</li>
                          </ul>
                        </div>
                        <div>
                          <strong className="text-foreground font-semibold">Calculations:</strong>
                          <ul className="list-disc pl-4 mt-1 space-y-1">
                            <li><strong className="text-foreground/80">Real Estate Valuation:</strong> Projects historical values using metropolitan or national appreciation indexes.</li>
                            <li><strong className="text-foreground/80">CAGR Fallback:</strong> If HPI data is unavailable, calculates the compounded annual growth rate to estimate property value every 30 days.</li>
                            <li><strong className="text-foreground/80">Mortgage Amortization:</strong> Simulates monthly principal paydowns, adjusting interest and principal over time using standard schedules.</li>
                          </ul>
                        </div>
                        <div>
                          <strong className="text-foreground font-semibold">Outputs:</strong>
                          <p className="mt-1">Monthly property value snapshots (positive assets) and monthly mortgage remaining balances (negative liabilities).</p>
                        </div>
                      </>
                    )}
                    {mod.key === 'cashFlowProjections' && (
                      <>
                        <div>
                          <strong className="text-foreground font-semibold">Inputs:</strong>
                          <ul className="list-disc pl-4 mt-1 space-y-1">
                            <li><strong className="text-foreground/80">Selected Accounts:</strong> Checking and savings account balances.</li>
                            <li><strong className="text-foreground/80">Active Budgets:</strong> User-defined recurring income and expense budgets.</li>
                            <li><strong className="text-foreground/80">Lookback Transactions:</strong> Recent transaction history (typically 3 months) to analyze spending patterns.</li>
                          </ul>
                        </div>
                        <div>
                          <strong className="text-foreground font-semibold">Calculations:</strong>
                          <ul className="list-disc pl-4 mt-1 space-y-1">
                            <li><strong className="text-foreground/80">Historical Mode:</strong> Projects balances using average monthly inflows and outflows.</li>
                            <li><strong className="text-foreground/80">Budget Mode:</strong> Projects balances using monthly budgets normalized for frequency.</li>
                            <li><strong className="text-foreground/80">Hybrid Mode (Default):</strong> Combines defined budget targets with historical averages for unbudgeted/uncategorized spending.</li>
                            <li><strong className="text-foreground/80">Accumulation:</strong> Iteratively computes month-over-month balances: <code className="text-foreground bg-muted px-1 py-0.5 rounded">Balance_next = Balance_curr + Inflows - Outflows</code>.</li>
                          </ul>
                        </div>
                        <div>
                          <strong className="text-foreground font-semibold">Outputs:</strong>
                          <p className="mt-1">Monthly projected inflows, outflows, and starting/ending balances up to 24 months in the future.</p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Summary Tables (Spending & Cash Flow) ─────────────────────── */}
      <div className="p-4 bg-muted/20 border border-border rounded-lg">
        <h2 className="text-sm font-semibold text-foreground mb-1">Summary Tables &mdash; Spending &amp; Cash Flow</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Your <strong className="text-foreground/80">Spending</strong> and <strong className="text-foreground/80">Cash Flow</strong>
          pages are powered by pre-computed summary tables: monthly income/expense totals and category breakdowns.
          These are <strong className="text-foreground/80">automatically recalculated</strong> whenever you sync
          accounts or create/edit transactions. If you&rsquo;re seeing missing or stale data, you can trigger a
          manual recalculation below.
        </p>
        <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between">
          <button
            type="button"
            disabled={summariesState.recalculating}
            onClick={() => handleRecalculate('summaries', summariesState, setSummariesState)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${summariesState.recalculating ? 'animate-spin' : ''}`} />
            {summariesState.recalculating ? 'Recalculating...' : 'Recalculate Spending & Cash Flow Summaries'}
          </button>
        </div>
        {summariesState.result && (
          <div className={`mt-2 p-2.5 rounded-lg border text-[11px] ${
            summariesState.result.success
              ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-300'
              : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-300'
          }`}>
            <p className="font-medium">{summariesState.result.message}</p>
            {summariesState.result.stats && (
              <ul className="mt-1 space-y-0.5">
                <li>Cash flow months: {summariesState.result.stats.summaryMonths}</li>
                <li>Transactions processed: {summariesState.result.stats.summaryTransactions}</li>
                <li>Spending summary rows: {summariesState.result.stats.summarySpendingRows} ({summariesState.result.stats.summarySpendingCategories} categories)</li>
                <li>Income summary rows: {summariesState.result.stats.summaryIncomeRows} ({summariesState.result.stats.summaryIncomeCategories} categories)</li>
              </ul>
            )}
          </div>
        )}
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