import { expect, test } from '@playwright/test';
import { startCampaign } from './helpers';

test('KL 3D map renders with attribution and verified company markers', async ({ page }) => {
  await startCampaign(page);
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  const box = await page.locator('.maplibregl-canvas').boundingBox();
  expect(box!.height).toBeGreaterThan(400);
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap', { timeout: 20_000 });
  // 18 companies have a verified OSM location (14 buildings); the rest are market-only.
  await expect(page.locator('.co-marker')).toHaveCount(18);
  await expect(page.locator('[data-testid="marker-US:NVDA"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="marker-MY:5211"]')).toHaveCount(0); // Sunway: rejected candidate
});

test('clicking a company marker opens that company, labelled as simulated', async ({ page }) => {
  await startCampaign(page);
  await page.locator('[data-testid="marker-MY:3182"]').click();
  await expect(page.getByTestId('security-detail')).toHaveAttribute('data-ticker', 'MY:3182');
  await expect(page.getByTestId('company-panel')).toContainText('Simulated · fictional data');
  await expect(page.getByTestId('company-panel')).toContainText('Wisma Genting');
  await expect(page.getByTestId('detail-price')).toContainText('RM');
});
