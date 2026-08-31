'use client';

import { cn } from '@/lib/utils';
import { AppTabs, type TabItem } from '@/components/ui/app-tabs';

interface MobileTabStripProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
  /** Stretch every pill to share the width (page-level tab bar). Default true. */
  fullWidth?: boolean;
  'aria-label'?: string;
}

/**
 * Horizontally scrollable pill tab strip for mobile.
 *
 * Thin wrapper around `AppTabs` (pills variant): the scroll, hidden
 * scrollbar, and edge-fade affordance all live in the shared pills
 * implementation, so this stays in lockstep with every other pill row.
 */
export function MobileTabStrip({
  tabs,
  activeTab,
  onChange,
  className,
  fullWidth = true,
  'aria-label': ariaLabel,
}: MobileTabStripProps) {
  return (
    <div className={cn('min-w-0 w-full', className)}>
      <div className="overflow-x-auto no-scrollbar scroll-contain-x touch-pan-x">
        <AppTabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={onChange}
          variant="pills"
          fullWidth={fullWidth}
          aria-label={ariaLabel}
        />
      </div>
    </div>
  );
}
