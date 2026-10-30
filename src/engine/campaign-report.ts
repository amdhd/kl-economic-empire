// Read-only report inputs. Opening values are campaign creation, not January's closing accounts.
import { BASELINE } from '../data/economic-baseline';
import type { GameState, GovMonthFlows } from '../types/game';
import { debtMYR, emptyFlows, treasuryMYR } from './government';
import { annualRealOutput, publicNetWorth, scoreDrivers } from './indicators';
import { navMYR } from './sovereign-fund';
import { toMinor } from './util';

export function campaignReport(s: GameState) {
  const fiscal = emptyFlows();
  for (const k of Object.keys(fiscal) as (keyof GovMonthFlows)[]) {
    fiscal[k] = [...s.reports.map((r) => r.gov), s.government.mtd]
      .reduce((sum, flows) => sum + toMinor(flows[k]), 0) / 100;
  }
  const last = s.reports.at(-1);
  const opening = { realGdp: s.baseline.realGdpAnnual, unemployment: BASELINE.unemployment,
    inflation: BASELINE.inflationTarget, treasury: BASELINE.treasury, debt: BASELINE.debt,
    fundNav: s.scheduler.startNav, approval: BASELINE.approval, netWorth: s.baseline.publicNetWorth };
  const closing = { realGdp: last ? annualRealOutput([last]) : opening.realGdp,
    unemployment: s.indicators.unemployment, inflation: s.indicators.inflationYoY,
    treasury: treasuryMYR(s.government), debt: debtMYR(s.government), fundNav: navMYR(s),
    approval: s.indicators.approval, netWorth: publicNetWorth(s) };
  const fundNetTransfers = s.fund.totalInjectedMYR - s.fund.totalWithdrawnMYR;
  const fundGain = closing.fundNav - opening.fundNav - fundNetTransfers;
  const revenue = fiscal.taxCorporate + fiscal.taxProperty + fiscal.taxConsumption + fiscal.taxHousehold + fiscal.federalGrant;
  const outlays = fiscal.opex + fiscal.capex + fiscal.interest + fiscal.emergency;
  return { opening, closing, fiscal, revenue, outlays, fiscalBalance: revenue - outlays,
    fundNetTransfers, fundGain, fundReturn: fundGain / opening.fundNav, drivers: scoreDrivers(s) };
}
