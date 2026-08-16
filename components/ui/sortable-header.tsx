'use client';

import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SortDirection, SortState } from '@/lib/hooks/use-table-sort';

export interface SortableHeaderProps<T extends string = string> {
  column: T;
  sort: SortState<T> | null;
  onSort: (column: T) => void;
  children: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
}

export function SortableHeader<T extends string = string>({
  column,
  sort,
  onSort,
  children,
  align = 'left',
  className,
}: SortableHeaderProps<T>) {
  const isSorted = sort?.column === column;
  const direction: SortDirection | null = isSorted ? sort.direction : null;

  const alignClass =
    align === 'right'
      ? 'justify-end text-right'
      : align === 'center'
      ? 'justify-center text-center'
      : 'justify-start text-left';

  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className={cn(
        'group inline-flex items-center gap-1.5 font-semibold text-xs transition-colors hover:text-foreground select-none cursor-pointer',
        isSorted ? 'text-primary' : 'text-muted-foreground',
        alignClass,
        className
      )}
    >
      <span>{children}</span>
      <span className="shrink-0 text-muted-foreground/60 group-hover:text-foreground">
        {direction === 'asc' ? (
          <ArrowUp className="w-3.5 h-3.5 text-primary" />
        ) : direction === 'desc' ? (
          <ArrowDown className="w-3.5 h-3.5 text-primary" />
        ) : (
          <ArrowUpDown className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
        )}
      </span>
    </button>
  );
}
