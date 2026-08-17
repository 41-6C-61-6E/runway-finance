'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled root global error:', error);
    try {
      fetch('/api/logs/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorName: error?.name || 'GlobalError',
          errorMessage: error?.message || 'Root layout exception',
          errorStack: error?.stack,
          url: typeof window !== 'undefined' ? window.location.href : '',
        }),
      }).catch(() => {});
    } catch {
      // Ignored
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-background text-foreground font-sans antialiased min-h-screen flex items-center justify-center p-6">
        <div className="flex flex-col items-center justify-center max-w-md w-full text-center select-none bg-card border border-border p-8 rounded-2xl shadow-xl">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-destructive/10 text-destructive mb-6">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold mb-3 tracking-tight">Application Error</h1>
          <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
            A critical error occurred while rendering the application. We have logged this issue for investigation.
          </p>
          <div className="flex gap-3 justify-center w-full">
            <Button onClick={() => reset()} variant="default" className="flex-1">
              <RefreshCw className="w-4 h-4 mr-2" />
              Try again
            </Button>
            <Button onClick={() => window.location.href = '/'} variant="outline" className="flex-1">
              Home
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
