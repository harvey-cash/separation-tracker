import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('navigates to the Progress view and back', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Progress' }).click();
    await expect(page.getByRole('heading', { name: 'Growth Journey' })).toBeVisible();
    await expect(page.getByText('Your progress will bloom here soon.')).toBeVisible();
    // Navigate back to dashboard
    await page.getByRole('button').filter({ has: page.locator('svg') }).first().click();
    await expect(page.getByRole('heading', { name: 'Brave Paws' })).toBeVisible();
  });

  test('navigates to the History view and back', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
    await expect(page.getByText('No sessions yet')).toBeVisible();
    // Navigate back to dashboard using the back arrow button
    await page.getByRole('button').filter({ has: page.locator('svg') }).first().click();
    await expect(page.getByRole('heading', { name: 'Brave Paws' })).toBeVisible();
  });

  test('navigates to session config and cancels back to dashboard', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start Training' }).click();
    await expect(page.getByRole('heading', { name: "Plan Today's Training" })).toBeVisible();
    // Cancel back to dashboard
    await page.getByRole('button').filter({ has: page.locator('svg') }).first().click();
    await expect(page.getByRole('heading', { name: 'Brave Paws' })).toBeVisible();
  });
});
