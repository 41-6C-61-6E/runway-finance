'use client';

import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Copy, Check } from 'lucide-react';

interface JsonViewerProps {
  data: unknown;
  defaultExpanded?: boolean;
}

function formatValue(val: unknown): string {
  if (val === null) return 'null';
  if (val === undefined) return 'undefined';
  if (typeof val === 'string') return `"${val}"`;
  return String(val);
}

function JsonNode({ keyName, value, depth, defaultExpanded }: { keyName?: string; value: unknown; depth: number; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded || depth < 2);
  const isObject = value !== null && typeof value === 'object';
  const isArray = Array.isArray(value);
  const entries = isObject
    ? isArray
      ? (value as unknown[]).map((v, i) => [String(i), v] as [string, unknown])
      : Object.entries(value as Record<string, unknown>)
    : [];

  const toggle = useCallback(() => setExpanded((e) => !e), []);

  if (!isObject) {
    const valColor =
      value === null ? 'text-muted-foreground italic' :
      typeof value === 'string' ? 'text-chart-1' :
      typeof value === 'number' ? 'text-chart-3' :
      typeof value === 'boolean' ? 'text-chart-4' :
      'text-foreground';

    return (
      <div className="flex items-start gap-1" style={{ paddingLeft: keyName ? depth * 16 : 0 }}>
        {keyName !== undefined && (
          <span className="text-primary shrink-0">{keyName}: </span>
        )}
        <span className={`${valColor} break-all font-mono text-[11px]`}>{formatValue(value)}</span>
      </div>
    );
  }

  const isEmpty = entries.length === 0;

  return (
    <div style={{ paddingLeft: keyName !== undefined ? depth * 16 : 0 }}>
      <button onClick={toggle} className="flex items-center gap-1 hover:opacity-80 text-left w-full">
        {keyName !== undefined && (
          <span className="text-primary shrink-0">{keyName}: </span>
        )}
        {isEmpty ? (
          <span className="text-muted-foreground font-mono text-[11px]">{isArray ? '[]' : '{}'}</span>
        ) : (
          <>
            <span className="shrink-0 text-muted-foreground">
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </span>
            <span className="text-muted-foreground font-mono text-[11px]">
              {isArray ? `[${entries.length}]` : `{${entries.length}}`}
            </span>
          </>
        )}
      </button>
      {expanded && !isEmpty && (
        <div className="border-l border-border/30 ml-1.5 pl-3">
          {entries.map(([k, v]) => (
            <JsonNode key={k} keyName={isArray ? undefined : k} value={v} depth={depth + 1} defaultExpanded={depth < 2} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function JsonViewer({ data, defaultExpanded = false }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }, [data]);

  return (
    <div className="relative group">
      <button
        onClick={handleCopy}
        className="absolute top-1 right-1 p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity"
        title="Copy JSON"
      >
        {copied ? <Check className="h-3 w-3 text-chart-1" /> : <Copy className="h-3 w-3" />}
      </button>
      <div className="bg-muted/20 rounded-md p-2 font-mono text-xs overflow-x-auto max-h-96 overflow-y-auto">
        <JsonNode value={data} depth={0} defaultExpanded={defaultExpanded} />
      </div>
    </div>
  );
}
