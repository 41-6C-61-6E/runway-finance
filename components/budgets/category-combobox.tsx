'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface Category {
  id: string;
  name: string;
  isIncome?: boolean;
  parentId?: string | null;
  color?: string;
}

interface CategoryComboboxProps {
  categories: Category[];
  value: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

export function CategoryCombobox({ categories, value, onSelect, disabled }: CategoryComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedCategory = categories.find((c) => c.id === value);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const parents = categories.filter(c => !c.parentId);
  const getChildren = (parentId: string) => categories.filter(c => c.parentId === parentId);

  const filteredCategories = categories.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (id: string) => {
    onSelect(id);
    setOpen(false);
    setSearch('');
  };

  const renderCategoryItem = (category: Category, isChild = false) => (
    <div
      key={category.id}
      onClick={() => handleSelect(category.id)}
      className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors ${
        isChild && search === '' ? "ml-4" : ""
      } ${value === category.id ? "bg-accent/50 text-accent-foreground" : ""}`}
    >
      <Check
        className={`h-4 w-4 shrink-0 ${
          value === category.id ? "opacity-100" : "opacity-0"
        }`}
      />
      <div 
        className="w-2.5 h-2.5 rounded-full shrink-0" 
        style={{ backgroundColor: category.color || '#6366f1' }} 
      />
      <span className="truncate">{category.name}</span>
    </div>
  );

  const renderCategoryGroup = (groupParents: Category[], heading: string) => {
    const groupItems = groupParents.flatMap(parent => {
      const children = getChildren(parent.id);
      const parentVisible = search === '' || parent.name.toLowerCase().includes(search.toLowerCase());
      const childrenVisible = children.filter(child => 
        search === '' || child.name.toLowerCase().includes(search.toLowerCase())
      );
      
      const items = [];
      if (parentVisible || childrenVisible.length > 0) {
        items.push(renderCategoryItem(parent));
        childrenVisible.forEach(child => items.push(renderCategoryItem(child, true)));
      }
      return items;
    }).filter(Boolean);

    if (groupItems.length === 0) return null;

    return (
      <div className="py-2">
        <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          {heading}
        </div>
        {groupItems}
      </div>
    );
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="inline-flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all hover:bg-accent hover:text-accent-foreground"
      >
        {selectedCategory ? (
          <div className="flex items-center gap-2 overflow-hidden">
            <div 
              className="w-2.5 h-2.5 rounded-full shrink-0" 
              style={{ backgroundColor: selectedCategory.color || '#6366f1' }} 
            />
            <span className="truncate">{selectedCategory.name}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">Select category...</span>
        )}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </button>

      {open && (
        <div className="absolute top-full z-50 mt-1 w-full rounded-lg border border-border bg-popover text-popover-foreground shadow-md outline-none">
          <div className="p-2 border-b border-border">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-8 bg-muted/50 border-none focus-visible:ring-0"
                placeholder="Search categories..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto">
            <div
              onClick={() => handleSelect('')}
              className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent text-muted-foreground italic transition-colors border-b border-border/50"
            >
              <Check className="h-4 w-4 opacity-0" />
              None / Uncategorized
            </div>
            {filteredCategories.length === 0 ? (
              <div className="px-3 py-6 text-sm text-center text-muted-foreground">
                No category found.
              </div>
            ) : (
              <>
                {renderCategoryGroup(parents.filter(p => !p.isIncome), "Expenses")}
                {renderCategoryGroup(parents.filter(p => p.isIncome), "Income")}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}