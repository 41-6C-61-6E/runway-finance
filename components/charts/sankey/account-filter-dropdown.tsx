'use client';

import React, { useState, useMemo } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

export interface FilterAccountItem {
  id: string;
  name: string;
  type?: string;
}

export interface AccountFilterDropdownProps {
  accounts: FilterAccountItem[];
  excludedAccountIds: Set<string>;
  onExcludedAccountIdsChange: (next: Set<string>) => void;
  label?: string;
}

export function AccountFilterDropdown({
  accounts,
  excludedAccountIds,
  onExcludedAccountIdsChange,
  label = 'Accounts',
}: AccountFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredAccounts = useMemo(() => {
    if (!search.trim()) return accounts;
    const q = search.toLowerCase();
    return accounts.filter(
      (a) => a.name.toLowerCase().includes(q) || (a.type && a.type.toLowerCase().includes(q))
    );
  }, [accounts, search]);

  const allFilteredSelected =
    filteredAccounts.length > 0 &&
    filteredAccounts.every((a) => !excludedAccountIds.has(a.id));

  const toggleSelectAllFiltered = () => {
    const next = new Set(excludedAccountIds);
    if (allFilteredSelected) {
      filteredAccounts.forEach((a) => next.add(a.id));
    } else {
      filteredAccounts.forEach((a) => next.delete(a.id));
    }
    onExcludedAccountIdsChange(next);
  };

  const toggleAccount = (id: string) => {
    const next = new Set(excludedAccountIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    onExcludedAccountIdsChange(next);
  };

  const selectedCount = accounts.length - excludedAccountIds.size;

  if (accounts.length === 0) return null;

  return (
    <div className="flex items-center gap-2 border-l border-border/30 pl-4">
      <span className="text-xs font-medium text-muted-foreground select-none">
        Filtered Accounts:
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="text-xs bg-background border border-border rounded-lg px-3 py-1.5 hover:bg-muted text-foreground flex items-center gap-1.5 whitespace-nowrap transition-colors select-none cursor-pointer"
          >
            <span>
              {label}
              {excludedAccountIds.size > 0 ? ` (${selectedCount})` : ''}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform text-muted-foreground ${
                open ? 'rotate-180' : ''
              }`}
            />
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          className="w-64 p-2 space-y-2 rounded-xl shadow-xl bg-card border-border"
        >
          <div className="relative flex items-center bg-muted/30 border border-border rounded-lg px-2 py-1">
            <Search className="w-3.5 h-3.5 text-muted-foreground mr-1.5 shrink-0" />
            <input
              type="text"
              placeholder="Search accounts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none text-xs text-foreground focus:outline-none w-full"
            />
          </div>

          <div className="max-h-60 overflow-y-auto space-y-0.5 pr-1 scrollbar-thin">
            {filteredAccounts.length === 0 ? (
              <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                No results
              </div>
            ) : (
              <>
                <div
                  className="flex items-center gap-2 p-1.5 hover:bg-muted rounded-lg text-xs cursor-pointer border-b border-border/45 pb-2 mb-1.5 font-semibold"
                  onClick={toggleSelectAllFiltered}
                >
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    readOnly
                    className="rounded border-border pointer-events-none"
                  />
                  <span>Select all</span>
                </div>

                {filteredAccounts.map((account) => {
                  const isChecked = !excludedAccountIds.has(account.id);
                  return (
                    <div
                      key={account.id}
                      className="flex items-center gap-2 p-1.5 hover:bg-muted rounded-lg text-xs cursor-pointer"
                      onClick={() => toggleAccount(account.id)}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        className="rounded border-border pointer-events-none"
                      />
                      <span className="truncate flex-1">{account.name}</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
