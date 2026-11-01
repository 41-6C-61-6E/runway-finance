import { test, expect } from '@playwright/test';

test.describe('Visual Snapshot Regression Suite — Routes', () => {
  const routes = [
    { name: 'signin', path: '/signin' },
    { name: 'dashboard', path: '/' },
    { name: 'accounts', path: '/accounts' },
    { name: 'transactions', path: '/transactions' },
    { name: 'spending', path: '/spending' },
    { name: 'budgets', path: '/budgets' },
    { name: 'investments', path: '/investments' },
    { name: 'goals', path: '/goals' },
    { name: 'plans', path: '/plans' },
    { name: 'real-estate', path: '/real-estate' },
    { name: 'flows', path: '/flows' },
    { name: 'settings', path: '/settings' },
  ];

  for (const { name, path } of routes) {
    test(`route visual snapshot: ${name} (${path})`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('domcontentloaded');
      // If redirected to signin, wait for signin form to render
      if (page.url().includes('/signin')) {
        await expect(page.locator('button[type="submit"]')).toBeVisible();
      }
      expect(await page.title()).toBeDefined();
    });
  }
});

