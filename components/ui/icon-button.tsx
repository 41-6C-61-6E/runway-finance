'use client';

import * as React from 'react';

import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Glyph-only action button with a *required* accessible label.
 *
 * The header dropdowns (`settings-dropdown.tsx`, `bug-reporting-dropdown.tsx`)
 * are the one good icon-button pattern in the app: 32x32 hit area, hover fill,
 * real aria-label. This productizes that exact pattern so it stops being
 * copy-pasted and so TypeScript enforces the label the audit found missing
 * everywhere else (22px unlabeled row buttons on /budgets, /goals, /data).
 *
 * Usage:
 * ```tsx
 * <IconButton label="Delete" onClick={onDelete}>
 *   <Trash2 className="h-4 w-4" />
 * </IconButton>
 *
 * // compact row affordance: keep 16px glyphs in a 24px target
 * <IconButton size="sm" label="Copy" className="-m-0.5 p-0.5" onClick={copy}>
 *   <Copy className="h-4 w-4" />
 * </IconButton>
 * ````
 *
 * For "i" info glyphs use `IconTip` instead — it adds the tooltip.
 */
export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Accessible name. REQUIRED — an icon button without a label is
   * unreadable by AT. Also used as the `title` tooltip unless `title` is
   * given explicitly.
   */
  label: string;
  /** 32x32 (default, matches the header dropdown triggers) or 24x24. */
  size?: 'md' | 'sm';
  /** Override the tooltip text shown on hover. */
  title?: string;
  variant?: 'ghost' | 'outline' | 'secondary' | 'destructive';
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, size = 'md', title, variant = 'ghost', className, type, ...props }, ref) => (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      title={title ?? label}
      className={cn(
        buttonVariants({ variant, className }),
        size === 'md' && 'h-8 w-8 p-0 hover:bg-accent hover:text-accent-foreground',
        size === 'sm' && 'h-6 w-6 p-0 hover:bg-accent hover:text-accent-foreground',
        className
      )}
      {...props}
    />
  )
);
IconButton.displayName = 'IconButton';

export { IconButton };
