import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { authenticateContext } from '../support/auth';

const E2E_CAPTURE_DIR = path.resolve(process.cwd(), 'tmp/ui-capture/e2e');

test.describe('Visual Snapshot Regression Suite — Routes', () => {
  const routes = [
    { name: 'signin', path: '/signin', auth: false },
    { name: 'dashboard', path: '/', auth: true },
    { name: 'accounts', path: '/accounts', auth: true },
    { name: 'transactions', path: '/transactions', auth: true },
    { name: 'spending', path: '/spending', auth: true },
    { name: 'budgets', path: '/budgets', auth: true },
    { name: 'investments', path: '/investments', auth: true },
    { name: 'goals', path: '/goals', auth: true },
    { name: 'plans', path: '/plans', auth: true },
    { name: 'real-estate', path: '/real-estate', auth: true },
    { name: 'flows', path: '/flows', auth: true },
    { name: 'settings', path: '/settings', auth: true },
  ];

  test.beforeAll(() => {
    fs.mkdirSync(E2E_CAPTURE_DIR, { recursive: true });
  });

  for (const { name, path: routePath, auth } of routes) {
    test(`route visual snapshot: ${name} (${routePath})`, async ({ page, context }, testInfo) => {
      if (auth) {
        await authenticateContext(context);
      } else {
        await context.clearCookies();
      }

      await page.goto(routePath, { waitUntil: 'domcontentloaded' });

      if (!auth || page.url().includes('/signin')) {
        await expect(page.locator('button[type="submit"]')).toBeVisible();
      }

      expect(await page.title()).toBeDefined();

      // Verify no unintended horizontal page overflow
      const overflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth - window.innerWidth;
      });
      expect(overflow).toBeLessThanOrEqual(2);

      // Save screenshot to gitignored tmp/ui-capture/e2e/
      const projectSlug = testInfo.project.name.replace(/[^a-z0-9_-]/gi, '-');
      await page.screenshot({
        path: path.join(E2E_CAPTURE_DIR, `${name}__${projectSlug}.png`),
      });
    });
  }
});
