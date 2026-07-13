'use client';

import { useState, Suspense } from 'react';
import { WealthFlowSankey } from '@/components/net-worth/wealth-flow-sankey';
import { CashFlowSankey } from '@/components/cash-flow/cash-flow-sankey';
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
        <div className="flex border-b border-border w-full sm:w-auto gap-6 mb-5 sm:mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('wealth')}
            className={`pb-2 text-xs font-semibold transition-all duration-200 cursor-pointer border-b-2 -mb-px ${
              activeTab === 'wealth'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Wealth Flow
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cash')}
            className={`pb-2 text-xs font-semibold transition-all duration-200 cursor-pointer border-b-2 -mb-px ${
              activeTab === 'cash'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
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
