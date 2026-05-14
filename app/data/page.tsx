'use client';

import { Suspense } from 'react';
import DataExplorerPage from '@/components/features/data-explorer/DataExplorerPage';

export default function DataPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    }>
      <DataExplorerPage />
    </Suspense>
  );
}
