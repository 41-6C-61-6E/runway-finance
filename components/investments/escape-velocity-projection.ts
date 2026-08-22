'use client';

/**
 * Escape-velocity projection engine (pure, framework-agnostic).
 *
 * "Escape velocity" is reached when the portfolio's annual return covers the
 * new money the user saves each year — i.e. when the return-to-savings ratio
 * crosses 1.0. These helpers project forward from the current state to find
 * when that happens under the chosen return + contribution-growth assumptions.
 */

import { useCallback } from 'react';
import { usePersistentState } from '@/lib/hooks/use-persistent-state';

/** Hard horizon for the projection (avoid implying certainty forever). */
export const MAX_PROJECTION_MONTHS = 480; // 40 years
const MONTHS_PER_YEAR = 12;

export interface EscapeVelocitySettings {
  /** `auto` uses the trailing annualized TWR; `assumed` uses a fixed rate. */
  returnSource: 'auto' | 'assumed';
  /** Fixed assumed annual return, as a percent (e.g. 7 → 7%). */
  assumedReturnPct: number;
  /** Return-to-savings ratio that flips the phase to "Approaching". */
  approachingThreshold: number;
  /** Year-over-year growth applied to annual contributions, as a percent. */
  contributionGrowthPct: number;
  /** Target savings rate (percent of income) for the trend reference line. */
  savingsRateTargetPct: number;
}

export const defaultEscapeVelocitySettings: EscapeVelocitySettings = {
  returnSource: 'auto',
  assumedReturnPct: 7,
  approachingThreshold: 0.5,
  contributionGrowthPct: 2,
  savingsRateTargetPct: 20,
};

export function clampRatio(v: number): number {
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

export function formatYearsMonths(years: number, months: number): string {
  if (!Number.isFinite(years) || years < 0) return '—';
  return years + (months > 0 ? `y ${months}m` : 'y');
}

/** One month of the projection path. */
export interface EscapeProjectionStep {
  /** Months from "now" (0 = today). */
  monthIndex: number;
  /** Annual contribution level at this point. */
  contributions: number;
  /** Return-to-savings ratio at this point. */
  ratio: number;
}

export interface EscapeProjection {
  ok: boolean;
  alreadyOrbit: boolean;
  /** Path from today until escape velocity (inclusive) or the horizon. */
  path: EscapeProjectionStep[];
  breakEven: { monthIndex: number | null; years: number; months: number };
  approaching: { monthIndex: number | null; years: number; months: number };
  /** Total months the path spans (last step index). */
  horizonMonths: number;
}

const toYearsMonths = (m: number) => ({ years: Math.floor(m / MONTHS_PER_YEAR), months: m % MONTHS_PER_YEAR });

/**
 * Project the return-to-savings ratio forward month-by-month until it crosses
 * 1.0 (or the hard horizon).
 *
 * - `currentCapitalReturn` is the portfolio's current *annual* earnings
 *   (return yield + passive income). It grows by `ratePct`/yr — the same
 *   rate its underlying portfolio compounds at.
 * - `currentAnnualContributions` is this year's saving pace and compounds at
 *   `contributionGrowthPct` (raises, better savings rate, …).
 *
 * The ratio is annual capital earnings / annual contribution pace; it climbs
 * at roughly `ratePct - contributionGrowthPct` per year. Returns null when
 * there is not enough data to project from.
 */
export function projectEscapeVelocity(
  currentCapitalReturn: number,
  currentAnnualContributions: number,
  ratePct: number,
  approachingThreshold: number,
  contributionGrowthPct: number
): EscapeProjection | null {
  if (
    !Number.isFinite(currentCapitalReturn) ||
    !Number.isFinite(currentAnnualContributions) ||
    currentCapitalReturn <= 0 ||
    currentAnnualContributions <= 0
  ) {
    return null;
  }

  const r = Math.max(Number.isFinite(ratePct) ? ratePct : 0, 0);
  const g = Math.max(Number.isFinite(contributionGrowthPct) ? contributionGrowthPct : 0, 0);
  const monthlyR = Math.pow(1 + r / 100, 1 / MONTHS_PER_YEAR) - 1;
  const monthlyG = Math.pow(1 + g / 100, 1 / MONTHS_PER_YEAR) - 1;
  const threshold = Number.isFinite(approachingThreshold) ? Math.max(0, approachingThreshold) : 0;

  const path: EscapeProjectionStep[] = [];
  let breakEvenMonth: number | null = null;
  let approachingMonth: number | null = null;
  let capital = currentCapitalReturn;
  let contributions = currentAnnualContributions;

  for (let m = 0; m <= MAX_PROJECTION_MONTHS; m++) {
    if (m > 0) {
      capital *= 1 + monthlyR;
      contributions *= 1 + monthlyG;
    }
    const ratio = contributions > 0 ? capital / contributions : 0;
    path.push({ monthIndex: m, contributions, ratio });
    if (approachingMonth === null && m > 0 && ratio >= threshold) approachingMonth = m;
    if (breakEvenMonth === null && ratio >= 1) {
      breakEvenMonth = m;
      break; // reached the milestone we care about
    }
  }

  const be = breakEvenMonth !== null && breakEvenMonth > 0 ? toYearsMonths(breakEvenMonth) : { years: 0, months: 0 };
  const ap = approachingMonth !== null ? toYearsMonths(approachingMonth) : { years: 0, months: 0 };

  return {
    ok: true,
    // breakEvenMonth === 0 means today's ratio already covers 1.0
    alreadyOrbit: breakEvenMonth === 0,
    path,
    breakEven: { monthIndex: breakEvenMonth !== null && breakEvenMonth > 0 ? breakEvenMonth : null, ...be },
    approaching: { monthIndex: approachingMonth, ...ap },
    horizonMonths: path.length - 1,
  };
}

/**
 * Sample the projection once per year for the projection chart. The dashed
 * "1.0x" line is the goal the plotted ratio curve crosses.
 */
export function buildProjectionChartData(
  projection: EscapeProjection | null
): { data: { label: string; year: number; contributions: number; ratio: number }[]; maxYAxis: number } {
  if (!projection || projection.alreadyOrbit) {
    return { data: [], maxYAxis: 1.2 };
  }
  const data = projection.path
    .filter((step) => step.monthIndex % MONTHS_PER_YEAR === 0)
    .map((step) => ({
      label: step.monthIndex === 0 ? 'Now' : `Yr ${Math.round(step.monthIndex / MONTHS_PER_YEAR)}`,
      year: Math.round(step.monthIndex / MONTHS_PER_YEAR),
      contributions: Math.round(step.contributions),
      ratio: step.ratio,
    }));
  const maxRatio = Math.max(1, ...projection.path.map((s) => Math.min(s.ratio, 1.4)));
  return { data, maxYAxis: maxRatio * 1.15 };
}

/* ─────────────────────────────────────────────────────────────────────────
   Settings persistence
───────────────────────────────────────────────────────────────────────── */

export function useEscapeVelocitySettings() {
  const [stored, setStored] = usePersistentState<Partial<EscapeVelocitySettings>>(
    'escapeVelocitySettings',
    defaultEscapeVelocitySettings
  );
  const settings: EscapeVelocitySettings = { ...defaultEscapeVelocitySettings, ...stored };
  const patch = useCallback(
    (partial: Partial<EscapeVelocitySettings>) =>
      setStored((prev) => ({ ...defaultEscapeVelocitySettings, ...prev, ...partial })),
    [setStored]
  );
  return { settings, patch };
}
