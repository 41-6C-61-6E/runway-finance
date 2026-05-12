'use client';

import { Switch } from '@/components/ui/switch';
import { useChartVisibility, CHARTS } from '@/lib/hooks/use-chart-visibility';

export default function AnalyticsTab() {
  const { visibility, loading: visLoading, updateVisibility } = useChartVisibility();

  if (visLoading) {
    return <div className="text-muted-foreground py-4">Loading...</div>;
  }

  return (
    <div className="space-y-10">
      {/* ── Chart Visibility ───────────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">Chart Visibility</h2>
        <p className="text-xs text-muted-foreground mb-6">
          Toggle charts on or off per page. Hidden charts will not be displayed.
        </p>

        <div className="space-y-8">
          {(Object.entries(CHARTS) as [string, { label: string; charts: Record<string, string> }][]).map(
            ([pageKey, page]) => (
              <div key={pageKey}>
                <h3 className="text-sm font-semibold text-foreground mb-3">{page.label}</h3>
                <div className="space-y-2">
                  {Object.entries(page.charts).map(([chartId, chartLabel]) => {
                    const visible = visibility[chartId] !== false;
                    return (
                      <div
                        key={chartId}
                        className="flex items-center justify-between p-3 bg-muted/30 border border-border rounded-lg"
                      >
                        <span className="text-sm text-foreground">{chartLabel}</span>
                        <Switch
                          checked={visible}
                          onCheckedChange={(checked) => updateVisibility(chartId, checked)}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
