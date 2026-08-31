'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Shared "glass capsule" design tokens — the single source of truth for all
 * translucent floating chrome in the app:
 *
 *  - bottom nav bar            (components/mobile-nav.tsx)
 *  - floating sub-nav capsule  (components/mobile-nav.tsx)
 *  - SegPill segmented selectors (this file)
 *  - top-right header actions  (page-header + the dropdown triggers)
 *  - AppTabs "pills" variant   (components/ui/app-tabs.tsx)
 *
 * Tweak a token here and every surface changes in unison. Built on the
 * `--sidebar` tokens + explicit backdrop-blur so they survive the global
 * "flat / cardless" `.bg-card` resets in styles/globals.css.
 */

/** Translucent glass surface for pill-sized capsules (sub-nav, selectors, tab pills). */
export const glassSurface =
  'bg-sidebar/55 backdrop-blur-md border border-sidebar-border/25';

/**
 * Alias of glassSurface — larger fixed chrome (bottom nav bar, top action
 * bar) uses the exact same glass, kept as a named alias for readability.
 */
export const glassBar = glassSurface;

/** Base classes shared by every item/button inside a glass capsule. */
export const glassItemBase =
  'rounded-full transition-all duration-200 cursor-pointer select-none';

/** Selected/active state for glass items (matches the bottom nav). */
export const glassItemActive = 'text-primary bg-primary/20 font-semibold shadow-xs';

/** Unselected/active-on-hover state for glass items (matches the bottom nav). */
export const glassItemInactive =
  'text-sidebar-foreground/65 hover:text-sidebar-foreground hover:bg-sidebar-foreground/8 font-medium';

/** Base classes for square/round icon buttons that live inside a glass bar. */
export const glassIconButton =
  'relative inline-flex items-center justify-center p-2 min-w-10 min-h-10 rounded-full active:scale-95';

export interface SegPillOption<T extends string = string> {
  id: T;
  label: string;
  disabled?: boolean;
}

interface SegPillProps<T extends string = string> {
  options: SegPillOption<T>[];
  /** Single-select mode. */
  value?: T;
  onChange?: (value: T) => void;
  /** Multi-select mode (toggles). */
  values?: Set<T>;
  onToggle?: (value: T) => void;
  /** Truncate long labels to fit narrow containers (debt-breakdown style). */
  truncateLabels?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * Segmented selector pill in the shared glass capsule style.
 *
 * Single-select: pass `value` + `onChange`.
 * Multi-select:  pass `values` + `onToggle`.
 */
export function SegPill<T extends string = string>({
  options,
  value,
  onChange,
  values,
  onToggle,
  truncateLabels = false,
  className,
  'aria-label': ariaLabel,
}: SegPillProps<T>) {
  const isMulti = !!(values && onToggle);

  return (
    <div
      className={cn(
        'inline-flex w-max items-center gap-1 p-1 rounded-full select-none',
        truncateLabels && 'min-w-0 max-w-full',
        glassSurface,
        className
      )}
      aria-label={ariaLabel}
    >
      {options.map((option) => {
        const selected = isMulti ? values!.has(option.id) : value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            disabled={option.disabled}
            onClick={() => (onToggle ? onToggle(option.id) : onChange?.(option.id))}
            aria-pressed={selected}
            className={cn(
              'py-1 px-2.5 min-h-9 text-xs whitespace-nowrap active:scale-95',
              truncateLabels && 'min-w-0 flex-[0_1_auto]',
              option.disabled && 'opacity-50 pointer-events-none',
              glassItemBase,
              selected ? glassItemActive : glassItemInactive
            )}
          >
            {truncateLabels ? <span className="block truncate">{option.label}</span> : option.label}
          </button>
        );
      })}
    </div>
  );
}
