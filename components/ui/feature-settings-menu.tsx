'use client';

import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Settings, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * A single entry in the feature settings menu.
 */
export interface FeatureSettingsMenuEntry {
  id: string;
  icon: LucideIcon;
  label: string;
  /** Inline explanatory tip shown under the label. */
  tip?: string;
  /**
   * `primary` highlights the icon and label (main capabilities),
   * `danger` styles the entry for destructive actions.
   */
  variant?: 'primary' | 'danger' | 'normal';
  disabled?: boolean;
  /** Render a divider line below this entry. */
  dividerBelow?: boolean;
  onSelect: () => void;
}

export interface FeatureSettingsMenuProps {
  /** The menu entries, in display order. */
  items: FeatureSettingsMenuEntry[];
  /** Accessible label for the trigger button. */
  ariaLabel?: string;
  /** Short tooltip shown via the `title` attribute. */
  title?: string;
  /** Show a spinner instead of the gear (e.g. while scanning). */
  busy?: boolean;
  /** Popover alignment: 'start' | 'center' | 'end'. Defaults to 'end'. */
  align?: 'start' | 'center' | 'end';
  /** Additional content rendered below the entries (e.g. footer links). */
  children?: React.ReactNode;
  className?: string;
  /** Popover width class. Defaults to `w-72`. */
  contentClassName?: string;
}

/**
 * Standardized settings dropdown for feature pages (Transactions → Recurring,
 * Budgets, and future feature pages). Each entry shows an icon, a label, and an
 * inline explanatory tip, in a consistent style.
 */
export function FeatureSettingsMenu({
  items,
  ariaLabel = 'Feature settings',
  title,
  busy = false,
  align = 'end',
  children,
  className,
  contentClassName,
}: FeatureSettingsMenuProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className={cn('relative', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={ariaLabel}
            title={title ?? ariaLabel}
            className="inline-flex items-center justify-center h-8 w-8 text-xs font-medium text-foreground bg-card hover:bg-accent border border-border rounded-xl transition-all shrink-0 cursor-pointer focus:outline-none shadow-2xs"
          >
            {busy ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            ) : (
              <Settings className="w-4 h-4 shrink-0 text-muted-foreground hover:text-foreground" />
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align={align} className={cn('w-72 p-1.5 z-50', contentClassName)}>
          <div className="space-y-1">
            {items.map((entry) => {
              const Icon = entry.icon;
              const isDanger = entry.variant === 'danger';
              const isPrimary = entry.variant === 'primary';
              return (
                <React.Fragment key={entry.id}>
                  <button
                    type="button"
                    disabled={entry.disabled}
                    onClick={() => {
                      setOpen(false);
                      entry.onSelect();
                    }}
                    className={cn(
                      'w-full p-2 text-xs rounded-lg flex items-start gap-2.5 transition-colors cursor-pointer text-left disabled:opacity-50 disabled:cursor-default',
                      isDanger
                        ? 'text-destructive hover:bg-destructive/10'
                        : 'text-foreground hover:bg-accent'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-4 h-4 shrink-0 mt-0.5',
                        isDanger ? 'text-destructive' : isPrimary ? 'text-primary' : 'text-muted-foreground'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className={cn(isPrimary || isDanger ? 'font-medium' : 'font-semibold')}>
                        {entry.label}
                      </div>
                      {entry.tip && (
                        <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
                          {entry.tip}
                        </div>
                      )}
                    </div>
                  </button>
                  {entry.dividerBelow && <div className="h-px bg-border/40 my-1" />}
                </React.Fragment>
              );
            })}
          </div>
          {children}
        </PopoverContent>
      </Popover>
    </div>
  );
}
