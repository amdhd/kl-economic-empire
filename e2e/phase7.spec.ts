import { expect, test } from '@playwright/test';
import { runHours, startCampaign } from './helpers';
import type { GameState } from '../src/types/game';
type Dev = { __klDev: { state: () => GameState } };
const state = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as Dev).__klDev.state());

test('fiscal rules, commodities, partners and state enterprises can be reviewed and applied', async ({ page }) => {
  await startCampaign(page);
  await runHours(page, 24 * 40);

  await page.getByTestId('nav-fiscal').click();
  await expect(page.getByTestId('fiscal-summary')).toContainText('Deficit');
  await expect(page.getByTestId('credibility')).toContainText('/100');
  await page.getByTestId('dev-budget').fill('70');
  await page.getByTestId('review-dev').click();
  await expect(page.getByRole('dialog')).toContainText('RM70bn');
  await page.getByTestId('confirm-btn').click();

  await page.getByTestId('nav-commodities').click();
  await expect(page.getByTestId('commodity-prices')).toContainText('Crude oil');
  await page.getByTestId('nav-oil').click();
  await page.getByRole('button', { name: 'Petrol subsidy' }).click();
  await page.getByTestId('fuel-ceiling').fill('2.3');
  await page.getByTestId('review-commodity').click();
  await expect(page.getByRole('dialog')).toContainText('RM2.30');
  await page.getByTestId('confirm-btn').click();

  await page.getByTestId('nav-partners').click();
  await page.getByTestId('partner-US').click();
  await page.getByTestId('partner-tariff').fill('10');
  await page.getByTestId('review-partner-tariff').click();
  await expect(page.getByRole('dialog')).toContainText('United States');
  await page.getByTestId('confirm-btn').click();

  await page.getByTestId('nav-soe').click();
  await expect(page.getByTestId('khazanah-table')).toContainText('Axiata');
  await page.getByTestId('nav-oil').click();
  await expect(page.getByTestId('petronas-outlook')).toBeVisible();
  await page.getByTestId('petronas-dividend').fill('45');
  await page.getByTestId('review-petronas').click();
  await page.getByTestId('confirm-btn').click();

  const s = await state(page);
  expect(s.soe.petronas.dividendAnnual).toBe(45e9);
  expect(s.government.pending.map((p) => p.kind).sort()).toEqual(['commodity', 'development', 'partner']);
  await runHours(page, 24 * 35);
  const t = await state(page);
  expect(t.fiscal.developmentAnnual).toBe(70e9);
  expect(t.world.policy.fuelCeiling).toBe(2.3);
  expect(t.world.partners.US.ourTariff).toBe(0.1);
  expect(t.fiscal.history.length).toBeGreaterThan(0);
});
