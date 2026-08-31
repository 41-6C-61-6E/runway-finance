'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Styled native `<select>`.
 *
 * 113 native selects across the app render with OS-native chrome, so arrows
 * and heights look inconsistent next to the `Input`s they sit beside. This
 * keeps the element native — keyboard handling, ARIA, and form semantics all
 * stay exactly the same — and only restyles the collapsed control:
 * `appearance-none` + right-parked `ChevronDown`, with the same
 * border/radius/ring classes as `Input`.
 *
 * ```tsx
 * <Select value={period} onChange={(e) => setPeriod(e.target.value)}>
 *   <option value="weekly">Weekly</option>
 *   <option value="monthly">Monthly</option>
 * </Select>
 * ```
 */
export interface SelectProps extends React.ComponentProps<'select'> {
  /**
   * Classes for the relatively-positioned wrapper (it becomes the flex/grid
   * item in place of the old `<select>`). Widths like `w-40` go here, not in
   * `className` (which targets the `<select>` itself).
   */
  wrapperClassName?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, wrapperClassName, children, ...props }, ref) => (
    <div className={cn('relative w-full', wrapperClassName)}>
      <select
        ref={ref}
        className={cn(
          'flex h-10 w-full appearance-none rounded-lg border border-input bg-background px-3 pr-9 text-base md:text-sm text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
);
Select.displayName = 'Select';

export { Select };
