'use client';

import { useState, useEffect } from 'react';

type FilterState = {
  accountId: string | null;
  categoryId: string | null;
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

export default function FilterSidebar({ filters, onChange, onClearAll }: FilterSidebarProps) {
  const [datePreset, setDatePreset] = useState('custom');
  const [search, setSearch] = useState(filters.search ?? '');

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange('search', search || null);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, onChange]);

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
