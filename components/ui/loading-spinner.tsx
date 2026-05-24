'use client';

import { useEffect, useState } from 'react';
import messages from '@/config/loading-messages.json';

type LoadingCategory = keyof typeof messages;

interface LoadingSpinnerProps {
  category?: LoadingCategory;
  message?: string;
  className?: string;
}

export function LoadingSpinner({ category = 'default', message, className = '' }: LoadingSpinnerProps) {
  const pool = message ? [message] : messages[category] || messages.default;
  const [index, setIndex] = useState(() => Math.floor(Math.random() * pool.length));

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % pool.length);
    }, 1000);
    return () => clearInterval(interval);
  }, [pool.length]);

  return (
    <div className={`flex items-center justify-center text-muted-foreground ${className}`}>
      <div className="text-center">
        <div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin mx-auto mb-2" />
        <p className="text-xs">{pool[index]}</p>
      </div>
    </div>
  );
}
