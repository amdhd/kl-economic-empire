import { expect, test, type Page } from '@playwright/test';
import type { GameState } from '../src/types/game';
import { runHours, startCampaign } from './helpers';

type Dev = { __klDev: { state: () => GameState } };
const state = (page: Page) => page.evaluate(() => (window as unknown as Dev).__klDev.state());

test('help pauses deliberation and speed shortcuts cannot resume the clock inside dialogs', async ({ page }) => {
  await startCampaign(page);
  await page.getByTestId('btn-speed-3').click();
  await page.getByRole('button', { name: '?', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Clock paused while help is open');
  const before = (await state(page)).clock.hour;
  await page.keyboard.press('1');
  await page.keyboard.press('Space');
  await page.waitForTimeout(1100);
  expect((await state(page)).clock.paused).toBe(true);
  expect((await state(page)).clock.hour).toBe(before);
  await page.keyboard.press('Escape');
  expect((await state(page)).clock.paused).toBe(false);
  await page.getByTestId('btn-pause').click();
  await page.getByTestId('nav-policies').click();
  await page.getByTestId('tax-corporate').fill('0.25');
  await page.getByTestId('btn-speed-3').click();
  await page.getByTestId('queue-tax').click();
  await page.keyboard.press('2');
  expect((await state(page)).clock.paused).toBe(true);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await state(page)).clock.paused).toBe(false);
});

test('final report explains scores, compares the true opening state and restores as a paused completed campaign', async ({ page }) => {
  // A fresh isolated Playwright context: permit save/load without touching any real player profile.
  await page.goto('/');
  await page.getByTestId('start-campaign').click();
  await runHours(page, 24 * 731 - 1);
  await page.getByTestId('btn-speed-3').click();
  await expect(page.getByTestId('panel')).toContainText('Economic Presidency Report', { timeout: 15000 });
  await expect(page.getByTestId('clock-time')).toHaveText('08:00');
  const final = await state(page);
  await expect(page.getByTestId('score-explanation')).toContainText('Sustainability preserves');
  await expect(page.getByTestId('campaign-comparison')).toContainText('Opening · 01 Jan 2027');
  await expect(page.getByTestId('campaign-comparison')).toContainText('RM 7.0bn');
  await page.getByRole('button', { name: 'Real output', exact: true }).click();
  await expect(page.getByTestId('panel')).toContainText('real RM bn per year');
  await page.getByTestId('term-fiscal').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('term-fiscal')).toContainText('Taxes & grants');
  await expect(page.getByTestId('term-fiscal')).toContainText('Bond proceeds');
  await page.getByText(/Policy history \(/).click();
  await expect(page.getByTestId('panel')).toContainText('You made no policy decisions.');
  await page.getByTestId('btn-save-menu').click();
  await page.getByTestId('save-slot1').click();
  await expect(page.getByTestId('toast').last()).toContainText('Saved to slot1');
  await page.reload();
  await page.getByTestId('continue').click(); // completed campaigns have an automatic end save
  await expect(page.getByTestId('panel')).toContainText('Economic Presidency Report');
  const loaded = await state(page);
  expect(loaded.scheduler.campaignEnded).toBe(true);
  expect(loaded.clock.paused).toBe(true);
  expect(loaded.clock.hour).toBe(final.clock.hour);
  expect(loaded.rng).toEqual(final.rng);
  await expect(page.getByTestId('btn-speed-3')).toBeDisabled();
});
