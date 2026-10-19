'use client';

import React from 'react';
import Link from 'next/link';
import { usePrivacyMode } from '@/components/privacy-mode-provider';
import { ADVICE_CONFIG } from '@/lib/advice/config';

export interface AdviceMarkdownProps {
  content: string;
  isStreaming?: boolean;
}

export type AskMarkdownProps = AdviceMarkdownProps;

const ALLOWLISTED_PATHS: readonly string[] = ADVICE_CONFIG.ALLOWLISTED_PATHS;

function isAllowlistedHref(href: string): boolean {
  if (!href.startsWith('/')) return false;
  const pathOnly = href.split('?')[0].split('#')[0];
  return ALLOWLISTED_PATHS.includes(pathOnly);
}

/**
 * Parses inline formatting: links, bold, italic, code, line breaks.
 * Strictly uses React children, never dangerouslySetInnerHTML.
 */
function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Regex to match inline elements:
  // 1: [text](href)
  // 2: `code`
  // 3: **bold**
  // 4: *italic* or _italic_
  const regex = /(\[([^\]]+)\]\(([^)]+)\))|(`([^`]+)`)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(_([^_]+)_)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.substring(lastIndex, match.index));
    }

    if (match[1]) {
      // Link: [text](href)
      const linkText = match[2];
      const href = match[3];
      if (isAllowlistedHref(href)) {
        nodes.push(
          <Link
            key={`l-${keyIdx++}`}
            href={href}
            className="text-primary font-medium underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            {linkText}
          </Link>
        );
      } else {
        // External or non-allowlisted: render as plain text only
        nodes.push(`${linkText} (${href})`);
      }
    } else if (match[4]) {
      // Code: `code`
      nodes.push(
        <code
          key={`c-${keyIdx++}`}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
        >
          {match[5]}
        </code>
      );
    } else if (match[6]) {
      // Bold: **bold**
      nodes.push(
        <strong key={`b-${keyIdx++}`} className="font-semibold text-foreground">
          {match[7]}
        </strong>
      );
    } else if (match[8]) {
      // Italic: *italic*
      nodes.push(
        <em key={`i-${keyIdx++}`} className="italic">
          {match[9]}
        </em>
      );
    } else if (match[10]) {
      // Italic: _italic_
      nodes.push(
        <em key={`i-${keyIdx++}`} className="italic">
          {match[11]}
        </em>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.substring(lastIndex));
  }

  return nodes;
}

/**
 * Safe, minimal markdown renderer without HTML injection or dangerouslySetInnerHTML.
 */
export function AdviceMarkdown({ content, isStreaming }: AdviceMarkdownProps) {
  const { privacyMode } = usePrivacyMode();

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  let elemKey = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // 1. Empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // 2. Headings (always render h3 or h4, never h1 or h2 to keep page hierarchy)
    if (trimmed.startsWith('#')) {
      const level = (trimmed.match(/^#+/) || ['#'])[0].length;
      const headingText = trimmed.replace(/^#+\s*/, '');
      if (level <= 2) {
        elements.push(
          <h3
            key={`h-${elemKey++}`}
            className="text-sm font-semibold tracking-tight text-foreground mt-3 mb-1.5"
          >
            {parseInline(headingText)}
          </h3>
        );
      } else {
        elements.push(
          <h4
            key={`h-${elemKey++}`}
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase mt-2 mb-1"
          >
            {parseInline(headingText)}
          </h4>
        );
      }
      i++;
      continue;
    }

    // 3. Tables (GFM pipe tables)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const headerCells = tableLines[0]
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        // Line 1 is the separator (|---|---|)
        const rowLines = tableLines.slice(2);

        elements.push(
          <div key={`t-wrap-${elemKey++}`} className="overflow-x-auto my-2 rounded border border-border">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {headerCells.map((cell, cIdx) => (
                    <th key={`th-${cIdx}`} className="px-2 py-1.5 font-medium text-foreground">
                      {parseInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rowLines.map((rowLine, rIdx) => {
                  const cells = rowLine
                    .slice(1, -1)
                    .split('|')
                    .map((c) => c.trim());
                  return (
                    <tr key={`tr-${rIdx}`} className="hover:bg-muted/30 transition-colors">
                      {cells.map((cell, cIdx) => (
                        <td key={`td-${cIdx}`} className="px-2 py-1 text-muted-foreground">
                          {parseInline(cell)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // 4. Bullet lists
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const listItems: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
        listItems.push(lines[i].trim().substring(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${elemKey++}`} className="list-disc list-inside space-y-1 text-xs my-1 text-foreground">
          {listItems.map((item, idx) => (
            <li key={`li-${idx}`}>{parseInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // 5. Numbered lists
    if (/^\d+\.\s/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s*/, ''));
        i++;
      }
      elements.push(
        <ol key={`ol-${elemKey++}`} className="list-decimal list-inside space-y-1 text-xs my-1 text-foreground">
          {listItems.map((item, idx) => (
            <li key={`oli-${idx}`}>{parseInline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // 6. Regular paragraphs
    elements.push(
      <p key={`p-${elemKey++}`} className="text-xs leading-relaxed text-foreground my-1">
        {parseInline(trimmed)}
      </p>
    );
    i++;
  }

  return (
    <div
      className={`prose prose-xs max-w-none text-foreground space-y-1 ${
        privacyMode ? 'filter blur-[5px] select-none transition-all' : ''
      }`}
    >
      {elements}
      {isStreaming && (
        <span className="inline-block w-1.5 h-3 ml-0.5 bg-primary animate-pulse align-middle" />
      )}
    </div>
  );
}

export const AskMarkdown = AdviceMarkdown;
