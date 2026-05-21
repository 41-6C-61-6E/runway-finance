'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { getTypesByGroup } from '@/lib/constants/account-types';

type FilterState = {
  accountId: string | null;
  accountIds: string | null;
  accountTypes: string | null;
  categoryId: string | null;
  categoryIds: string | null;
  search: string | null;
  startDate: string | null;
  endDate: string | null;
  pending: string | null;
  reviewed: string | null;
  minAmount: string | null;
  maxAmount: string | null;
  categorizedByAi: string | null;
};

interface FilterBarProps {
  filters: FilterState;
  onChange: (key: keyof FilterState, value: string | null) => void;
  onClearAll: () => void;
}

type Account = {
  id: string;
  name: string;
  type: string;
  institution: string | null;
};

type Category = {
  id: string;
  parentId: string | null;
  name: string;
  color: string;
  isIncome: boolean;
};



function MultiSelectDropdown({
  label,
  items,
  selectedValues,
  onChange,
  getItemLabel,
  getItemKey,
}: {
  label: string;
  items: { id?: string; value?: string; label: string }[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  getItemLabel?: (item: { id?: string; value?: string; label: string }) => string;
  getItemKey?: (item: { id?: string; value?: string; label: string }) => string;
}) {
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
        className="px-3 py-1.5 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring flex items-center gap-2 whitespace-nowrap"
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
                    className="rounded border-border bg-background text-primary focus:ring-ring"
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

export default function FilterBar({ filters, onChange, onClearAll }: FilterBarProps) {
  const [datePreset, setDatePreset] = useState('all');
  const [search, setSearch] = useState(filters.search ?? '');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accountIdsOpen, setAccountIdsOpen] = useState(false);
  const [categoryIdsOpen, setCategoryIdsOpen] = useState(false);
  const [accountTypesOpen, setAccountTypesOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const accountIdsRef = useRef<HTMLDivElement>(null);
  const categoryIdsRef = useRef<HTMLDivElement>(null);
  const accountTypesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/accounts', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setAccounts(Array.isArray(data) ? data : []))
      .catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    fetch('/api/categories', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (filters.startDate || filters.endDate) {
      setDatePreset('custom');
    } else {
      setDatePreset('all');
    }
  }, [filters.startDate, filters.endDate]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange('search', search || null);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, onChange]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (accountIdsRef.current && !accountIdsRef.current.contains(e.target as Node)) {
        setAccountIdsOpen(false);
        setAccountSearch('');
      }
      if (categoryIdsRef.current && !categoryIdsRef.current.contains(e.target as Node)) {
        setCategoryIdsOpen(false);
        setCategorySearch('');
      }
      if (accountTypesRef.current && !accountTypesRef.current.contains(e.target as Node)) {
        setAccountTypesOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const applyDatePreset = (preset: string) => {
    setDatePreset(preset);
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    let start = '';
    let end = today;

    switch (preset) {
      case 'this-month': {
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        start = first.toISOString().split('T')[0];
        break;
      }
      case 'last-month': {
        const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const last = new Date(now.getFullYear(), now.getMonth(), 0);
        start = first.toISOString().split('T')[0];
        end = last.toISOString().split('T')[0];
        break;
      }
      case 'last-3m': {
        const first = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        start = first.toISOString().split('T')[0];
        break;
      }
      case 'last-6m': {
        const first = new Date(now.getFullYear(), now.getMonth() - 6, 1);
        start = first.toISOString().split('T')[0];
        break;
      }
      case 'this-year': {
        const first = new Date(now.getFullYear(), 0, 1);
        start = first.toISOString().split('T')[0];
        break;
      }
      case 'all':
        onChange('startDate', null);
        onChange('endDate', null);
        return;
      case 'custom':
        return;
    }

    onChange('startDate', start || null);
    onChange('endDate', end || null);
  };

  const hasActiveFilters = Object.values(filters).some(
    (v) => {
      // Return true if any filter is active (excluding null, empty strings, and default values)
      if (v === null || v === '') return false;
      
      // Handle special cases for filters that could be default values
      if (v === 'all' && (filters.startDate === null && filters.endDate === null)) return false;
      
      return true;
    }
  );

  const parents = categories.filter((c) => !c.parentId);
  const getChildren = (parentId: string) => categories.filter((c) => c.parentId === parentId);

  const selectedAccountIds = (filters.accountIds ?? '').split(',').filter(Boolean);
  const selectedCategoryIds = (filters.categoryIds ?? '').split(',').filter(Boolean);
  const selectedAccountTypes = (filters.accountTypes ?? '').split(',').filter(Boolean);

  const handleAccountIdsChange = useCallback((values: string[]) => {
    onChange('accountIds', values.length > 0 ? values.join(',') : null);
  }, [onChange]);

  const handleCategoryIdsChange = useCallback((values: string[]) => {
    onChange('categoryIds', values.length > 0 ? values.join(',') : null);
  }, [onChange]);

  const handleAccountTypesChange = useCallback((values: string[]) => {
    onChange('accountTypes', values.length > 0 ? values.join(',') : null);
  }, [onChange]);

  const accountItems = accounts.map((a) => ({
    id: a.id,
    label: a.institution ? `${a.name} (${a.institution})` : a.name,
  }));

  const categoryItems = parents.flatMap((parent) => {
    const children = getChildren(parent.id);
    if (children.length > 0) {
      return children.map((child) => ({
        id: child.id,
        label: `${parent.name} › ${child.name}`,
      }));
    }
    return [{ id: parent.id, label: parent.name }];
  });
  categoryItems.unshift({ id: 'uncategorized', label: 'Uncategorized' });

  const groupedAccountTypes = getTypesByGroup();

  return (
    <div className="mb-6 bg-gradient-to-br from-card to-card/95 border border-border rounded-xl shadow-sm">
      {/* Primary Controls Section */}
      <div className="p-4 border-b border-border/50">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {/* Search Input */}
          <div className="flex-1 min-w-[200px]">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by description, payee..."
              className="w-full px-4 py-2.5 bg-background border border-input rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
            />
          </div>

          {/* Date Preset Selector */}
          <div className="w-full sm:w-auto">
            <select
              value={datePreset}
              onChange={(e) => applyDatePreset(e.target.value)}
              className="w-full px-4 py-2.5 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
            >
              <option value="all">All Time</option>
              <option value="this-month">This Month</option>
              <option value="last-month">Last Month</option>
              <option value="last-3m">Last 3 Months</option>
              <option value="last-6m">Last 6 Months</option>
              <option value="this-year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
        </div>

        {/* Custom Date Range */}
        {datePreset === 'custom' && (
          <div className="mt-3 flex flex-col sm:flex-row gap-2 items-start sm:items-center">
            <span className="text-xs font-medium text-muted-foreground mt-1">Date range:</span>
            <input
              type="date"
              value={filters.startDate ?? ''}
              onChange={(e) => onChange('startDate', e.target.value || null)}
              className="flex-1 sm:flex-none px-3 py-1.5 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
            />
            <span className="hidden sm:inline text-xs text-muted-foreground">to</span>
            <input
              type="date"
              value={filters.endDate ?? ''}
              onChange={(e) => onChange('endDate', e.target.value || null)}
              className="flex-1 sm:flex-none px-3 py-1.5 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
            />
          </div>
        )}
      </div>

      {/* Filter Controls Section */}
      <div className="p-4 space-y-3">
        {/* Dropdowns Row */}
        <div className="flex flex-wrap gap-2 items-start">
          {/* Account Types - Grouped */}
          <div className="relative z-30" ref={accountTypesRef}>
            <button
              type="button"
              onClick={() => setAccountTypesOpen(!accountTypesOpen)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                selectedAccountTypes.length > 0
                  ? 'bg-primary/15 border border-primary text-primary'
                  : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
              }`}
            >
              <span className="text-xs">Type</span>
              {selectedAccountTypes.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-primary/25 text-primary rounded-full min-w-[20px] text-center">
                  {selectedAccountTypes.length}
                </span>
              )}
              <svg className={`h-3.5 w-3.5 transition-transform ${accountTypesOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {accountTypesOpen && (
              <div className="absolute top-full left-0 mt-2 w-52 bg-card border border-border rounded-lg shadow-xl z-50 max-h-96 overflow-y-auto">
                {groupedAccountTypes.map((group) => (
                  <div key={group.group}>
                    <div className="px-3 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/20 border-b border-border/50">
                      {group.group}
                    </div>
                    {group.types.map((t) => (
                      <label
                        key={t.value}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={selectedAccountTypes.includes(t.value)}
                          onChange={() => {
                            const next = selectedAccountTypes.includes(t.value)
                              ? selectedAccountTypes.filter((v) => v !== t.value)
                              : [...selectedAccountTypes, t.value];
                            handleAccountTypesChange(next);
                          }}
                          className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                        />
                        <span className="text-sm">{t.label}</span>
                      </label>
                    ))}
                  </div>
                ))}
                {groupedAccountTypes.length === 0 && (
                  <div className="px-3 py-4 text-xs text-muted-foreground text-center">No account types</div>
                )}
              </div>
            )}
          </div>

          {/* Accounts Multi-Select */}
          <div className="relative z-30" ref={accountIdsRef}>
            <button
              type="button"
              onClick={() => { setAccountIdsOpen(!accountIdsOpen); if (!accountIdsOpen) setAccountSearch(''); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
                selectedAccountIds.length > 0
                  ? 'bg-primary/15 border border-primary text-primary'
                  : 'bg-muted/50 border border-input text-foreground hover:bg-muted hover:border-border'
              }`}
            >
              <span className="text-xs">Accounts</span>
              {selectedAccountIds.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs font-semibold bg-primary/25 text-primary rounded-full min-w-[20px] text-center">
                  {selectedAccountIds.length}
                </span>
              )}
              <svg className={`h-3.5 w-3.5 transition-transform ${accountIdsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {accountIdsOpen && (
              <div className="absolute top-full left-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-xl z-50 max-h-96 flex flex-col">
                <div className="p-2 border-b border-border/50">
                  <input
                    type="text"
                    value={accountSearch}
                    onChange={(e) => setAccountSearch(e.target.value)}
                    placeholder="Search accounts..."
                    className="w-full px-3 py-1.5 bg-background border border-input rounded-lg text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
                  />
                </div>
                <div className="overflow-y-auto flex-1 p-1">
                  {(() => {
                    const filtered = accounts.filter(
                      (a) => !accountSearch || a.name.toLowerCase().includes(accountSearch.toLowerCase()) || (a.institution && a.institution.toLowerCase().includes(accountSearch.toLowerCase()))
                    );
                    return (
                      <>
                        <label className="flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
                          <input
                            type="checkbox"
                            checked={filtered.length > 0 && filtered.every((a) => selectedAccountIds.includes(a.id))}
                            onChange={() => {
                              if (filtered.every((a) => selectedAccountIds.includes(a.id))) {
                                handleAccountIdsChange(selectedAccountIds.filter((id) => !filtered.some((a) => a.id === id)));
                              } else {
                                const existing = selectedAccountIds.filter((id) => !filtered.some((a) => a.id === id));
                                handleAccountIdsChange([...existing, ...filtered.map((a) => a.id)]);
                              }
                            }}
                            className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                          />
                          Select All
                        </label>
                        {filtered.map((a) => (
                          <label
                            key={a.id}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/30 last:border-b-0"
                          >
                            <input
                              type="checkbox"
                              checked={selectedAccountIds.includes(a.id)}
                              onChange={() => {
                                const next = selectedAccountIds.includes(a.id)
                                  ? selectedAccountIds.filter((id) => id !== a.id)
                                  : [...selectedAccountIds, a.id];
                                handleAccountIdsChange(next);
                              }}
                              className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                            />
                            <span className="text-sm">
                              {a.name}{a.institution ? ` (${a.institution})` : ''}
                            </span>
                          </label>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Categories Multi-Select */}
          <div className="relative z-30" ref={categoryIdsRef}>
            <button
              type="button"
              onClick={() => { setCategoryIdsOpen(!categoryIdsOpen); if (!categoryIdsOpen) setCategorySearch(''); }}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap ${
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
              <svg className={`h-3.5 w-3.5 transition-transform ${categoryIdsOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {categoryIdsOpen && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-lg shadow-xl z-50 max-h-96 flex flex-col">
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
                  {(() => {
                    const matches = (name: string) =>
                      !categorySearch || name.toLowerCase().includes(categorySearch.toLowerCase());
                    return (
                      <>
                        <label className="flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 hover:bg-muted/50 cursor-pointer font-medium transition-colors border-b border-border/30">
                          <input
                            type="checkbox"
                            checked={selectedCategoryIds.length === categoryItems.length && categoryItems.length > 0}
                            onChange={() => {
                              if (selectedCategoryIds.length === categoryItems.length) {
                                handleCategoryIdsChange([]);
                              } else {
                                handleCategoryIdsChange(categoryItems.map((c) => c.id!));
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
                          const children = getChildren(parent.id).filter(
                            (child) => matches(child.name) || matches(parent.name)
                          );
                          if (!categorySearch && children.length === 0) {
                            if (!matches(parent.name)) return null;
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
                          if (children.length === 0) return null;
                          return (
                            <div key={parent.id}>
                              <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-widest bg-muted/20">
                                {parent.name}
                              </div>
                              {children.map((child) => (
                                <label
                                  key={child.id}
                                  className="flex items-center gap-2 px-3 py-2 text-sm text-foreground/80 hover:bg-muted/50 cursor-pointer ml-2 transition-colors border-b border-border/30 last:border-b-0"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedCategoryIds.includes(child.id)}
                                    onChange={() => {
                                      const next = selectedCategoryIds.includes(child.id)
                                        ? selectedCategoryIds.filter((id) => id !== child.id)
                                        : [...selectedCategoryIds, child.id];
                                      handleCategoryIdsChange(next);
                                    }}
                                    className="rounded border-border bg-background text-primary focus:ring-ring cursor-pointer"
                                  />
                                  <span
                                    className="w-2.5 h-2.5 rounded-full inline-block flex-shrink-0"
                                    style={{ backgroundColor: child.color }}
                                  />
                                  {child.name}
                                </label>
                              ))}
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Amount Filter Group */}
          <div className="flex items-center gap-2 bg-muted/30 px-3 py-2 rounded-lg border border-border/50">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount:</span>
            <input
              type="number"
              placeholder="Min"
              value={filters.minAmount ?? ''}
              onChange={(e) => onChange('minAmount', e.target.value || null)}
              className="w-20 px-2.5 py-1 bg-background border border-input rounded-md text-foreground text-xs placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
            />
            <span className="text-xs text-muted-foreground">–</span>
            <input
              type="number"
              placeholder="Max"
              value={filters.maxAmount ?? ''}
              onChange={(e) => onChange('maxAmount', e.target.value || null)}
              className="w-20 px-2.5 py-1 bg-background border border-input rounded-md text-foreground text-xs placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
            />
          </div>
        </div>

        {/* Status Filters Row */}
        <div className="flex flex-wrap gap-2 items-center pt-1">
          {/* Status Filter Group */}
          <div className="flex items-center gap-1.5 bg-muted/30 px-3 py-2 rounded-lg border border-border/50">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Filter:</span>
            <button
              onClick={() => onChange('pending', filters.pending === 'true' ? null : 'true')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                filters.pending === 'true'
                  ? 'border border-chart-3 bg-chart-3/20 text-chart-3 shadow-sm'
                  : 'border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              Pending
            </button>
            <button
              onClick={() => onChange('reviewed', filters.reviewed === 'true' ? null : 'true')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                filters.reviewed === 'true'
                  ? 'border border-primary bg-primary/20 text-primary shadow-sm'
                  : 'border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              Reviewed
            </button>
            <button
              onClick={() => onChange('reviewed', filters.reviewed === 'false' ? null : 'false')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                filters.reviewed === 'false'
                  ? 'border border-muted-foreground/50 bg-muted text-foreground shadow-sm'
                  : 'border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              Unreviewed
            </button>
            <button
              onClick={() => onChange('categorizedByAi', filters.categorizedByAi === 'true' ? null : 'true')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                filters.categorizedByAi === 'true'
                  ? 'border border-primary bg-primary/20 text-primary shadow-sm'
                  : 'border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              AI Categorized
            </button>
            <button
              onClick={() => {
                // Toggle uncategorized filter
                // We'll treat this as a category filter since it's not a standard status
                const currentCategoryFilter = filters.categoryIds || '';
                const categoryIds = currentCategoryFilter.split(',').filter(id => id.trim() !== '');
                
                if (categoryIds.includes('uncategorized')) {
                  // Remove uncategorized
                  const newCategoryIds = categoryIds.filter(id => id !== 'uncategorized');
                  onChange('categoryIds', newCategoryIds.length > 0 ? newCategoryIds.join(',') : null);
                } else {
                  // Add uncategorized
                  const newCategoryIds = [...categoryIds, 'uncategorized'];
                  onChange('categoryIds', newCategoryIds.join(','));
                }
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                (filters.categoryIds && filters.categoryIds.includes('uncategorized'))
                  ? 'border border-muted-foreground/50 bg-muted text-foreground shadow-sm'
                  : 'border border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              Uncategorized
            </button>
          </div>

          {/* Clear All Button - Positioned in bottom right of filter area */}
          {hasActiveFilters && (
            <div className="ml-auto flex justify-end w-full sm:w-auto relative z-10">
              <button
                onClick={onClearAll}
                className="px-3 py-2 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all flex items-center gap-1 min-w-[80px] justify-center bg-background/90 backdrop-blur-sm shadow-lg"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18"></path>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
                Clear All
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
