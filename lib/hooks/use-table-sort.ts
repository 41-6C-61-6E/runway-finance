'use client';

import { useState, useMemo, useCallback } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface SortState<T extends string = string> {
  column: T;
  direction: SortDirection;
}

/**
 * Hook to manage 2-state or 3-state (with clear) table sorting logic.
 */
export function useTableSort<T extends string = string>(
  defaultColumn?: T,
  defaultDirection: SortDirection = 'asc',
  allowClear = true
) {
  const [sort, setSort] = useState<SortState<T> | null>(
    defaultColumn ? { column: defaultColumn, direction: defaultDirection } : null
  );

  const toggleSort = useCallback(
    (column: T) => {
      setSort((prev) => {
        if (!prev || prev.column !== column) {
          return { column, direction: defaultDirection };
        }
        if (prev.direction === 'asc') {
          return { column, direction: 'desc' };
        }
        if (allowClear) {
          return null;
        }
        return { column, direction: 'asc' };
      });
    },
    [defaultDirection, allowClear]
  );

  return {
    sort,
    setSort,
    toggleSort,
  };
}
