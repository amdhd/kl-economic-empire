// Phase 3 fund-desk checks, ported from the standalone desk to the integrated shell.
// Playwright gives every test a fresh browser profile, so real saves are safe to exercise here.
import { expect, test, type Page } from '@playwright/test';
import { runHours, openPanel } from './helpers';

type Dev = { __klDev: { runHours: (h: number) => void; state: () => any } }; // eslint-disable-line @typescript-eslint/no-explicit-any
const state = (page: Page) => page.evaluate(() => (window as unknown as Dev).__klDev.state());

async function begin(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.getByTestId('start-campaign').click();
  await page.getByTestId('info-views').click();
  return errors;
}

async function openCompany(page: Page, id: string) {
  await page.getByTestId('nav-markets').click();
  await page.getByLabel('Search ticker').fill(id.split(':')[1]);
  await page.locator(`[data-testid=security-row][data-ticker="${id}"]`).click();
}

test('closed-market order queues and cancels; FX, treasury transfer, save/load', async ({ page }) => {
  const errors = await begin(page); // Fri 1 Jan 2027 08:00: Bursa closed (holiday)
  await openCompany(page, 'MY:1155');
  await page.getByTestId('trade-units').fill('1000');
  await page.getByTestId('trade-review').click();
  await page.getByTestId('confirm-btn').click();
  await expect(page.getByTestId('toast').last()).toContainText('queued');
  await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
  await expect(page.getByTestId('toast').last()).toContainText('cancelled');

  await openPanel(page, 'fund');
  await page.getByTestId('fx-amount').fill('100');
  await page.getByTestId('fx-convert').click();
  await expect(page.getByTestId('toast').last()).toContainText('FX conversion complete');
  await page.getByRole('button', { name: 'Inject → SWF' }).click();
  await page.getByTestId('confirm-btn').click();
  await expect(page.getByTestId('toast').last()).toContainText('Public net worth unchanged');

  const saved = await state(page);
  await page.getByTestId('btn-save-menu').click();
  await page.getByTestId('save-slot1').click();
  await expect(page.getByTestId('toast').last()).toContainText('Saved to slot1');
  await page.getByRole('button', { name: 'Withdraw → treasury' }).click();
  await page.getByTestId('confirm-btn').click();
  expect((await state(page)).fund.myrCash).not.toBe(saved.fund.myrCash);
  await page.getByTestId('btn-save-menu').click();
  await page.getByTestId('load-slot1').click();
  await expect(page.getByTestId('toast').last()).toContainText('Loaded slot1');
  const restored = await state(page);
  expect(restored.fund.myrCash).toBe(saved.fund.myrCash);
  expect(restored.fund.usdCash).toBe(saved.fund.usdCash);
  expect(restored.government.treasury).toBe(saved.government.treasury);
  expect(restored.clock.hour).toBe(saved.clock.hour);
  expect(restored.clock.paused).toBe(true);
  expect(errors).toEqual([]);
});

test('open-market buy then full sale keeps realised return across save/load', async ({ page }) => {
  await begin(page);
  await runHours(page, 74); // Mon 4 Jan 10:00 MYT, Bursa open
  await openCompany(page, 'MY:1155');
  await page.getByTestId('trade-units').fill('1000');
  await page.getByTestId('trade-review').click();
  await page.getByTestId('confirm-btn').click();
  await expect(page.getByTestId('toast').last()).toContainText('Filled: buy 1,000');
  await page.getByTestId('company-panel').getByRole('button', { name: 'Sell', exact: true }).click();
  await page.getByTestId('trade-units').fill('1000');
  await page.getByTestId('trade-review').click();
  await page.getByTestId('confirm-btn').click();
  await expect(page.getByTestId('toast').last()).toContainText('Filled: sell 1,000');
  const s = await state(page);
  expect(s.fund.positions).toEqual({});
  expect(s.fund.realized.MYR).toBeLessThan(0); // round trip pays fees + spread
  await openPanel(page, 'fund');
  await expect(page.getByTestId('fund-totals')).toContainText('Realised (MYR stocks)');
  await page.getByTestId('btn-save-menu').click();
  await page.getByTestId('save-slot2').click();
  await expect(page.getByTestId('toast').last()).toContainText('Saved to slot2'); // save is async; menu closes after
  await page.getByTestId('btn-save-menu').click();
  await page.getByTestId('load-slot2').click();
  await expect(page.getByTestId('toast').last()).toContainText('Loaded slot2');
  expect((await state(page)).fund.realized.MYR).toBe(s.fund.realized.MYR);
});

test('order review pauses the running clock; cancelling resumes it', async ({ page }) => {
  await begin(page);
  await openCompany(page, 'MY:1155');
  await page.getByTestId('btn-speed-3').click();
  expect((await state(page)).clock.paused).toBe(false);
  await page.getByTestId('trade-review').click();
  expect((await state(page)).clock.paused).toBe(true);
  const t = await page.getByTestId('clock-time').textContent();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId('clock-time')).toHaveText(t!);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await state(page)).clock.paused).toBe(false);
});

test('settled monthly report reconciles cash and debt to zero sen; treasury journal shows postings', async ({ page }) => {
  await begin(page);
  await runHours(page, 24 * 31 + 1); // through the 1 Feb 2027 month close
  await openPanel(page, 'reports');
  await expect(page.getByTestId('reconciliation')).toBeVisible();
  await expect(page.getByTestId('cash-residual')).toHaveText('RM 0.00');
  await expect(page.getByTestId('debt-residual')).toHaveText('RM 0.00');
  await openPanel(page, 'debt');
  await expect(page.getByTestId('treasury-journal')).toContainText('Other public receipts');
});
