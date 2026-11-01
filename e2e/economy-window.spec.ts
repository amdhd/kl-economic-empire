import { expect, test } from '@playwright/test';
import { runHours, startCampaign } from './helpers';
import type { GameState } from '../src/types/game';
type Dev = { __klDev: { state: () => GameState } };
const state = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as Dev).__klDev.state());

test('the money readout opens a tabbed Economy window whose budget, tax and loan controls act on the game', async ({ page }) => {
  await startCampaign(page);
  await runHours(page, 24 * 35);
  await page.getByTestId('bottom-treasury').click();
  const win = page.getByTestId('economy-window');
  await expect(win).toBeVisible();
  await expect(page.getByTestId('monthly-balance')).toBeVisible();

  await page.getByTestId('econ-tab-budget').click();
  // Every line is per year, with a pinned total and the annual balance (the fiscal rule's deficit measure).
  await expect(page.getByTestId('budget-total')).toContainText('TOTAL SPENDING · PER YEAR');
  await expect(page.getByTestId('econ-budget-builds')).toBeVisible();
  await expect(page.getByTestId('annual-balance')).toBeVisible();
  const shown = (await page.getByTestId('annual-balance-block').innerText()).match(/([\d.]+)% of GDP/)![1];
  expect(Number(shown)).toBeCloseTo((await state(page)).fiscal.history.at(-1)!.deficit * 100, 1);
  await page.getByTestId('econ-budget-health').click();
  await page.getByTestId('econ-budget-slider').fill('1.2');
  await page.getByTestId('econ-budget-apply').click();

  await page.getByTestId('econ-tab-taxation').click();
  await expect(page.getByTestId('revenue-total')).toContainText('TOTAL REVENUE · PER YEAR');
  await page.getByTestId('econ-tax-consumption').click();
  await page.getByTestId('econ-tax-slider').fill('0.05');
  await page.getByTestId('econ-tax-apply').click();

  await page.getByTestId('econ-tab-loans').click();
  const debt = (await state(page)).government.debt;
  await page.getByTestId('econ-issue').click();

  await page.getByTestId('econ-tab-production').click();
  await expect(page.getByTestId('econ-sector-tech')).toBeVisible();

  const s = await state(page);
  expect(s.government.pending.map((p) => p.kind).sort()).toEqual(['budget', 'tax']);
  expect(s.government.debt).toBeGreaterThan(debt);
  await page.keyboard.press('Escape');
  await expect(win).not.toBeVisible();
});

test('queued tax and budget changes are listed in the Economy window and can be withdrawn', async ({ page }) => {
  await startCampaign(page);
  await page.getByTestId('bottom-treasury').click();
  await page.getByTestId('econ-tab-taxation').click();
  await expect(page.getByTestId('queued-policies')).toContainText('Nothing queued.');
  await page.getByTestId('econ-tax-corporate').click();
  await page.getByTestId('econ-tax-slider').fill('0.25');
  await page.getByTestId('econ-tax-apply').click();
  await expect(page.getByTestId('queued-policies')).toContainText('Corporate');
  expect((await state(page)).government.pending).toHaveLength(1);
  await page.getByTestId('queued-policies').getByRole('button', { name: 'Withdraw' }).click();
  await expect(page.getByTestId('queued-policies')).toContainText('Nothing queued.');
  expect((await state(page)).government.pending).toHaveLength(0);
});
