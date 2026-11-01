import { expect, test } from '@playwright/test';
import { runHours, startCampaign, openPanel, openEconomyWindow } from './helpers';
import type { GameState } from '../src/types/game';
type Dev = {__klDev:{state:()=>GameState}};

test('all four economic controls can be reviewed, applied and observed in simulation',async({page})=>{
  test.slow(); // the Fiscal control tab is a long page: on a loaded CI runner these steps come close to the 60s budget
  await startCampaign(page);
  await openPanel(page, 'reforms');
  await page.getByTestId('review-incentive').click();
  await expect(page.getByRole('dialog')).toContainText('5pp relief');
  await page.getByTestId('confirm-btn').click();
  await page.getByRole('button',{name:'Review ministry plan',exact:true}).click();
  await page.getByTestId('confirm-btn').click();
  await openPanel(page, 'reforms');
  await page.getByLabel('New debt term').selectOption('36');
  await page.getByRole('button',{name:'Review debt strategy',exact:true}).click();
  await page.getByTestId('confirm-btn').click();
  await openPanel(page, 'debt');
  await expect(page.getByTestId('panel')).toContainText('4.00%');
  await openPanel(page, 'controls');
  await page.getByLabel('Upper',{exact:true}).fill('4');
  await page.getByRole('button',{name:'Review & enable band',exact:true}).click();
  await page.getByTestId('confirm-btn').click();
  const before=await page.evaluate(()=>(window as unknown as Dev).__klDev.state());
  expect(before.controls.incentives[0].cut).toBe(.05);
  // The player's annual plan replaces that category's inherited monthly indexation (D-055).
  expect(before.controls.plans.filter(p=>p.everyMonths!==1)).toHaveLength(1);
  expect(before.controls.plans).toHaveLength(6);
  expect(before.controls.debt.newTermMonths).toBe(36);
  expect(before.controls.fxBand.enabled).toBe(true);
  await runHours(page,16);
  const after=await page.evaluate(()=>(window as unknown as Dev).__klDev.state());
  expect(after.centralBank.tx.some(t=>t.side==='sellUSD')).toBe(true);
  expect(after.centralBank.usdReserves).toBeLessThan(before.centralBank.usdReserves);
  await openPanel(page, 'reforms');
  await expect(page.getByTestId('panel')).toContainText('Health coverage');
});

test('queuing a manual budget for a planned ministry warns, then replaces the plan',async({page})=>{
  await startCampaign(page);
  await openPanel(page, 'reforms');
  await page.getByRole('button',{name:'Review ministry plan',exact:true}).click();
  await page.getByTestId('confirm-btn').click();
  const s=await page.evaluate(()=>(window as unknown as Dev).__klDev.state());
  const cat=s.controls.plans.find(p=>p.everyMonths!==1)!.category;
  await openEconomyWindow(page, 'budget');
  await page.getByTestId(`econ-budget-${cat}`).click();
  await page.getByTestId('econ-budget-slider').fill('0.9');
  await expect(page.getByTestId(`plan-replaced-${cat}`)).toBeVisible();
  await page.getByTestId('econ-budget-apply').click();
  const after=await page.evaluate(()=>(window as unknown as Dev).__klDev.state());
  expect(after.controls.plans.some(p=>p.category===cat)).toBe(false);
  expect(after.government.pending.at(-1)?.label).toContain('ministry plan');
});

test('inherited monthly budget steps never show up as player edits in an open budget panel',async({page})=>{
  await startCampaign(page);
  await openEconomyWindow(page, 'budget');
  await expect(page.getByTestId('econ-budget-apply')).toBeDisabled();
  const before=await page.evaluate(()=>(window as unknown as Dev).__klDev.state().government.policies.budget.health);
  await runHours(page,24*33);
  const after=await page.evaluate(()=>(window as unknown as Dev).__klDev.state().government.policies.budget.health);
  expect(after).toBeGreaterThan(before);
  await expect(page.getByTestId('econ-budget-apply')).toBeDisabled();
});
