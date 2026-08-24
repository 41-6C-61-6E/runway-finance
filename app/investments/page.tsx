'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { AppTabs } from '@/components/ui/app-tabs';
import { MobileTabSwipeContainer } from '@/components/ui/mobile-view-switcher';

const INVESTMENT_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'holdings', label: 'Holdings' },
  { id: 'income', label: 'Activity' },
];
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { PerformanceChart } from '@/components/investments/performance-chart';
import { TaxBreakdown } from '@/components/investments/tax-breakdown';
import { HoldingSparklineCards } from '@/components/investments/holding-sparkline-cards';
import { HoldingsAllocation } from '@/components/investments/holdings-allocation';
import { IncomeDividendsPanel } from '@/components/investments/income-dividends-panel';
import { RecentActivity } from '@/components/investments/recent-activity';
import { HoldingsTable } from '@/components/investments/holdings-table';
import { HoldingDetailSheet } from '@/components/investments/holding-detail-modal';
import { CandlestickChart, ShieldCheck, ArrowRight } from 'lucide-react';
import type { QuoteData } from '@/app/api/investments/quotes/route';
import { useQuery } from '@tanstack/react-query';
import { useQueryClient } from '@tanstack/react-query';
import { getDisplayTicker } from '@/lib/types/investments';
import { useInvestmentIncomeData, type IncomeTimeframeValue, type IncomeResponse } from '@/lib/hooks/use-investment-income';

interface InvestmentsData {
  accounts: any[];
  holdings: any[];
  summary: {
    totalBalance: number;
    totalCostBasis: number | null;
    totalUnrealizedGainLoss: number | null;
    totalUnrealizedReturnPct: number | null;
    holdingsCount: number;
  };
  recentTransactions: any[];
}

export default function InvestmentsPage() {
  const { isVisible } = useChartVisibility();
  const [activeTab, setActiveTab] = useState<'overview' | 'holdings' | 'income'>('overview');
  const [selectedHolding, setSelectedHolding] = useState<any | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [incomeTimeframe, setIncomeTimeframe] = useState<IncomeTimeframeValue>('1y');
  const [activityFilter, setActivityFilter] = useState<string>('all');

  const queryClient = useQueryClient();

  const handleSelectHolding = (h: any) => {
    setSelectedHolding(h);
    setIsDetailOpen(true);
  };

  /**
   * Persist a ticker override / public equivalent for this holding's
   * security, then refresh quotes + investments data so the whole page
   * reflects the new identifiers immediately.
   */
  const handleHoldingOverridesChange = async (
    securityId: string,
    patch: { tickerOverride?: string; publicEquivalent?: string },
  ) => {
    const res = await fetch('/api/investments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ securityId, ...patch }),
    });
    if (!res.ok) {
      try {
        const j = await res.json();
        // The route returns { error, field?, message } for known field errors
        // and { error, details: { field: string[] }, message } for zod-level
        // rejections.
        if (j?.field && j?.message) throw new Error(String(j.message));
        const details = j?.details;
        if (details && typeof details === 'object') {
          const [field, msgs] = Object.entries(details).find(
            ([, v]) => Array.isArray(v) && v.length > 0
          );
          if (field && Array.isArray(msgs) && msgs[0]) {
            throw new Error(`${field}: ${msgs[0]}`);
          }
        }
        throw new Error(j?.message || 'Failed to save');
      } catch (e) {
        if (e instanceof Error && /ticker|invalid/i.test(e.message)) throw e;
        throw new Error('Failed to save');
      }
    }
    // Optimistically patch the currently open holding so the drawer refreshes
    // instantly (the query invalidation below re-syncs everything else).
    setSelectedHolding((prev) =>
      prev && prev.securityId === securityId
        ? (() => {
            const next = { ...prev, ...patch };
            // Recompute the resolved display ticker locally (override →
            // ticker → equivalent) so the drawer header updates instantly.
            const ov = (next.tickerOverride ?? '').trim().toUpperCase();
            const t = (next.ticker ?? '').trim().toUpperCase();
            const eq = (next.publicEquivalent ?? '').trim().toUpperCase();
            next.displayTicker = ov || t || eq || null;
            return next;
          })()
        : prev
    );
    // Refresh the page's cached data so the edited ticker/equivalent flows
    // through to all cards, tables, charts, and the quote mapping immediately.
    await queryClient.invalidateQueries({ queryKey: ['investments'] });
    // The quotes query key depends on holdings data, which is refetched above,
    // so this also re-keys (and thus refetches with the new mapping).
    queryClient.invalidateQueries({ queryKey: ['investments-quotes'] });
  };
  /** Chart summary tiles / legend focus the activity list on a flow group. */
  const handleFocusActivity = (filter: string) => {
    setActivityFilter(filter);
  };

  // 1. Fetch main investments data
  const { data, isLoading: dataLoading, error: dataError } = useQuery<InvestmentsData>({
    queryKey: ['investments'],
    queryFn: async () => {
      const res = await fetch('/api/investments', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch investments data');
      return res.json();
    },
  });

  // 2. Fetch classified income
  const { data: incomeActivity, isLoading: incomeLoading } = useInvestmentIncomeData(incomeTimeframe);
  const { data: incomeOneYear } = useInvestmentIncomeData('1y');

  // Extract unique *display* tickers from holdings (user overrides take
  // precedence over the Plaid-reported ticker), plus a mapping of any
  // user-assigned public ETF equivalents so prices resolve to those sources.
  const holdingsArr: any[] = data?.holdings || [];
  const { uniqueTickers, quoteMappings } = (() => {
    const set = new Set<string>();
    const mapping = new Map<string, string>();
    for (const h of holdingsArr) {
      const dt = getDisplayTicker(h);
      if (dt) set.add(dt);
      const eq = (h.publicEquivalent ?? '').trim().toUpperCase();
      if (dt && eq && eq !== dt && !mapping.has(dt)) {
        mapping.set(dt, eq);
      }
    }
    const mappings = [...mapping.entries()].map(([k, v]) => `${k}:${v}`).join(',');
    return { uniqueTickers: Array.from(set), quoteMappings: mappings };
  })();

  // 4. Fetch live stock quotes (progressive / non-blocking)
  const { data: quotesRes } = useQuery<{ quotes: QuoteData[] }>({
    queryKey: ['investments-quotes', uniqueTickers.join(','), quoteMappings],
    queryFn: async () => {
      const url = quoteMappings
        ? `/api/investments/quotes?tickers=${uniqueTickers.join(',')}&mapping=${encodeURIComponent(quoteMappings)}`
        : `/api/investments/quotes?tickers=${uniqueTickers.join(',')}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch live quotes');
      return res.json();
    },
    enabled: uniqueTickers.length > 0,
    refetchInterval: 1000 * 60 * 5, // Poll every 5 minutes
    refetchOnWindowFocus: true,
  });

  const quotes = quotesRes?.quotes || [];

  // Non-blocking loading check
  const loading = dataLoading || incomeLoading;
  const error = dataError ? (dataError instanceof Error ? dataError.message : String(dataError)) : null;

  if (loading) {
    return (
      <div className="min-h-screen w-full">
        <PageHeader title="Investments" icon={CandlestickChart} />
        <PageContent>
          <LoadingSpinner category="default" className="min-h-[400px]" />
        </PageContent>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen w-full">
        <PageHeader title="Investments" icon={CandlestickChart} />
        <PageContent>
          <div className="p-6 border border-destructive/20 bg-destructive/10 rounded-xl max-w-xl mx-auto text-center space-y-3">
            <h3 className="text-base font-semibold text-destructive">Error Loading Dashboard</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{error}</p>
          </div>
        </PageContent>
      </div>
    );
  }

  const hasAccounts = data && data.accounts && data.accounts.length > 0;

  const selectedDisplayTicker = getDisplayTicker(selectedHolding ?? {});
  const selectedQuote = selectedDisplayTicker
    ? quotes.find((q) => q.ticker?.toUpperCase() === selectedDisplayTicker)
    : undefined;

  return (
    <div className="min-h-screen w-full">
      <PageHeader title="Investments" icon={CandlestickChart} />
      <PageContent>
        {hasAccounts && data ? (
          <div className="space-y-5 sm:space-y-6">
            {/* ── Tabs & Sub-Navigation ── */}
            <MobileTabSwipeContainer
              tabs={INVESTMENT_TABS}
              activeTabId={activeTab}
                  onTabChange={(tabId) => setActiveTab(tabId as 'overview' | 'holdings' | 'income')}
            >
              <div className="hidden md:block mb-5 sm:mb-6">
                <AppTabs
                  tabs={INVESTMENT_TABS}
                  activeTab={activeTab}
                  onChange={(tabId) => setActiveTab(tabId as 'overview' | 'holdings' | 'income')}
                  variant="underline"
                />
              </div>

              {/* ── Overview Tab Content ── */}
              {activeTab === 'overview' && (
                <div className="space-y-5 sm:space-y-6">
                  {(isVisible('performanceChart') || isVisible('taxBreakdown')) && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 items-stretch">
                      {isVisible('performanceChart') && (
                        <div className="lg:col-span-2">
                          <PerformanceChart />
                        </div>
                      )}
                      {isVisible('taxBreakdown') && (
                        <div className="lg:col-span-1">
                          <TaxBreakdown accounts={data.accounts} />
                        </div>
                      )}
                    </div>
                  )}

                  {isVisible('holdingsAllocationChart') && (
                    <div>
                      <HoldingsAllocation holdings={data.holdings} accounts={data.accounts} />
                    </div>
                  )}
                </div>
              )}

              {/* ── Holdings Tab Content ── */}
              {activeTab === 'holdings' && (
                <div className="space-y-5 sm:space-y-6">
                  {isVisible('topHoldings') && (
                    <div>
                      <HoldingSparklineCards
                        holdings={data.holdings}
                        quotes={quotes}
                        onSelectHolding={handleSelectHolding}
                      />
                    </div>
                  )}

                  {isVisible('holdingsTable') && (
                    <div>
                      <div className="bg-card border border-border rounded-xl shadow-sm p-4 sm:p-5">
                        <div className="mb-4 border-b border-border/60 pb-2">
                          <h3 className="text-sm sm:text-base font-semibold text-foreground">Holdings Portfolio</h3>
                          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                            A list of all securities and cash assets currently held across your linked accounts. Click any holding to view historical performance and position details.
                          </p>
                        </div>
                        <HoldingsTable
                          holdings={data.holdings}
                          accounts={data.accounts}
                          quotes={quotes}
                          onSelectHolding={handleSelectHolding}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Income & Activity Tab Content ── */}
              {activeTab === 'income' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6 items-stretch">
                  {isVisible('incomeDividends') && (
                    <div>
                      <IncomeDividendsPanel
                        value={incomeTimeframe}
                        onValueChange={setIncomeTimeframe}
                        onFocusActivity={handleFocusActivity}
                      />
                    </div>
                  )}
                  {isVisible('recentActivity') && (
                    <div>
                      <RecentActivity
                        transactions={incomeActivity?.transactions || []}
                        startDate={incomeActivity?.start}
                        endDate={incomeActivity?.end}
                        value={activityFilter}
                        onValueChange={setActivityFilter}
                      />
                    </div>
                  )}
                </div>
              )}
            </MobileTabSwipeContainer>

            {/* ── Holding Detail Slide-Out Sheet ── */}
            <HoldingDetailSheet
              open={isDetailOpen}
              onOpenChange={setIsDetailOpen}
              holding={selectedHolding}
              allHoldings={data.holdings}
              accounts={data.accounts}
              quote={selectedQuote}
              recentTransactions={incomeOneYear?.transactions || []}
              onOverridesChange={handleHoldingOverridesChange}
            />
          </div>
        ) : (
          /* Onboarding/Empty State */
          <div className="max-w-2xl mx-auto py-10 sm:py-16 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto text-primary animate-pulse">
              <CandlestickChart className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-lg sm:text-xl font-bold text-foreground">Connect Your Investment Accounts</h2>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                Connect your taxable brokerage accounts, retirement plans (like 401k or IRA), and health savings accounts to unlock real-time holdings tracking, asset allocation breakdowns, and investment performance metrics.
              </p>
            </div>

            {/* Premium features checklist */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-4 text-left border-y border-border/60 max-w-xl mx-auto">
              {[
                { title: 'Holdings Breakdown', desc: 'Track shares, current price, and cost basis' },
                { title: 'Asset Allocation', desc: 'Analyze diversification by asset type or brokerage' },
                { title: 'Performance Trends', desc: 'Monitor portfolio value growth over time' }
              ].map((feat, idx) => (
                <div key={idx} className="space-y-1 p-1">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <ShieldCheck className="w-4 h-4 text-chart-1 shrink-0" />
                    <span>{feat.title}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-normal">{feat.desc}</p>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <a
                href="/settings?tab=accounts"
                className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-semibold text-primary-foreground bg-primary shadow-sm hover:opacity-90 transition-all group"
              >
                <span>Link Brokerage in Settings</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 duration-200" />
              </a>
            </div>
          </div>
        )}
      </PageContent>
    </div>
  );
}
