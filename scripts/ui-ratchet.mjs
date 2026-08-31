#!/usr/bin/env node
/**
 * UI anti-regression ratchet (desktop audit R-5 / R-7 / R-10 guards).
 *
 * The ESLint config does not parse TS/TSX, so the plan's lint guards live here
 * instead: a count ratchet. Each banned pattern has a committed baseline; the
 * script FAILS if any count exceeds its baseline and prints how to update it
 * after a deliberate, reviewed migration.
 *
 *   R-5  : text-[8px] / text-[9px]  — below the DPR-1 readable floor; use
 *          `text-micro` (10px, axes/badges/captions only) or the 11px floor.
 *          `@utility text-micro` lives in styles/globals.css.
 *   R-7  : toFixed(1) in UI        — raw decimals drift per-site; use the role
 *          formatters (formatPlainPercent / formatProjected /
 *          formatCompactCurrency, see lib/utils/format.ts).
 *   R-10 : raw <select            — use components/ui/select.tsx (styled,
 *          focus ring, chevron).
 *
 * Usage:
 *   node scripts/ui-ratchet.mjs                 # check against baseline (CI)
 *   node scripts/ui-ratchet.mjs --update        # re-baseline after migration
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const BASELINE_PATH = new URL('./ui-ratchet-baseline.json', import.meta.url).pathname;

// [label, regex (grep -E), search dirs, files excluded from the count]
const RULES = [
  {
    key: 'text8px',
    label: 'R-5  text-[8px]',
    regex: 'text-\\[8px\\]',
    dirs: ['components', 'app', 'lib'],
    exclude: [],
  },
  {
    key: 'text9px',
    label: 'R-5  text-[9px]',
    regex: 'text-\\[9px\\]',
    dirs: ['components', 'app', 'lib'],
    exclude: [],
  },
  {
    key: 'rawSelect',
    label: 'R-10 raw <select',
    regex: '<select[\\s>]?',
    dirs: ['components', 'app'],
    exclude: ['components/ui/select.tsx'],
  },
  {
    key: 'toFixed1',
    label: 'R-7  .toFixed(1) in UI',
    regex: '\\.toFixed\\(1\\)',
    dirs: ['components', 'app'],
    exclude: [],
  },
];

function countRule(rule) {
  const files = [];
  for (const dir of rule.dirs) {
    const out = grepFiles(rule.regex, dir);
    if (out) files.push(...out.split('\n').filter(Boolean));
  }
  const kept = files.filter((f) => !rule.exclude.includes(f));
  let count = 0;
  for (const f of kept) {
    const content = readFileSync(`${ROOT}/${f}`, 'utf8');
    count += (content.match(new RegExp(rule.regex, 'g')) ?? []).length;
  }
  return count;
}

/** grep -rlE for files matching `regex`; empty string when none (grep exits 1). */
function grepFiles(regex, dir) {
  try {
    return execFileSync('grep', ['-rlE', regex, '--include=*.tsx', '--include=*.ts', dir], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (err) {
    if (err && err.status === 1) return ''; // no matches
    throw err;
  }
}

const updateMode = process.argv.includes('--update');
let baseline;
if (existsSync(BASELINE_PATH)) {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
} else {
  baseline = {};
}

let changed = false;
let failed = false;

for (const rule of RULES) {
  const count = countRule(rule);
  const prev = baseline[rule.key];
  if (updateMode) {
    if (prev !== count) {
      baseline[rule.key] = count;
      changed = true;
    }
    console.log(`  [baseline] ${rule.label}: ${count}`);
    continue;
  }
  if (prev === undefined) {
    console.log(`  [missing baseline] ${rule.label}: ${count} (run once with --update)`);
    failed = true;
    continue;
  }
  const ok = count <= prev;
  if (!ok) failed = true;
  console.log(`  ${ok ? '✓' : '✗'} ${rule.label}: ${count} (baseline ${prev}${count < prev ? ', improved — re-baseline optional' : ''})`);
  if (!ok) {
    const files = [];
    for (const dir of rule.dirs) {
      const out = grepFiles(rule.regex, dir);
      if (out) files.push(...out.split('\n').filter(Boolean));
    }
    for (const file of files.filter((f) => !rule.exclude.includes(f))) {
      const content = readFileSync(`${ROOT}/${file}`, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (new RegExp(rule.regex).test(line)) console.log(`      ${file}:${i + 1}: ${line.trim()}`);
      });
    }
  }
}

if (updateMode) {
  if (changed) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log('\nBaseline updated. Commit scripts/ui-ratchet-baseline.json with your migration.');
  } else {
    console.log('\nBaseline unchanged.');
  }
} else if (failed) {
  console.error('\nUI ratchet FAILED: a banned pattern count grew past its baseline.');
  console.error('Reduce the new occurrences (see R-5/R-7/R-10 in scratch/desktop-audit/UI-FIX-PLAN.md) or,');
  console.error('only after a deliberate approved regression, re-baseline with: node scripts/ui-ratchet.mjs --update');
  process.exit(1);
} else {
  console.log('\nUI ratchet OK: no regressions beyond baseline.');
}
