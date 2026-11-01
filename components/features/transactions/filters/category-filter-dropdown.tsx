'use client';

import React, { useState, useEffect, useRef } from 'react';

export type FilterCategory = {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
};

interface CategoryFilterDropdownProps {
  selectedCategoryIds: string[];
  categoryItems: { id: string; name?: string }[];
  categories: FilterCategory[];
  handleCategoryIdsChange: (ids: string[]) => void;
}

export function CategoryFilterDropdown({
  selectedCategoryIds,
  categoryItems,
  categories,
  handleCategoryIdsChange,
}: CategoryFilterDropdownProps) {
  const [categoryIdsOpen, setCategoryIdsOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const categoryIdsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (categoryIdsRef.current && !categoryIdsRef.current.contains(e.target as Node)) {
        setCategoryIdsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const parents = categories.filter((c) => !c.parentId);
  const getChildren = (parentId: string) => categories.filter((c) => c.parentId === parentId);

  const matches = (name: string) =>
    !categorySearch || name.toLowerCase().includes(categorySearch.toLowerCase());

  return (
    <div className="relative z-30" ref={categoryIdsRef}>
      <button
        type="button"
        onClick={() => {
          setCategoryIdsOpen(!categoryIdsOpen);
          if (!categoryIdsOpen) setCategorySearch('');
        }}
        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
          selectedCategoryIds.length > 0
            ? 'bg-primary/15 border border-primary text-primary'
            : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
        }`}
      >
        <span className="text-xs">Categories</span>
        {selectedCategoryIds.length > 0 && (
          <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-primary/25 text-primary rounded-full min-w-[20px] text-center">
            {selectedCategoryIds.length}
          </span>
        )}
        <svg
          className={`h-3.5 w-3.5 transition-transform ${categoryIdsOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {categoryIdsOpen && (
        <div className="absolute top-full left-0 sm:right-0 sm:left-auto mt-2 w-64 bg-card border border-border rounded-lg shadow-xl z-50 max-h-96 flex flex-col">
          <div className="p-2 border-b border-border/50">
            <input
              type="text"
              value={categorySearch}
              onChange={(e) => setCategorySearch(e.target.value)}
              placeholder="Search categories..."
              className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
            />
          </div>
          <div className="overflow-y-auto flex-1 p-1">
            <label className="flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
              <input
                type="checkbox"
                checked={selectedCategoryIds.length === categoryItems.length && categoryItems.length > 0}
                onChange={() => {
                  if (selectedCategoryIds.length === categoryItems.length) {
                    handleCategoryIdsChange([]);
                  } else {
                    handleCategoryIdsChange(categoryItems.map((c) => c.id));
                  }
                }}
                className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
              />
              Select All
            </label>
            {(!categorySearch || matches('uncategorized')) && (
              <label className="flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30">
                <input
                  type="checkbox"
                  checked={selectedCategoryIds.includes('uncategorized')}
                  onChange={() => {
                    const next = selectedCategoryIds.includes('uncategorized')
                      ? selectedCategoryIds.filter((id) => id !== 'uncategorized')
                      : [...selectedCategoryIds, 'uncategorized'];
                    handleCategoryIdsChange(next);
                  }}
                  className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                />
                Uncategorized
              </label>
            )}
            {parents.map((parent) => {
              const allChildren = getChildren(parent.id);
              const matchingChildren = allChildren.filter(
                (child) => matches(child.name) || matches(parent.name)
              );
              const hasChildren = allChildren.length > 0;

              if (categorySearch && !matches(parent.name) && matchingChildren.length === 0) {
                return null;
              }

              if (!hasChildren) {
                return (
                  <label
                    key={parent.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCategoryIds.includes(parent.id)}
                      onChange={() => {
                        const next = selectedCategoryIds.includes(parent.id)
                          ? selectedCategoryIds.filter((id) => id !== parent.id)
                          : [...selectedCategoryIds, parent.id];
                        handleCategoryIdsChange(next);
                      }}
                      className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                      style={{ backgroundColor: parent.color }}
                    />
                    {parent.name}
                  </label>
                );
              }

              // Parent with children
              const allChildIds = allChildren.map((c) => c.id);
              const selectedChildCount = allChildIds.filter((id) => selectedCategoryIds.includes(id)).length;
              const isParentSelected = selectedCategoryIds.includes(parent.id);
              const isAllSelected =
                isParentSelected || (allChildIds.length > 0 && selectedChildCount === allChildIds.length);
              const isPartial = !isAllSelected && (selectedChildCount > 0 || isParentSelected);

              return (
                <div key={parent.id} className="border-b border-border/30 last:border-b-0">
                  <label className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted/50 cursor-pointer transition-colors bg-muted/20">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isPartial;
                      }}
                      onChange={() => {
                        let next: string[];
                        if (isAllSelected || isParentSelected) {
                          // Deselect parent and its children
                          next = selectedCategoryIds.filter(
                            (id) => id !== parent.id && !allChildIds.includes(id)
                          );
                        } else {
                          // Select parent and its children
                          next = Array.from(new Set([...selectedCategoryIds, parent.id, ...allChildIds]));
                        }
                        handleCategoryIdsChange(next);
                      }}
                      className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                      style={{ backgroundColor: parent.color }}
                    />
                    <span className="uppercase tracking-wider">{parent.name}</span>
                  </label>
                  {matchingChildren.map((child) => (
                    <label
                      key={child.id}
                      className="flex items-center gap-2 pl-7 pr-3 py-1.5 text-sm text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-t border-border/20"
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategoryIds.includes(child.id)}
                        onChange={() => {
                          const next = selectedCategoryIds.includes(child.id)
                            ? selectedCategoryIds.filter((id) => id !== child.id && id !== parent.id)
                            : [...selectedCategoryIds, child.id];
                          handleCategoryIdsChange(next);
                        }}
                        className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                      />
                      <span
                        className="w-2 h-2 rounded-full inline-block flex-shrink-0"
                        style={{ backgroundColor: child.color }}
                      />
                      {child.name}
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
