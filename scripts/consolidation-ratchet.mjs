#!/usr/bin/env node
/**
 * Runway Finance — Code Consolidation Ratchet
 * Enforces zero regressions across consolidation patterns.
 * Fails if any pattern count exceeds its committed baseline.
 *
 * Usage:
 *   node scripts/consolidation-ratchet.mjs           # check against baseline (CI)
 *   node scripts/consolidation-ratchet.mjs --update  # update baseline after migration
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const BASELINE_PATH = new URL('./consolidation-ratchet-baseline.json', import.meta.url).pathname;

function walk(dir, extFilter = ['.ts', '.tsx']) {
  const files = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.next', 'dist', 'coverage', '.git'].includes(entry.name)) continue;
        files.push(...walk(full, extFilter));
      } else if (entry.isFile()) {
        if (!extFilter || extFilter.some((ext) => entry.name.endsWith(ext))) {
          files.push(full);
        }
      }
    }
  } catch {
    // Directory might not exist
  }
  return files;
}

const RULES = [
  {
    key: 'clientFetch',
    label: 'Client-side raw fetch(',
    mode: 'occurrences',
    dirs: ['components', 'app'],
    regex: '\\bfetch\\(',
    exclude: (rel) => rel.startsWith('app/api/'),
  },
  {
    key: 'inlineQueryKey',
    label: "Inline queryKey: ['",
    mode: 'occurrences',
    dirs: ['components', 'app', 'lib'],
    regex: 'queryKey:\\s*\\[[\'"`]',
    exclude: () => false,
  },
  {
    key: 'routesAuth',
    label: 'Routes with direct await auth()',
    mode: 'files',
    dirs: ['app/api'],
    regex: 'await\\s+auth\\(',
    exclude: () => false,
  },
  {
    key: 'nextResponseJson',
    label: 'Routes using NextResponse.json',
    mode: 'files',
    dirs: ['app/api'],
    regex: 'NextResponse\\.json',
    exclude: () => false,
  },
  {
    key: 'fixedInset0',
    label: 'fixed inset-0 outside components/ui',
    mode: 'occurrences',
    dirs: ['components', 'app'],
    regex: 'fixed\\s+inset-0|inset-0\\s+fixed',
    exclude: (rel) => rel.startsWith('components/ui/'),
  },
  {
    key: 'rawLoader2',
    label: '<Loader2 direct outside components/ui',
    mode: 'occurrences',
    dirs: ['components', 'app'],
    regex: '<Loader2\\b',
    exclude: (rel) => rel.startsWith('components/ui/'),
  },
  {
    key: 'intlFormat',
    label: 'Intl.NumberFormat outside format.ts',
    mode: 'occurrences',
    dirs: ['components', 'app', 'lib'],
    regex: 'Intl\\.NumberFormat',
    exclude: (rel) => rel === 'lib/utils/format.ts',
  },
  {
    key: 'anyInProd',
    label: ': any / as any in production',
    mode: 'occurrences',
    dirs: ['components', 'app', 'lib'],
    regex: ':\\s*any\\b|as\\s+any\\b|<\\s*any\\b|\\bany\\[\\]',
    exclude: () => false,
  },
  {
    key: 'hexLiterals',
    label: 'Hex literals in TS/TSX',
    mode: 'occurrences',
    dirs: ['components', 'app', 'lib'],
    regex: '#[0-9a-fA-F]{3,8}\\b',
    exclude: (rel) => rel.includes('palette.ts') || rel.includes('generated'),
  },
  {
    key: 'textPixel',
    label: 'text-[Npx] font sizes',
    mode: 'occurrences',
    dirs: ['components', 'app', 'lib'],
    regex: 'text-\\[\\d+px\\]',
    exclude: () => false,
  },
  {
    key: 'styleAttr',
    label: 'style={{ inline styles',
    mode: 'occurrences',
    dirs: ['components', 'app', 'lib'],
    regex: 'style=\\{\\{',
    exclude: () => false,
  },
  {
    key: 'directLocalStorage',
    label: 'Direct localStorage outside hook',
    mode: 'occurrences',
    dirs: ['components', 'app', 'lib'],
    regex: '\\blocalStorage\\.',
    exclude: (rel) => rel === 'lib/hooks/use-persistent-state.ts',
  },
  {
    key: 'consoleInProd',
    label: 'console.* in production',
    mode: 'occurrences',
    dirs: ['components', 'app', 'lib'],
    regex: '\\bconsole\\.(log|warn|error|info|debug)\\(',
    exclude: (rel) => rel === 'lib/logger.ts' || rel === 'lib/client-error-reporter.ts' || rel === 'lib/client-logger.ts',
  },
  {
    key: 'processEnvDirect',
    label: 'process.env.* outside lib/env',
    mode: 'occurrences',
    dirs: ['components', 'app', 'lib'],
    regex: 'process\\.env\\.',
    exclude: (rel) => rel === 'lib/env.ts' || rel === 'lib/env.client.ts',
  },
  {
    key: 'pascalCaseComponents',
    label: 'PascalCase component files',
    mode: 'custom',
    check: () => {
      const compFiles = walk(join(ROOT, 'components'));
      const offending = [];
      for (const f of compFiles) {
        const rel = relative(ROOT, f);
        const filename = rel.split('/').pop();
        if (/^[A-Z]/.test(filename) && (filename.endsWith('.tsx') || filename.endsWith('.ts'))) {
          offending.push(rel);
        }
      }
      return { count: offending.length, details: offending };
    },
  },
];

function evaluateRule(rule) {
  if (rule.mode === 'custom') {
    return rule.check();
  }
  const files = rule.dirs.flatMap((d) => walk(join(ROOT, d)));
  let occurrences = 0;
  const matchedFiles = [];
  const details = [];

  for (const f of files) {
    const rel = relative(ROOT, f);
    if (rule.exclude(rel)) continue;
    const content = readFileSync(f, 'utf8');
    const matches = content.match(new RegExp(rule.regex, 'g'));
    if (matches && matches.length > 0) {
      occurrences += matches.length;
      matchedFiles.push(rel);
      const lines = content.split('\n');
      lines.forEach((line, i) => {
        if (new RegExp(rule.regex).test(line)) {
          details.push(`${rel}:${i + 1}: ${line.trim()}`);
        }
      });
    }
  }

  const count = rule.mode === 'files' ? matchedFiles.length : occurrences;
  return { count, details };
}

const updateMode = process.argv.includes('--update');
let baseline = {};
if (existsSync(BASELINE_PATH)) {
  baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
}

let changed = false;
let failed = false;

console.log('🔒 Checking Consolidation Ratchet Baselines...');

for (const rule of RULES) {
  const { count, details } = evaluateRule(rule);
  const prev = baseline[rule.key];

  if (updateMode) {
    if (prev !== count) {
      baseline[rule.key] = count;
      changed = true;
    }
    console.log(`  [baseline] ${rule.label}: ${count} (${rule.mode})`);
    continue;
  }

  if (prev === undefined) {
    console.log(`  [missing baseline] ${rule.label}: ${count} (run with --update)`);
    failed = true;
    continue;
  }

  const ok = count <= prev;
  if (!ok) failed = true;
  console.log(`  ${ok ? '✓' : '✗'} ${rule.label}: ${count} (baseline ${prev}${count < prev ? ', improved' : ''})`);

  if (!ok) {
    console.error(`\n    Violations for ${rule.label} (count ${count} > baseline ${prev}):`);
    details.slice(0, 10).forEach((d) => console.error(`      ${d}`));
    if (details.length > 10) console.error(`      ... and ${details.length - 10} more`);
    console.error('');
  }
}

if (updateMode) {
  if (changed) {
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log('\n✅ Baseline updated. Commit scripts/consolidation-ratchet-baseline.json with your changes.');
  } else {
    console.log('\nBaseline unchanged.');
  }
} else if (failed) {
  console.error('\n❌ Consolidation ratchet FAILED: a consolidation metric exceeded its baseline.');
  console.error('Revert the regressions or re-baseline after intentional changes with:');
  console.error('  node scripts/consolidation-ratchet.mjs --update');
  process.exit(1);
} else {
  console.log('\n✅ Consolidation ratchet OK: all metrics within baselines.');
}

