'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Check } from 'lucide-react';

interface BulkActionsToolbarProps {
  selectedIds: string[];
  onClear: () => void;
  totalCount: number;
  selectAllMatching: boolean;
  onSelectAllMatching: () => void;
  filters: Record<string, string | null>;
}

type Category = {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
};

export default function BulkActionsToolbar({ selectedIds, onClear, totalCount, selectAllMatching, onSelectAllMatching, filters }: BulkActionsToolbarProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categorySearch, setCategorySearch] = useState('');
  const categoryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (categoryDropdownOpen) {
      fetch('/api/categories', { credentials: 'include' })
        .then((res) => res.json())
        .then((data) => setCategories(Array.isArray(data) ? data : []))
        .catch(() => setCategories([]));
    }
  }, [categoryDropdownOpen]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (categoryRef.current && !categoryRef.current.contains(e.target as Node)) {
        setCategoryDropdownOpen(false);
        setCategorySearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleBulkPatch = useCallback(
    async (updates: Record<string, unknown>) => {
      const action = Object.keys(updates)[0] || 'patch';
      setActionLoading(action);
      try {
        let body: Record<string, unknown>;
        if (selectAllMatching) {
          body = { selectAllMatching: true, patch: updates };
          for (const [key, value] of Object.entries(filters)) {
            if (value !== null) {
              body[key] = value;
            }
          }
        } else {
          body = { ids: selectedIds, patch: updates };
        }
        const res = await fetch('/api/transactions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          console.error('Bulk patch failed', data);
          return;
        }
        if (data.updated === 0) {
          console.warn('Bulk patch: 0 rows updated', { body, patch: updates });
        }
        onClear();
      } catch (err) {
        console.error('Bulk patch error', err);
      } finally {
        setActionLoading(null);
      }
    },
    [selectedIds, selectAllMatching, filters, onClear]
  );

  const handleSetCategory = useCallback(
    async (categoryId: string | null) => {
      setCategoryDropdownOpen(false);
      setCategorySearch('');
      await handleBulkPatch({ categoryId });
    },
    [handleBulkPatch]
  );

  const parents = categories.filter((c) => !c.parentId);
  const getChildren = (parentId: string) =>
    categories.filter((c) => c.parentId === parentId);
  const matches = (name: string) =>
    !categorySearch || name.toLowerCase().includes(categorySearch.toLowerCase());

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-xl mb-4">
      {selectAllMatching ? (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
          <Check className="h-4 w-4" />
          All {totalCount} transactions selected
        </span>
      ) : (
        <span className="text-sm text-primary font-medium">{selectedIds.length} selected</span>
      )}
      {!selectAllMatching && selectedIds.length < totalCount && (
        <>
          <div className="h-4 w-px bg-border" />
          <button
            onClick={onSelectAllMatching}
            className="px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
          >
            Select all {totalCount} transactions
          </button>
        </>
      )}
      <div className="h-4 w-px bg-border" />
      <button
        onClick={() => handleBulkPatch({ reviewed: true })}
        disabled={actionLoading !== null}
        className="px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors disabled:opacity-50"
      >
        Mark Reviewed
      </button>
      <button
        onClick={() => handleBulkPatch({ ignored: true })}
        disabled={actionLoading !== null}
        className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
      >
        Mark Ignored
      </button>
      <div className="relative" ref={categoryRef}>
        <button
          onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
          disabled={actionLoading !== null}
          className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted hover:bg-accent rounded-lg transition-colors disabled:opacity-50"
        >
          Set Category
        </button>
        {categoryDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-card border border-border rounded-lg shadow-lg z-50 max-h-72 flex flex-col">
            <div className="p-2 border-b border-border">
              <input
                type="text"
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Search categories..."
                autoFocus
                className="w-full px-2 py-1 bg-background border border-input rounded text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="overflow-y-auto flex-1 p-1">
              <button
                onClick={() => handleSetCategory(null)}
                className="w-full text-left px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted rounded cursor-pointer"
              >
                None
              </button>
              {parents.map((parent) => {
                const children = getChildren(parent.id).filter(
                  (c) => matches(c.name) || matches(parent.name)
                );
                if (!categorySearch && children.length === 0) {
                  if (!matches(parent.name)) return null;
                  return (
                    <button
                      key={parent.id}
                      onClick={() => handleSetCategory(parent.id)}
                      className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs text-foreground/80 hover:bg-muted rounded cursor-pointer"
                    >
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: parent.color }} />
                      {parent.name}
                    </button>
                  );
                }
                if (children.length === 0) return null;
                return (
                  <div key={parent.id}>
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {parent.name}
                    </div>
                    {children.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => handleSetCategory(child.id)}
                        className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-xs text-foreground/80 hover:bg-muted rounded cursor-pointer"
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: child.color }} />
                        {child.name}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="flex-1" />
      <button
        onClick={onClear}
        className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        Clear Selection
      </button>
    </div>
  );
}
