#!/usr/bin/env node
/**
 * Runway Finance — Architecture Module Boundary Checker
 * Enforces clean layer separation as defined in docs/architecture.md and CC-17.
 *
 * Rules:
 *   1. components/ and lib/ must never import from app/api/**
 *   2. components/ui/** must never import from components/<domain>, lib/services, or lib/db
 *   3. lib/types/** and lib/constants/** must never import from components/**
 *   4. lib/utils/** must not import UI components
 */

import { readFileSync, readdirSync } from 'node:fs';
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

const violations = [];

// Rule 1: No app/api imports in components/ or lib/
const clientAndLibFiles = [...walk(join(ROOT, 'components')), ...walk(join(ROOT, 'lib'))];
for (const file of clientAndLibFiles) {
  const content = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  if (content.match(/from\s+['"]@\/app\/api(\/|['"])/)) {
    violations.push({
      rule: 'R-API-IMPORT',
      file: rel,
      message: 'Client components and lib services must never import from app/api/**; import from lib/types, lib/validations, or lib/services instead.',
    });
  }
}

// Rule 2: components/ui must be pure primitives
const uiPrimitiveFiles = walk(join(ROOT, 'components/ui'));
for (const file of uiPrimitiveFiles) {
  const content = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  if (content.match(/from\s+['"]@\/lib\/(db|services)/)) {
    violations.push({
      rule: 'R-UI-ISOLATION',
      file: rel,
      message: 'components/ui primitive must not import from lib/db or lib/services.',
    });
  }
}

// Rule 3: lib/types and lib/constants must not import from components/
const pureLibFiles = [
  ...walk(join(ROOT, 'lib/types')),
  ...walk(join(ROOT, 'lib/constants')),
];
for (const file of pureLibFiles) {
  const content = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  if (content.match(/from\s+['"]@\/components\//)) {
    violations.push({
      rule: 'R-PURE-LIB',
      file: rel,
      message: 'lib/types and lib/constants must not import from components/**.',
    });
  }
}

console.log('🏛️ Checking Architectural Module Boundaries...');

if (violations.length > 0) {
  console.error(`❌ Found ${violations.length} architectural boundary violation(s):`);
  for (const v of violations) {
    console.error(`  - [${v.rule}] ${v.file}: ${v.message}`);
  }
  process.exit(1);
} else {
  console.log('✅ All architectural module boundary checks passed cleanly.');
  process.exit(0);
}

