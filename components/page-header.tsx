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
      className="relative sticky top-0 z-40 px-4 md:pr-6 py-4 pt-[calc(env(safe-area-inset-top)+1rem)] md:pt-4 flex flex-col md:flex-row gap-3 md:items-center justify-between transition-all duration-200 md:pl-[var(--sidebar-width)]"
    >
      {/* Gradient-masked glassmorphic background panel */}
      <div 
        className={`absolute inset-0 -z-10 transition-all duration-200 ${
          reduceTransparency 
            ? 'bg-background' 
            : 'bg-card/15 backdrop-blur-md'
        }`}
        style={!reduceTransparency ? {
          WebkitMaskImage: 'linear-gradient(to bottom, black 50%, rgba(0, 0, 0, 0.8) 75%, rgba(0, 0, 0, 0.3) 90%, transparent 100%)',
          maskImage: 'linear-gradient(to bottom, black 50%, rgba(0, 0, 0, 0.8) 75%, rgba(0, 0, 0, 0.3) 90%, transparent 100%)',
        } : {}}
      />
      <div className="flex items-center justify-between w-full md:w-auto">
        <div className="flex items-center gap-3">
          <Icon className="w-6 h-6 text-primary flex-shrink-0" />
          <h1 className="text-xl font-normal tracking-tight text-foreground truncate">{title}</h1>
          {leftExtra}
        </div>
        <div className="flex md:hidden items-center gap-1">
          <SettingsDropdown />
          <UserDropdown />
        </div>
      </div>
      
      {children && (
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto md:overflow-visible no-scrollbar justify-start md:justify-end pb-1 md:pb-0">
          {children}
        </div>
      )}

      <div className="hidden md:flex items-center gap-1">
        <SettingsDropdown />
        <UserDropdown />
      </div>
    </div>
  );
}
