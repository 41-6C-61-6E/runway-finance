#!/usr/bin/env node
/**
 * Runway Finance — Code Consolidation Metrics Reporter
 * Computes all metrics tracked in tmp/code-consolidation/01-TRACKER.md §2.
 *
 * Usage:
 *   node scripts/consolidation-metrics.mjs           # prints table to stdout
 *   node scripts/consolidation-metrics.mjs --json    # outputs raw JSON
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

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

function countLines(files) {
  let total = 0;
  for (const f of files) {
    const content = readFileSync(f, 'utf8');
    total += content.split('\n').length;
  }
  return total;
}

const prodDirs = ['app', 'components', 'lib'].map((d) => join(ROOT, d));
const prodFiles = prodDirs.flatMap((d) => walk(d));
const appFiles = walk(join(ROOT, 'app'));
const componentFiles = walk(join(ROOT, 'components'));
const libFiles = walk(join(ROOT, 'lib'));
const apiFiles = walk(join(ROOT, 'app/api'));

// 1. App LOC (app+components+lib)
const appLoc = countLines(prodFiles);

// 2. Files > 1,000 lines
const oversizedFiles = prodFiles
  .map((f) => ({ path: relative(ROOT, f), lines: readFileSync(f, 'utf8').split('\n').length }))
  .filter((f) => f.lines > 1000);
const oversizedLoc = oversizedFiles.reduce((acc, f) => acc + f.lines, 0);

// Helper for regex matching
function scanFiles(files, regex, excludeFn = () => false) {
  let occurrences = 0;
  const matchedFiles = new Set();
  for (const f of files) {
    const rel = relative(ROOT, f);
    if (excludeFn(rel)) continue;
    const content = readFileSync(f, 'utf8');
    const matches = content.match(new RegExp(regex, 'g'));
    if (matches && matches.length > 0) {
      occurrences += matches.length;
      matchedFiles.add(rel);
    }
  }
  return { occurrences, fileCount: matchedFiles.size, files: Array.from(matchedFiles) };
}

// 3. Raw fetch( in components and app (outside app/api)
const nonApiAppFiles = appFiles.filter((f) => !relative(ROOT, f).startsWith('app/api'));
const clientFetch = scanFiles([...componentFiles, ...nonApiAppFiles], '\\bfetch\\(');

// 4. useQuery / useMutation hits
const queryHooks = scanFiles(prodFiles, '\\b(useQuery|useMutation)\\(');

// 5. Inline queryKey: ['
const inlineQueryKey = scanFiles(prodFiles, 'queryKey:\\s*\\[[\'"`]');

// 6. Routes with direct await auth()
const routesAuth = scanFiles(apiFiles, 'await\\s+auth\\(');

// 7. Files using NextResponse.json
const nextResponseJson = scanFiles(apiFiles, 'NextResponse\\.json');

// 8. fixed inset-0 outside components/ui
const fixedInset0 = scanFiles(
  [...componentFiles, ...appFiles],
  'fixed\\s+inset-0|inset-0\\s+fixed',
  (rel) => rel.startsWith('components/ui/')
);

// 9. <Loader2 direct outside components/ui
const rawLoader2 = scanFiles(
  [...componentFiles, ...appFiles],
  '<Loader2\\b',
  (rel) => rel.startsWith('components/ui/')
);

// 10. Intl.NumberFormat outside format.ts
const intlFormat = scanFiles(
  prodFiles,
  'Intl\\.NumberFormat',
  (rel) => rel === 'lib/utils/format.ts'
);

// 11. any in production
const anyHits = scanFiles(prodFiles, ':\\s*any\\b|as\\s+any\\b|<\\s*any\\b|\\bany\\[\\]');

// 12. Hex literals in TSX/TS (excluding palette.ts and generated files)
const hexHits = scanFiles(
  prodFiles,
  '#[0-9a-fA-F]{3,8}\\b',
  (rel) => rel.includes('palette.ts') || rel.includes('generated')
);

// 13. text-[Npx]
const textPixelHits = scanFiles(prodFiles, 'text-\\[\\d+px\\]');

// 14. style={{
const styleHits = scanFiles(prodFiles, 'style=\\{\\{');

// 15. Direct localStorage outside persistent state hook
const localStorageHits = scanFiles(
  prodFiles,
  '\\blocalStorage\\.',
  (rel) => rel === 'lib/hooks/use-persistent-state.ts'
);

// 16. console.* in app/components/lib
const consoleHits = scanFiles(
  prodFiles,
  '\\bconsole\\.(log|warn|error|info|debug)\\(',
  (rel) => rel === 'lib/logger.ts' || rel === 'lib/client-error-reporter.ts'
);

// 17. process.env. outside env module
const processEnvHits = scanFiles(
  prodFiles,
  'process\\.env\\.',
  (rel) => rel === 'lib/env.ts' || rel === 'lib/env.client.ts'
);

// 18. PascalCase component filenames
let pascalCaseCount = 0;
for (const f of componentFiles) {
  const parts = relative(ROOT, f).split('/');
  const filename = parts[parts.length - 1];
  if (/^[A-Z]/.test(filename) && (filename.endsWith('.tsx') || filename.endsWith('.ts'))) {
    pascalCaseCount++;
  }
}

// 19. Hard-coded '/api/ paths outside routes.ts
const apiPathHits = scanFiles(
  prodFiles,
  '[\'"`]/api/[a-zA-Z0-9_/-]+',
  (rel) => rel === 'lib/api/routes.ts'
);

// 20. Duration literals N * 60 * 1000
const durationHits = scanFiles(prodFiles, '\\b\\d+\\s*\\*\\s*60\\s*\\*\\s*1000\\b|\\b\\d+\\s*\\*\\s*1000\\s*\\*\\s*60\\b');

const metrics = {
  appLoc,
  oversizedFiles: { count: oversizedFiles.length, loc: oversizedLoc },
  clientFetch: { occurrences: clientFetch.occurrences, files: clientFetch.fileCount },
  queryHooks: { occurrences: queryHooks.occurrences, files: queryHooks.fileCount },
  inlineQueryKey: { occurrences: inlineQueryKey.occurrences, files: inlineQueryKey.fileCount },
  routesAuth: { occurrences: routesAuth.occurrences, files: routesAuth.fileCount },
  nextResponseJson: { occurrences: nextResponseJson.occurrences, files: nextResponseJson.fileCount },
  fixedInset0: { occurrences: fixedInset0.occurrences, files: fixedInset0.fileCount },
  rawLoader2: { occurrences: rawLoader2.occurrences, files: rawLoader2.fileCount },
  intlFormat: { occurrences: intlFormat.occurrences, files: intlFormat.fileCount },
  anyHits: { occurrences: anyHits.occurrences, files: anyHits.fileCount },
  hexHits: { occurrences: hexHits.occurrences, files: hexHits.fileCount },
  textPixelHits: { occurrences: textPixelHits.occurrences, files: textPixelHits.fileCount },
  styleHits: { occurrences: styleHits.occurrences, files: styleHits.fileCount },
  localStorageHits: { occurrences: localStorageHits.occurrences, files: localStorageHits.fileCount },
  consoleHits: { occurrences: consoleHits.occurrences, files: consoleHits.fileCount },
  processEnvHits: { occurrences: processEnvHits.occurrences, files: processEnvHits.fileCount },
  pascalCaseComponentFiles: pascalCaseCount,
  apiPathHits: { occurrences: apiPathHits.occurrences, files: apiPathHits.fileCount },
  durationHits: { occurrences: durationHits.occurrences, files: durationHits.fileCount },
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(metrics, null, 2));
} else {
  console.log('\n======================================================');
  console.log(' RUNWAY FINANCE — CONSOLIDATION METRICS REPORT');
  console.log('======================================================');
  console.log(`App LOC (app+components+lib):               ${appLoc.toLocaleString()}`);
  console.log(`Files > 1,000 lines:                        ${oversizedFiles.length} (${oversizedLoc.toLocaleString()} LOC)`);
  console.log(`Raw fetch( hits (client):                   ${clientFetch.occurrences} (${clientFetch.fileCount} files)`);
  console.log(`useQuery/useMutation hits:                  ${queryHooks.occurrences} (${queryHooks.fileCount} files)`);
  console.log(`Inline queryKey: ['                         ${inlineQueryKey.occurrences} (${inlineQueryKey.fileCount} files)`);
  console.log(`Routes with direct await auth():            ${routesAuth.fileCount} routes`);
  console.log(`Files using NextResponse.json:              ${nextResponseJson.fileCount} files`);
  console.log(`fixed inset-0 outside components/ui:        ${fixedInset0.occurrences} (${fixedInset0.fileCount} files)`);
  console.log(`<Loader2 direct:                            ${rawLoader2.occurrences} (${rawLoader2.fileCount} files)`);
  console.log(`Intl.NumberFormat outside format.ts:        ${intlFormat.occurrences} (${intlFormat.fileCount} files)`);
  console.log(`any in production:                          ${anyHits.occurrences} (${anyHits.fileCount} files)`);
  console.log(`Hex literals in TSX/TS:                     ${hexHits.occurrences} (${hexHits.fileCount} files)`);
  console.log(`text-[Npx]:                                 ${textPixelHits.occurrences} (${textPixelHits.fileCount} files)`);
  console.log(`style={{:                                   ${styleHits.occurrences} (${styleHits.fileCount} files)`);
  console.log(`Direct localStorage:                        ${localStorageHits.occurrences} (${localStorageHits.fileCount} files)`);
  console.log(`console.* in app/components/lib:            ${consoleHits.occurrences} (${consoleHits.fileCount} files)`);
  console.log(`process.env. outside env module:            ${processEnvHits.occurrences} (${processEnvHits.fileCount} files)`);
  console.log(`PascalCase component filenames:             ${pascalCaseCount} files`);
  console.log(`Hard-coded '/api/ paths:                    ${apiPathHits.occurrences} (${apiPathHits.fileCount} files)`);
  console.log(`Duration literals (N*60*1000):              ${durationHits.occurrences} (${durationHits.fileCount} files)`);
  console.log('======================================================\n');
}

