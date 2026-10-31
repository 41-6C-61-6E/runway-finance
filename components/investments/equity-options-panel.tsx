'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  Rocket,
  Plus,
  Calendar,
  TrendingUp,
  DollarSign,
  ShieldAlert,
  Pencil,
  Trash2,
  Calculator,
  CheckCircle2,
  Clock,
  Layers,
  Sparkles,
  Upload,
  X,
  Building2,
} from 'lucide-react';
import {
  formatBalance,
  formatAmount,
  formatCompactCurrency,
  formatPlainPercent,
  formatDate,
} from '@/lib/utils/format';
import {
  buildPortfolioVestingTimeline,
  computeGrantMetrics,
  addMonthsDateStr,
  type EquityGrantType,
  type EquityValuationMode,
  type VestingFrequency,
  type CustomVestingTranche,
} from '@/lib/utils/vesting';
import type { EquityGrantWithMetrics } from '@/lib/services/equity-grants';
import { invalidateAfterAccountChange } from '@/lib/query-invalidation';
import { ActionButton, AddButton } from '@/components/ui/action-button';
import { AppTabs } from '@/components/ui/app-tabs';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ChartTooltip, TooltipHeader, TooltipRow } from '@/components/charts/chart-tooltip';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface EquityGrantsApiResponse {
  grants: EquityGrantWithMetrics[];
  summary: {
    totalVestedValue: number;
    totalVestedValueFmv: number;
    totalVestedValuePreferred: number;
    totalUnvestedValue: number;
    totalPotentialValue: number;
    totalSharesGranted: number;
    totalVestedShares: number;
    totalUnvestedShares: number;
    totalExercisedShares: number;
    totalCashToExerciseVested: number;
    totalIsoAmtBargainElement: number;
    totalEstimatedTaxOnExercise: number;
    nextVestEvent: {
      date: string;
      shares: number;
      grantName: string;
      companyName: string;
    } | null;
  };
}

const GRANT_TYPE_LABELS: Record<EquityGrantType, { short: string; full: string; badgeClass: string }> = {
  iso: {
    short: 'ISO',
    full: 'Incentive Stock Options (ISO)',
    badgeClass: 'bg-chart-1/15 text-chart-1 border-chart-1/30',
  },
  nso: {
    short: 'NSO',
    full: 'Non-Qualified Stock Options (NSO)',
    badgeClass: 'bg-chart-2/15 text-chart-2 border-chart-2/30',
  },
  rsu: {
    short: 'RSU',
    full: 'Restricted Stock Units (RSU)',
    badgeClass: 'bg-chart-3/15 text-chart-3 border-chart-3/30',
  },
  common: {
    short: 'Common / Early Ex.',
    full: 'Direct / Early-Exercised Shares',
    badgeClass: 'bg-chart-4/15 text-chart-4 border-chart-4/30',
  },
};

function formatShareCount(n: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(n);
}

function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function resolveGrantLogoSrc(raw?: string | null): string | null {
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

function GrantLogoBadge({
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
    if (typeof document === 'undefined') return;
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
    if (!resolvedSrc || typeof window === 'undefined') return;

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

export function EquityOptionsPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<EquityGrantsApiResponse>({
    queryKey: ['equity-grants'],
    queryFn: async () => {
      const res = await fetch('/api/investments/equity-grants', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load equity grants');
      return res.json();
    },
  });

  const grants = data?.grants ?? [];
  const summary = data?.summary;

  // Chart controls
  const [chartMetric, setChartMetric] = useState<'value' | 'shares'>('value');

  // Drawer state for Create / Edit
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingGrant, setEditingGrant] = useState<EquityGrantWithMetrics | null>(null);
  const [deletingGrant, setDeletingGrant] = useState<EquityGrantWithMetrics | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form fields
  const todayStr = new Date().toISOString().split('T')[0];
  const [companyName, setCompanyName] = useState('');
  const [grantName, setGrantName] = useState('');
  const [grantType, setGrantType] = useState<EquityGrantType>('iso');
  const [grantDate, setGrantDate] = useState('');
  const [vestingStartDate, setVestingStartDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [totalShares, setTotalShares] = useState('');
  const [exercisedShares, setExercisedShares] = useState('0');
  const [soldShares, setSoldShares] = useState('0');
  const [strikePrice, setStrikePrice] = useState('');
  const [currentFmv, setCurrentFmv] = useState('');
  const [preferredPrice, setPreferredPrice] = useState('');
  const [valuationMode, setValuationMode] = useState<EquityValuationMode>('fmv');
  const [vestingPreset, setVestingPreset] = useState<string>('standard_48_12');
  const [totalMonths, setTotalMonths] = useState('48');
  const [cliffMonths, setCliffMonths] = useState('12');
  const [cliffPercent, setCliffPercent] = useState('25');
  const [vestingFrequency, setVestingFrequency] = useState<VestingFrequency>('monthly');
  const [customTranches, setCustomTranches] = useState<CustomVestingTranche[]>([]);
  const [earlyExerciseAllowed, setEarlyExerciseAllowed] = useState(false);
  const [filed83b, setFiled83b] = useState(false);
  const [isExcludedFromNetWorth, setIsExcludedFromNetWorth] = useState(false);
  const [applyValuationToCompany, setApplyValuationToCompany] = useState(true);
  const [logoUrl, setLogoUrl] = useState('');
  const [notes, setNotes] = useState('');
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFormError('Please select a valid image file (PNG, JPG, SVG, or WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;

      // Keep small SVGs directly; resize raster images to at most 128x128 so storage stays compact
      if (file.type === 'image/svg+xml' && dataUrl.length < 60000) {
        setLogoUrl(dataUrl);
        return;
      }

      const img = new window.Image();
      img.onload = () => {
        const maxDim = 128;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          setLogoUrl(canvas.toDataURL('image/png', 0.9));
        } else {
          setLogoUrl(dataUrl);
        }
      };
      img.onerror = () => {
        setLogoUrl(dataUrl);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const openCreateDrawer = () => {
    setEditingGrant(null);
    setFormError(null);

    setCompanyName('');
    setGrantName('');
    setGrantType('iso');
    setGrantDate('');
    setVestingStartDate('');
    setExpirationDate('');
    setTotalShares('');
    setExercisedShares('0');
    setSoldShares('0');
    setStrikePrice('');
    setCurrentFmv('');
    setPreferredPrice('');
    setValuationMode('fmv');
    setVestingPreset('standard_48_12');
    setTotalMonths('48');
    setCliffMonths('12');
    setCliffPercent('25');
    setVestingFrequency('monthly');
    setCustomTranches([]);
    setEarlyExerciseAllowed(false);
    setFiled83b(false);
    setIsExcludedFromNetWorth(false);
    setApplyValuationToCompany(true);
    setLogoUrl('');
    setNotes('');
    setSheetOpen(true);
  };

  const detectVestingPreset = (sched: {
    totalMonths: number;
    cliffMonths: number;
    cliffPercent: number;
    frequency: VestingFrequency;
  }): string => {
    if (sched.frequency === 'immediate' || sched.totalMonths === 0) return 'immediate';
    if (sched.frequency === 'custom') return 'custom_tranches';
    if (
      sched.frequency === 'monthly' &&
      sched.totalMonths === 48 &&
      sched.cliffMonths === 12 &&
      Math.abs(sched.cliffPercent - 25) < 0.01
    ) {
      return 'standard_48_12';
    }
    if (
      sched.frequency === 'monthly' &&
      sched.totalMonths === 48 &&
      sched.cliffMonths === 0 &&
      sched.cliffPercent === 0
    ) {
      return 'monthly_48_0';
    }
    if (
      sched.frequency === 'quarterly' &&
      sched.totalMonths === 48 &&
      sched.cliffMonths === 12 &&
      Math.abs(sched.cliffPercent - 25) < 0.01
    ) {
      return 'quarterly_48_12';
    }
    if (
      sched.frequency === 'monthly' &&
      sched.totalMonths === 36 &&
      sched.cliffMonths === 12 &&
      Math.abs(sched.cliffPercent - 33.33) < 0.5
    ) {
      return 'standard_36_12';
    }
    return 'custom_periodic';
  };

  const handleVestingPresetChange = (preset: string) => {
    setVestingPreset(preset);
    if (preset === 'standard_48_12') {
      setVestingFrequency('monthly');
      setTotalMonths('48');
      setCliffMonths('12');
      setCliffPercent('25');
    } else if (preset === 'monthly_48_0') {
      setVestingFrequency('monthly');
      setTotalMonths('48');
      setCliffMonths('0');
      setCliffPercent('0');
    } else if (preset === 'quarterly_48_12') {
      setVestingFrequency('quarterly');
      setTotalMonths('48');
      setCliffMonths('12');
      setCliffPercent('25');
    } else if (preset === 'standard_36_12') {
      setVestingFrequency('monthly');
      setTotalMonths('36');
      setCliffMonths('12');
      setCliffPercent('33.33');
    } else if (preset === 'immediate') {
      setVestingFrequency('immediate');
      setTotalMonths('0');
      setCliffMonths('0');
      setCliffPercent('100');
    } else if (preset === 'custom_tranches') {
      setVestingFrequency('custom');
    } else if (preset === 'custom_periodic') {
      if (vestingFrequency === 'immediate' || vestingFrequency === 'custom') {
        setVestingFrequency('monthly');
      }
    }
  };

  const openEditDrawer = (g: EquityGrantWithMetrics) => {
    setEditingGrant(g);
    setFormError(null);
    setCompanyName(g.companyName);
    setGrantName(g.grantName);
    setGrantType(g.grantType);
    setGrantDate(g.grantDate);
    setVestingStartDate(g.vestingStartDate);
    setExpirationDate(g.expirationDate || '');
    setTotalShares(String(g.totalShares));
    setExercisedShares(String(g.exercisedShares));
    setSoldShares(String(g.soldShares));
    setStrikePrice(String(g.strikePrice));
    setCurrentFmv(String(g.currentFmv));
    setPreferredPrice(g.preferredPrice != null ? String(g.preferredPrice) : '');
    setValuationMode(g.valuationMode);
    setVestingPreset(detectVestingPreset(g.vestingSchedule));
    setTotalMonths(String(g.vestingSchedule.totalMonths));
    setCliffMonths(String(g.vestingSchedule.cliffMonths));
    setCliffPercent(String(g.vestingSchedule.cliffPercent));
    setVestingFrequency(g.vestingSchedule.frequency);
    setCustomTranches(g.vestingSchedule.customTranches || []);
    setEarlyExerciseAllowed(Boolean(g.earlyExerciseAllowed));
    setFiled83b(Boolean(g.filed83b));
    setIsExcludedFromNetWorth(g.isExcludedFromNetWorth);
    setApplyValuationToCompany(true);
    setLogoUrl(g.logoUrl || '');
    setNotes(g.notes || '');
    setSheetOpen(true);
  };

  const handleSaveGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedTotalShares = parseFloat(totalShares);
    const parsedExercised = parseFloat(exercisedShares || '0') || 0;
    const parsedSold = parseFloat(soldShares || '0') || 0;
    const parsedStrike = grantType === 'rsu' ? 0 : parseFloat(strikePrice || '0') || 0;
    const parsedFmv = parseFloat(currentFmv || '0') || 0;
    const parsedPref = preferredPrice.trim() !== '' ? parseFloat(preferredPrice) : null;

    if (!companyName.trim() || !grantName.trim()) {
      setFormError('Company name and grant name are required.');
      return;
    }
    if (isNaN(parsedTotalShares) || parsedTotalShares <= 0) {
      setFormError('Total shares must be greater than 0.');
      return;
    }
    if (parsedExercised > parsedTotalShares) {
      setFormError('Exercised shares cannot exceed total shares granted.');
      return;
    }
    if (parsedSold > parsedTotalShares) {
      setFormError('Sold shares cannot exceed total shares.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        companyName: companyName.trim(),
        grantName: grantName.trim(),
        grantType,
        grantDate,
        vestingStartDate: vestingStartDate || grantDate,
        expirationDate: expirationDate.trim() !== '' ? expirationDate : null,
        totalShares: parsedTotalShares,
        exercisedShares: parsedExercised,
        soldShares: parsedSold,
        strikePrice: parsedStrike,
        currentFmv: parsedFmv,
        preferredPrice: parsedPref !== null && !isNaN(parsedPref) ? parsedPref : null,
        valuationMode,
        vestingSchedule: {
          totalMonths: vestingFrequency === 'immediate' ? 0 : Math.max(0, parseInt(totalMonths, 10) || 48),
          cliffMonths: vestingFrequency === 'immediate' ? 0 : Math.max(0, parseInt(cliffMonths, 10) || 0),
          cliffPercent: vestingFrequency === 'immediate' ? 100 : Math.max(0, parseFloat(cliffPercent) || 0),
          frequency: vestingFrequency,
          ...(vestingFrequency === 'custom' ? { customTranches } : {}),
        },
        earlyExerciseAllowed,
        filed83b,
        isExcludedFromNetWorth,
        logoUrl: logoUrl.trim() || null,
        notes: notes.trim() || null,
        ...(editingGrant ? { applyValuationToCompany } : {}),
      };

      const url = editingGrant
        ? `/api/investments/equity-grants/${editingGrant.id}`
        : '/api/investments/equity-grants';
      const method = editingGrant ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.message || 'Failed to save equity grant');
      }

      setSheetOpen(false);
      invalidateAfterAccountChange(queryClient);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save equity grant');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingGrant) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/investments/equity-grants/${deletingGrant.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete grant');
      setDeletingGrant(null);
      invalidateAfterAccountChange(queryClient);
    } catch {
      // keep dialog open or close
      setDeletingGrant(null);
    } finally {
      setDeleting(false);
    }
  };

  // Timeline series across all grants
  const timelineData = useMemo(() => {
    if (grants.length === 0) return [];
    return buildPortfolioVestingTimeline(grants, todayStr);
  }, [grants, todayStr]);

  // Exercise & Tax Breakdown Calculations (at current active valuation)
  const baseSharePrice = useMemo(() => {
    if (grants.length === 0) return 0;
    return grants[0].metrics.effectiveSharePrice;
  }, [grants]);

  const exerciseBreakdown = useMemo(() => {
    if (grants.length === 0) {
      return {
        vestedGrossValue: 0,
        totalGrossValue: 0,
        cashToExerciseAll: 0,
        cashToExerciseVested: 0,
        exercisedCostBasis: 0,
        isoAmtBargainElement: 0,
        estimatedTaxOnVestedExercise: 0,
        estimatedExitTax: 0,
        netTotalPayout: 0,
      };
    }

    let vestedIntrinsic = 0;
    let totalPotential = 0;
    let cashToExerciseVested = 0;
    let cashToExerciseAll = 0;
    let exercisedCostBasis = 0;
    let isoAmtBargainElement = 0;
    let estimatedTaxOnVestedExercise = 0;
    let estimatedExitTax = 0;

    for (const g of grants) {
      const m = computeGrantMetrics(g, todayStr);
      vestedIntrinsic += m.vestedIntrinsicValue;
      totalPotential += m.totalPotentialValue;
      cashToExerciseVested += m.cashToExerciseVested;
      cashToExerciseAll += m.cashToExerciseAll;
      exercisedCostBasis += m.exercisedCostBasis;
      isoAmtBargainElement += m.isoAmtBargainElement;
      estimatedTaxOnVestedExercise += m.estimatedTaxOnVestedExercise;

      const taxRate = g.grantType === 'nso' || g.grantType === 'rsu' ? 0.32 : 0.238;
      estimatedExitTax += m.totalPotentialValue * taxRate;
    }

    return {
      vestedGrossValue: vestedIntrinsic,
      totalGrossValue: totalPotential,
      cashToExerciseVested,
      cashToExerciseAll,
      exercisedCostBasis,
      isoAmtBargainElement,
      estimatedTaxOnVestedExercise,
      estimatedExitTax: Math.round(estimatedExitTax * 100) / 100,
      netTotalPayout: Math.max(0, totalPotential - estimatedExitTax),
    };
  }, [grants, todayStr]);

  if (isLoading) {
    return <LoadingSpinner category="default" className="min-h-[320px]" />;
  }

  if (error) {
    return (
      <div className="p-6 border border-destructive/20 bg-destructive/10 rounded-xl text-center space-y-2">
        <p className="text-xs font-semibold text-destructive">Failed to load equity grants</p>
      </div>
    );
  }

  const totalVestedPct =
    summary && summary.totalSharesGranted > 0
      ? (summary.totalVestedShares / summary.totalSharesGranted) * 100
      : 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      {grants.length === 0 ? (
        /* Empty / Onboarding State for Private Equity & Stock Options */
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-10 text-center max-w-2xl mx-auto space-y-5 shadow-xs">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Rocket className="w-7 h-7" />
          </div>
          <div className="space-y-2">
            <h3 className="text-base sm:text-lg font-bold text-foreground">
              Track Your Company Stock Options & Private Equity
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-lg mx-auto">
              Add your option grants (ISOs, NSOs, RSUs, or early-exercised shares) to automatically track your vesting schedule, cliff dates, 409A vs. preferred valuation, exercise costs, and exit scenarios.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left border-y border-border/60 py-4">
            <div className="space-y-1 p-1">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-chart-1 shrink-0" />
                <span>Automated Vesting</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Daily cliff & monthly/quarterly tranche calculations with historical net worth snapshots.
              </p>
            </div>
            <div className="space-y-1 p-1">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-chart-2 shrink-0" />
                <span>409A & Preferred</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Track conservative 409A FMV alongside preferred round prices and custom exit multipliers.
              </p>
            </div>
            <div className="space-y-1 p-1">
              <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-chart-3 shrink-0" />
                <span>Exercise & AMT Math</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                See exact cash required to exercise vested options and estimated ISO AMT bargain element.
              </p>
            </div>
          </div>
          <div>
            <ActionButton variant="primary" size="lg" icon={Plus} onClick={openCreateDrawer}>
              Add Option Grant
            </ActionButton>
          </div>
        </div>
      ) : (
        <>
          {/* ── Top Summary Scorecard ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
            {/* Card 1: Vested Intrinsic Value */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                <span>Vested Intrinsic Value</span>
                <TrendingUp className="w-4 h-4 text-chart-1 shrink-0" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-foreground blur-number">
                {formatBalance(summary?.totalVestedValue ?? 0)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span>409A: {formatBalance(summary?.totalVestedValueFmv ?? 0)}</span>
                {summary && summary.totalVestedValuePreferred !== summary.totalVestedValueFmv && (
                  <span className="text-chart-2 font-medium">
                    Pref: {formatBalance(summary.totalVestedValuePreferred)}
                  </span>
                )}
              </div>
            </div>

            {/* Card 2: Unvested & Total Potential */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                <span>Unvested (&ldquo;On the Table&rdquo;)</span>
                <Sparkles className="w-4 h-4 text-chart-2 shrink-0" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-foreground blur-number">
                {formatBalance(summary?.totalUnvestedValue ?? 0)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span>Total Potential Value:</span>
                <span className="font-mono font-semibold text-foreground blur-number">
                  {formatBalance(summary?.totalPotentialValue ?? 0)}
                </span>
              </div>
            </div>

            {/* Card 3: Vesting Progress & Next Tranche */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                <span>Vested Shares ({formatPlainPercent(totalVestedPct)})</span>
                <Calendar className="w-4 h-4 text-chart-3 shrink-0" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-foreground blur-number">
                {formatShareCount(summary?.totalVestedShares ?? 0)}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  / {formatShareCount(summary?.totalSharesGranted ?? 0)}
                </span>
              </div>
              <div className="w-full bg-muted/40 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-chart-1 h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, totalVestedPct)}%` }}
                />
              </div>
              <div className="text-[11px] text-muted-foreground truncate pt-0.5">
                {summary?.nextVestEvent ? (
                  <span>
                    Next:{' '}
                    <strong className="text-foreground font-mono">
                      +{formatShareCount(summary.nextVestEvent.shares)}
                    </strong>{' '}
                    on {formatDate(summary.nextVestEvent.date)} (
                    {getDaysUntil(summary.nextVestEvent.date)}d)
                  </span>
                ) : (
                  <span className="text-chart-1 font-medium">All active grants fully vested</span>
                )}
              </div>
            </div>

            {/* Card 4: Exercise Cost & AMT Exposure */}
            <div className="bg-card border border-border rounded-xl p-4 shadow-xs space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                <span>Cost to Exercise Vested</span>
                <DollarSign className="w-4 h-4 text-chart-4 shrink-0" />
              </div>
              <div className="text-2xl font-extrabold font-mono text-foreground blur-number">
                {formatBalance(summary?.totalCashToExerciseVested ?? 0)}
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <span>ISO AMT Spread:</span>
                <span className="font-mono font-semibold text-foreground blur-number">
                  {formatBalance(summary?.totalIsoAmtBargainElement ?? 0)}
                </span>
              </div>
            </div>
          </div>

          {/* ── Vesting Schedule Chart & Scenario Calculator ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6 items-stretch">
            {/* Vesting Schedule Timeline (2 columns on desktop) */}
            <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4 sm:p-5 shadow-xs flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b border-border/60 pb-3">
                <div>
                  <h3 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
                    <Layers className="w-4 h-4 text-primary" />
                    <span>Vesting Schedule & Value Trajectory</span>
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Historical and projected cumulative vesting across all option grants
                  </p>
                </div>
                <AppTabs
                  tabs={[
                    { id: 'value', label: 'Intrinsic Value ($)' },
                    { id: 'shares', label: 'Shares (#)' },
                  ]}
                  activeTab={chartMetric}
                  onChange={(id) => setChartMetric(id as 'value' | 'shares')}
                  variant="pills"
                  size="sm"
                />
              </div>

              <div className="flex-1 min-h-[260px] w-full">
                <ResponsiveContainer
                  width="100%"
                  height={260}
                  minWidth={0}
                  minHeight={0}
                  initialDimension={{ width: 400, height: 260 }}
                >
                  <AreaChart data={timelineData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="equityVestedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-chart-1)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="equityUnvestedGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--color-chart-2)" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="var(--color-chart-2)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.4} />
                    <XAxis
                      dataKey="monthLabel"
                      tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={28}
                    />
                    <YAxis
                      tickFormatter={(val) =>
                        chartMetric === 'value' ? formatCompactCurrency(val) : formatShareCount(val)
                      }
                      tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                      tickLine={false}
                      axisLine={false}
                      width={60}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        const pt = payload[0].payload;
                        return (
                          <ChartTooltip>
                            <TooltipHeader>
                              {pt.monthLabel} {pt.isPastOrToday ? '(Vested to Date)' : '(Projected)'}
                            </TooltipHeader>
                            {chartMetric === 'value' ? (
                              <>
                                <TooltipRow
                                  label="Vested Value"
                                  value={formatBalance(pt.vestedValueEffective)}
                                  color="var(--color-chart-1)"
                                />
                                <TooltipRow
                                  label="Unvested Value"
                                  value={formatBalance(pt.unvestedValueEffective)}
                                  color="var(--color-chart-2)"
                                />
                                <TooltipRow
                                  label="Total Potential"
                                  value={formatBalance(pt.totalPotentialValue)}
                                />
                              </>
                            ) : (
                              <>
                                <TooltipRow
                                  label="Vested Shares"
                                  value={formatShareCount(pt.vestedShares)}
                                  color="var(--color-chart-1)"
                                />
                                <TooltipRow
                                  label="Unvested Shares"
                                  value={formatShareCount(pt.unvestedShares)}
                                  color="var(--color-chart-2)"
                                />
                              </>
                            )}
                          </ChartTooltip>
                        );
                      }}
                    />
                    <ReferenceLine
                      x={timelineData.find((p) => p.date === todayStr)?.monthLabel}
                      stroke="var(--color-primary)"
                      strokeDasharray="4 4"
                      label={{
                        value: 'Today',
                        position: 'insideTopLeft',
                        fill: 'var(--color-primary)',
                        fontSize: 11,
                      }}
                    />
                    <Area
                      type="stepAfter"
                      dataKey={chartMetric === 'value' ? 'vestedValueEffective' : 'vestedShares'}
                      stackId="1"
                      stroke="var(--color-chart-1)"
                      strokeWidth={2}
                      fill="url(#equityVestedGrad)"
                      name="Vested"
                    />
                    <Area
                      type="stepAfter"
                      dataKey={chartMetric === 'value' ? 'unvestedValueEffective' : 'unvestedShares'}
                      stackId="1"
                      stroke="var(--color-chart-2)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      fill="url(#equityUnvestedGrad)"
                      name="Unvested"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Estimated Exercise Cost & Tax Breakdown */}
            <div className="bg-card border border-border rounded-xl p-4 sm:p-5 shadow-xs flex flex-col justify-between space-y-4">
              <div className="border-b border-border/60 pb-3">
                <h3 className="text-sm sm:text-base font-semibold text-foreground flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-chart-2" />
                  <span>Estimated Exercise Cost &amp; Tax</span>
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Cash required to exercise and estimated tax impact at current share valuation
                </p>
              </div>

              <div className="bg-muted/30 border border-border/60 rounded-xl p-3.5 space-y-2.5 text-xs flex-1 flex flex-col justify-between">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="text-muted-foreground font-medium">Active Share Price</span>
                    <span className="font-mono font-bold text-foreground">
                      {formatAmount(baseSharePrice)} / sh
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Cash to Exercise (Vested)</span>
                    <span className="font-mono font-semibold text-foreground blur-number">
                      {formatBalance(exerciseBreakdown.cashToExerciseVested)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Total Exercise Cost (All Shares)</span>
                    <span className="font-mono blur-number">
                      {formatBalance(exerciseBreakdown.cashToExerciseAll)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>ISO AMT Bargain Element (Vested)</span>
                    <span className="font-mono blur-number">
                      {formatBalance(exerciseBreakdown.isoAmtBargainElement)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Est. Tax on Vested Exercise</span>
                    <span className="font-mono text-destructive blur-number">
                      {formatBalance(exerciseBreakdown.estimatedTaxOnVestedExercise)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <span className="text-muted-foreground">Vested Intrinsic Value</span>
                    <span className="font-mono font-semibold text-chart-1 blur-number">
                      {formatBalance(exerciseBreakdown.vestedGrossValue)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Fully-Vested Spread</span>
                    <span className="font-mono font-semibold text-foreground blur-number">
                      {formatBalance(exerciseBreakdown.totalGrossValue)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Est. Full Exit Tax (~23.8%–32%)</span>
                    <span className="font-mono text-destructive blur-number">
                      -{formatBalance(exerciseBreakdown.estimatedExitTax)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-border/60 text-sm">
                  <span className="font-bold text-foreground">Est. Net Value (Fully Vested)</span>
                  <span className="font-mono font-extrabold text-chart-1 blur-number">
                    {formatBalance(exerciseBreakdown.netTotalPayout)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Grants Portfolio Table ── */}
          <div className="bg-card border border-border rounded-xl shadow-xs p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-foreground">
                  Option Grants & Equity Holdings
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Manage individual option grants, strike prices, 409A / preferred valuations, and exercise records.
                </p>
              </div>
              <AddButton variant="primary" onClick={openCreateDrawer}>
                Add Grant
              </AddButton>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/60 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-2.5 pr-3">Grant / Company</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Vesting Progress</th>
                    <th className="py-2.5 px-3 text-right">Strike</th>
                    <th className="py-2.5 px-3 text-right">Share Price</th>
                    <th className="py-2.5 px-3 text-right">Exercise Cost</th>
                    <th className="py-2.5 px-3 text-right">Vested Value</th>
                    <th className="py-2.5 px-3 text-right">Total Potential</th>
                    <th className="py-2.5 pl-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {grants.map((g) => {
                    const m = g.metrics;
                    const typeInfo = GRANT_TYPE_LABELS[g.grantType] ?? GRANT_TYPE_LABELS.iso;
                    return (
                      <tr
                        key={g.id}
                        className="hover:bg-muted/30 transition-colors group"
                      >
                        <td className="py-3 pr-3">
                          <div className="flex items-center gap-2.5">
                            <GrantLogoBadge
                              companyName={g.companyName}
                              logoUrl={g.logoUrl}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <div className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                                <span className="truncate">{g.grantName}</span>
                                {g.filed83b && (
                                  <span className="text-micro px-1.5 py-0.5 rounded bg-chart-4/15 text-chart-4 font-mono">
                                    83(b)
                                  </span>
                                )}
                                {g.isExcludedFromNetWorth && (
                                  <span className="text-micro px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                    Excl. NW
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                                <span className="truncate">{g.companyName}</span>
                                <span>•</span>
                                <span>Granted {formatDate(g.grantDate)}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${typeInfo.badgeClass}`}
                          >
                            {typeInfo.short}
                          </span>
                        </td>
                        <td className="py-3 px-3 min-w-[160px]">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="font-mono font-medium text-foreground">
                              {formatShareCount(m.vestedShares)} / {formatShareCount(m.totalShares)}
                            </span>
                            <span className="font-mono text-muted-foreground">
                              {formatPlainPercent(m.vestedPct)}
                            </span>
                          </div>
                          <div className="w-full bg-muted/40 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-chart-1 h-full rounded-full"
                              style={{ width: `${Math.min(100, m.vestedPct)}%` }}
                            />
                          </div>
                          {m.exercisedShares > 0 && (
                            <div className="text-micro text-muted-foreground mt-0.5">
                              Exercised: {formatShareCount(m.exercisedShares)} sh
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-foreground">
                          {g.grantType === 'rsu' ? '—' : formatAmount(m.strikePrice)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          <div className="font-semibold text-foreground">
                            {formatAmount(m.effectiveSharePrice)}
                          </div>
                          <div className="text-micro text-muted-foreground">
                            {g.valuationMode === 'preferred' ? 'Preferred' : '409A FMV'}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-muted-foreground blur-number">
                          {formatBalance(m.cashToExerciseVested)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-chart-1 blur-number">
                          {formatBalance(m.vestedIntrinsicValue)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-foreground blur-number">
                          {formatBalance(m.totalPotentialValue)}
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditDrawer(g)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                              title="Edit grant"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingGrant(g)}
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                              title="Delete grant"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Slide-Out Sheet for Creating / Editing a Grant ── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {editingGrant ? `Edit ${editingGrant.grantName}` : 'Add Stock Option / Equity Grant'}
            </SheetTitle>
            <SheetDescription>
              Enter your grant details from your option agreement or equity portal. Vesting and intrinsic value update automatically every day.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleSaveGrant} className="space-y-4 mt-5">
            {formError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Section 1: Grant Identity & Company Logo (1 entry per line) */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border/60 space-y-3.5">
              <div className="text-xs font-bold text-foreground uppercase tracking-wider">
                Company & Grant Details
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Company Name</label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Grant Name / ID</label>
                <Input
                  value={grantName}
                  onChange={(e) => setGrantName(e.target.value)}
                  placeholder="e.g. ES-104 (Initial Grant)"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Company Logo (Optional)
                </label>
                <div className="flex items-center gap-3">
                  <GrantLogoBadge
                    companyName={companyName}
                    logoUrl={logoUrl}
                    size="md"
                  />
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleLogoFileChange}
                        className="hidden"
                      />
                      <ActionButton
                        size="xs"
                        variant="outline"
                        icon={Upload}
                        onClick={() => logoInputRef.current?.click()}
                      >
                        Upload Image
                      </ActionButton>
                      {logoUrl && (
                        <button
                          type="button"
                          onClick={() => setLogoUrl('')}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>
                    <Input
                      value={logoUrl.startsWith('data:image/') ? '' : logoUrl}
                      onChange={(e) => setLogoUrl(e.target.value)}
                      placeholder={
                        logoUrl.startsWith('data:image/')
                          ? 'Custom image uploaded (or paste URL / domain)'
                          : 'Or enter company domain (e.g. acme.com) or image URL'
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Grant Type</label>
                <Select
                  value={grantType}
                  onChange={(e) => setGrantType(e.target.value as EquityGrantType)}
                >
                  <option value="iso">ISO (Incentive Stock Options)</option>
                  <option value="nso">NSO (Non-Qualified Stock Options)</option>
                  <option value="rsu">RSU (Restricted Stock Units)</option>
                  <option value="common">Common / Early-Exercised Shares</option>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Total Shares Granted</label>
                <Input
                  type="number"
                  step="any"
                  min="1"
                  value={totalShares}
                  onChange={(e) => setTotalShares(e.target.value)}
                  placeholder="e.g. 10000"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Grant Date</label>
                <Input
                  type="date"
                  value={grantDate}
                  onChange={(e) => setGrantDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Vesting Start Date</label>
                <Input
                  type="date"
                  value={vestingStartDate}
                  onChange={(e) => setVestingStartDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Expiration Date (Optional)
                </label>
                <Input
                  type="date"
                  value={expirationDate}
                  onChange={(e) => setExpirationDate(e.target.value)}
                />
              </div>
            </div>

            {/* Section 2: Pricing & Valuation (1 entry per line) */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border/60 space-y-3.5">
              <div className="text-xs font-bold text-foreground uppercase tracking-wider">
                Strike Price & Valuation
              </div>

              {grantType !== 'rsu' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Strike / Exercise Price per Share ($)
                  </label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={strikePrice}
                    onChange={(e) => setStrikePrice(e.target.value)}
                    placeholder="e.g. 1.25"
                    required
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Current 409A Fair Market Value per Share ($)
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={currentFmv}
                  onChange={(e) => setCurrentFmv(e.target.value)}
                  placeholder="e.g. 4.50"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Preferred / Target Share Price ($) (Optional)
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={preferredPrice}
                  onChange={(e) => setPreferredPrice(e.target.value)}
                  placeholder="e.g. 9.00"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Net Worth Valuation Basis
                </label>
                <Select
                  value={valuationMode}
                  onChange={(e) => setValuationMode(e.target.value as EquityValuationMode)}
                >
                  <option value="fmv">409A Fair Market Value (Conservative)</option>
                  <option value="preferred">Preferred / Target Share Price</option>
                </Select>
                <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                  <strong>Tip:</strong> Check your equity portal&apos;s grant details or exercise tax calculator for the active <strong>409A FMV</strong>. For <strong>Preferred / Secondary price</strong>, check company funding round announcements or private market trackers.
                </p>
              </div>

              {editingGrant && grants.length > 1 && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={applyValuationToCompany}
                    onChange={(e) => setApplyValuationToCompany(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>Apply updated valuation &amp; logo to all {companyName} grants</span>
                </label>
              )}
            </div>

            {/* Section 3: Vesting Schedule Configuration (1 entry per line) */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border/60 space-y-3.5">
              <div className="text-xs font-bold text-foreground uppercase tracking-wider">
                Vesting Schedule
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Vesting Schedule Type
                </label>
                <Select
                  value={vestingPreset}
                  onChange={(e) => handleVestingPresetChange(e.target.value)}
                >
                  <option value="standard_48_12">
                    1/48th Monthly, 1-Year Cliff (1/4th at 12 mos, then 1/48th/mo)
                  </option>
                  <option value="monthly_48_0">
                    1/48th Monthly, No Cliff (48 Months)
                  </option>
                  <option value="quarterly_48_12">
                    4-Year Quarterly, 1-Year Cliff (1/4th at 12 mos, then 1/16th/qtr)
                  </option>
                  <option value="standard_36_12">
                    1/36th Monthly, 1-Year Cliff (1/3rd at 12 mos, then 1/36th/mo)
                  </option>
                  <option value="immediate">
                    Immediate (100% Vested on Start Date)
                  </option>
                  <option value="custom_periodic">
                    Custom Periodic Schedule (Set Months, Cliff &amp; Frequency)
                  </option>
                  <option value="custom_tranches">
                    Custom Milestone Tranches (Specific Dates &amp; Shares)
                  </option>
                </Select>
              </div>

              {/* Live Human-Readable Schedule Summary */}
              {vestingFrequency !== 'custom' && vestingFrequency !== 'immediate' && (
                <div className="p-3 rounded-lg bg-background/70 border border-border/60 text-[11px] text-muted-foreground space-y-1.5 leading-relaxed">
                  {vestingPreset === 'standard_48_12' ? (
                    <p>
                      <strong className="text-foreground">1/4th (25%)</strong> of total shares vest on the 12-month anniversary of the Vesting Start Date, and{' '}
                      <strong className="text-foreground">1/48th</strong> vests on the same day of each month thereafter (or on the last day of the month if a month does not have that date).
                    </p>
                  ) : (
                    <p>
                      {Number(cliffMonths) > 0 && Number(cliffPercent) > 0 ? (
                        <>
                          <strong className="text-foreground">{cliffPercent}%</strong> vests at the{' '}
                          <strong className="text-foreground">{cliffMonths}-month</strong> cliff, followed by{' '}
                          <strong className="text-foreground">{vestingFrequency}</strong> vesting over the remaining{' '}
                          <strong className="text-foreground">
                            {Math.max(0, (Number(totalMonths) || 0) - (Number(cliffMonths) || 0))} months
                          </strong>
                          .
                        </>
                      ) : (
                        <>
                          Vests <strong className="text-foreground">{vestingFrequency}</strong> in equal installments over{' '}
                          <strong className="text-foreground">{totalMonths} months</strong> with no cliff.
                        </>
                      )}
                    </p>
                  )}

                  {(Number(totalShares) > 0 || vestingStartDate) && (
                    <div className="pt-1.5 border-t border-border/50 grid grid-cols-1 gap-1 font-mono text-[11px] text-foreground">
                      {Number(cliffMonths) > 0 && Number(cliffPercent) > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground font-sans">
                            {cliffMonths}-Mo Cliff ({cliffPercent}%):
                          </span>
                          <span>
                            {Number(totalShares) > 0
                              ? `${formatShareCount((Number(totalShares) * Number(cliffPercent)) / 100)} sh`
                              : '25%'}{' '}
                            {vestingStartDate
                              ? `on ${formatDate(addMonthsDateStr(vestingStartDate, Number(cliffMonths) || 12))}`
                              : ''}
                          </span>
                        </div>
                      )}
                      {Number(totalShares) > 0 && Number(totalMonths) > Number(cliffMonths) && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground font-sans">
                            {vestingFrequency === 'quarterly'
                              ? 'Each Quarter After Cliff:'
                              : vestingFrequency === 'annual'
                                ? 'Each Year After Cliff:'
                                : 'Each Month After Cliff:'}
                          </span>
                          <span>
                            {formatShareCount(
                              (Number(totalShares) * (1 - (Number(cliffPercent) || 0) / 100)) /
                                Math.max(
                                  1,
                                  Math.ceil(
                                    ((Number(totalMonths) || 48) - (Number(cliffMonths) || 0)) /
                                      (vestingFrequency === 'quarterly'
                                        ? 3
                                        : vestingFrequency === 'annual'
                                          ? 12
                                          : 1)
                                  )
                                )
                            )}{' '}
                            sh
                          </span>
                        </div>
                      )}
                      {vestingStartDate && Number(totalMonths) > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground font-sans">Fully Vested Date:</span>
                          <span>
                            {formatDate(addMonthsDateStr(vestingStartDate, Number(totalMonths) || 48))}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {vestingPreset === 'custom_periodic' && (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Installment Frequency
                    </label>
                    <Select
                      value={vestingFrequency}
                      onChange={(e) => setVestingFrequency(e.target.value as VestingFrequency)}
                    >
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="annual">Annual</option>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Total Vesting Duration (Months)
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="240"
                      value={totalMonths}
                      onChange={(e) => setTotalMonths(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Cliff Duration (Months)
                    </label>
                    <Input
                      type="number"
                      min="0"
                      max="240"
                      value={cliffMonths}
                      onChange={(e) => setCliffMonths(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-foreground">
                      Cliff Vesting Percentage (%)
                    </label>
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      max="100"
                      value={cliffPercent}
                      onChange={(e) => setCliffPercent(e.target.value)}
                    />
                  </div>
                </>
              )}

              {vestingFrequency === 'custom' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      Custom Vesting Tranches
                    </span>
                    <ActionButton
                      size="xs"
                      icon={Plus}
                      onClick={() =>
                        setCustomTranches((prev) => [
                          ...prev,
                          { date: todayStr, shares: 1000 },
                        ])
                      }
                    >
                      Add Tranche
                    </ActionButton>
                  </div>
                  {customTranches.map((tranche, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={tranche.date}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCustomTranches((prev) =>
                            prev.map((t, i) => (i === idx ? { ...t, date: val } : t))
                          );
                        }}
                        className="h-9 text-xs"
                      />
                      <Input
                        type="number"
                        step="any"
                        min="0"
                        value={tranche.shares}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          setCustomTranches((prev) =>
                            prev.map((t, i) => (i === idx ? { ...t, shares: val } : t))
                          );
                        }}
                        placeholder="Shares"
                        className="h-9 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setCustomTranches((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="p-1.5 text-muted-foreground hover:text-destructive cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 4: Exercise & Tax Status (1 entry per line) */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border/60 space-y-3.5">
              <div className="text-xs font-bold text-foreground uppercase tracking-wider">
                Exercise & Tax Status
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Shares Exercised to Date
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={exercisedShares}
                  onChange={(e) => setExercisedShares(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  Shares Sold / Liquidated
                </label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={soldShares}
                  onChange={(e) => setSoldShares(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-2.5 pt-1">
                <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={earlyExerciseAllowed}
                    onChange={(e) => setEarlyExerciseAllowed(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>Grant allows Early Exercise prior to vesting</span>
                </label>
                <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filed83b}
                    onChange={(e) => setFiled83b(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>83(b) Election filed with IRS</span>
                </label>
                <label className="flex items-center gap-2.5 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isExcludedFromNetWorth}
                    onChange={(e) => setIsExcludedFromNetWorth(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>Exclude this company equity account from liquid Net Worth</span>
                </label>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Notes (Optional)</label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Grant ID, board approval date, or exercise window notes"
              />
            </div>

            <SheetFooter className="pt-3">
              <ActionButton
                variant="outline"
                onClick={() => setSheetOpen(false)}
                disabled={saving}
              >
                Cancel
              </ActionButton>
              <ActionButton
                type="submit"
                variant="primary"
                icon={CheckCircle2}
                disabled={saving}
              >
                {saving ? 'Saving...' : editingGrant ? 'Save Changes' : 'Create Grant'}
              </ActionButton>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      {/* ── Delete Confirmation Dialog ── */}
      <AlertDialog
        open={Boolean(deletingGrant)}
        onOpenChange={(open) => !open && setDeletingGrant(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Equity Grant?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{' '}
              <strong>{deletingGrant?.grantName}</strong> ({deletingGrant?.companyName})? This will remove the grant and recalculate your equity account balance and historical snapshots.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <ActionButton
              variant="primary"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Grant'}
            </ActionButton>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

