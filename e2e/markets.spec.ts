import { expect, test } from '@playwright/test';

test.describe('Phase 2 market UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('security-table')).toBeVisible();
  });

  test('lists 20 Malaysian (RM) and 20 US (US$) securities with no duplicates', async ({ page }) => {
    const rows = page.getByTestId('security-row');
    await expect(rows).toHaveCount(20);
    const my = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-ticker')));
    expect(my.every((t) => t!.startsWith('MY:'))).toBe(true);
    for (const p of await page.getByTestId('row-price').allTextContents()) expect(p).toMatch(/^RM \d/);

    await page.getByRole('tab', { name: 'US 20' }).click();
    await expect(rows).toHaveCount(20);
    const us = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('data-ticker')));
    expect(us.every((t) => t!.startsWith('US:'))).toBe(true);
    for (const p of await page.getByTestId('row-price').allTextContents()) expect(p).toMatch(/^US\$ \d/);
    expect(new Set([...my, ...us]).size).toBe(40);
  });

  test('ticker search, detail panel and chart resolutions', async ({ page }) => {
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

  test('clock starts paused and runs after choosing a speed', async ({ page }) => {
    const clock = page.getByTestId('game-clock');
    const t0 = await clock.textContent();
    await page.waitForTimeout(600);
    expect(await clock.textContent()).toBe(t0); // starts paused
    await page.getByRole('button', { name: '3×' }).click();
    await expect(clock).not.toHaveText(t0!, { timeout: 5000 });
    await page.getByRole('button', { name: /Pause/ }).click();
  });

  test('KL map shows only verified company markers which open the right company', async ({ page }) => {
    await page.getByRole('button', { name: 'KL map' }).click();
    const markers = page.getByTestId('company-marker');
    await expect(markers).toHaveCount(14);
    const all = (await markers.evaluateAll((els) => els.map((e) => e.getAttribute('data-companies')))).join(',').split(',');
    expect(all).toHaveLength(18);
    expect(all).not.toContain('US:NVDA');
    // Labels can overlap at the default zoom; dispatch the click on the marker button itself.
    await page.getByRole('button', { name: 'Maxis', exact: true }).dispatchEvent('click');
    await expect(page.getByTestId('security-detail')).toHaveAttribute('data-ticker', 'MY:6012');
    await expect(page.getByTestId('security-table')).toBeVisible();
  });
});
