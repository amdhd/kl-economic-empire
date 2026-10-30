import { expect, test } from '@playwright/test';
import { startCampaign } from './helpers';

test('KL 3D map renders with attribution and verified company markers', async ({ page }) => {
  await startCampaign(page);
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  const box = await page.locator('.maplibregl-canvas').boundingBox();
  expect(box!.height).toBeGreaterThan(400);
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap', { timeout: 20_000 });
  // 16 companies have a verified OSM location; the rest are market-only.
  await expect(page.locator('.co-marker')).toHaveCount(16);
  await expect(page.locator('[data-testid="marker-MY:1023"]')).toHaveCount(0); // CIMB: no verified point
});

test('clicking a company marker opens that company, labelled as simulated', async ({ page }) => {
  await startCampaign(page);
  await page.locator('[data-testid="marker-MY:3182"]').click();
  await expect(page.getByTestId('company-name')).toHaveText('Genting');
  await expect(page.getByTestId('company-panel')).toContainText('Simulated · fictional data');
  await expect(page.getByTestId('company-panel')).toContainText('Wisma Genting');
  await expect(page.getByTestId('company-price')).toContainText('RM');
});

test('market browser lists 20 + 20 securities with correct currencies', async ({ page }) => {
  await startCampaign(page);
  await page.getByTestId('nav-markets').click();
  await expect(page.locator('[data-testid=market-table] tbody tr')).toHaveCount(20);
  await expect(page.locator('[data-testid=market-table] tbody')).toContainText('RM');
  await page.getByRole('button', { name: 'US 20 (USD)' }).click();
  await expect(page.locator('[data-testid=market-table] tbody tr')).toHaveCount(20);
  await expect(page.locator('[data-testid=market-table] tbody')).toContainText('US$');
  await page.getByTestId('market-search').fill('nvidia');
  await expect(page.locator('[data-testid=market-table] tbody tr')).toHaveCount(1);
});
