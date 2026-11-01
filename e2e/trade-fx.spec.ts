import { expect, test } from '@playwright/test';
import { runHours, startCampaign, openPanel } from './helpers';
import type { GameState } from '../src/types/game';
type Dev = { __klDev: { state: () => GameState } };

test('shows full cash balances beside month close and exposes dated national sources', async ({ page }) => {
  await startCampaign(page);
  const cash = page.getByTestId('bottom-treasury');
  await expect(cash).toContainText('RM 8,865,574,579');
  const footer = page.locator('footer');
  await expect(footer).toContainText('closes in');
  const box = await footer.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(1600);
  expect(box!.height).toBeLessThanOrEqual(56); // one slim toolbar row
  // The money readout opens the Economy window, whose summary carries the full cash positions.
  await cash.click();
  await expect(page.getByTestId('economy-window')).toBeVisible();
  await expect(page.getByTestId('bottom-fund-cash')).toContainText('RM 15,000,000,000');
  await expect(page.getByTestId('bottom-fund-cash')).toContainText('$2,500,000,000');
  await page.getByTestId('economy-window').getByRole('button', { name: 'Treasury & debt' }).click();
  await expect(page.getByTestId('panel')).toContainText('Treasury & public debt');
  await openPanel(page, 'sources');
  await expect(page.getByTestId('baseline-profile')).toContainText('Malaysia baseline');
  await expect(page.getByTestId('panel')).toContainText('RM 40,954,794,000');
  await expect(page.getByTestId('panel').getByRole('link', { name: 'Official source ↗' }).first()).toHaveAttribute('href', /open.dosm.gov.my/);
  await page.setViewportSize({ width: 1280, height: 800 });
  await openPanel(page, 'reports');
  await expect(page.getByTestId('panel')).toContainText('Reports');
  await expect(cash).toBeVisible();
});

test('queues trade for tomorrow, settles reserve-backed FX and reconciles the new flows', async ({ page }) => {
  await startCampaign(page);
  await openPanel(page, 'trade');
  await page.getByTestId('trade-tariff').fill('10');
  await page.getByTestId('export-support').fill('100');
  await page.getByTestId('queue-trade').click();
  await expect(page.getByRole('dialog')).toContainText('tomorrow');
  await page.getByTestId('confirm-btn').click();
  const before = await page.evaluate(() => (window as unknown as Dev).__klDev.state());
  expect(before.trade.policy.tariff).toBe(0);
  await page.getByTestId('review-intervention').click();
  await expect(page.getByRole('dialog')).toContainText('$100,000,000');
  await page.getByTestId('confirm-btn').click();
  await expect(page.getByTestId('intervention-history')).toContainText('Sold $100,000,000');
  const after = await page.evaluate(() => (window as unknown as Dev).__klDev.state());
  expect(after.government.treasury).toBe(before.government.treasury);
  expect(after.fund.myrCash).toBe(before.fund.myrCash);
  expect(after.centralBank.usdReserves).toBe(before.centralBank.usdReserves - 100e6 * 100);
  await runHours(page, 31 * 24 - 8);
  const closed = await page.evaluate(() => (window as unknown as Dev).__klDev.state());
  expect(closed.reports[0].gov.importTariff).toBeGreaterThan(0);
  expect(closed.trade.policy.tariff).toBe(0.1);
  await runHours(page, 28 * 24);
  const feb = await page.evaluate(() => (window as unknown as Dev).__klDev.state());
  expect(feb.reports[1].gov.importTariff).toBeGreaterThan(0);
  expect(feb.reports[1].reconciliation?.cashResidualMinor).toBe(0);
  await openPanel(page, 'reports');
  await expect(page.getByTestId('panel')).toContainText('Import tariffs');
});
