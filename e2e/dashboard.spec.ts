import { test, expect } from '@playwright/test';

test.describe('Dashboard', () => {
  test('shows the app title and tagline', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Brave Paws');
    await expect(page.getByRole('heading', { name: 'Brave Paws' })).toBeVisible();
    await expect(page.getByText('Celebrating every second of independence.')).toBeVisible();
  });

  test('shows the main navigation buttons', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Start Training' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Progress' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'History' })).toBeVisible();
  });

  test('shows empty-state message when there are no sessions', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('No sessions yet')).toBeVisible();
  });
});
