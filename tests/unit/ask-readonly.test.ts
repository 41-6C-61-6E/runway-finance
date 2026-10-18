import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function getFilesRecursively(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...getFilesRecursively(fullPath));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Ask Read-Only Guarantees', () => {
  const askLibDir = path.resolve(process.cwd(), 'lib/ask');
  const askApiDir = path.resolve(process.cwd(), 'app/api/ai/ask');

  const filesToCheck = [
    ...getFilesRecursively(askLibDir),
    ...getFilesRecursively(askApiDir),
  ];

  it('scans all Ask library and route files', () => {
    expect(filesToCheck.length).toBeGreaterThan(10);
  });

  it('strictly forbids database mutation operations in lib/ask and app/api/ai/ask', () => {
    const forbiddenPatterns = [
      /\.insert\(/,
      /\.update\(/,
      /\.delete\(/,
      /db\.execute\(/,
      /import\s+.*from\s+['"]@\/app\/api\//, // Never import from other route files
    ];

    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relPath = path.relative(process.cwd(), filePath);

      for (const pattern of forbiddenPatterns) {
        const match = content.match(pattern);
        expect(
          match,
          `File ${relPath} contains forbidden database write or route import pattern: ${pattern}`
        ).toBeNull();
      }
    }
  });

  it('strictly forbids importing mutative helper functions', () => {
    const forbiddenImports = [
      'createManualRecurring',
      'mergeRecurringTransactions',
      'updateRecurringTransaction',
      'deleteRecurringTransaction',
      'autoDetectRecurring',
      'updateSystemTaxRules',
      'applyApprovedProposals',
      'analyzeUncategorized',
      'encryptRow',
      'encryptField',
    ];

    for (const filePath of filesToCheck) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relPath = path.relative(process.cwd(), filePath);

      for (const fnName of forbiddenImports) {
        const regex = new RegExp(`\\b${fnName}\\b`);
        expect(
          regex.test(content),
          `File ${relPath} contains forbidden write import: ${fnName}`
        ).toBe(false);
      }
    }
  });
});
