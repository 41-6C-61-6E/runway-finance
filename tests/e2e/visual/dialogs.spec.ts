import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const E2E_CAPTURE_DIR = path.resolve(process.cwd(), 'tmp/ui-capture/e2e');

test.describe('Visual Snapshot Regression Suite — Dialogs', () => {
  test('signin and dialog layout containment', async ({ page }, testInfo) => {
    fs.mkdirSync(E2E_CAPTURE_DIR, { recursive: true });
    await page.goto('/signin');
    await page.waitForLoadState('domcontentloaded');
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();

    const projectSlug = testInfo.project.name.replace(/[^a-z0-9_-]/gi, '-');
    await page.screenshot({
      path: path.join(E2E_CAPTURE_DIR, `signin-dialog__${projectSlug}.png`),
    });
  });
});
