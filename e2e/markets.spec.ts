// Phase 2 market UI checks, ported from the standalone harness to the integrated shell.
import { expect, test } from '@playwright/test';
import { startCampaign } from './helpers';

test.describe('Phase 2 market UI (integrated)', () => {
  test.beforeEach(async ({ page }) => {
    await startCampaign(page);
    await page.getByTestId('nav-markets').click();
    await expect(page.getByTestId('security-table')).toBeVisible();
  });

  test('lists 26 Malaysian (RM) and 34 US (US$) securities with no duplicates', async ({ page }) => {
    const rows = page.getByTestId('security-row');
    await expect(rows).toHaveCount(26);
    const my = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-ticker')));
    expect(my.every((t) => t!.startsWith('MY:'))).toBe(true);
    for (const p of await page.getByTestId('row-price').allTextContents()) expect(p).toMatch(/^RM \d/);
    await page.getByRole('tab', { name: 'US 34' }).click();
    await expect(rows).toHaveCount(34);
    const us = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-ticker')));
    expect(us.every((t) => t!.startsWith('US:'))).toBe(true);
    for (const p of await page.getByTestId('row-price').allTextContents()) expect(p).toMatch(/^US\$ \d/);
    expect(new Set([...my, ...us]).size).toBe(60);
  });

  test('ticker search, detail panel, chart resolutions and trade ticket', async ({ page }) => {
    await page.getByLabel('Search ticker').fill('nvda');
    await expect(page.getByTestId('security-row')).toHaveCount(1);
    await page.getByTestId('security-row').first().click();
    const detail = page.getByTestId('security-detail');
    await expect(detail).toHaveAttribute('data-ticker', 'US:NVDA');
    await expect(page.getByTestId('detail-price')).toContainText('US$');
    await expect(detail).toContainText('No verified Kuala Lumpur location');
    for (const res of ['Hour', 'Day', 'Month']) {
      await detail.getByRole('tab', { name: res }).click();
      await expect(page.getByTestId('price-chart')).toBeVisible();
      await expect(page.getByTestId('price-chart')).toContainText('US$');
    }
    await expect(page.getByTestId('trade-review')).toBeVisible(); // SWF ticket sits under the detail
    await page.getByLabel('Search ticker').fill('1155');
    await page.getByTestId('security-row').first().click();
    await expect(detail).toHaveAttribute('data-ticker', 'MY:1155');
    await expect(detail).toContainText('Menara Maybank');
  });

  test('exchange status chips and FX tab', async ({ page }) => {
    await expect(page.getByTestId('status-MY')).toContainText('Bursa');
    await expect(page.getByTestId('status-US')).toContainText(/E[SD]T/);
    await expect(page.getByTestId('fx-chip')).toContainText('USD/MYR');
    await page.getByRole('tab', { name: 'FX' }).click();
    await expect(page.getByTestId('fx-pane')).toContainText('USD / MYR');
  });
});
