'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * ListRow — accessible, tappable list row (W-15).
 *
 * Renders a REAL interactive element so rows are keyboard-reachable and carry
 * correct semantics:
 *   - href        → <a href>  (native link, Tab-focusable, Enter activates)
 *   - onActivate  → <button type="button">
 *   - neither     → <div> (plain, non-interactive)
 *
 * Press feedback: hover bg + `active:` pressed bg flash. An optional trailing
 * chevron acts as the "tappable" affordance (mobile-first, hidden >=md unless
 * showChevronAlways).
 *
 * The caller's `children` become the row body. Pass `bodyClassName` to control
 * the body's own layout (flex row, grid columns, etc.); by default the body is
 * a centered flex row that fills the available width.
 */
export interface ListRowProps {
  children: React.ReactNode;
  /** When set, renders a native <a href> (link semantics). */
  href?: string;
  /** When set (and no href), renders a real <button type="button">. */
  onActivate?: () => void;
  /** Which shell to use when onActivate is set (and no href):
   *  - 'button' (default): a real <button> — use when the row has NO nested
   *    interactive elements (links, pill buttons).
   *  - 'div': <div role="button" tabIndex={0}> — required when the row
   *    CONTAINS nested interactive elements (button/link), which are invalid
   *    inside a <button>. Same keyboard support (Enter/Space activate). */
  element?: 'button' | 'div';
  /** Accessible name. Required in screen-reader terms when the visible text is
   *  not a self-explanatory label. */
  ariaLabel?: string;
  /** Extra classes for the interactive shell. */
  className?: string;
  /** Extra classes for the inner body. Layout (flex/grid) is the caller's job;
   *  defaults to a centered flex row. */
  bodyClassName?: string;
  /** Show the trailing chevron affordance. Hidden >=md unless showChevronAlways. */
  showChevron?: boolean;
  /** Keep the chevron visible on desktop too. */
  showChevronAlways?: boolean;
  /** Enforce a >=44px touch target by padding the shell. */
  minTouchHeight?: boolean;
  /** Data attribute marker for probes/screenshots. */
  'data-list-row'?: string;
}

export function ListRow({
  children,
  href,
  onActivate,
  ariaLabel,
  element = 'button',
  className,
  bodyClassName,
  showChevron = true,
  showChevronAlways = false,
  minTouchHeight = true,
  'data-list-row': dataRow,
}: ListRowProps) {
  const chevron = showChevron ? (
    <span
      className={cn(
        'shrink-0 text-muted-foreground/40 flex items-center justify-center self-center',
        showChevronAlways ? '' : 'md:hidden'
      )}
      aria-hidden="true"
    >
      <ChevronRight className="w-4 h-4" />
    </span>
  ) : null;

  const shellClass = cn(
    'group/listrow flex w-full items-center text-left touch-manipulation select-none',
    'hover:bg-muted/50 active:bg-muted transition-colors',
    'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
    'cursor-pointer',
    minTouchHeight && 'min-h-[44px]',
    className
  );

  const body = (
    <div
      className={cn(
        'min-w-0 flex-1 min-h-full',
        bodyClassName ?? 'flex items-center gap-2 px-1'
      )}
    >
      {children}
    </div>
  );

  const shared: { 'data-list-row'?: string } = {
    'data-list-row': dataRow,
  };

  if (href) {
    return (
      <Link
        href={href}
        aria-label={ariaLabel}
        className={shellClass}
        {...shared}
      >
        {body}
        {chevron}
      </Link>
    );
  }

  if (onActivate) {
    // 'div' mode: rows containing NESTED interactive elements (links/buttons)
    // must not use a real <button> (invalid HTML); a role-="button" div with
    // the same keyboard support is the accessible substitute.
    if (element === 'div') {
      return (
        <div
          role="button"
          tabIndex={0}
          onClick={onActivate}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onActivate();
            }
          }}
          aria-label={ariaLabel}
          className={shellClass}
          {...shared}
        >
          {body}
          {chevron}
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={onActivate}
        aria-label={ariaLabel}
        className={cn(shellClass, 'text-foreground bg-transparent border-none w-full')}
        {...shared}
      >
        {body}
        {chevron}
      </button>
    );
  }

  return (
    <div className={shellClass} {...shared}>
      {body}
      {chevron}
    </div>
  );
}

/**
 * RowAction — a per-row action button that is ALWAYS visible to touch users
 * (replaces the `opacity-0 group-hover:opacity-100` hover-only pencil pattern).
 * 30px minimum hit target with a padded flash on press.
 */
export function RowAction({
  label,
  onActivate,
  className,
  children,
}: {
  label: string;
  onActivate: (e: React.MouseEvent) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onActivate(e);
      }}
      className={cn(
        'shrink-0 inline-flex items-center justify-center rounded-md',
        'text-muted-foreground/50 hover:text-foreground hover:bg-muted transition-colors',
        'active:bg-muted active:text-foreground p-1 min-w-[30px] min-h-[30px]',
        className
      )}
    >
      {children}
    </button>
  );
}
