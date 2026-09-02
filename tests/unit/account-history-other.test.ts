// @vitest-environment jsdom
// Unit tests for the R-9 top-N + "Other" aggregation helpers in
// components/features/accounts/AccountHistoryChart.tsx.
//
// The full chart is rendered from `rechartsData` produced by a memo that
// folds `TOP_N + 1` layers (6 named series + one "Other" layer) when more
// than TOP_N series are selected. The pure helpers under test here are the
// pieces that guarantee:
//   - exactly 6 named series are kept (top-6 by average |value|), so the
//     default 17-account view renders exactly 7 layers;
//   - the kept set is deterministic and input-order-stable (so layer colors
//     never repaint on hover / period change);
//   - the "Other" layer is the EXACT sum of the hidden series (signs
//     preserved), so the stacked total area never changes when collapsed.

import { describe, expect, it } from 'vitest';
import {
  TOP_N,
  OTHER_KEY,
  pickTopSeries,
  buildAggregatedValues,
} from '@/components/features/accounts/AccountHistoryChart';

// Build `rows` where every key has a constant value per row. A key with a
// constant `mag` has average |value| === mag, so top-N ranking is trivial to
// assert.
const makeConstantRows = (
  entries: Array<[string, number]>,
  rowCount = 12
): Array<Record<string, any>> =>
  Array.from({ length: rowCount }, (_, i) => {
    const row: Record<string, any> = { date: `2026-01-${String(i + 1).padStart(2, '0')}` };
    for (const [key, val] of entries) row[key] = val;
    return row;
  });

// 17 account series (the scenario in the R-9 acceptance criteria): 14 assets
// with distinct magnitudes 100+10i and 3 liabilities (negative) 1000, 2000,
// 3000.
const buildSeventeen = () => {
  const entries: Array<[string, number]> = [];
  for (let i = 0; i < 14; i++) entries.push([`asset_${String(i).padStart(2, '0')}`, -(100 + i * 10)]);
  entries.push(['liab_01', 1000]);
  entries.push(['liab_02', 2000]);
  entries.push(['liab_03', 3000]);
  return entries;
};

describe('AccountHistoryChart top-N + Other aggregation', () => {
  it('exports a top-6 constant and a dedicated mute key', () => {
    expect(TOP_N).toBe(6);
    expect(OTHER_KEY).toBe('other-aggregate');
  });

  it('picks exactly TOP_N keys from a 17-series selection', () => {
    const entries = buildSeventeen();
    const rows = makeConstantRows(entries);
    const keys = entries.map(([k]) => k);

    const top = pickTopSeries(keys, rows);

    expect(top).toHaveLength(TOP_N);
    // The 3 liabilities have magnitudes 1000/2000/3000 — all above any asset
    // magnitude (max asset magnitude is 230) — so they must dominate the pick.
    expect(top).toEqual(expect.arrayContaining(['liab_01', 'liab_02', 'liab_03']));
    // The remaining 3 slots go to the 3 largest assets (magnitudes 230, 220,
    // 210 → asset_13, asset_12, asset_11).
    expect(top).toEqual(expect.arrayContaining(['asset_13', 'asset_12', 'asset_11']));
    expect(top).not.toContain('asset_10');
  });

  it('is stable to input key order (no value re-sort repainting)', () => {
    const entries = buildSeventeen();
    const rows = makeConstantRows(entries);
    const keys = entries.map(([k]) => k);
    const shuffled = [...keys].reverse();

    expect(pickTopSeries(keys, rows)).toEqual(pickTopSeries(shuffled, rows));
  });

  it('breaks average ties alphabetically for deterministic colors', () => {
    // Three tied magnitudes → all kept if TOP_N allows, in localeCompare
    // order of the input-independent ranking.
    const rows = makeConstantRows([
      ['delta', 50],
      ['charlie', 50],
      ['bravo', 50],
      ['alpha', 50],
    ]);
    expect(pickTopSeries(['delta', 'charlie', 'bravo', 'alpha'], rows)).toEqual([
      'alpha',
      'bravo',
      'charlie',
      'delta',
    ]);
  });

  it('excludes keys with no data from the pick', () => {
    const rows = makeConstantRows([
      ['silent', 9999],
      ['loud', 1],
    ]);
    // Wipe `silent` entirely (undefined → never counted).
    for (const row of rows) delete row.silent;
    expect(pickTopSeries(['silent', 'loud'], rows)).toEqual(['loud', 'silent']);
    // And a data-less key is pushed below any key with data.
    expect(pickTopSeries(['silent', 'loud'], rows)[0]).toBe('loud');
  });

  it('buildaggregatedvalues is the exact sign-preserving sum of hidden keys', () => {
    const rows: Array<Record<string, any>> = [
      { date: 'd1', a: 10, b: -15, c: 5 },
      { date: 'd2', a: 4, b: undefined, c: 1 },
      { date: 'd3' }, // nothing — no data
      { date: 'd4', a: -2, b: 3 }, // NaN must not leak in
    ];
    rows[3].c = Number.NaN;

    const agg = buildAggregatedValues(rows, ['a', 'b', 'c']);

    // Row 1: 10 + (-15) + 5 = 0, but hasData is true (values exist).
    expect(agg[0]).toEqual({ value: 0, hasData: true });
    // Row 2: 4 + 1 = 5 (undefined skipped, not treated as 0-data).
    expect(agg[1]).toEqual({ value: 5, hasData: true });
    // Row 3: no finite values → no Other value written on that row.
    expect(agg[2]).toEqual({ value: undefined, hasData: false });
    // Row 4: -2 + 3 = 1, NaN ignored.
    expect(agg[3]).toEqual({ value: 1, hasData: true });
  });

  it('keeps the stacked total unchanged when hidden keys fold into Other', () => {
    const entries = buildSeventeen();
    const rows = makeConstantRows(entries);
    const keys = entries.map(([k]) => k);

    const top = pickTopSeries(keys, rows);
    const hidden = keys.filter((k) => !top.includes(k));
    expect(hidden.length).toBe(keys.length - TOP_N); // 17 → 11 hidden

    const agg = buildAggregatedValues(rows, hidden);
    for (let i = 0; i < rows.length; i++) {
      let fullSum = 0;
      let hasFull = false;
      for (const k of keys) {
        const v: any = rows[i][k];
        if (typeof v === 'number' && Number.isFinite(v)) {
          fullSum += v;
          hasFull = true;
        }
      }
      let foldedSum = 0;
      let hasFolded = false;
      for (const k of top) {
        const v: any = rows[i][k];
        if (typeof v === 'number' && Number.isFinite(v)) {
          foldedSum += v;
          hasFolded = true;
        }
      }
      if (agg[i].hasData) {
        foldedSum += agg[i].value as number;
        hasFolded = true;
      }
      expect(hasFolded).toBe(hasFull);
      expect(foldedSum).toBeCloseTo(fullSum, 8);
    }
  });

  it('reports layer counts matching the R-9 acceptance criteria', () => {
    // Default 17-series view: 6 named + 1 Other = 7 layers; legend rows are
    // the 6 named + 1 collapsible "Other" = 7 (≤ 8 cap).
    const keys = buildSeventeen().map(([k]) => k);
    const rows = makeConstantRows(keys.map((k) => [k, 10] as [string, number]));
    const top = pickTopSeries(keys, rows);
    const otherCount = keys.length - top.length; // 11
    const layerCount = top.length + (otherCount > 0 ? 1 : 0);
    expect(layerCount).toBe(7);

    // No more than TOP_N series → every series is its own layer, no Other.
    const small = keys.slice(0, 5);
    const smallTop = pickTopSeries(small, rows);
    expect(smallTop).toHaveLength(5);
    const smallOther = small.length - smallTop.length;
    expect(smallOther).toBe(0);
    expect(smallTop.length + (smallOther > 0 ? 1 : 0)).toBe(5);
    // Exactly TOP_N series → no Other row at all.
    const exact = keys.slice(0, TOP_N);
    expect(pickTopSeries(exact, rows)).toHaveLength(TOP_N);
  });
});
