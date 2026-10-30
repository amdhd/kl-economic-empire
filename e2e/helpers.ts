import type { Page } from '@playwright/test';

/** Start a fresh campaign in a test tab that never touches the player's saves. */
export async function startCampaign(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('klDevNoSave', '1'));
  await page.goto('/');
  await page.getByTestId('start-campaign').click();
  await page.getByTestId('info-views').click();
}

/** Dev-only fast-forward (window.__klDev exists only in dev builds). */
export async function runHours(page: Page, hours: number) {
  await page.evaluate((h) => (window as unknown as { __klDev: { runHours: (h: number) => void } }).__klDev.runHours(h), hours);
}
