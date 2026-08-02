'use client';

import { useState, Suspense } from 'react';
import { WealthFlowSankey } from '@/components/net-worth/wealth-flow-sankey';
import { CashFlowSankey } from '@/components/cash-flow/cash-flow-sankey';
import { ArrowLeftRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';
import { ChartErrorBoundary } from '@/components/chart-error-boundary';
import { AppTabs } from '@/components/ui/app-tabs';

type Tab = 'wealth' | 'cash';

function FlowsContent() {
  const [activeTab, setActiveTab] = useState<Tab>('wealth');

  return (
    <div className="min-h-screen w-full">
      <PageHeader title="Flows" icon={ArrowLeftRight} />
      <PageContent>
        <AppTabs
          tabs={[
            { id: 'wealth', label: 'Wealth Flow' },
            { id: 'cash', label: 'Cash Flow' },
          ]}
          activeTab={activeTab}
          onChange={(tabId) => setActiveTab(tabId as Tab)}
          variant="underline"
          className="mb-5 sm:mb-6"
        />

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
