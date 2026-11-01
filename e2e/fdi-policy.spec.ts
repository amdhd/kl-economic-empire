import { expect, test } from '@playwright/test';
import { startCampaign, openPanel } from './helpers';
import type { GameState } from '../src/types/game';
type Dev = { __klDev: { state: () => GameState } };
const state = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as Dev).__klDev.state());

test('policy decisions: tick, slide, review and see the phase cycle', async ({ page }) => {
  await startCampaign(page);
  await openPanel(page, 'decisions');
  await page.getByTestId('lever-toggle-carbonTax').check();
  await page.getByTestId('lever-slider-carbonTax').fill('60');
  await page.getByTestId('decide-policies').click();
  await expect(page.getByRole('dialog')).toContainText('RM60 per tonne');
  await page.getByTestId('confirm-btn').click();
  await expect(page.getByTestId('lever-carbonTax')).toContainText('Announced');
  const s = await state(page);
  expect(s.policy.levers.carbonTax.value).toBe(60);
});

test('investment pledges and the global standing board', async ({ page }) => {
  await startCampaign(page);
  await openPanel(page, 'fdi');
  const s0 = await state(page);
  const id = s0.fdi.pledges[0].id;
  await expect(page.getByTestId(`pledge-${id}`)).toContainText('Google (Alphabet)');
  await page.getByTestId(`pledge-approve-${id}`).click();
  await page.getByTestId('confirm-btn').click();
  expect((await state(page)).fdi.pledges[0].status).toBe('building');
  await page.getByTestId('nav-standing').click();
  await expect(page.getByTestId('standing-table').locator('tbody tr')).toHaveCount(11);
  await expect(page.getByTestId('standing-MYS')).toContainText('Malaysia');
});

test('fiscal reforms tab in Money & debt: estimate, review and decide a pension and a tax lever', async ({ page }) => {
  await startCampaign(page);
  await openPanel(page, 'reforms');
  await expect(page.getByTestId('reforms-intro')).toContainText('Fictional');
  await page.getByTestId('lever-toggle-retirementAge').check();
  await page.getByTestId('lever-slider-retirementAge').fill('65');
  await expect(page.getByTestId('estimate-retirementAge')).toContainText('saves about');
  await page.getByTestId('lever-toggle-wealthTax').check();
  await page.getByTestId('lever-slider-wealthTax').fill('0.01');
  await expect(page.getByTestId('estimate-wealthTax')).toContainText('raises about');
  await page.getByTestId('decide-policies').click();
  await expect(page.getByRole('dialog')).toContainText('65 years');
  await page.getByTestId('confirm-btn').click();
  await expect(page.getByTestId('lever-retirementAge')).toContainText('Announced');
  const s = await state(page);
  expect(s.policy.levers.retirementAge.value).toBe(65);
  expect(s.policy.levers.wealthTax.value).toBeCloseTo(0.01, 9);
});

test('fiscal control tab: rating readout on top, development and borrowing controls in the same tab', async ({ page }) => {
  await startCampaign(page);
  await openPanel(page, 'reforms');
  await expect(page.getByTestId('hub-readout')).toContainText('Credit rating');
  await expect(page.getByTestId('rating-breakdown')).toContainText('Score starts at 9');
  await page.getByTestId('dev-budget').fill('60');
  await page.getByTestId('review-dev').click();
  await page.getByTestId('confirm-btn').click();
  expect((await state(page)).government.pending.some(p => p.kind === 'development')).toBe(true);
  await page.getByTestId('hub-go-oil').click();
  await expect(page.getByTestId('panel')).toBeVisible();
});
