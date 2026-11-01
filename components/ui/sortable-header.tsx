'use client';

import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SortDirection, SortState } from '@/lib/hooks/use-table-sort';

export interface SortableHeaderProps<T extends string = string> {
  column: T | any;
  sort?: SortState<T> | null;
  onSort?: (column: T) => void;
  title?: string;
  children?: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  className?: string;
  dragHandleProps?: Record<string, any>;
}

export function SortableHeader<T extends string = string>({
  column,
  sort,
  onSort,
  title,
  children,
  align = 'left',
  className,
  dragHandleProps,
}: SortableHeaderProps<T>) {
  const content = children || title;

  // Handle TanStack table column object
  if (column && typeof column === 'object' && typeof column.getCanSort === 'function') {
    const canSort = column.getCanSort();
    const sorted = column.getIsSorted(); // 'asc' | 'desc' | false
    return (
      <div className={cn('flex items-center gap-1', className)}>
        {dragHandleProps && (
          <span
            {...dragHandleProps}
            className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            <GripVertical className="h-3 w-3" />
          </span>
        )}
        {canSort ? (
          <button
            type="button"
            onClick={() => column.toggleSorting(sorted === 'asc')}
            className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer select-none text-xs font-semibold"
          >
            <span>{content}</span>
            {sorted === 'asc' ? (
              <ArrowUp className="ml-0.5 h-3 w-3 text-primary" />
            ) : sorted === 'desc' ? (
              <ArrowDown className="ml-0.5 h-3 w-3 text-primary" />
            ) : (
              <ArrowUpDown className="ml-0.5 h-3 w-3 opacity-50" />
            )}
          </button>
        ) : (
          <span>{content}</span>
        )}
      </div>
    );
  }

  // Standard controlled sort
  const isSorted = sort?.column === column;
  const direction: SortDirection | null = isSorted ? sort.direction : null;

  const alignClass =
    align === 'right'
      ? 'justify-end text-right'
      : align === 'center'
      ? 'justify-center text-center'
      : 'justify-start text-left';

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {dragHandleProps && (
        <span
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0"
        >
          <GripVertical className="h-3 w-3" />
        </span>
      )}
      <button
        type="button"
        onClick={() => onSort?.(column as T)}
        className={cn(
          'group inline-flex items-center gap-1.5 font-semibold text-xs transition-colors hover:text-foreground select-none cursor-pointer',
          isSorted ? 'text-primary' : 'text-muted-foreground',
          alignClass
        )}
      >
        <span>{content}</span>
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
    </div>
  );
}
