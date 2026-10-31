import { expect, test } from '@playwright/test';

test('closing Info views dismisses its inspector and reopening starts with categories only', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('klDevNoSave', '1'));
  await page.goto('/');
  await page.getByTestId('start-campaign').click();
  const launcher = page.getByRole('button', { name: 'Info views', exact: true });
  const categories = page.getByRole('navigation', { name: 'Info view categories' });
  await expect(launcher).toHaveAttribute('aria-expanded', 'false');
  await expect(categories).not.toBeVisible();
  await launcher.click();
  await expect(categories.getByRole('button')).toHaveCount(22);
  await page.getByTestId('nav-population').click();
  await expect(page.getByTestId('nav-population')).toHaveAttribute('aria-pressed', 'true');
  const inspector = page.getByRole('region', { name: 'Population', exact: true });
  await expect(inspector).toContainText('34,200,000');
  await expect(inspector).toContainText('Sector shares describe modeled jobs');
  await expect(inspector.locator('.distribution-bar > span')).toHaveCount(7);
  await launcher.click();
  await expect(categories).not.toBeVisible();
  await expect(inspector).not.toBeVisible();
  await launcher.click();
  await expect(categories).toBeVisible();
  await expect(inspector).not.toBeVisible();
  await page.getByTestId('nav-population').click();
  await expect(inspector).toBeVisible();
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(inspector).not.toBeVisible();
  await expect(page.getByTestId('btn-speed-3')).toBeVisible();
  await expect(page.getByTestId('bottom-treasury')).toContainText('RM 8,865,574,579');
});

test('compact desktop layout keeps the inspector and bottom controls inside the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => sessionStorage.setItem('klDevNoSave', '1'));
  await page.goto('/');
  await page.getByTestId('start-campaign').click();
  await page.getByTestId('info-views').click();
  await page.getByTestId('nav-population').click();
  const panel = await page.getByTestId('panel').boundingBox();
  const stats = await page.getByTestId('stats').boundingBox();
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(1280);
  expect(panel!.y + panel!.height).toBeLessThanOrEqual(stats!.y);
  await page.getByTestId('panel').locator('.panel-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(page.getByText('Births, deaths and age groups are not modeled.', { exact: false })).toBeInViewport();
  await expect(page.getByTestId('btn-speed-3')).toBeInViewport();
  await expect(page.getByTestId('bottom-treasury')).toBeInViewport();
});

for (const viewport of [{ width: 1600, height: 900 }, { width: 1280, height: 720 }]) {
  test(`company list has usable space and scrolls to the final row at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => sessionStorage.setItem('klDevNoSave', '1'));
    await page.goto('/');
    await page.getByTestId('start-campaign').click();
    await page.getByTestId('info-views').click();
    await page.getByTestId('nav-markets').click();
    const list = page.getByRole('region', { name: 'Company list', exact: true });
    const dimensions = await list.evaluate(el => ({ height: el.clientHeight, scrollHeight: el.scrollHeight }));
    expect(dimensions.height).toBeGreaterThan(200);
    expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.height);
    const heading = await page.locator('.panel-heading').boundingBox();
    expect(heading!.height).toBeLessThan(110);
    const last = page.getByTestId('security-row').last();
    await list.hover();
    await page.mouse.wheel(0, 1600);
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await expect(last).toBeInViewport();
    await last.click();
    await expect(page.getByTestId('company-panel')).toBeVisible();
    // The right-side detail must not collapse the list or push its scroll area out of the window.
    expect((await list.boundingBox())!.height).toBeGreaterThan(160);
    await page.getByTestId('info-views').click();
    await expect(page.getByTestId('panel')).not.toBeVisible();
    await expect(page.getByTestId('company-panel')).not.toBeVisible();
  });
}
