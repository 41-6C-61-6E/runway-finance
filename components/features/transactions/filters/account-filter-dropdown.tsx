'use client';

import React, { useState, useEffect, useRef } from 'react';

export type FilterAccount = {
  id: string;
  name: string;
  institution?: string | null;
};

interface AccountFilterDropdownProps {
  selectedAccountIds: string[];
  accounts: FilterAccount[];
  handleAccountIdsChange: (ids: string[]) => void;
}

export function AccountFilterDropdown({
  selectedAccountIds,
  accounts,
  handleAccountIdsChange,
}: AccountFilterDropdownProps) {
  const [accountIdsOpen, setAccountIdsOpen] = useState(false);
  const [accountSearch, setAccountSearch] = useState('');
  const accountIdsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (accountIdsRef.current && !accountIdsRef.current.contains(e.target as Node)) {
        setAccountIdsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = accounts.filter(
    (a) =>
      !accountSearch ||
      a.name.toLowerCase().includes(accountSearch.toLowerCase()) ||
      (a.institution && a.institution.toLowerCase().includes(accountSearch.toLowerCase()))
  );

  return (
    <div className="relative z-30" ref={accountIdsRef}>
      <button
        type="button"
        onClick={() => {
          setAccountIdsOpen(!accountIdsOpen);
          if (!accountIdsOpen) setAccountSearch('');
        }}
        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
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
        <svg
          className={`h-3.5 w-3.5 transition-transform ${accountIdsOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
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
                  {a.name}
                  {a.institution ? ` (${a.institution})` : ''}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

