import { expect, test } from '@playwright/test';
import type { GameState } from '../src/types/game';
import { runHours, startCampaign } from './helpers';
type Dev = { __klDev: { state: () => GameState } };

test('metric clicks explain measured changes, lags and uncertainty at laptop size', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await startCampaign(page);
  await runHours(page, 24 * 80);
  await page.getByTestId('bottom-treasury').click();
  await page.getByTestId('stat-unemployment').click();
  const panel = page.getByTestId('panel');
  await expect(panel).toContainText('Why did unemployment change?');
  await expect(panel).toContainText('Change in employed workers');
  await page.getByTestId('explain-inflation').click();
  await expect(panel).toContainText('not the latest year-on-year inflation rate');
  await page.getByTestId('explain-approval').click();
  await expect(panel).toContainText('monthly approval change');
  await expect(page.getByTestId('explanation-contributions')).toContainText('Trust');
  await page.screenshot({ path: testInfo.outputPath('explanation.png') });
  await page.getByTestId('explain-treasury').click();
  await expect(panel).toContainText('Public receipts');
  await page.getByTestId('explain-gdp').click();
  await expect(panel).toContainText('no calibrated probability range');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('critical alerts pause once, keep history and persist device preferences', async ({ page }, testInfo) => {
  await startCampaign(page);
  await page.getByTestId('btn-settings').click();
  for (const rule of ['treasury', 'housing', 'projects']) await page.getByRole('checkbox', { name: `Enable ${rule} alerts` }).uncheck();
  await page.getByTestId('threshold-unemployment').fill('8');
  await page.getByTestId('pause-on-critical').check();
  await page.getByTestId('btn-speed-3').click();
  await page.evaluate(() => {
    const s = (window as unknown as Dev).__klDev.state();
    s.households.employed = s.households.laborForce * 0.8;
  });
  await runHours(page, 24);
  await expect(page.getByTestId('btn-pause')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('alert-history')).toContainText('Unemployment is 20.0%');
  await expect(page.getByTestId('alert-history').locator('> div')).toHaveCount(1);
  await runHours(page, 24);
  await expect(page.getByTestId('alert-history').locator('> div')).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('settings.png') });
  await page.reload();
  await page.getByTestId('start-campaign').click();
  await page.getByTestId('btn-settings').click();
  await expect(page.getByTestId('threshold-unemployment')).toHaveValue('8');
  await expect(page.getByTestId('pause-on-critical')).toBeChecked();
  await expect(page.getByRole('checkbox', { name: 'Enable treasury alerts' })).not.toBeChecked();
  await expect(page.getByTestId('alert-history')).toContainText('No alerts recorded');
});

test('warnings do not pause and the energy scenario explains its opening shock', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('klDevNoSave', '1'));
  await page.goto('/');
  await page.getByTestId('scenario-energy-shock').click();
  await expect(page.getByTestId('scenario-energy-shock')).toContainText('90-day oil supply shock');
  await page.getByTestId('start-campaign').click();
  expect(await page.evaluate(() => (window as unknown as Dev).__klDev.state().events.active[0].templateId)).toBe('oil_spike');
  await page.getByTestId('btn-settings').click();
  for (const rule of ['treasury', 'housing', 'projects']) await page.getByRole('checkbox', { name: `Enable ${rule} alerts` }).uncheck();
  await page.getByTestId('pause-on-critical').check();
  await page.getByTestId('btn-speed-3').click();
  await page.evaluate(() => {
    const s = (window as unknown as Dev).__klDev.state();
    s.households.employed = s.households.laborForce * 0.93;
  });
  await runHours(page, 24);
  await expect(page.getByTestId('alert-history')).toContainText('warning');
  await expect(page.getByTestId('btn-pause')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('btn-pause').click();
});

test('GDP explanation has a monthly US$ chart and a window with reasons for each month', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await startCampaign(page);
  await runHours(page, 24 * 80);
  await page.getByTestId('bottom-treasury').click();
  await page.getByTestId('stat-unemployment').click();
  await page.getByRole('button', { name: 'GDP', exact: true }).click();
  await expect(page.getByTestId('panel')).toContainText('Monthly GDP in US dollars');
  await page.getByTestId('open-gdp-history').click();
  const panel = page.getByTestId('panel');
  await expect(panel).toContainText('Monthly GDP history');
  const months = await page.evaluate(() => (window as unknown as Dev).__klDev.state().reports.length);
  expect(months).toBeGreaterThanOrEqual(2);
  const key = await page.evaluate(() => { const s = (window as unknown as Dev).__klDev.state(); return s.reports.at(-1)!.monthKey; });
  const reasons = page.getByTestId(`gdp-reasons-${key}`);
  await expect(reasons.locator('li')).toHaveCount(3);
  await expect(reasons).toContainText('US$ GDP');
  await expect(reasons).toContainText('ringgit');
});
