import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../src/types/game';
import { runHours } from './helpers';

type Dev = { __klDev: { state: () => GameState } };
const state = (page: Page) => page.evaluate(() => (window as unknown as Dev).__klDev.state());

test('recession shocks explain their causes, propagation and lifecycle in live and retained history', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => sessionStorage.setItem('klDevNoSave', '1'));
  await page.goto('/');
  await page.getByTestId('scenario-recession').click();
  await page.getByTestId('start-campaign').click();
  await page.getByTestId('nav-economy').click();
  await expect(page.getByTestId('event-2')).toContainText('Banking credit crunch');
  await expect(page.getByTestId('event-2')).toContainText('Active · strength 1.30×');
  await expect(page.getByTestId('event-2')).toContainText('New loans ↓ → investment ↓');
  await page.getByTestId('nav-reports').click();
  await page.getByRole('button', { name: 'Event log', exact: true }).click();
  await expect(page.getByTestId('event-1')).toContainText('Global growth slowdown');
  await expect(page.getByTestId('event-1')).toContainText('Fictional scenario');
  await expect(page.getByTestId('event-2')).toContainText('Funding stress makes banks pull back lending.');
  const before = await state(page);
  // Make this a deterministic boundary fixture in this isolated, no-save dev tab.
  await page.evaluate(() => {
    const s = (window as unknown as Dev).__klDev.state();
    for (const event of s.events.active) event.endDay = s.scheduler.lastDay + 1;
  });
  await runHours(page, 16);
  await expect(page.getByTestId('event-2')).toContainText('Ended · strength 1.30×');
  await expect(page.getByTestId('event-2')).toContainText('Direct shock ended');
  expect((await state(page)).events.active).toHaveLength(0);
  expect((await state(page)).clock.hour).toBe(before.clock.hour + 16);
  expect(errors).toEqual([]);
});

test('a credit crunch changes the economy view and the monthly lending/investment report', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('klDevNoSave', '1'));
  await page.goto('/');
  await page.getByTestId('scenario-recession').click();
  await page.getByTestId('start-campaign').click();
  await runHours(page, 31 * 24 - 8); // January closes, using its own final day's stress
  const s = await state(page);
  expect(s.bank.lendingRate).toBeGreaterThan(0.06);
  expect(s.reports[0].events).toContain('Banking credit crunch');
  expect(s.reports[0].reconciliation!.cashResidualMinor).toBe(0);
  expect(s.reports[0].investment).toBeGreaterThan(0);
  await page.getByTestId('nav-economy').click();
  await expect(page.getByTestId('panel')).toContainText('Banking (reduced form)');
  await expect(page.getByTestId('panel')).toContainText('Credit met');
  await expect(page.getByTestId('panel')).toContainText('External conditions & monetary signals');
  await expect(page.getByTestId('panel')).toContainText('US demand');
  await page.getByTestId('nav-reports').click();
  await expect(page.getByTestId('panel')).toContainText('Global growth slowdown');
  await expect(page.getByTestId('panel')).toContainText('Banking credit crunch');
  await page.getByTestId('nav-markets').click();
  await page.getByLabel('Search ticker').fill('NVDA');
  await page.locator('[data-testid="security-row"][data-ticker="US:NVDA"]').click();
  await expect(page.getByTestId('valuation-drivers')).toContainText('UST10 benchmark');
  await expect(page.getByTestId('valuation-drivers')).toContainText('Model value');
  await page.getByLabel('Search ticker').fill('1155');
  await page.locator('[data-testid="security-row"][data-ticker="MY:1155"]').click();
  await expect(page.getByTestId('valuation-drivers')).toContainText('MGS10 benchmark');
});
