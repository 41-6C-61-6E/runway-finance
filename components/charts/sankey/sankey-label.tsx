'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

const ELLIPSIS = '…';

function fitsWidth(measureEl: SVGTextElement, s: string, maxW: number): boolean {
  measureEl.textContent = s;
  return measureEl.getComputedTextLength() <= maxW;
}

/** Return `str` unchanged if it fits `maxW`; else the longest prefix + one `…` that does. */
export function truncateWithEllipsis(measureEl: SVGTextElement, str: string, maxW: number): string {
  if (!str || maxW <= 0) return '';
  if (fitsWidth(measureEl, str, maxW)) return str;
  let s = str;
  while (s.length > 1) {
    s = s.slice(0, -1);
    const candidate = `${s}${ELLIPSIS}`;
    if (fitsWidth(measureEl, candidate, maxW)) return candidate;
  }
  return ELLIPSIS;
}

/**
 * Greedily wrap `text` into ≤ `maxLines` lines each fitting `maxW`. When the
 * text can't fit, the last line is ellipsized to account for the dropped
 * words (classic "wrap N lines + …").
 */
export function wrapToLines(measureEl: SVGTextElement, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (maxW <= 0) return [];

  const lines: string[] = [];
  let cur = '';
  for (let i = 0; i < words.length; i++) {
    const cand = cur ? `${cur} ${words[i]}` : words[i];
    if (fitsWidth(measureEl, cand, maxW)) {
      cur = cand;
      continue;
    }
    if (!cur) {
      // A single word is wider than the gutter: it starts the line; the rest of
      // the words are folded into it and ellipsized on final push.
      cur = words.slice(i).join(' ');
      i = words.length - 1;
      break;
    }
    lines.push(cur);
    cur = words[i]; // this word would start the next line
    if (lines.length >= maxLines) {
      // Out of lines: fold the unplaced word(s) into an ellipsized last line.
      lines[lines.length - 1] = truncateWithEllipsis(
        measureEl,
        [lines[lines.length - 1], cur, ...words.slice(i + 1)].join(' '),
        maxW,
      );
      cur = '';
      i = words.length - 1;
      break;
    }
  }

  if (cur) {
    lines.push(fitsWidth(measureEl, cur, maxW) ? cur : truncateWithEllipsis(measureEl, cur, maxW));
  }
  return lines;
}

/**
 * Measured sankey node label.
 *
 * The three sankey charts (`sankey-nodes.tsx`, `cash-flow-sankey.tsx`,
 * `wealth-flow-sankey.tsx`) each hard-truncated node names at a *character
 * count* (22/8/24), which reads as "Payroll Tax (SS / Medi…" at 1440px with
 * hundreds of blank canvas pixels to the right. This component truncates
 * against the *actual measured pixel width* (`maxW`) instead:
 *
 *   1. render at full size whenever the measured width allows;
 *   2. otherwise wrap to up to two lines at word boundaries;
 *   3. if it still doesn't fit, ellipsize with `…`.
 *
 * Measurement happens in a `useLayoutEffect` via `getComputedTextLength()` on a
 * hidden `<text>` twin, re-run once `document.fonts.ready` resolves so the
 * first paint (webfont not yet loaded) doesn't leave a stale truncation. A
 * native SVG `<title>` carries the un-truncated text for an on-hover tooltip.
 *
 * It also owns the optional second "value" line (`+$2,393` / `12.3%`) the old
 * code drew as a separate `<text>` with hand-tuned `y` offsets — here the
 * whole block (name + value) is positioned as one unit around `y`.
 */
export interface SankeyLabelProps {
  /** The node name to display. */
  text: string;
  /** Anchor x shared by every line (keeps the wrapped block aligned). */
  x: number;
  /** Vertical center of the whole label block. */
  y: number;
  /** Available pixel width to fit within (the real gutter, not a char count). */
  maxW: number;
  /** Text alignment: `'start'` (left) or `'end'` (right). */
  anchor?: 'start' | 'end';
  /** Primary line size. @default 10 */
  fontSize?: number;
  /** Primary line weight. @default 600 (node names render semibold). */
  fontWeight?: number;
  /** Line spacing multiplier over `fontSize`. @default 1.25 */
  lineHeight?: number;
  /** Max wrapped lines for the name. @default 2 */
  maxLines?: number;
  /** Optional value/secondary line (e.g. "+$2,393"). Kept on one line. */
  value?: string;
  /** Class for the name lines (custom colors/fills; base is `fill-foreground`). */
  className?: string;
  /** Class for the value line (base is `fill-muted-foreground blur-number`). */
  valueClassName?: string;
  /** Size multiplier for the value line vs `fontSize`. @default 0.9 */
  valueSizeFactor?: number;
  /** Opacity for the whole label (charts pass 0.3 when dimmed). @default 1 */
  opacity?: number;
  /** Full un-truncated text for the hover tooltip. @default `text` */
  title?: string;
}

const SankeyLabel = React.forwardRef<SVGGElement, SankeyLabelProps>(function SankeyLabel(
  {
    text,
    x,
    y,
    maxW,
    anchor = 'start',
    fontSize = 10,
    fontWeight = 600,
    lineHeight = 1.25,
    maxLines = 2,
    value,
    className,
    valueClassName,
    valueSizeFactor = 0.9,
    opacity = 1,
    title,
  },
  ref
) {
  const measureRef = React.useRef<SVGTextElement | null>(null);
  const [fontsReady, setFontsReady] = React.useState(false);
  // Start un-truncated; the layout effect below corrects it before paint.
  const [lines, setLines] = React.useState<string[]>(() => (text ? [text] : []));

  // Re-measure once webfonts settle so fallback metrics don't leave a
  // wrong truncation behind the real font.
  React.useEffect(() => {
    let on = true;
    if (typeof document === 'undefined' || !('fonts' in document)) {
      setFontsReady(true);
      return;
    }
    document.fonts.ready.then(() => {
      if (on) setFontsReady(true);
    });
    return () => {
      on = false;
    };
  }, []);

  React.useLayoutEffect(() => {
    const el = measureRef.current;
    const safeMaxW = Math.max(0, maxW);
    if (!text || safeMaxW <= 0) {
      // No room at all → hide the label rather than draw across the gutter.
      setLines([]);
      return;
    }
    if (typeof window === 'undefined' || !el) {
      setLines([text]);
      return;
    }
    setLines(wrapToLines(el, text, safeMaxW, maxLines));
  }, [text, maxW, maxLines, fontSize, fontWeight, fontsReady]);

  const hasValue = value != null && value !== '';
  const totalLines = lines.length + (hasValue ? 1 : 0);
  if (totalLines === 0) return null;

  const lineH = fontSize * lineHeight;
  const valueSize = fontSize * valueSizeFactor;
  // Center the whole block (name lines + optional value line) around y.
  const centerY = (i: number) => y + (i - (totalLines - 1) / 2) * lineH;

  const isTruncated = lines.some((l) => l.includes(ELLIPSIS));

  return (
    <g ref={ref} style={{ opacity }}>
      {isTruncated && <title>{title ?? text}</title>}
      {lines.map((line, i) => (
        <text
          key={i}
          x={x}
          y={centerY(i)}
          textAnchor={anchor}
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight={fontWeight}
          fill="currentColor"
          className={cn('select-none fill-foreground', className)}
        >
          {line}
        </text>
      ))}
      {hasValue && (
        <text
          x={x}
          y={centerY(lines.length)}
          textAnchor={anchor}
          dominantBaseline="central"
          fontSize={valueSize}
          fill="currentColor"
          className={cn('select-none fill-muted-foreground blur-number', valueClassName)}
        >
          {value}
        </text>
      )}
      {/* Hidden twin used for width measurement (never painted). */}
      <text
        ref={measureRef}
        x={0}
        y={0}
        opacity={0}
        aria-hidden="true"
        fontSize={fontSize}
        fontWeight={fontWeight}
        style={{ pointerEvents: 'none' }}
      />
    </g>
  );
});

export { SankeyLabel };
