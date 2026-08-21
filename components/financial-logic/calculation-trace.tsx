'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Calculator, ChevronDown, ChevronRight, Copy, Check, Info, Layers } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import type { CalculationTrace, TraceFormat } from '@/lib/types/financial';

export function formatTraceResult(value: number, format: TraceFormat): string {
  if (isNaN(value)) return '0.00';
  switch (format) {
    case 'currency':
      return formatCurrency(value);
    case 'percentage':
      return `${Math.min(value, 9999).toFixed(1)}%`;
    case 'ratio':
      return value === Infinity ? '100%+ (∞)' : value.toFixed(2);
    case 'years':
      return value === Infinity ? '∞' : `${value.toFixed(1)} yrs`;
    case 'number':
      return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    default:
      return formatCurrency(value);
  }
}

export function CalculationTraceOverlay({
  trace,
  depth = 0,
}: {
  trace: CalculationTrace;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(depth === 0 ? false : false);
  const [copied, setCopied] = useState(false);
  const [showInputs, setShowInputs] = useState(false);
  const resultDisplay = formatTraceResult(trace.result, trace.format);

  const handleCopyFormula = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(trace.formula);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`mt-2.5 px-3.5 py-2.5 rounded-lg bg-muted/20 border border-border/50 ${depth > 0 ? 'ml-3 border-l-2 border-l-primary/40' : ''}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full text-left group"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
          <Calculator className="w-3.5 h-3.5 text-primary/70 shrink-0" />
          <span className="text-[11px] font-semibold text-foreground tracking-wide">
            {trace.title}
          </span>
          {trace.isEstimate && (
            <span className="px-1.5 py-0.2 bg-amber-500/10 text-amber-500 border border-amber-500/20 rounded text-[9px] font-mono font-medium">
              [ESTIMATE]
            </span>
          )}
        </div>
        <span className="text-xs font-mono font-bold text-foreground">
          {resultDisplay}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-3 text-xs text-muted-foreground/80 animate-in fade-in-50 duration-150">
          <div className="bg-muted/30 rounded p-2.5 font-mono text-[11px] leading-relaxed relative group/copy">
            <div className="flex items-center justify-between text-foreground/60 mb-1">
              <span>Formula</span>
              <button
                type="button"
                onClick={handleCopyFormula}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded bg-muted/50 border border-border/40"
              >
                {copied ? <Check className="w-3 h-3 text-constructive" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="text-foreground">{trace.formula}</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-muted/30 rounded p-2.5">
              <div className="text-foreground/60 mb-1">Data Source</div>
              <div className="text-foreground font-mono text-[11px] break-all">{trace.dataSource}</div>
            </div>
            <div className="bg-muted/30 rounded p-2.5">
              <div className="text-foreground/60 mb-1">Filters Applied</div>
              {trace.filters.length > 0 ? (
                <ul className="list-disc list-inside text-foreground font-mono text-[11px]">
                  {trace.filters.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted-foreground text-[11px]">None</span>
              )}
            </div>
          </div>

          {(trace.typesIncluded.length > 0 || trace.typesExcluded.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="bg-muted/30 rounded p-2.5">
                <div className="text-foreground/60 mb-1">Account Types Included ({trace.typesIncluded.length})</div>
                <div className="flex flex-wrap gap-1">
                  {trace.typesIncluded.map((t) => (
                    <span 
                      key={t} 
                      className="goal-pill px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{ '--goal-color': 'var(--chart-1)' } as React.CSSProperties}
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <div className="bg-muted/30 rounded p-2.5">
                <div className="text-foreground/60 mb-1">Account Types Excluded ({trace.typesExcluded.length})</div>
                <div className="flex flex-wrap gap-1">
                  {trace.typesExcluded.length > 0 ? (
                    trace.typesExcluded.map((t) => (
                      <span 
                        key={t} 
                        className="goal-pill px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{ '--goal-color': 'var(--destructive)' } as React.CSSProperties}
                      >
                        {t}
                      </span>
                    ))
                  ) : (
                    <span className="text-muted-foreground text-[10px]">None</span>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="bg-muted/30 rounded p-2.5">
            <div className="flex items-center justify-between text-foreground/60 mb-1.5">
              <span>Step-by-Step Calculation ({trace.steps.length} steps)</span>
              <button
                type="button"
                onClick={() => setShowInputs(!showInputs)}
                className="text-[10px] text-primary hover:underline font-mono"
              >
                {showInputs ? 'Hide Raw Inputs' : 'Inspect Raw Inputs'}
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1 divide-y divide-border/20">
              {trace.steps.map((step, i) => (
                <div key={i} className="pt-1 first:pt-0">
                  <div className="flex items-center justify-between py-0.5">
                    <span className="font-mono text-[11px] text-foreground truncate mr-2 flex items-center gap-1.5">
                      {step.label}
                      {step.isEstimate && (
                        <span className="px-1 py-0.2 bg-amber-500/10 text-amber-500 rounded text-[9px]">
                          [ESTIMATE]
                        </span>
                      )}
                    </span>
                    <span className="text-muted-foreground text-[10px] shrink-0 font-mono">
                      {step.operation}
                    </span>
                  </div>
                  {showInputs && step.inputs && Object.keys(step.inputs).length > 0 && (
                    <div className="bg-muted/40 rounded px-2 py-1 my-0.5 text-[10px] font-mono flex flex-wrap gap-2 text-foreground/80">
                      {Object.entries(step.inputs).map(([k, v]) => (
                        <span key={k}>
                          <span className="text-muted-foreground">{k}:</span> {typeof v === 'number' ? v.toLocaleString() : String(v)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Recursive Child Traces */}
          {trace.children && trace.children.length > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Layers className="w-3.5 h-3.5 text-primary" />
                <span>Account & Sub-Calculations Breakdown ({trace.children.length})</span>
              </div>
              <div className="space-y-1.5">
                {trace.children.map((child) => (
                  <CalculationTraceOverlay key={child.id} trace={child} depth={depth + 1} />
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between bg-muted/40 rounded p-2.5 border border-border/40">
            <span className="text-foreground font-semibold">{trace.title} Result</span>
            <span className="text-foreground font-bold font-mono text-sm">{resultDisplay}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function CalculationTraceLink({
  metric,
  label = 'Inspect Calculation Trace',
  className = '',
}: {
  metric: string;
  label?: string;
  className?: string;
}) {
  return (
    <Link
      href={`/financial-logic#${metric}`}
      className={`inline-flex items-center gap-1 text-[11px] text-primary/80 hover:text-primary transition-colors font-medium ${className}`}
      title="View mathematical formula and calculation trace"
    >
      <Calculator className="w-3 h-3" />
      <span>{label}</span>
    </Link>
  );
}
