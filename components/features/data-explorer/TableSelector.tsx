'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Search, Database, ChevronDown, Check } from 'lucide-react';

interface TableMeta {
  key: string;
  label: string;
  group: string;
}

interface TableSelectorProps {
  tables: TableMeta[];
  selected: string;
  onSelect: (key: string) => void;
}

const GROUP_ORDER = ['Accounts', 'Transactions', 'Cash Flow', 'Budgets', 'FIRE', 'System'];

export default function TableSelector({ tables, selected, onSelect }: TableSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selectedTable = tables.find((t) => t.key === selected);

  const grouped = useMemo(() => {
    const groups = new Map<string, TableMeta[]>();
    for (const t of tables) {
      if (search && !t.label.toLowerCase().includes(search.toLowerCase())) continue;
      if (!groups.has(t.group)) groups.set(t.group, []);
      groups.get(t.group)!.push(t);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        const ai = GROUP_ORDER.indexOf(a);
        const bi = GROUP_ORDER.indexOf(b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.localeCompare(b);
      });
  }, [tables, search]);

  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative min-w-[240px]">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 transition-colors text-left"
      >
        <Database className="h-4 w-4 text-primary flex-shrink-0" />
        <span className="text-sm font-medium text-foreground flex-1 truncate">
          {selectedTable?.label ?? 'Select table'}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl z-50 max-h-80 flex flex-col">
          <div className="relative p-2 border-b border-border">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tables..."
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-input rounded-md text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {grouped.length === 0 ? (
              <div className="px-3 py-6 text-xs text-muted-foreground text-center">No tables found</div>
            ) : (
              grouped.map(([group, groupTables]) => (
                <div key={group}>
                  <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground bg-muted/30 uppercase tracking-wider">
                    {group}
                  </div>
                  {groupTables.map((t) => {
                    const isSelected = t.key === selected;
                    return (
                      <button
                        key={t.key}
                        onClick={() => { onSelect(t.key); setOpen(false); }}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                          isSelected
                            ? 'text-primary bg-primary/10'
                            : 'text-foreground/80 hover:bg-muted'
                        }`}
                      >
                        <span className="flex-1 text-left">{t.label}</span>
                        {isSelected && <Check className="h-3 w-3 text-primary flex-shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
