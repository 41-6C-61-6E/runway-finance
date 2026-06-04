'use client';

import { LayoutDashboard } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import PageContent from '@/components/page-content';

export default function PlansPage() {
  return (
    <div className="min-h-screen w-full">
      <PageHeader title="Plans" icon={LayoutDashboard} />
      <PageContent>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <LayoutDashboard className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Planning & Projections</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Create and manage financial plans, run projections, and model future scenarios.
            This section is coming soon.
          </p>
        </div>
      </PageContent>
    </div>
  );
}
