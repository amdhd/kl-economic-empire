import { expect, test } from '@playwright/test';
import { runHours, startCampaign } from './helpers';

test('clock starts paused at 08:00 and runs at 3x (≤1 game hour per real second)', async ({ page }) => {
  await startCampaign(page);
  await expect(page.getByTestId('clock-time')).toHaveText('08:00');
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('clock-time')).toHaveText('08:00'); // still paused
  // 3× = 60 game minutes per real second. Under CPU load long frames are clamped (no catch-up),
  // so the clock may run slower than wall time but must never run faster.
  const t0 = Date.now();
  await page.getByTestId('btn-speed-3').click();
  const hour = async () => Number((await page.getByTestId('clock-time').textContent())!.split(':')[0]);
  await expect.poll(hour, { timeout: 10_000 }).toBeGreaterThanOrEqual(10);
  const elapsedS = (Date.now() - t0) / 1000;
  expect((await hour()) - 8).toBeLessThanOrEqual(Math.ceil(elapsedS) + 1);
  await page.keyboard.press('Space');
  const paused = await page.getByTestId('clock-time').textContent();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('clock-time')).toHaveText(paused!);
});

test('key 5 runs the clock at 5x (≤100 game minutes per real second, no catch-up)', async ({ page }) => {
  await startCampaign(page);
  const t0 = Date.now();
  await page.keyboard.press('5');
  await expect(page.getByTestId('btn-speed-5')).toHaveClass(/bg-emerald-500/);
  const minutes = async () => { const [h, m] = (await page.getByTestId('clock-time').textContent())!.split(':').map(Number); return h * 60 + m; };
  await expect.poll(minutes, { timeout: 10_000 }).toBeGreaterThanOrEqual(11 * 60);
  const elapsedS = (Date.now() - t0) / 1000;
  expect((await minutes()) - 8 * 60).toBeLessThanOrEqual(100 * (Math.ceil(elapsedS) + 1));
  await page.keyboard.press('Space');
});

test('only Pause/1x/2x/3x/5x exist — no skip or month-advance controls', async ({ page }) => {
  await startCampaign(page);
  for (const s of [1, 2, 3, 5]) await expect(page.getByTestId(`btn-speed-${s}`)).toBeVisible();
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
  await page.locator('[data-testid=security-row][data-ticker="MY:1155"]').click();
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
  await expect(page.getByTestId('panel')).toContainText('from 02 Jan 2027');
});

test('campaign ends after 24 months with the Economic Presidency Report', async ({ page }) => {
  await startCampaign(page);
  await runHours(page, 24 * 731 - 1); // up to 1 Jan 2029 07:00
  await page.getByTestId('btn-speed-3').click(); // resumes and crosses the final boundary
  await expect(page.getByTestId('panel')).toContainText('Economic Presidency Report', { timeout: 15_000 });
  await expect(page.getByTestId('score-total')).toBeVisible();
  await expect(page.getByTestId('clock-date')).toHaveText('01 Jan 2029');
  await expect(page.getByTestId('btn-speed-1')).toBeDisabled();
});
