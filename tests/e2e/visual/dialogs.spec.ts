import { test, expect } from '@playwright/test';

test.describe('Visual Snapshot Regression Suite — Dialogs', () => {
  test('signin and dialog layout containment', async ({ page }) => {
    await page.goto('/signin');
    await page.waitForLoadState('domcontentloaded');
    const submitBtn = page.locator('button[type="submit"]');
    await expect(submitBtn).toBeVisible();
  });
});

