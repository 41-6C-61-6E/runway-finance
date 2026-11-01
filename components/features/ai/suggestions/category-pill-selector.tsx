'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { Spinner } from '@/components/ui/loading-spinner';
import { Select } from '@/components/ui/select';
import type { Category } from './types';

interface CategoryPillSelectorProps {
  currentCategoryName: string | null;
  categories: Category[];
  onSelectCategory: (categoryId: string, categoryName: string, categoryColor: string) => void;
  onCategoryCreated?: (newCategory: Category) => void;
}

export function CategoryPillSelector({
  currentCategoryName,
  categories,
  onSelectCategory,
  onCategoryCreated,
}: CategoryPillSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [openUpward, setOpenUpward] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState<string | null>(null);
  const [newCategoryColor, setNewCategoryColor] = useState('#6366f1');
  const [newCategoryIsIncome, setNewCategoryIsIncome] = useState(false);
  const [creatingCategoryLoading, setCreatingCategoryLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setCategoryFilter('');
        setIsCreatingCategory(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const currentCat = categories.find(
    (c) => c.name.toLowerCase() === (currentCategoryName || '').toLowerCase()
  );
  const color = currentCat?.color || '#6366f1';
  const displayName = currentCategoryName || 'Uncategorized';

  const parents = categories.filter((c) => !c.parentId);
  const getChildren = (parentId: string) => categories.filter((c) => c.parentId === parentId);

  const filter = categoryFilter.toLowerCase();
  const filteredParents = filter
    ? parents.filter(
        (p) =>
          p.name.toLowerCase().includes(filter) ||
          getChildren(p.id).some((c) => c.name.toLowerCase().includes(filter))
      )
    : parents;

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    setCreatingCategoryLoading(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: newCategoryName.trim(),
          parentId: newCategoryParentId || null,
          color: newCategoryColor,
          isIncome: newCategoryIsIncome,
        }),
      });

      if (res.ok) {
        const createdData = await res.json();
        const createdCategory: Category = {
          id: createdData.id,
          name: newCategoryName.trim(),
          parentId: newCategoryParentId || null,
          color: newCategoryColor,
          isIncome: newCategoryIsIncome,
        };
        onCategoryCreated?.(createdCategory);
        onSelectCategory(createdCategory.id, createdCategory.name, createdCategory.color);
        setIsOpen(false);
        setIsCreatingCategory(false);
      }
    } catch (err) {
      console.error('Failed to create category', err);
    } finally {
      setCreatingCategoryLoading(false);
    }
  };

  return (
    <div className={`relative inline-flex items-center ${isOpen ? 'z-50' : ''}`} ref={containerRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (isOpen) {
            setIsOpen(false);
            setCategoryFilter('');
            setIsCreatingCategory(false);
          } else {
            const rect = e.currentTarget.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            setOpenUpward(spaceBelow < 290 && rect.top > 290);
            setAlignRight(rect.left + 260 > window.innerWidth);
            setIsOpen(true);
            setCategoryFilter('');
            setIsCreatingCategory(false);
          }
        }}
        className="group/cat inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all cursor-pointer hover:brightness-95 hover:shadow-xs active:scale-95"
        style={{
          backgroundColor: `${color}18`,
          color: color,
          borderColor: `${color}35`,
        }}
        title="Click to change category"
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />
        <span className="font-semibold">{displayName}</span>
        <ChevronDown className={`h-3 w-3 opacity-60 group-hover/cat:opacity-100 transition-transform shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 w-64 bg-card border border-border rounded-xl shadow-2xl max-h-80 flex flex-col text-xs overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
          } ${alignRight ? 'right-0' : 'left-0'}`}
          onClick={(e) => e.stopPropagation()}
        >
          {isCreatingCategory ? (
            <div className="p-3 space-y-2.5 flex flex-col text-xs">
              <div className="font-semibold text-foreground uppercase tracking-wider text-[10px]">
                New Category
              </div>
              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">
                  Name
                </label>
                <input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Category name"
                  className="w-full px-2 py-1 bg-background border border-input rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">
                  Parent Category
                </label>
                <Select
                  className="h-8 text-xs rounded px-2"
                  value={newCategoryParentId || ''}
                  onChange={(e) => setNewCategoryParentId(e.target.value || null)}
                >
                  <option value="">None (top-level)</option>
                  {parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex items-center justify-between gap-2 pt-0.5">
                <div className="flex items-center gap-1.5">
                  <input
                    type="color"
                    value={newCategoryColor}
                    onChange={(e) => setNewCategoryColor(e.target.value)}
                    className="w-5 h-5 rounded cursor-pointer border border-input"
                  />
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {newCategoryColor}
                  </span>
                </div>

                <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newCategoryIsIncome}
                    onChange={(e) => setNewCategoryIsIncome(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-ring"
                  />
                  Income
                </label>
              </div>

              <div className="flex gap-2 pt-2 border-t border-border/50">
                <button
                  type="button"
                  onClick={() => setIsCreatingCategory(false)}
                  className="flex-1 py-1 text-xs text-foreground bg-muted hover:bg-accent rounded-md transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={creatingCategoryLoading || !newCategoryName.trim()}
                  className="flex-1 py-1 text-xs font-semibold text-primary-foreground bg-primary rounded-md hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-1 cursor-pointer"
                >
                  {creatingCategoryLoading ? <Spinner size="xs" /> : 'Create'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative p-2 border-b border-border bg-muted/20">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  placeholder="Search categories..."
                  className="w-full pl-7 pr-2 py-1 text-xs bg-background border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
              </div>

              <div className="flex-1 overflow-y-auto max-h-56 divide-y divide-border/20">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingCategory(true);
                    setNewCategoryName('');
                    setNewCategoryParentId(null);
                    setNewCategoryColor('#6366f1');
                    setNewCategoryIsIncome(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-primary hover:bg-muted font-medium transition-colors text-left cursor-pointer"
                >
                  + Create new category
                </button>

                {filteredParents.map((parent) => {
                  const childList = filter
                    ? getChildren(parent.id).filter((c) =>
                        c.name.toLowerCase().includes(filter)
                      )
                    : getChildren(parent.id);
                  if (
                    filter &&
                    childList.length === 0 &&
                    !parent.name.toLowerCase().includes(filter)
                  ) {
                    return null;
                  }

                  const isParentSelected =
                    (currentCategoryName || '').toLowerCase() === parent.name.toLowerCase();

                  return (
                    <div key={parent.id} className="py-0.5">
                      <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted/30">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: parent.color }}
                        />
                        {parent.name}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectCategory(parent.id, parent.name, parent.color);
                          setIsOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-1.5 text-xs transition-colors text-left cursor-pointer ${
                          isParentSelected
                            ? 'text-primary bg-primary/10 font-medium'
                            : 'text-foreground/90 hover:bg-muted'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: parent.color }}
                          />
                          {parent.name}
                        </span>
                        {isParentSelected && <Check className="h-3 w-3 text-primary shrink-0 ml-1" />}
                      </button>

                      {childList.map((child) => {
                        const isChildSelected =
                          (currentCategoryName || '').toLowerCase() === child.name.toLowerCase();

                        return (
                          <button
                            key={child.id}
                            type="button"
                            onClick={() => {
                              onSelectCategory(child.id, child.name, child.color);
                              setIsOpen(false);
                            }}
                            className={`w-full flex items-center justify-between pl-6 pr-4 py-1.5 text-xs transition-colors text-left cursor-pointer ${
                              isChildSelected
                                ? 'text-primary bg-primary/10 font-medium'
                                : 'text-foreground/80 hover:bg-muted'
                            }`}
                          >
                            <span className="flex items-center gap-2 truncate">
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: child.color }}
                              />
                              {child.name}
                            </span>
                            {isChildSelected && <Check className="h-3 w-3 text-primary shrink-0 ml-1" />}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
