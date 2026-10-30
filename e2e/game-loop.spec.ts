import { expect, test } from '@playwright/test';
import { runHours, startCampaign } from './helpers';

test('clock starts paused at 08:00 and runs at 3x (≈1 game hour per second)', async ({ page }) => {
  await startCampaign(page);
  await expect(page.getByTestId('clock-time')).toHaveText('08:00');
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('clock-time')).toHaveText('08:00'); // still paused
  await page.getByTestId('btn-speed-3').click();
  await page.waitForTimeout(2600);
  const t = await page.getByTestId('clock-time').textContent();
  const [h] = t!.split(':').map(Number);
  expect(h).toBeGreaterThanOrEqual(10);
  expect(h).toBeLessThanOrEqual(11);
  await page.keyboard.press('Space');
  const paused = await page.getByTestId('clock-time').textContent();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('clock-time')).toHaveText(paused!);
});

test('only Pause/1x/2x/3x exist — no skip or month-advance controls', async ({ page }) => {
  await startCampaign(page);
  for (const s of [1, 2, 3]) await expect(page.getByTestId(`btn-speed-${s}`)).toBeVisible();
  await expect(page.getByTestId('btn-speed-4')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /next month|skip|end turn|fast.?forward/i })).toHaveCount(0);
});

test('hiding the tab auto-pauses with no catch-up on return', async ({ page }) => {
  await startCampaign(page);
  await page.getByTestId('btn-speed-1').click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const t = await page.getByTestId('clock-time').textContent();
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(500);
  await expect(page.getByTestId('clock-time')).toHaveText(t!);
  await expect(page.getByTestId('btn-pause')).toHaveAttribute('aria-pressed', 'true');
});

test('SWF buys Maybank while Bursa is open: cash becomes shares', async ({ page }) => {
  await startCampaign(page);
  await runHours(page, 74); // Mon 4 Jan 2027 10:00 MYT
  await expect(page.getByTestId('market-MY')).toContainText('OPEN');
  await page.getByTestId('nav-markets').click();
  await page.getByTestId('row-MY:1155').click();
  await page.getByTestId('trade-units').fill('100000');
  await page.getByTestId('trade-review').click();
  await page.getByTestId('confirm-btn').click();
  await expect(page.getByTestId('toast').first()).toContainText('Filled');
  await page.getByTestId('nav-fund').click();
  await expect(page.getByTestId('panel')).toContainText('Maybank');
});

test('queue a tax change with an effective date and see the policy log', async ({ page }) => {
  await startCampaign(page);
  await page.getByTestId('nav-policies').click();
  await page.getByTestId('tax-corporate').fill('0.25');
  await page.getByTestId('queue-tax').click();
  await page.getByTestId('confirm-btn').click();
  await expect(page.getByTestId('panel')).toContainText('from 01 Feb 2027');
});
