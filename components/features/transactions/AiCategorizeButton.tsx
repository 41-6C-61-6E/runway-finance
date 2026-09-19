'use client';

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

type Props = {
  transactionId: string;
  onSuggested?: () => void;
  className?: string;
};

/**
 * Small "Ask AI" button for a single uncategorized transaction. Creates one
 * pending proposal for review — never auto-approves.
 */
export default function AiCategorizeButton({ transactionId, onSuggested, className }: Props) {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ai/analyze-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ transactionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        toast.success(data.message || 'AI suggestion created.');
        onSuggested?.();
      } else {
        toast.error(data.error || 'AI analysis failed.');
      }
    } catch {
      toast.error('Failed to reach server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          aria-label="Ask AI to categorize this transaction"
          className={`inline-flex items-center justify-center p-1 rounded-md text-primary/70 hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 ${className ?? ''}`}
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        Ask AI to categorize
      </TooltipContent>
    </Tooltip>
  );
}
