import { expect, test } from '@playwright/test';
import { runHours, startCampaign } from './helpers';

test('year-end window opens at the December close, pauses the clock and queues the next budget', async ({ page }) => {
  await startCampaign(page);
  await runHours(page, 24 * 30 * 12 + 24 * 5);
  await page.getByTestId('btn-speed-3').click(); // the next tick sees the December close
  await expect(page.getByTestId('year-review')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('year-review')).toContainText('2027 in review');
  await expect(page.getByTestId('year-headlines')).toBeVisible();
  await page.getByTestId('plan-index').click();
  await expect(page.getByTestId('plan-outlook')).toContainText('Projected deficit');
  await page.getByTestId('year-queue').click();
  await expect(page.getByTestId('year-review')).not.toBeVisible();
  // Once per year: it does not reopen by itself, but the rail can bring it back.
  await page.getByTestId('nav-yearreview').click();
  await expect(page.getByTestId('year-review')).toBeVisible();
  await page.getByTestId('year-continue').click();
  await expect(page.getByTestId('year-review')).not.toBeVisible();
});
