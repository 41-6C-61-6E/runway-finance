'use client';

import { useState } from 'react';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { InvestmentsSummary } from '@/components/investments/investments-summary';
import { PerformanceChart } from '@/components/investments/performance-chart';
import { TaxBreakdown } from '@/components/investments/tax-breakdown';
import { HoldingSparklineCards } from '@/components/investments/holding-sparkline-cards';
import { HoldingsAllocation } from '@/components/investments/holdings-allocation';
import { IncomeDividendsPanel } from '@/components/investments/income-dividends-panel';
import { RecentActivity } from '@/components/investments/recent-activity';
import { HoldingsTable } from '@/components/investments/holdings-table';
import { CandlestickChart, ShieldCheck, ArrowRight } from 'lucide-react';
import type { QuoteData } from '@/app/api/investments/quotes/route';
import { useQuery } from '@tanstack/react-query';

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
  const { data: incomeData = null, isLoading: incomeLoading } = useQuery<{ monthlyIncome: any[]; totalAnnual: number; transactions: any[] } | null>({
    queryKey: ['investments-income'],
    queryFn: async () => {
      const res = await fetch('/api/investments/income', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch income data');
      return res.json();
    },
  });

  // 3. Fetch 1m portfolio history
  const { data: historyRes, isLoading: historyLoading } = useQuery<{ data: any[] }>({
    queryKey: ['investments-history'],
    queryFn: async () => {
      const res = await fetch('/api/investments/history?timeframe=1m', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch history data');
      return res.json();
    },
  });

  const portfolioHistory = historyRes?.data || [];

  // Extract unique tickers from holdings
  const tickers = data?.holdings
    ?.map((h) => h.ticker)
    .filter((t): t is string => !!t && typeof t === 'string' && t.trim().length > 0) || [];
  const uniqueTickers = Array.from(new Set(tickers));

  // 4. Fetch live stock quotes
  const { data: quotesRes, isLoading: quotesLoading } = useQuery<{ quotes: QuoteData[] }>({
    queryKey: ['investments-quotes', uniqueTickers.join(',')],
    queryFn: async () => {
      const res = await fetch(`/api/investments/quotes?tickers=${uniqueTickers.join(',')}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch live quotes');
      return res.json();
    },
    enabled: uniqueTickers.length > 0,
    refetchInterval: 1000 * 60 * 5, // Poll every 5 minutes
    refetchOnWindowFocus: true,
  });

  const quotes = quotesRes?.quotes || [];

  const loading = dataLoading || incomeLoading || historyLoading || (uniqueTickers.length > 0 && quotesLoading);
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

  return (
    <div className="min-h-screen w-full">
      <PageHeader title="Investments" icon={CandlestickChart} />
      <PageContent>
        {hasAccounts && data ? (
          <div className="space-y-5 sm:space-y-6">
            {/* ── Summary Metrics ── */}
            {isVisible('investmentsSummary') && (
              <div>
                <InvestmentsSummary
                  summary={data.summary}
                  accounts={data.accounts}
                  holdings={data.holdings}
                  totalAnnualIncome={incomeData?.totalAnnual}
                  portfolioHistory={portfolioHistory}
                  quotes={quotes}
                />
              </div>
            )}

            {/* ── Tabs Selector ── */}
            <div className="flex border-b border-border w-full overflow-x-auto scrollbar-none snap-x snap-mandatory gap-6 mb-5 sm:mb-6">
              {([
                { id: 'overview', label: 'Overview' },
                { id: 'holdings', label: 'Holdings & Portfolio' },
                { id: 'income', label: 'Income & Activity' },
              ] as const).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-2.5 px-1 snap-start text-xs font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer border-b-2 -mb-px ${
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
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
                    <HoldingSparklineCards holdings={data.holdings} quotes={quotes} />
                  </div>
                )}

                {isVisible('holdingsTable') && (
                  <div>
                    <div className="bg-card border border-border rounded-xl shadow-sm p-4 sm:p-5">
                      <div className="mb-4 border-b border-border/60 pb-2">
                        <h3 className="text-sm sm:text-base font-semibold text-foreground">Holdings Portfolio</h3>
                        <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                          A list of all securities and cash assets currently held across your linked accounts.
                        </p>
                      </div>
                      <HoldingsTable holdings={data.holdings} accounts={data.accounts} quotes={quotes} />
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
                      monthlyIncome={incomeData?.monthlyIncome || []}
                      totalAnnualIncome={incomeData?.totalAnnual || 0}
                      loading={loading}
                    />
                  </div>
                )}
                {isVisible('recentActivity') && (
                  <div>
                    <RecentActivity transactions={incomeData?.transactions || []} />
                  </div>
                )}
              </div>
            )}
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
