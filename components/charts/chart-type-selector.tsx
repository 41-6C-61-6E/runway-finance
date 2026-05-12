'use client';

export type ChartType = 'bar' | 'pie' | 'line';

interface ChartTypeSelectorProps {
  value: ChartType;
  options: { value: ChartType; label: string }[];
  onChange: (type: ChartType) => void;
}

export function ChartTypeSelector({ value, options, onChange }: ChartTypeSelectorProps) {
  if (options.length <= 1) return null;

  return (
    <div className="flex gap-1 bg-muted/50 rounded-lg p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
            value === opt.value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
