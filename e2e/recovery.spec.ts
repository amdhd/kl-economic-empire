import { expect, test } from '@playwright/test';
import { runHours } from './helpers';

test('refresh offers the exact previous session, paused without offline progress', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('start-campaign').click();
  await runHours(page, 37);
  const before = await page.evaluate(() => JSON.stringify((window as unknown as { __klDev: { state: () => unknown } }).__klDev.state()));
  await page.reload();
  await page.getByTestId('restore-session').click();
  const after = await page.evaluate(() => (window as unknown as { __klDev: { state: () => { clock: { paused: boolean }; rng: unknown } } }).__klDev.state());
  const expected = JSON.parse(before);
  expected.clock.paused = true;
  expect(after).toEqual(expected);
  await expect(page.getByTestId('new-game')).not.toBeVisible();
  await page.reload();
  await page.getByTestId('restore-session').click();
  expect(await page.evaluate(() => (window as unknown as { __klDev: { state: () => unknown } }).__klDev.state())).toEqual(expected);
});
