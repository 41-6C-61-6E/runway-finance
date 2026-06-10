'use client';

import { useState, useEffect, Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { MathDescription } from '@/components/features/settings/math-description';
import { useChartVisibility } from '@/lib/hooks/use-chart-visibility';
import { InvestmentsSummary } from '@/components/investments/investments-summary';
import { PerformanceChart } from '@/components/investments/performance-chart';
import { HoldingsAllocation } from '@/components/investments/holdings-allocation';
import { HoldingsTable } from '@/components/investments/holdings-table';
import { RecentActivity } from '@/components/investments/recent-activity';
import { Briefcase, Landmark, ShieldCheck, ArrowRight } from 'lucide-react';

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
  const [data, setData] = useState<InvestmentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInvestments = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/investments', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to fetch investments data');
        const json: InvestmentsData = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchInvestments();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen w-full">
        <PageHeader title="Investments" icon={Briefcase} />
        <PageContent>
          <LoadingSpinner category="default" className="min-h-[400px]" />
        </PageContent>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen w-full">
        <PageHeader title="Investments" icon={Briefcase} />
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
      <PageHeader title="Investments" icon={Briefcase} />
      <PageContent>
        {hasAccounts && data ? (
          <div className="space-y-5 sm:space-y-6">
            {/* ── Summary Metrics ── */}
            {isVisible('investmentsSummary') && (
              <div>
                <InvestmentsSummary summary={data.summary} />
                <MathDescription chartId="investmentsSummary" />
              </div>
            )}

            {/* ── Performance Value Chart ── */}
            {isVisible('performanceChart') && (
              <div>
                <PerformanceChart />
                <MathDescription chartId="performanceChart" />
              </div>
            )}

            {/* ── Allocation & Activity Grid ── */}
            {(isVisible('holdingsAllocationChart') || isVisible('recentActivity')) && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 items-stretch">
                {isVisible('holdingsAllocationChart') && (
                  <div className="lg:col-span-2">
                    <HoldingsAllocation holdings={data.holdings} accounts={data.accounts} />
                    <MathDescription chartId="holdingsAllocationChart" />
                  </div>
                )}
                {isVisible('recentActivity') && (
                  <div className="lg:col-span-1">
                    <RecentActivity transactions={data.recentTransactions} />
                    <MathDescription chartId="recentActivity" />
                  </div>
                )}
              </div>
            )}

            {/* ── Holdings Table ── */}
            {isVisible('holdingsTable') && (
              <div>
                <div className="bg-card border border-border rounded-xl shadow-sm p-4 sm:p-5">
                  <div className="mb-4 border-b border-border/60 pb-2">
                    <h3 className="text-sm sm:text-base font-semibold text-foreground">Holdings Portfolio</h3>
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                      A list of all securities and cash assets currently held across your linked accounts.
                    </p>
                  </div>
                  <HoldingsTable holdings={data.holdings} accounts={data.accounts} />
                </div>
                <MathDescription chartId="holdingsTable" />
              </div>
            )}
          </div>
        ) : (
          /* Onboarding/Empty State */
          <div className="max-w-2xl mx-auto py-10 sm:py-16 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto text-primary animate-pulse">
              <Briefcase className="w-8 h-8" />
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
