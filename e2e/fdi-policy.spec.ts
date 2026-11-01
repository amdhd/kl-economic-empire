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
  await expect(page.getByTestId(`pledge-${id}`)).toContainText(s0.fdi.pledges[0].title);
  await page.getByTestId(`pledge-approve-${id}`).click();
  await page.getByTestId('confirm-btn').click();
  expect((await state(page)).fdi.pledges[0].status).toBe('building');
  await page.getByTestId('nav-standing').click();
  await expect(page.getByTestId('standing-table').locator('tbody tr')).toHaveCount(11);
  await expect(page.getByTestId('standing-MYS')).toContainText('Malaysia');
});
