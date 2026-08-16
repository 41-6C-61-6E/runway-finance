'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import messages from '@/config/loading-messages.json';
import { cn } from '@/lib/utils';

type LoadingCategory = keyof typeof messages;

export interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className }: SpinnerProps) {
  const sizeClasses = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-5 h-5',
    lg: 'w-8 h-8',
  };

  return (
    <Loader2
      className={cn('animate-spin text-current shrink-0', sizeClasses[size], className)}
    />
  );
}

export interface LoadingSpinnerProps {
  category?: LoadingCategory;
  message?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingSpinner({
  category = 'default',
  message,
  className = '',
  size = 'md',
}: LoadingSpinnerProps) {
  const pool = message ? [message] : messages[category] || messages.default;
  const [index, setIndex] = useState(0);

  const spinnerSizes = {
    sm: 'w-4 h-4 border-2 mb-1',
    md: 'w-7 h-7 border-2 mb-2',
    lg: 'w-10 h-10 border-3 mb-3',
  };

  useEffect(() => {
    setIndex(Math.floor(Math.random() * pool.length));

    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % pool.length);
    }, 1000);
    return () => clearInterval(interval);
  }, [pool.length]);

  return (
    <div className={cn('flex items-center justify-center text-muted-foreground', className)}>
      <div className="text-center">
        <div
          className={cn(
            'border-border border-t-primary rounded-full animate-spin mx-auto',
            spinnerSizes[size]
          )}
        />
        {pool[index] && <p className="text-xs">{pool[index]}</p>}
      </div>
    </div>
  );
}
