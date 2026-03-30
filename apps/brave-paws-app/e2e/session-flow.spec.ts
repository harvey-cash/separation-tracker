import { test, expect } from '@playwright/test';

const DEFAULT_CLOCK = '00:00';

function parseClock(text: string) {
  const [minutes, seconds] = text.trim().split(':').map(Number);
  return minutes * 60 + seconds;
}

test.describe('Session flow', () => {
  test('completes a full session and saves it to the dashboard', async ({ page }) => {
    await page.goto('/');

    // Start a new training session
    await page.getByRole('button', { name: 'Start Training' }).click();
    await expect(page.getByRole('heading', { name: "Plan Today's Training" })).toBeVisible();

    // Confirm default steps are loaded and start the session
    await expect(page.getByRole('button', { name: "Let's Go!" })).toBeEnabled();
    await page.getByRole('button', { name: "Let's Go!" }).click();

    // Active session screen should be visible
    await expect(page.getByRole('button', { name: 'Wrap Up Session' })).toBeVisible();

    // Wrap up the session without waiting for the timer
    await page.getByRole('button', { name: 'Wrap Up Session' }).click();

    // Session wrap-up screen
    await expect(page.getByRole('heading', { name: 'Wrap Up Session' })).toBeVisible();

    // Rate anxiety as Calm and save
    await page.getByRole('button', { name: 'Completed' }).click();
    await page.getByRole('button', { name: 'Calm' }).click();
    await page.getByRole('button', { name: 'Save Session' }).click();

    // Should be back on dashboard with the new session in Recent Wins
    await expect(page.getByRole('heading', { name: 'Brave Paws' })).toBeVisible();
    await expect(page.getByText('Recent Wins')).toBeVisible();
    // The session card shows completed steps
    await expect(page.getByText('0 completed • 0 aborted')).toBeVisible();
  });

  test('can abort a step, save the session as aborted, and review the statuses', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start Training' }).click();
    await page.getByRole('button', { name: "Let's Go!" }).click();

    await expect(page.getByRole('button', { name: 'Abort Step' })).toBeVisible();
    await page.getByRole('button', { name: 'Abort Step' }).click();
    await page.getByRole('button', { name: 'Wrap Up Session' }).click();

    await expect(page.getByRole('heading', { name: 'Wrap Up Session' })).toBeVisible();
    await page.getByRole('button', { name: 'Aborted' }).click();
    await page.getByRole('button', { name: 'Panicking' }).click();
    await page.getByRole('button', { name: 'Save Session' }).click();

    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();
    await expect(page.getByText('Aborted').first()).toBeVisible();

    await page.locator('div.bg-white.p-6.rounded-3xl').first().click();
    await expect(page.getByRole('heading', { name: 'Session Details' })).toBeVisible();
    await expect(page.getByText('Step Outcomes')).toBeVisible();
    await expect(page.getByText('Session').first()).toBeVisible();
    await expect(page.getByText('Aborted').first()).toBeVisible();
  });

  test('can add a step in session config', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start Training' }).click();
    await expect(page.getByRole('heading', { name: "Plan Today's Training" })).toBeVisible();

    // Add a step using the Add Step button
    await page.getByRole('button', { name: 'Add Step' }).click();

    // The Let's Go button should still be enabled
    await expect(page.getByRole('button', { name: "Let's Go!" })).toBeEnabled();
  });

  test('can add a historical session from History view', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    // Click "Add Past Session"
    await page.getByRole('button', { name: 'Add Past Session' }).click();

    // A modal should appear for editing/adding a session
    await expect(page.getByRole('heading', { name: 'Edit Session' })).toBeVisible();
  });

  test('restores an in-progress session after reloading the page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Start Training' }).click();
    await page.getByRole('button', { name: "Let's Go!" }).click();
    await expect(page.getByRole('button', { name: 'Wrap Up Session' })).toBeVisible();

    const sessionElapsed = page.locator('header span.font-mono').first();
    const stepRemaining = page.locator('div.text-8xl');
    const stepToggle = page.locator('div.flex.items-center.gap-6 > button').first();
    const elapsedAtStart = parseClock(await sessionElapsed.textContent() ?? DEFAULT_CLOCK);

    await stepToggle.click();
    await expect.poll(async () => parseClock(await sessionElapsed.textContent() ?? DEFAULT_CLOCK)).toBeGreaterThan(elapsedAtStart);
    await expect.poll(async () => parseClock(await stepRemaining.textContent() ?? DEFAULT_CLOCK)).toBeLessThan(30);

    const elapsedBeforeReload = parseClock(await sessionElapsed.textContent() ?? DEFAULT_CLOCK);
    const remainingBeforeReload = parseClock(await stepRemaining.textContent() ?? DEFAULT_CLOCK);

    await page.reload();
    await expect(page.getByRole('button', { name: 'Wrap Up Session' })).toBeVisible();

    const elapsedAfterReload = parseClock(await sessionElapsed.textContent() ?? DEFAULT_CLOCK);
    const remainingAfterReload = parseClock(await stepRemaining.textContent() ?? DEFAULT_CLOCK);

    expect(elapsedAfterReload).toBeGreaterThanOrEqual(elapsedBeforeReload);
    expect(remainingAfterReload).toBeLessThanOrEqual(remainingBeforeReload);

    await expect.poll(async () => parseClock(await sessionElapsed.textContent() ?? DEFAULT_CLOCK)).toBeGreaterThan(elapsedAfterReload);
    await expect.poll(async () => parseClock(await stepRemaining.textContent() ?? DEFAULT_CLOCK)).toBeLessThan(remainingAfterReload);
  });
});
