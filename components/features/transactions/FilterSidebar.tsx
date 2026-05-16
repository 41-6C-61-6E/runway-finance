'use client';

import { useState, useEffect } from 'react';

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
};

interface FilterSidebarProps {
  filters: FilterState;
  onChange: (key: keyof FilterState, value: string | null) => void;
  onClearAll: () => void;
}

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'credit', label: 'Credit' },
  { value: 'loan', label: 'Loan' },
  { value: 'investment', label: 'Investment' },
  { value: 'brokerage', label: 'Brokerage' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'realestate', label: 'Real Estate' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'metals', label: 'Metals' },
  { value: 'other', label: 'Other' },
  { value: 'otherAsset', label: 'Other Asset' },
  { value: 'otherLiability', label: 'Other Liability' },
];

export default function FilterSidebar({ filters, onChange, onClearAll }: FilterSidebarProps) {
  const [datePreset, setDatePreset] = useState('custom');
  const [search, setSearch] = useState(filters.search ?? '');
  const [accounts, setAccounts] = useState<{ id: string; name: string; type: string; institution: string | null }[]>([]);
  const [categories, setCategories] = useState<{ id: string; parentId: string | null; name: string; color: string; isIncome: boolean }[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange('search', search || null);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, onChange]);

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
      case 'custom':
        setDatePreset('custom');
        return;
    }

    onChange('startDate', start || null);
    onChange('endDate', end || null);
  };

  const toggleFilter = (key: keyof FilterState, value: string) => {
    const current = filters[key];
    onChange(key, current === value ? null : value);
  };

  const parents = categories.filter((c) => !c.parentId);
  const getChildren = (parentId: string) => categories.filter((c) => c.parentId === parentId);

  const selectedAccountIds = (filters.accountIds ?? '').split(',').filter(Boolean);
  const selectedCategoryIds = (filters.categoryIds ?? '').split(',').filter(Boolean);
  const selectedAccountTypes = (filters.accountTypes ?? '').split(',').filter(Boolean);

  const toggleAccountId = (id: string) => {
    const next = selectedAccountIds.includes(id)
      ? selectedAccountIds.filter((v) => v !== id)
      : [...selectedAccountIds, id];
    onChange('accountIds', next.length > 0 ? next.join(',') : null);
  };

  const toggleCategoryId = (id: string) => {
    const next = selectedCategoryIds.includes(id)
      ? selectedCategoryIds.filter((v) => v !== id)
      : [...selectedCategoryIds, id];
    onChange('categoryIds', next.length > 0 ? next.join(',') : null);
  };

  const toggleAccountType = (value: string) => {
    const next = selectedAccountTypes.includes(value)
      ? selectedAccountTypes.filter((v) => v !== value)
      : [...selectedAccountTypes, value];
    onChange('accountTypes', next.length > 0 ? next.join(',') : null);
  };

  return (
    <div className="p-4 bg-card border border-border rounded-xl space-y-5">
      {/* Search */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Search</label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transactions..."
          className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Date Presets */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Date Range</label>
        <select
          value={datePreset}
          onChange={(e) => applyDatePreset(e.target.value)}
          className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="this-month">This Month</option>
          <option value="last-month">Last Month</option>
          <option value="last-3m">Last 3 Months</option>
          <option value="last-6m">Last 6 Months</option>
          <option value="this-year">This Year</option>
          <option value="custom">Custom</option>
        </select>
        {datePreset === 'custom' && (
          <div className="mt-2 space-y-2">
            <input
              type="date"
              value={filters.startDate ?? ''}
              onChange={(e) => onChange('startDate', e.target.value || null)}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <input
              type="date"
              value={filters.endDate ?? ''}
              onChange={(e) => onChange('endDate', e.target.value || null)}
              className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
      </div>

      {/* Account Types */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Account Type</label>
        <div className="space-y-1.5">
          {ACCOUNT_TYPES.map((t) => (
            <label key={t.value} className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedAccountTypes.includes(t.value)}
                onChange={() => toggleAccountType(t.value)}
                className="rounded border-border bg-background text-primary focus:ring-ring"
              />
              {t.label}
            </label>
          ))}
        </div>
      </div>

      {/* Accounts */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Accounts</label>
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {accounts.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedAccountIds.includes(a.id)}
                onChange={() => toggleAccountId(a.id)}
                className="rounded border-border bg-background text-primary focus:ring-ring"
              />
              {a.name}
            </label>
          ))}
          {accounts.length === 0 && (
            <p className="text-xs text-muted-foreground">No accounts</p>
          )}
        </div>
      </div>

      {/* Categories */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Categories</label>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedCategoryIds.includes('uncategorized')}
              onChange={() => toggleCategoryId('uncategorized')}
              className="rounded border-border bg-background text-primary focus:ring-ring"
            />
            Uncategorized
          </label>
          {parents.map((parent) => {
            const children = getChildren(parent.id);
            return (
              <div key={parent.id}>
                <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedCategoryIds.includes(parent.id)}
                    onChange={() => toggleCategoryId(parent.id)}
                    className="rounded border-border bg-background text-primary focus:ring-ring"
                  />
                  <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: parent.color }} />
                  {parent.name}
                </label>
                {children.length > 0 && (
                  <div className="ml-2">
                    {children.map((child) => (
                      <label key={child.id} className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedCategoryIds.includes(child.id)}
                          onChange={() => toggleCategoryId(child.id)}
                          className="rounded border-border bg-background text-primary focus:ring-ring"
                        />
                        <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: child.color }} />
                        {child.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Status Toggles */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Status</label>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.pending === 'true'}
              onChange={() => toggleFilter('pending', 'true')}
              className="rounded border-border bg-background text-primary focus:ring-ring"
            />
            Pending
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.reviewed === 'true'}
              onChange={() => toggleFilter('reviewed', 'true')}
              className="rounded border-border bg-background text-primary focus:ring-ring"
            />
            Reviewed
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground/80 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.reviewed === 'false'}
              onChange={() => toggleFilter('reviewed', 'false')}
              className="rounded border-border bg-background text-primary focus:ring-ring"
            />
            Unreviewed
          </label>
        </div>
      </div>

      {/* Amount Range */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Amount Range</label>
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Min"
            value={filters.minAmount ?? ''}
            onChange={(e) => onChange('minAmount', e.target.value || null)}
            className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.maxAmount ?? ''}
            onChange={(e) => onChange('maxAmount', e.target.value || null)}
            className="w-full px-3 py-2 bg-background border border-input rounded-lg text-foreground text-sm placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Clear All */}
      <button
        onClick={onClearAll}
        className="w-full px-3 py-2 text-sm text-muted-foreground hover:text-foreground border border-border hover:bg-muted rounded-lg transition-colors"
      >
        Clear All Filters
      </button>
    </div>
  );
}
