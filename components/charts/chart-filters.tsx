'use client';

export type TimeRange = '1m' | '3m' | '6m' | '1y' | '5y' | 'ytd' | 'all';

export const TIME_RANGE_PRESETS: { label: string; value: TimeRange }[] = [
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: '6M', value: '6m' },
  { label: '1Y', value: '1y' },
  { label: '5Y', value: '5y' },
  { label: 'YTD', value: 'ytd' },
  { label: 'All', value: 'all' },
];

interface TimeRangeFilterProps {
  value: TimeRange;
  presets?: { label: string; value: TimeRange }[];
  onChange: (value: TimeRange) => void;
}

export function TimeRangeFilter({ value, presets = TIME_RANGE_PRESETS, onChange }: TimeRangeFilterProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {presets.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
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

interface IncludeExcludedFilterProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

export function IncludeExcludedFilter({ value, onChange }: IncludeExcludedFilterProps) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-muted-foreground hover:text-foreground transition-colors">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="w-3.5 h-3.5 rounded border-border bg-background text-primary cursor-pointer"
      />
      Include excluded
    </label>
  );
}
