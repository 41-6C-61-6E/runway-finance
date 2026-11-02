'use client';

import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { Building2 } from 'lucide-react';

export function formatShareCount(n: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(n);
}

export function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

export function resolveGrantLogoSrc(raw?: string | null): string | null {
  const trimmed = (raw || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:image/') || trimmed.startsWith('/')) {
    return trimmed;
  }
  // Route external URLs and company domains (e.g. "stokespace.com") through our same-origin proxy
  // so they comply with `img-src 'self' blob: data:`
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(trimmed)
  ) {
    return `/api/investments/company-logo?q=${encodeURIComponent(trimmed)}`;
  }
  return null;
}

function parseRgbString(str: string, fallback: [number, number, number]): [number, number, number] {
  const m = str.match(/rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i);
  if (!m) return fallback;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/**
 * Inspects a loaded logo image on an offscreen canvas and adapts monochrome / low-contrast
 * pixels so the logo always contrasts cleanly with the active theme's card background.
 */
function adaptLogoToTheme(img: HTMLImageElement, isDarkTheme: boolean, fgRgb: [number, number, number]): string | null {
  try {
    const maxDim = 128;
    const rawW = img.naturalWidth || img.width || 128;
    const rawH = img.naturalHeight || img.height || 128;
    const scale = Math.min(1, maxDim / Math.max(rawW, rawH, 1));
    const w = Math.max(1, Math.round(rawW * scale));
    const h = Math.max(1, Math.round(rawH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;

    let weightedLumSum = 0;
    let weightedSatSum = 0;
    let weightSum = 0;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a <= 20) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const weight = a / 255;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      weightedLumSum += lum * weight;
      weightedSatSum += sat * weight;
      weightSum += weight;
    }

    if (weightSum <= 0) return null;

    const avgLum = weightedLumSum / weightSum;
    const avgSat = weightedSatSum / weightSum;

    const needsLighteningOnDark = isDarkTheme && avgLum < 95;
    const needsDarkeningOnLight = !isDarkTheme && avgLum > 180;

    if (!needsLighteningOnDark && !needsDarkeningOnLight) {
      // Already has strong contrast with the active theme
      return canvas.toDataURL('image/png');
    }

    const [fgR, fgG, fgB] = fgRgb;
    const isNearMonochrome = avgSat < 45;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a <= 5) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      if (isNearMonochrome) {
        if (needsLighteningOnDark) {
          // Map dark monochrome pixels (e.g. black #000000) to the theme's light foreground color
          const t = 1 - lum / 255;
          data[i] = Math.round(fgR * t + r * (1 - t));
          data[i + 1] = Math.round(fgG * t + g * (1 - t));
          data[i + 2] = Math.round(fgB * t + b * (1 - t));
        } else {
          // Map white/light monochrome pixels to the theme's dark foreground color
          const t = lum / 255;
          data[i] = Math.round(fgR * t + r * (1 - t));
          data[i + 1] = Math.round(fgG * t + g * (1 - t));
          data[i + 2] = Math.round(fgB * t + b * (1 - t));
        }
      } else {
        // Colored logo with low contrast: invert channel luminance while preserving hue balance
        data[i] = 255 - r;
        data[i + 1] = 255 - g;
        data[i + 2] = 255 - b;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

export function GrantLogoBadge({
  companyName,
  logoUrl,
  size = 'sm',
}: {
  companyName: string;
  logoUrl?: string | null;
  size?: 'sm' | 'md';
}) {
  const { theme, resolvedTheme } = useTheme();
  const [themeRevision, setThemeRevision] = useState(0);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [processedState, setProcessedState] = useState<{
    key: string;
    dataUrl: string;
  } | null>(null);

  const resolvedSrc = resolveGrantLogoSrc(logoUrl);
  const imgError = Boolean(resolvedSrc && failedSrc === resolvedSrc);
  const dimClass = size === 'md' ? 'w-10 h-10 rounded-xl text-sm' : 'w-8 h-8 rounded-lg text-xs';

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const observer = new MutationObserver(() => {
      setThemeRevision((v) => v + 1);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!resolvedSrc || typeof window === 'undefined') return undefined;

    let cancelled = false;
    const docAttr = document.documentElement.getAttribute('data-theme') || theme || resolvedTheme || 'dark';
    const isDarkTheme = docAttr !== 'light';
    const bodyStyle = window.getComputedStyle(document.body);
    const defaultFg: [number, number, number] = isDarkTheme ? [248, 250, 252] : [15, 23, 42];
    const fgRgb = parseRgbString(bodyStyle.color || '', defaultFg);
    const cacheKey = `${resolvedSrc}::${docAttr}::${themeRevision}`;

    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const adapted = adaptLogoToTheme(img, isDarkTheme, fgRgb);
      if (adapted) {
        setProcessedState({ key: cacheKey, dataUrl: adapted });
      } else {
        setProcessedState({ key: cacheKey, dataUrl: resolvedSrc });
      }
    };
    img.onerror = () => {
      if (cancelled) return;
      setFailedSrc(resolvedSrc);
    };
    img.src = resolvedSrc;

    return () => {
      cancelled = true;
    };
  }, [resolvedSrc, theme, resolvedTheme, themeRevision]);

  const initials = (companyName || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('') || '?';

  if (resolvedSrc && !imgError) {
    const displaySrc =
      processedState && processedState.key.startsWith(`${resolvedSrc}::`)
        ? processedState.dataUrl
        : resolvedSrc;

    return (
      <div
        className={`${dimClass} shrink-0 bg-muted/40 border border-border/60 flex items-center justify-center overflow-hidden p-1.5`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displaySrc}
          alt={companyName || 'Company logo'}
          className="w-full h-full object-contain"
          onError={() => setFailedSrc(resolvedSrc)}
        />
      </div>
    );
  }

  return (
    <div
      className={`${dimClass} shrink-0 bg-primary/10 text-primary border border-primary/20 font-bold flex items-center justify-center`}
    >
      {companyName ? initials : <Building2 className="w-4 h-4 text-muted-foreground" />}
    </div>
  );
}

