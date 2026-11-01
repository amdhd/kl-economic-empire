import { expect, test } from '@playwright/test';
import { runHours, startCampaign, openPanel } from './helpers';
import type { GameState } from '../src/types/game';
type Dev = { __klDev: { state: () => GameState } };

test('trade ministry shows trillion-ringgit trade, signs a product deal and funds export promotion', async ({ page }) => {
  await startCampaign(page);
  await runHours(page, 32 * 24);
  await openPanel(page, 'ministry');
  const headline = page.getByTestId('ministry-headline');
  await expect(headline).toContainText('Exports · annual rate');
  await expect(headline).toContainText(/RM ?1\.\d+tn/);
  await expect(page.getByTestId('ministry-partners')).toContainText('Singapore');

  await page.getByTestId('ministry-tab-products').click();
  await expect(page.getByTestId('ministry-products')).toContainText('Electrical & electronic products');

  await page.getByTestId('ministry-tab-deals').click();
  await page.getByTestId('deal-partner').selectOption('US');
  await page.getByTestId('deal-product').selectOption('ee');
  await page.getByTestId('deal-propose').click();
  await page.locator('[data-testid^="deal-sign-"]').first().click();
  await expect(page.getByRole('dialog')).toContainText('formal talks');
  await page.getByTestId('confirm-btn').click();
  const deals = await page.evaluate(() => (window as unknown as Dev).__klDev.state().tradeBook.deals);
  expect(deals[0].status).toBe('talks');

  await page.getByTestId('ministry-tab-promotion').click();
  await page.getByTestId('programme-budget-digital').fill('1');
  await page.getByTestId('programme-set-digital').click();
  await expect(page.getByRole('dialog')).toContainText('from tomorrow');
  await page.getByTestId('confirm-btn').click();
  await runHours(page, 48);
  const s = await page.evaluate(() => (window as unknown as Dev).__klDev.state());
  expect(s.tradeBook.programmes.digital.budget).toBe(1e9);
  expect(s.government.mtd.exportSupport).toBeGreaterThan(0);
});
