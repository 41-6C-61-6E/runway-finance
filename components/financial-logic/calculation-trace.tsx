'use client';

import { useState } from 'react';
import { Calculator, ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import type { CalculationTrace, TraceFormat } from '@/lib/types/financial';

export function formatTraceResult(value: number, format: TraceFormat): string {
  switch (format) {
    case 'currency':
      return formatCurrency(value);
    case 'percentage':
      return `${Math.min(value, 9999).toFixed(1)}%`;
    case 'ratio':
      return value.toFixed(2);
    case 'years':
      return value === Infinity ? '∞' : `${value.toFixed(1)} yrs`;
    case 'number':
      return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    default:
      return formatCurrency(value);
  }
}

export function CalculationTraceOverlay({ trace }: { trace: CalculationTrace }) {
  const [expanded, setExpanded] = useState(false);
  const resultDisplay = formatTraceResult(trace.result, trace.format);

  return (
    <div className="mt-3 px-4 py-3 rounded-lg bg-muted/20 border border-border/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
        <Calculator className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {trace.title} — {resultDisplay}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 text-xs text-muted-foreground/80">
          <div className="bg-muted/30 rounded p-2.5 font-mono text-[11px] leading-relaxed">
            <div className="text-foreground/60 mb-1">Formula</div>
            <div className="text-foreground">{trace.formula}</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-muted/30 rounded p-2.5">
              <div className="text-foreground/60 mb-1">Data Source</div>
              <div className="text-foreground font-mono text-[11px] break-all">{trace.dataSource}</div>
            </div>
            <div className="bg-muted/30 rounded p-2.5">
              <div className="text-foreground/60 mb-1">Filters Applied</div>
              <ul className="list-disc list-inside text-foreground font-mono text-[11px]">
                {trace.filters.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-muted/30 rounded p-2.5">
              <div className="text-foreground/60 mb-1">Account Types Included ({trace.typesIncluded.length})</div>
              <div className="flex flex-wrap gap-1">
                {trace.typesIncluded.map((t) => (
                  <span key={t} className="px-1.5 py-0.5 bg-chart-1/10 text-chart-1 rounded text-[10px] font-medium">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-muted/30 rounded p-2.5">
              <div className="text-foreground/60 mb-1">Account Types Excluded ({trace.typesExcluded.length})</div>
              <div className="flex flex-wrap gap-1">
                {trace.typesExcluded.map((t) => (
                  <span key={t} className="px-1.5 py-0.5 bg-destructive/10 text-destructive rounded text-[10px] font-medium">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-muted/30 rounded p-2.5">
            <div className="text-foreground/60 mb-1">Step-by-Step Calculation ({trace.steps.length} steps)</div>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {trace.steps.map((step, i) => (
                <div key={i} className="flex items-center justify-between py-0.5 border-b border-border/30 last:border-0">
                  <span className="font-mono text-[11px] text-foreground truncate mr-2">
                    {step.label}
                  </span>
                  <span className="text-muted-foreground/60 text-[10px] shrink-0">
                    {step.operation}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between bg-muted/40 rounded p-2.5">
            <span className="text-foreground font-semibold">{trace.title}</span>
            <span className="text-foreground font-bold font-mono">{resultDisplay}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function CalculationTraceExplorerPage({ traces }: { traces: CalculationTrace[] }) {
  return (
    <div className="space-y-4">
      {traces.map((trace) => (
        <div key={trace.id} className="bg-card border border-border rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-foreground">{trace.title}</h3>
            <span className="text-lg font-bold text-foreground font-mono">
              {formatTraceResult(trace.result, trace.format)}
            </span>
          </div>
          <CalculationTraceOverlay trace={trace} />
        </div>
      ))}
    </div>
  );
}
