'use client';

import { Suspense } from 'react';
import DataExplorerPage from '@/components/features/data-explorer/DataExplorerPage';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function DataPage() {
  return (
    <Suspense fallback={<LoadingSpinner category="default" className="min-h-screen" />}>
      <DataExplorerPage />
    </Suspense>
  );
}
