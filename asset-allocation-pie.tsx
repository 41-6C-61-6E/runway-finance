'use client';

import { useState, useMemo } from 'react';
import { ResponsivePie } from '@nivo/pie';
import { formatCurrency } from '@/lib/utils/format';

interface AllocationData {
  id: string;
  label: string;
  value: number;
  color: string;
}

interface AssetAllocationPieProps {
  data: AllocationData[];
  totalAssets: number;
}

export function AssetAllocationPie({ data, totalAssets }: AssetAllocationPieProps) {
  const [excludedIds, setExcludedIds] = useState<string[]>([]);

  // Filter data based on user selection
  const filteredData = useMemo(() => 
    data.filter((item) => !excludedIds.includes(item.id)),
    [data, excludedIds]
  );

  // Recalculate total for filtered view to show relative percentages
  const filteredTotal = useMemo(() => 
    filteredData.reduce((acc, curr) => acc + curr.value, 0),
    [filteredData]
  );

  const toggleId = (id: string) => {
    setExcludedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const theme = {
    text: { fontSize: 11, fill: 'hsl(var(--muted-foreground))' },
    tooltip: {
      container: {
        background: 'hsl(var(--popover))',
        color: 'hsl(var(--popover-foreground))',
        fontSize: 12,
        borderRadius: '8px',
        border: '1px solid hsl(var(--border))',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      },
    },
    labels: {
      text: { fontWeight: 600, fill: 'hsl(var(--foreground))' }
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* Filter Chips */}
      <div className="flex flex-wrap gap-2 mb-4 px-2">
        {data.map((item) => {
          const isExcluded = excludedIds.includes(item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggleId(item.id)}
              className={`px-2 py-1 rounded-md text-[10px] font-medium border transition-all ${
                isExcluded
                  ? 'bg-muted/50 text-muted-foreground border-transparent opacity-50'
                  : 'bg-background text-foreground border-border shadow-sm'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-[300px] relative">
        <ResponsivePie
          data={filteredData}
          theme={theme}
          margin={{ top: 40, right: 80, bottom: 80, left: 80 }}
          innerRadius={0.6}
          padAngle={1}
          cornerRadius={4}
          activeOuterRadiusOffset={8}
          colors={{ datum: 'data.color' }}
          borderWidth={1}
          borderColor={{ from: 'color', modifiers: [['darker', 0.2]] }}
          enableArcLinkLabels={true}
          arcLinkLabelsSkipAngle={10}
          arcLinkLabelsTextColor="hsl(var(--foreground))"
          arcLinkLabelsThickness={2}
          arcLinkLabelsColor={{ from: 'color' }}
          arcLabelsSkipAngle={10}
          arcLabelsTextColor="white"
          valueFormat={(value) => `${((value / filteredTotal) * 100).toFixed(1)}%`}
          tooltip={({ datum }) => (
            <div className="px-3 py-2 bg-popover border border-border rounded-lg shadow-sm text-xs">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: datum.color }} />
                <span className="font-semibold">{datum.label}</span>
              </div>
              <div className="text-muted-foreground font-mono">
                {formatCurrency(datum.value)}
              </div>
              <div className="text-[10px] opacity-70">
                {((datum.value / filteredTotal) * 100).toFixed(1)}% of filtered view
              </div>
            </div>
          )}
          legends={[
            {
              anchor: 'bottom',
              direction: 'row',
              justify: false,
              translateX: 0,
              translateY: 56,
              itemsSpacing: 0,
              itemWidth: 100,
              itemHeight: 18,
              itemTextColor: 'hsl(var(--muted-foreground))',
              itemDirection: 'left-to-right',
              itemOpacity: 1,
              symbolSize: 10,
              symbolShape: 'circle',
              effects: [
                {
                  on: 'hover',
                  style: {
                    itemTextColor: 'hsl(var(--foreground))'
                  }
                }
              ]
            }
          ]}
        />
      </div>
    </div>
  );
}