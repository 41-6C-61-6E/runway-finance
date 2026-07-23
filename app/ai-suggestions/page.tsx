'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AiSuggestionsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/transactions?aiSuggestions=true');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center text-muted-foreground">
      Redirecting to Transactions AI Suggestions...
    </div>
  );
}
