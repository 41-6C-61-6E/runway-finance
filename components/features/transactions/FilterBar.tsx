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

interface FilterBarProps {
  filters: FilterState;
  onChange: (key: keyof FilterState, value: string | null) => void;
  onClearAll: () => void;
}

export default function FilterBar({ filters, onChange, onClearAll }: FilterBarProps) {
  const [datePreset, setDatePreset] = useState('custom');
  const [search, setSearch] = useState(filters.search ?? '');

  useEffect(() => {
    setDatePreset('custom');
  }, [filters.startDate, filters.endDate]);

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
        return;
    }

    onChange('startDate', start || null);
    onChange('endDate', end || null);
  };

  const toggleFilter = (key: keyof FilterState, value: string) => {
    const current = filters[key];
    onChange(key, current === value ? null : value);
  };

  const hasActiveFilters = Object.values(filters).some(
    (v) => v !== null && v !== 'date' && v !== 'desc'
  );

  return (
    <div className="mb-6 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 p-4 space-y-4">
      {/* Search + Date Range Row */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search transactions..."
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="w-48">
          <select
            value={datePreset}
            onChange={(e) => applyDatePreset(e.target.value)}
            className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="this-month">This Month</option>
            <option value="last-month">Last Month</option>
            <option value="last-3m">Last 3 Months</option>
            <option value="last-6m">Last 6 Months</option>
            <option value="this-year">This Year</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        {datePreset === 'custom' && (
          <>
            <div className="w-36">
              <input
                type="date"
                value={filters.startDate ?? ''}
                onChange={(e) => onChange('startDate', e.target.value || null)}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="w-36">
              <input
                type="date"
                value={filters.endDate ?? ''}
                onChange={(e) => onChange('endDate', e.target.value || null)}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}
      </div>

      {/* Status + Amount Row */}
      <div className="flex flex-wrap gap-4 items-center">
        <div className="flex gap-3 items-center">
          <span className="text-sm text-gray-400">Status:</span>
          <label className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.pending === 'true'}
              onChange={() => toggleFilter('pending', 'true')}
              className="rounded border-white/20 bg-white/10 text-blue-600 focus:ring-blue-500"
            />
            Pending
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.reviewed === 'true'}
              onChange={() => toggleFilter('reviewed', 'true')}
              className="rounded border-white/20 bg-white/10 text-blue-600 focus:ring-blue-500"
            />
            Reviewed
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.reviewed === 'false'}
              onChange={() => toggleFilter('reviewed', 'false')}
              className="rounded border-white/20 bg-white/10 text-blue-600 focus:ring-blue-500"
            />
            Unreviewed
          </label>
        </div>
        <div className="flex gap-2 items-center ml-auto">
          <span className="text-sm text-gray-400">Amount:</span>
          <input
            type="number"
            placeholder="Min"
            value={filters.minAmount ?? ''}
            onChange={(e) => onChange('minAmount', e.target.value || null)}
            className="w-24 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="number"
            placeholder="Max"
            value={filters.maxAmount ?? ''}
            onChange={(e) => onChange('maxAmount', e.target.value || null)}
            className="w-24 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={onClearAll}
            className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
              hasActiveFilters
                ? 'border-white/10 hover:border-white/20 text-gray-400 hover:text-white'
                : 'border-transparent text-gray-600 cursor-default'
            }`}
          >
            Clear All
          </button>
        </div>
      </div>
    </div>
  );
}
