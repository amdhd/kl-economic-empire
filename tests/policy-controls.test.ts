import { estimateTaxChange } from '../src/engine/policy-preview';
import { expect, it } from 'vitest';
import { applyCommand, createGame, runHeadless } from '../src/engine/game';
import { sectorTax, automaticFx, ministryOutcomes } from '../src/engine/policy-controls';
import { issueDebt, monthCloseGovernment } from '../src/engine/government';
import { deserialize, serialize } from '../src/persistence/save';
import { klToEpochMin } from '../src/engine/time';
import { clone, runUntil, withoutEvents } from './helpers';
const act = (s: ReturnType<typeof createGame>, c: Parameters<typeof applyCommand>[1]) => applyCommand(s,c,s.clock.hour*60);
it('sector relief settles old profits under the old rate, then reduces receipts and improves investment with a lag',()=>withoutEvents(()=>{
  const base=createGame(801), relief=clone(base);
  expect(act(relief,{type:'sectorIncentive',sector:'tech',cut:.1,months:2}).ok).toBe(true);
  runUntil(base,2027,2,1);runUntil(relief,2027,2,1);
  expect(relief.reports[0].gov.taxCorporate).toBe(base.reports[0].gov.taxCorporate);
  expect(sectorTax(relief,'tech',klToEpochMin(2027,2,1))).toBeCloseTo(.08);
  expect(sectorTax(relief,'fin',klToEpochMin(2027,2,1))).toBe(.18);
  runUntil(base,2027,3,1);runUntil(relief,2027,3,1);
  expect(relief.reports[1].gov.taxCorporate).toBeLessThan(base.reports[1].gov.taxCorporate);
  expect(relief.sectors.tech.investmentMonthly).toBeGreaterThan(base.sectors.tech.investmentMonthly);
  expect(sectorTax(relief,'tech',klToEpochMin(2027,4,1))).toBe(.18);
  expect(relief.reports[1].reconciliation?.cashResidualMinor).toBe(0);
}));
it('ministry plans apply next month, escalate annually and can cancel future appropriations',()=>withoutEvents(()=>{
  const s=createGame(802),old=s.government.policies.budget.health;
  expect(act(s,{type:'ministryPlan',category:'health',monthly:old*1.2,growth:.05,years:3}).ok).toBe(true);
  expect(s.government.policies.budget.health).toBe(old);
  runUntil(s,2027,2,1);expect(s.government.policies.budget.health).toBe(old*1.2);
  runUntil(s,2028,2,1);expect(s.government.policies.budget.health).toBeCloseTo(old*1.2*1.05,2);
  const current=s.government.policies.budget.health;
  act(s,{type:'cancelMinistryPlan',category:'health'});
  expect(s.controls.plans).toHaveLength(0);expect(s.government.policies.budget.health).toBe(current);
}));
it('service outcome indices reward real funding and deteriorate under unpaid obligations',()=>{
  const base=createGame(803),more=clone(base),unpaid=clone(base);
  more.government.policies.budget.health*=1.5;unpaid.government.mtdArrearsDays=30;
  ministryOutcomes(base);ministryOutcomes(more);ministryOutcomes(unpaid);
  expect(more.controls.outcomes.health).toBeGreaterThan(base.controls.outcomes.health);
  expect(unpaid.controls.outcomes.health).toBeLessThan(base.controls.outcomes.health);
  expect(more.controls.outcomes.safety).toBe(base.controls.outcomes.safety);
});
it('longer issuance changes only the new debt coupon and weighted amortisation term',()=>{
  const short=createGame(804),long=clone(short);
  const debt=short.government.debt,cash=short.government.treasury;
  act(short,{type:'debtStrategy',termMonths:36,refinance:1});act(long,{type:'debtStrategy',termMonths:240,refinance:1});
  expect(long.government.avgDebtRate).toBe(short.government.avgDebtRate);
  issueDebt(short,1e9,'test',true);issueDebt(long,1e9,'test',true);
  expect(short.government.debt-debt).toBe(1e11);expect(short.government.treasury-cash).toBe(1e11);
  expect(long.government.avgDebtRate).toBeGreaterThan(short.government.avgDebtRate);
  expect(long.controls.debt.averageMonths).toBeGreaterThan(short.controls.debt.averageMonths);
});
it('reducing rollover reduces new refinancing and closing liquidity rather than creating revenue',()=>{
  const full=createGame(805),none=clone(full);
  full.government.treasury=none.government.treasury=2e12;
  full.government.mtd.opex=none.government.mtd.opex=30e9;
  act(none,{type:'debtStrategy',termMonths:120,refinance:0});
  const a=monthCloseGovernment(full),b=monthCloseGovernment(none);
  expect(a.flows.principal).toBe(b.flows.principal);
  expect(a.flows.borrowing).toBeGreaterThan(b.flows.borrowing);
  expect(full.government.treasury).toBeGreaterThan(none.government.treasury);
});
it('automatic FX respects floors and shared turnover, then stops inside the band without touching fiscal cash or RNG',()=>{
  const s=createGame(806);const treasury=s.government.treasury,rng=clone(s.rng);
  act(s,{type:'fxBand',enabled:true,lower:3.8,upper:4,dailyUSD:1e9,reserveFloorUSD:116e9});
  automaticFx(s);
  expect(s.centralBank.usdReserves).toBe(116e9*100);
  const count=s.centralBank.tx.length;automaticFx(s);expect(s.centralBank.tx.length).toBe(count);
  s.external.myrPerUsd=3.9;automaticFx(s);expect(s.controls.fxBand.status).toContain('Inside band');
  expect(s.government.treasury).toBe(treasury);expect(s.rng).toEqual(rng);
});
it('invalid controls are atomic and schema4 migration preserves accounts and RNG',()=>{
  const s=createGame(807),before=clone(s);
  expect(act(s,{type:'debtStrategy',termMonths:0,refinance:2}).ok).toBe(false);expect(s).toEqual(before);
  const file=JSON.parse(serialize(s));file.state.schemaVersion=4;delete file.state.controls;
  const restored=deserialize(JSON.stringify(file));expect(restored.government).toEqual(s.government);expect(restored.rng).toEqual(s.rng);
  expect(restored.controls.fxBand.enabled).toBe(false);expect(restored.controls.incentives).toEqual([]);
});
it('active controls survive save/load and continue deterministically',()=>{
  const s=createGame(808);
  act(s,{type:'fxBand',enabled:true,lower:3.8,upper:4,dailyUSD:100e6,reserveFloorUSD:110e9});
  act(s,{type:'ministryPlan',category:'services',monthly:5e9,growth:.03,years:2});
  runHeadless(s,50);const restored=deserialize(serialize(s));
  runHeadless(s,1500);runHeadless(restored,1500);expect(restored).toEqual(s);
});

it('tax previews respect incentive floors in the effective month',()=>{
  const s=createGame(809);
  act(s,{type:'sectorIncentive',sector:'tech',cut:.15,months:12});
  for(const sector of Object.values(s.sectors)) sector.lastMonthProfit=0;
  s.sectors.tech.lastMonthProfit=100e6;
  const estimate=estimateTaxChange(s,{...s.government.policies.tax,corporate:.1});
  expect(estimate.corporate/(100e6/30.4/(12/365))).toBeCloseTo(-.03,10);
});
it('a manual budget change replaces that ministry plan instead of being overwritten next year',()=>withoutEvents(()=>{
  const s=createGame(806),old=s.government.policies.budget.health;
  expect(act(s,{type:'ministryPlan',category:'health',monthly:old*1.5,growth:.05,years:3}).ok).toBe(true);
  expect(act(s,{type:'ministryPlan',category:'safety',monthly:s.government.policies.budget.safety*1.1,growth:0,years:2}).ok).toBe(true);
  const res=act(s,{type:'queueBudget',patch:{health:old*0.9}});
  expect(res.ok).toBe(true);
  expect(s.government.pending.at(-1)?.label).toContain('replaces Healthcare ministry plan');
  expect(s.controls.plans.map(p=>p.category)).toEqual(['safety']);
  runUntil(s,2028,2,2);
  expect(s.government.policies.budget.health).toBe(Math.round(old*0.9/1e6)*1e6);
}));
