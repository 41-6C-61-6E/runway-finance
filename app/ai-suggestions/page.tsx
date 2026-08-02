'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function AiSuggestionsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/transactions?aiSuggestions=true');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingSpinner category="default" />
    </div>
  );
}
