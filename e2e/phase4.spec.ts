import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../src/types/game';
import { runHours, startCampaign, openPanel, openEconomyWindow } from './helpers';

type Dev = { __klDev: { state: () => GameState } };
const state = (page: Page) => page.evaluate(() => (window as unknown as Dev).__klDev.state());

test('tax policy takes effect the next day; a zero levy still has a positive reintroduction forecast', async ({ page }) => {
  test.slow(); // the Fiscal control tab is a long page: on a loaded CI runner these steps come close to the 60s budget
  await startCampaign(page);
  await openEconomyWindow(page, 'taxation');
  await page.getByTestId('econ-tax-corporate').click();
  await page.getByTestId('econ-tax-slider').fill('0.25');
  await page.getByTestId('econ-tax-apply').click();
  await page.getByTestId('econ-tax-consumption').click();
  await page.getByTestId('econ-tax-slider').fill('0');
  await page.getByTestId('econ-tax-apply').click();
  expect((await state(page)).government.policies.tax.corporate).toBe(0.18);
  await runHours(page, 31 * 24 - 8); // 1 Feb 00:00
  let s = await state(page);
  expect(s.government.policies.tax.corporate).toBe(0.25);
  expect(s.government.policies.tax.consumption).toBe(0);
  await runHours(page, 28 * 24); // February closes at zero levy
  s = await state(page);
  expect(s.reports[1].gov.taxConsumption).toBe(0);
  // Reopen to start a fresh proposal at the currently effective rates.
  await openPanel(page, 'reports');
  await expect(page.getByTestId('panel')).toContainText('GDP by sector (value added)');
  await page.getByRole('button', { name: 'Close panel' }).click();
  await openEconomyWindow(page, 'taxation');
  await page.getByTestId('econ-tax-consumption').click();
  await page.getByTestId('econ-tax-slider').fill('0.04');
  const estimate = page.locator('.econ-line', { hasText: 'Static estimate of change' });
  await expect(estimate).toContainText(/RM [1-9][\d,.]*(?:m|bn|tn)/);
});

test('project quote includes current construction prices, then cash and work settle before completion', async ({ page }) => {
  await startCampaign(page);
  await page.evaluate(() => {
    (window as unknown as Dev).__klDev.state().sectors.prop.price = 1.2;
  });
  await openPanel(page, 'projects');
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
