import { describe, expect, it } from 'vitest';
import {
  buildProjectionChartData,
  formatYearsMonths,
  projectEscapeVelocity,
} from '@/components/investments/escape-velocity-projection';

describe('projectEscapeVelocity', () => {
  it('returns null when there is no capital return or no contributions', () => {
    expect(projectEscapeVelocity(0, 50_000, 7, 0.5, 2)).toBeNull();
    expect(projectEscapeVelocity(10_000, 0, 7, 0.5, 2)).toBeNull();
    expect(projectEscapeVelocity(NaN, 50_000, 7, 0.5, 2)).toBeNull();
  });

  it('reports already-orbit when today’s returns already cover contributions', () => {
    const p = projectEscapeVelocity(100_000, 80_000, 7, 0.5, 2);
    expect(p).not.toBeNull();
    expect(p!.alreadyOrbit).toBe(true);
    expect(p!.breakEven.monthIndex).toBeNull();
    expect(p!.path).toHaveLength(1);
    expect(p!.path[0].ratio).toBeCloseTo(1.25, 5);
  });

  it('finds the break-even point where (1+r)/(1+g) powers to the ratio gap', () => {
    // Capital return 12k vs contributions 60k → ratio 0.2 today.
    // Returns grow 7%/yr, contributions 2%/yr → the ratio grows ~4.9%/yr.
    const p = projectEscapeVelocity(12_000, 60_000, 7, 0.5, 2)!;
    expect(p.alreadyOrbit).toBe(false);
    // (1.07/1.02)^M * 0.2 = 1 → M = ln(5)/ln(1.07/1.02) ≈ 33.6 years ≈ 403 months
    const months = p.breakEven.years * 12 + p.breakEven.months;
    expect(months).toBeGreaterThanOrEqual(398);
    expect(months).toBeLessThanOrEqual(410);
    // Approaching (0.5 threshold) should land earlier than break-even.
    const apMonths = p.approaching.years * 12 + p.approaching.months;
    expect(apMonths).toBeLessThan(months);
  });

  it('grows contributions with the configured growth rate', () => {
    // 40k return vs 100k contributions → ratio 0.4 today, at 8%/yr.
    const flat = projectEscapeVelocity(40_000, 100_000, 8, 0.5, 0)!;
    const grown = projectEscapeVelocity(40_000, 100_000, 8, 0.5, 4)!;
    // Higher contribution growth delays break-even.
    const flatMonths = flat.breakEven.years * 12 + flat.breakEven.months;
    const grownMonths = grown.breakEven.years * 12 + grown.breakEven.months;
    expect(flatMonths).toBeGreaterThan(0);
    expect(grownMonths).toBeGreaterThan(flatMonths);
  });

  it('never projects beyond the horizon', () => {
    const p = projectEscapeVelocity(100, 10_000, 1, 0.5, 0.1)!;
    // Tiny return, tiny growth → ratio grows ~0.9%/yr → very long; cap at 480 months.
    expect(p.path.length).toBeLessThanOrEqual(481);
    expect(p.path[p.path.length - 1].monthIndex).toBeLessThanOrEqual(480);
  });

  it('records the approaching milestone at the configured threshold', () => {
    const p = projectEscapeVelocity(20_000, 100_000, 7, 0.25, 2)!;
    expect(p.approaching.monthIndex).not.toBeNull();
    // Approaching ratio right at the first step that crosses the threshold.
    const first = p.path.find((s) => s.monthIndex === p.approaching.monthIndex);
    expect(first!.ratio).toBeGreaterThanOrEqual(0.25);
  });
});

describe('buildProjectionChartData', () => {
  it('returns empty data when there is no projection or already-orbit', () => {
    expect(buildProjectionChartData(null).data).toHaveLength(0);
    const orbit = projectEscapeVelocity(100_000, 80_000, 7, 0.5, 2)!;
    expect(buildProjectionChartData(orbit).data).toHaveLength(0);
  });

  it('samples one point per year starting at Now', () => {
    const p = projectEscapeVelocity(12_000, 60_000, 7, 0.5, 2)!;
    const { data, maxYAxis } = buildProjectionChartData(p);
    expect(data[0].label).toBe('Now');
    expect(data[0].year).toBe(0);
    expect(data[1].label).toBe('Yr 1');
    // One sample per exact-year step from Now through the break-even month.
    const lastMonthIndex = p.path[p.path.length - 1].monthIndex;
    expect(data.length).toBe(Math.floor(lastMonthIndex / 12) + 1);
    // Y axis headroom above the 1.0 goal line.
    expect(maxYAxis).toBeGreaterThan(1);
  });
});

describe('formatYearsMonths', () => {
  it('formats years and months', () => {
    expect(formatYearsMonths(0, 6)).toBe('0y 6m');
    expect(formatYearsMonths(3, 0)).toBe('3y');
    expect(formatYearsMonths(1, 2)).toBe('1y 2m');
  });
});
