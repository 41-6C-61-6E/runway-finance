'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console
    console.error('Unhandled app-level error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center select-none">
      <div className="flex items-center justify-center w-14 h-14 rounded-full bg-destructive/10 text-destructive mb-4">
        <AlertCircle className="w-7 h-7" />
      </div>
      <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
      <p className="text-muted-foreground text-sm max-w-md mb-6 leading-relaxed">
        An unexpected error occurred while rendering this page. You can try to reset the component or reload the application.
      </p>
      {error.message && (
        <div className="mb-6 p-3 bg-muted/50 border border-border/60 rounded text-left font-mono text-xs max-w-lg overflow-auto select-text text-destructive">
          <strong>{error.name || 'Error'}:</strong> {error.message}
        </div>
      )}
      <div className="flex gap-3 justify-center">
        <Button onClick={() => reset()} variant="default" size="sm">
          Try again
        </Button>
        <Button onClick={() => window.location.reload()} variant="outline" size="sm">
          Reload page
        </Button>
      </div>
    </div>
  );
}
