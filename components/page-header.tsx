'use client';

import React from 'react';
import { useSidebar } from '@/components/sidebar-context';
import SettingsDropdown from '@/components/settings-dropdown';
import UserDropdown from '@/components/user-dropdown';
import BugReportingDropdown from '@/components/bug-reporting-dropdown';

interface PageHeaderProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  leftExtra?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageHeader({ title, icon: Icon, leftExtra, children }: PageHeaderProps) {
  const { sidebarWidth } = useSidebar();

  return (
    <>
      {/* Mobile-only fixed floating actions pill */}
      <div 
        style={{
          top: 'calc(env(safe-area-inset-top) + 8px)',
        } as React.CSSProperties}
        className="fixed right-4 z-40 md:hidden flex items-center gap-1 py-1 px-1.5 rounded-full border border-sidebar-border/25 bg-sidebar/35 backdrop-blur-2xl shadow-md"
      >
        <BugReportingDropdown />
        <SettingsDropdown />
        <UserDropdown />
      </div>

      {/* Mobile-only scrolling title & children container */}
      <div className="flex flex-col gap-3 px-4 pt-[calc(env(safe-area-inset-top)+20px)] pb-3 md:hidden w-full">
        <div className="flex items-center gap-3">
          <Icon className="w-6 h-6 text-primary flex-shrink-0" />
          <h1 className="text-xl font-normal tracking-tight text-foreground truncate">{title}</h1>
          {leftExtra}
        </div>
        {children && (
          <div className="flex items-center gap-1.5 w-full overflow-x-auto no-scrollbar justify-start pb-1">
            {children}
          </div>
        )}
      </div>

      {/* Desktop-only header bar */}
      <div 
        style={{ 
          '--sidebar-width': `${sidebarWidth}px`
        } as React.CSSProperties}
        className="hidden md:flex relative sticky top-0 z-40 px-6 py-4 border-b border-border/30 bg-background/45 backdrop-blur-xl flex-row items-center justify-between pl-[var(--sidebar-width)] transition-all duration-200 w-full"
      >
        <div className="flex items-center gap-3">
          <Icon className="w-6 h-6 text-primary flex-shrink-0" />
          <h1 className="text-xl font-normal tracking-tight text-foreground truncate">{title}</h1>
          {leftExtra}
        </div>
        
        {children && (
          <div className="flex items-center gap-1.5 overflow-visible justify-end">
            {children}
          </div>
        )}

        <div className="flex items-center gap-1">
          <BugReportingDropdown />
          <SettingsDropdown />
          <UserDropdown />
        </div>
      </div>
    </>
  );
}
