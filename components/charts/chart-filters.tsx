'use client';

export type TimeRange = '7d' | '30d' | '1m' | '3m' | '6m' | '1y' | '365d' | '5y' | 'ytd' | 'all';

export const TIME_RANGE_PRESETS: { label: string; value: TimeRange; group?: string }[] = [
  { label: '7D', value: '7d', group: 'Rolling' },
  { label: '30D', value: '30d', group: 'Rolling' },
  { label: '365D', value: '365d', group: 'Rolling' },
  { label: '1M', value: '1m', group: 'Discrete' },
  { label: '3M', value: '3m', group: 'Discrete' },
  { label: '6M', value: '6m', group: 'Discrete' },
  { label: '1Y', value: '1y', group: 'Discrete' },
  { label: '5Y', value: '5y', group: 'Discrete' },
  { label: 'YTD', value: 'ytd', group: 'Other' },
  { label: 'All', value: 'all', group: 'Other' },
];

interface TimeRangeFilterProps {
  value: TimeRange;
  presets?: { label: string; value: TimeRange; group?: string }[];
  onChange: (value: TimeRange) => void;
}

export function TimeRangeFilter({ value, presets = TIME_RANGE_PRESETS, onChange }: TimeRangeFilterProps) {
  const hasGroups = presets.some(p => p.group);

  if (hasGroups) {
    const groups = presets.reduce((acc, curr) => {
      const g = curr.group || 'Other';
      if (!acc[g]) acc[g] = [];
      acc[g].push(curr);
      return acc;
    }, {} as Record<string, typeof presets>);

    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group} className="flex items-center gap-1.5">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group}</span>
            <div className="flex bg-muted/40 p-0.5 rounded-lg border border-border/50">
              {items.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onChange(opt.value)}
                  className={`px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-md text-xs font-medium transition-all ${
                    value === opt.value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-muted/80 hover:text-accent-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {presets.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 sm:px-2.5 sm:py-1 rounded-md text-xs font-medium transition-all ${
            value === opt.value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

