'use client';

import React from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { usePrivacyMode } from '@/components/privacy-mode-provider';

export interface SourceItem {
  packId: string;
  label: string;
  period?: string;
  href: string;
}

interface AskSourcesProps {
  sources: SourceItem[];
}

export function AskSources({ sources }: AskSourcesProps) {
  const { privacyMode } = usePrivacyMode();

  if (!sources || sources.length === 0) return null;

  return (
    <div
      className={`mt-2.5 pt-2 border-t border-border/40 flex flex-wrap items-center gap-1.5 ${
        privacyMode ? 'filter blur-[5px] select-none transition-all' : ''
      }`}
    >
      <span className="text-[11px] font-medium text-muted-foreground mr-1">
        Based on:
      </span>
      {sources.map((src, idx) => {
        const text = src.period ? `${src.label} (${src.period})` : src.label;
        return (
          <Link
            key={`${src.packId}-${idx}`}
            href={src.href}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 hover:bg-muted text-[11px] font-medium text-muted-foreground hover:text-foreground border border-border/50 transition-colors"
          >
            <span>{text}</span>
            <ExternalLink className="w-2.5 h-2.5 opacity-60" />
          </Link>
        );
      })}
    </div>
  );
}
