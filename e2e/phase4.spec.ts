import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../src/types/game';
import { runHours, startCampaign } from './helpers';

type Dev = { __klDev: { state: () => GameState } };
const state = (page: Page) => page.evaluate(() => (window as unknown as Dev).__klDev.state());

test('tax policy takes effect the next day; a zero levy still has a positive reintroduction forecast', async ({ page }) => {
  await startCampaign(page);
  await page.getByTestId('nav-policies').click();
  await page.getByTestId('tax-corporate').fill('0.25');
  await page.getByTestId('tax-consumption').fill('0');
  await page.getByTestId('queue-tax').click();
  await expect(page.getByRole('dialog')).toContainText('Effective from tomorrow');
  await page.getByTestId('confirm-btn').click();
  expect((await state(page)).government.policies.tax.corporate).toBe(0.18);
  await runHours(page, 31 * 24 - 8); // 1 Feb 00:00
  let s = await state(page);
  expect(s.government.policies.tax.corporate).toBe(0.25);
  expect(s.government.policies.tax.consumption).toBe(0);
  await runHours(page, 28 * 24); // February closes at zero levy
  s = await state(page);
  expect(s.reports[1].gov.taxConsumption).toBe(0);
  // Reopen to start a fresh proposal at the currently effective rates.
  await page.getByTestId('nav-reports').click();
  await expect(page.getByTestId('panel')).toContainText('GDP by sector (value added)');
  await page.getByTestId('nav-policies').click();
  await page.getByTestId('tax-consumption').fill('0.04');
  await expect(page.getByTestId('tax-estimate')).toContainText(/\+RM [1-9][\d,.]*(?:m|bn) per month/);
});

test('project quote includes current construction prices, then cash and work settle before completion', async ({ page }) => {
  await startCampaign(page);
  await page.evaluate(() => {
    (window as unknown as Dev).__klDev.state().sectors.prop.price = 1.2;
  });
  await page.getByTestId('nav-projects').click();
  await page.getByTestId('project-fibre').click();
  await expect(page.getByRole('dialog')).toContainText('Estimated cost RM 720.0m');
  await expect(page.getByRole('dialog')).toContainText('RM 600.0m base cost');
  await expect(page.getByRole('dialog')).toContainText('RM 121.7m/month');
  await page.getByTestId('confirm-btn').click();
  expect((await state(page)).government.projects[0].spent).toBe(0);
  await runHours(page, 16); // next daily settlement
  const s = await state(page);
  expect(s.government.projects[0].spent).toBeCloseTo(4e6, 2);
  expect(s.government.projects[0].status).toBe('building');
  expect(s.sectors.tech.infraBoost).toBe(0);
  await expect(page.getByTestId('panel')).toContainText('RM 4.0m spent');
});
