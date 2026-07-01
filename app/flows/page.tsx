'use client';

import { useState, Suspense } from 'react';
import { WealthFlowSankey } from '@/components/net-worth/wealth-flow-sankey';
import { CashFlowSankey } from '@/components/cash-flow/cash-flow-sankey';
import { MathDescription } from '@/components/features/settings/math-description';
import { ArrowLeftRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { ChartErrorBoundary } from '@/components/chart-error-boundary';

type Tab = 'wealth' | 'cash';

function FlowsContent() {
  const [activeTab, setActiveTab] = useState<Tab>('wealth');

  return (
    <div className="min-h-screen w-full">
      <PageHeader title="Flows" icon={ArrowLeftRight} />
      <PageContent>
        <div className="flex bg-muted/40 border border-border/50 rounded-xl p-1 w-full sm:w-auto gap-1 mb-5 sm:mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('wealth')}
            className={`flex-1 sm:flex-none py-1.5 px-4 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'wealth'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
            }`}
          >
            Wealth Flow
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cash')}
            className={`flex-1 sm:flex-none py-1.5 px-4 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'cash'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
            }`}
          >
            Cash Flow
          </button>
        </div>

        {activeTab === 'wealth' && (
          <Suspense fallback={<LoadingSpinner category="chart" />}>
            <WealthFlowSankey />
          </Suspense>
        )}

        {activeTab === 'cash' && (
          <Suspense fallback={<LoadingSpinner category="sankey" />}>
            <ChartErrorBoundary name="Cash Flow Sankey">
              <div>
                <CashFlowSankey />
                <MathDescription chartId="cashFlowSankey" />
              </div>
            </ChartErrorBoundary>
          </Suspense>
        )}
      </PageContent>
    </div>
  );
}

export default function FlowsPage() {
  return (
    <Suspense fallback={<LoadingSpinner category="default" className="min-h-screen" />}>
      <FlowsContent />
    </Suspense>
  );
}
