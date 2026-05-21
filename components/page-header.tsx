'use client';

import React from 'react';
import { useReduceTransparency } from '@/lib/hooks/use-reduce-transparency';

interface PageHeaderProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  leftExtra?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({ title, icon: Icon, leftExtra, children }: PageHeaderProps) {
  const { reduceTransparency } = useReduceTransparency();

  return (
    <div className={`border-b border-border/40 sticky top-0 z-40 pl-14 pr-6 py-4 flex items-center justify-between transition-all duration-200 ${
      reduceTransparency 
        ? 'bg-card' 
        : 'bg-card/10 backdrop-blur-md'
    }`}>
      <div className="flex items-center gap-3">
        <Icon className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
        {leftExtra}
      </div>
      {children}
    </div>
  );
}
