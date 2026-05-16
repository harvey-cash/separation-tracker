import { test, expect } from '@playwright/test';

test.describe('Settings', () => {
  test('navigates to the settings page from the dashboard and back', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.getByText('Longest departure auto-increment')).toBeVisible();
    await expect(page.getByLabel('Backend server URL')).toBeVisible();

    await page.getByRole('button', { name: 'Back to dashboard' }).click();
    await expect(page.getByRole('heading', { name: 'Brave Paws' })).toBeVisible();
  });

  test('uses saved settings to auto-increment the longest planned step from the previous session', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('csa_tracker_sessions', JSON.stringify([
        {
          id: 'session-1',
          date: '2026-05-15T10:00:00.000Z',
          steps: [
            { id: 'step-1', durationSeconds: 30, status: 'completed' },
            { id: 'step-2', durationSeconds: 480, status: 'completed' },
            { id: 'step-3', durationSeconds: 45, status: 'completed' },
          ],
          totalDurationSeconds: 555,
          status: 'completed',
        },
      ]));
      localStorage.setItem('brave_paws_settings', JSON.stringify({
        longestDepartureIncrement: {
          mode: 'percentage',
          value: 10,
        },
      }));
    });

    await page.goto('/');
    await page.getByRole('button', { name: 'Start Training' }).click();

    await expect(page.getByRole('heading', { name: "Plan Today's Training" })).toBeVisible();
    await expect(page.locator('span').filter({ hasText: '8m 50s' }).first()).toBeVisible();
    await expect(page.locator('span').filter({ hasText: '30s' }).first()).toBeVisible();
    await expect(page.locator('span').filter({ hasText: '45s' }).first()).toBeVisible();
  });
});
