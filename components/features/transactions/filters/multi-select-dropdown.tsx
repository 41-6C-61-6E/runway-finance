'use client';

import React, { useState, useEffect, useRef } from 'react';

interface MultiSelectDropdownProps {
  label: string;
  items: { id?: string; value?: string; label: string }[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  getItemLabel?: (item: { id?: string; value?: string; label: string }) => string;
  getItemKey?: (item: { id?: string; value?: string; label: string }) => string;
}

export function MultiSelectDropdown({
  label,
  items,
  selectedValues,
  onChange,
  getItemLabel,
  getItemKey,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = items.filter((item) => {
    const itemLabel = getItemLabel ? getItemLabel(item) : item.label;
    return itemLabel.toLowerCase().includes(search.toLowerCase());
  });

  const toggleItem = (key: string) => {
    if (selectedValues.includes(key)) {
      onChange(selectedValues.filter((v) => v !== key));
    } else {
      onChange([...selectedValues, key]);
    }
  };

  const selectedCount = selectedValues.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-3 py-1.5 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring flex items-center gap-2 whitespace-nowrap cursor-pointer"
      >
        <span>{label}{selectedCount > 0 ? ` (${selectedCount})` : ''}</span>
        <svg className={`h-3 w-3 transition-transform text-muted-foreground ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-card border border-border rounded-lg shadow-lg z-50 max-h-72 flex flex-col">
          <div className="p-2 border-b border-border">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full px-2 py-1 bg-background border border-input rounded text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="overflow-y-auto flex-1 p-1">
            {filtered.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground text-center">No results</div>
            )}
            {filtered.map((item) => {
              const key = getItemKey ? getItemKey(item) : (item.id ?? item.value ?? item.label);
              return (
                <label
                  key={key}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs text-foreground/80 hover:bg-muted rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(key)}
                    onChange={() => toggleItem(key)}
                    className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                  />
                  {getItemLabel ? getItemLabel(item) : item.label}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
