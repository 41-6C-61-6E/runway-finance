import { BarChart3, Inbox, Filter, AlertTriangle } from 'lucide-react';

type EmptyStateVariant = 'nodata' | 'empty' | 'error' | 'insufficient';

interface ChartEmptyStateProps {
  variant?: EmptyStateVariant;
  title?: string;
  description?: string;
  error?: string;
}

const defaults: Record<EmptyStateVariant, { icon: typeof Inbox; title: string; description: string }> = {
  nodata: {
    icon: Inbox,
    title: 'No data yet',
    description: 'Charts will appear once you sync your accounts',
  },
  empty: {
    icon: Filter,
    title: 'No results',
    description: 'Try a different time range or adjust your filters',
  },
  error: {
    icon: AlertTriangle,
    title: 'Something went wrong',
    description: '',
  },
  insufficient: {
    icon: BarChart3,
    title: 'Insufficient data',
    description: 'Need at least 2 data points to render a chart',
  },
};

export function ChartEmptyState({ variant = 'nodata', title, description, error }: ChartEmptyStateProps) {
  const def = defaults[variant];
  const Icon = def.icon;

  return (
    <div className="flex items-center justify-center h-full w-full">
      <div className="text-center px-6">
        <Icon className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" strokeWidth={1.5} />
        <p className="font-medium text-sm text-muted-foreground mb-1">
          {title || def.title}
        </p>
        <p className="text-xs text-muted-foreground/60 leading-relaxed max-w-[200px] mx-auto">
          {error || description || def.description}
        </p>
      </div>
    </div>
  );
}
