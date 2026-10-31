import { expect, test } from '@playwright/test';
import type { GameState } from '../src/types/game';
type Dev = { __klDev: { state: () => GameState } };

test('new game offers term lengths and an opt-in Boom sandbox', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('klDevNoSave', '1'));
  await page.goto('/');
  await expect(page.getByTestId('term-24')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('term-120').click();
  await page.getByTestId('boom-mode').check();
  await page.getByTestId('start-campaign').click();
  const s = await page.evaluate(() => (window as unknown as Dev).__klDev.state());
  expect(s.mode).toEqual({ boom: true, months: 120 });
  await page.getByTestId('info-views').click();
  await page.getByTestId('nav-objectives').click();
  await expect(page.getByTestId('panel')).toContainText('Boom sandbox');
  await expect(page.getByTestId('panel')).toContainText('of 120');
});
