'use client';

import React from 'react';
import { useReduceTransparency } from '@/lib/hooks/use-reduce-transparency';
import { useSidebar } from '@/components/sidebar-context';
import SettingsDropdown from '@/components/settings-dropdown';
import UserDropdown from '@/components/user-dropdown';

interface PageHeaderProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  leftExtra?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({ title, icon: Icon, leftExtra, children }: PageHeaderProps) {
  const { reduceTransparency } = useReduceTransparency();
  const { sidebarWidth } = useSidebar();

  return (
    <div 
      style={{ 
        '--sidebar-width': `${sidebarWidth}px`
      } as React.CSSProperties}
      className={`border-b border-border/40 sticky top-0 z-40 pr-6 py-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:pt-4 flex items-center justify-between transition-all duration-200 pl-4 md:pl-[var(--sidebar-width)] ${
        reduceTransparency 
          ? 'bg-card' 
          : 'bg-card/10 backdrop-blur-md'
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className="w-6 h-6 text-primary" />
        <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
        {leftExtra}
      </div>
      <div className="flex items-center gap-1">
        {children}
        <SettingsDropdown />
        <UserDropdown />
      </div>
    </div>
  );
}
