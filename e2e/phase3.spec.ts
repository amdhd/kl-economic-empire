/// <reference lib="dom" />
import { expect, test } from '@playwright/test';

test('fund desk: closed order, cancellation, FX, transfer and save/load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Capital with a purpose.' })).toBeVisible();
  await expect(page.getByText('MY CLOSED', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review buy order' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Confirm buy', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('queued');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('cancelled');
  await page.getByRole('button', { name: 'Confirm FX conversion' }).click();
  await expect(page.getByRole('status')).toContainText('FX conversion complete');
  await page.getByRole('button', { name: 'Treasury', exact: true }).click();
  await page.getByRole('button', { name: 'Contribute to SWF' }).click();
  await expect(page.getByRole('status')).toContainText('Public net worth unchanged');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Saved');
  await page.getByRole('button', { name: 'Distribute to treasury' }).click();
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('restored');
  await page.getByRole('button', { name: 'Statements', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Maybank', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await expect(page.getByText('The first reconciliation publishes', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Fund', exact: true }).click();
  await page.screenshot({ path: 'test-results/phase3-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('open-market buy and full sale preserve realized return after reload', async ({ page }) => {
  // Seed a valid saved snapshot at an open session through test tooling only.
  // No bulk-time controls are shipped in the application.
  const { createGame } = await import('../src/engine/game');
  const { runUntil } = await import('../tests/helpers');
  const { serialize } = await import('../src/persistence/save');
  const s = createGame(2027);
  runUntil(s, 2027, 1, 4, 10);
  await page.goto('/');
  await page.evaluate((raw) => localStorage.setItem('kl-phase3-save', raw), serialize(s));
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('MY OPEN', { exact: true })).toBeVisible();
  await page.getByLabel('Shares · lot 100').fill('1000');
  await page.getByRole('button', { name: 'Review buy order' }).click();
  await page.getByRole('button', { name: 'Confirm buy', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Filled: buy 1,000');
  await expect(page.getByRole('table')).toContainText('Maybank');
  await page.getByRole('button', { name: 'SELL', exact: true }).click();
  await page.getByRole('button', { name: 'Review sell order' }).click();
  await page.getByRole('button', { name: 'Confirm sell', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Filled: sell 1,000');
  await expect(page.getByText('No equities held.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem('kl-phase3-save')!).state);
  expect(snapshot.fund.realized.MYR).toBeLessThan(0); // round-trip fees/spread
  expect(snapshot.fund.positions).toEqual({});
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('No equities held.', { exact: false })).toBeVisible();
});

test('clock runs only at allowed speeds and order review pauses it', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '3×', exact: true }).click();
  await expect(page.getByText('RUNNING · 3×')).toBeVisible();
  await page.getByRole('button', { name: 'Review buy order' }).click();
  await expect(page.getByText('PAUSED', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('kl-phase3-save')!).state.clock);
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('kl-phase3-save')!).state.clock);
  expect(after).toEqual(before);
  await page.setViewportSize({ width: 850, height: 900 });
  await page.screenshot({ path: 'test-results/phase3-narrow.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('settled monthly report and fund chart render actual simulation history', async ({ page }) => {
  const { createGame } = await import('../src/engine/game');
  const { runUntil } = await import('../tests/helpers');
  const { serialize } = await import('../src/persistence/save');
  const s = createGame(31);
  runUntil(s, 2027, 2, 1, 1);
  await page.goto('/');
  await page.evaluate(raw => localStorage.setItem('kl-phase3-save', raw), serialize(s));
  await page.getByRole('button', { name: 'Load', exact: true }).click();
  await expect(page.getByText('Daily history begins', { exact: false })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await expect(page.getByLabel('Closed month')).toContainText('Jan');
  const cashRow = page.locator('dl > div').filter({ hasText: 'cashResidual' });
  const debtRow = page.locator('dl > div').filter({ hasText: 'debtResidual' });
  await expect(cashRow).toContainText('RM 0.00');
  await expect(debtRow).toContainText('RM 0.00');
  await page.screenshot({ path: 'test-results/phase3-reconciliation.png', fullPage: true });
});
