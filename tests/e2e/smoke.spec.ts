import { test, expect } from '@playwright/test';

test.describe('Runway Finance Smoke Tests', () => {
  test('redirects unauthenticated visitor to signin page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/.*signin/);
    await expect(page.locator('input[name="username"], input[type="text"]')).toBeVisible();
    await expect(page.locator('input[name="password"], input[type="password"]')).toBeVisible();
  });

  test('signin page renders branding and required authentication elements', async ({ page }) => {
    await page.goto('/signin');
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });
});
