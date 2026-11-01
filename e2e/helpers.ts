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

/** Opens an Info views panel: its window's rail button, then its tab when it is not the window's first panel. */
const WINDOW_OF: Record<string, string> = { decisions: 'controls', fiscal: 'debt', reforms: 'debt', central: 'debt', infra: 'projects', partners: 'ministry', trade: 'ministry', oil: 'commodities', fdi: 'deals', soe: 'fund', reports: 'economy', sources: 'economy' };
export async function openPanel(page: Page, id: string) {
  const tab = page.getByTestId(`tab-${id}`);
  if (await tab.isVisible()) return tab.click(); // its window is already open
  const primary = WINDOW_OF[id] ?? id;
  await page.getByTestId(`nav-${primary}`).click();
  if (primary !== id) await tab.click();
}

/** Opens the Economy window (the money readout) on a tab: budget, taxation, loans and so on. */
export async function openEconomyWindow(page: Page, tab: string) {
  // Budgets and tax rates live in the Fiscal control tab of Money & debt (D-115).
  if (tab === 'budget' || tab === 'taxation') return openPanel(page, 'reforms');
  if (!(await page.getByTestId('economy-window').isVisible())) await page.getByTestId('bottom-treasury').click();
  await page.getByTestId(`econ-tab-${tab}`).click();
}
