// Plain-language outlook for a Deal Room offer (D-086): what we get, what we pay, the expected profit where the deal
// pays one, and what can go wrong. Read-only estimates from the terms on the table; not forecasts.
import type { Deal } from '../types/deals';
import type { GameState } from '../types/game';
import { concessionQuote } from './concessions';
import { exportSpot, EXPORT_ADDITIONALITY } from './export-contracts';
import { money } from '../utils/format';

export interface DealOutlook {
  /** The expected-profit line, or null when the deal pays no direct profit. */
  profit: { text: string; tone: 'good' | 'neutral' | 'bad' } | null;
  gets: string[];
  pays: string[];
  risks: string[];
}

const m = (minor: number) => money(minor / 100);

export function dealOutlook(s: GameState, d: Deal): DealOutlook {
  const gets: string[] = [], pays: string[] = [], risks: string[] = [];
  let profit: DealOutlook['profit'] = null;
  const cash = d.priceMinor;
  pays.push(`${m(cash)} now, held in escrow from ${d.payer === 'strategic' ? 'Khazanah' : d.payer === 'fund' ? 'the sovereign fund' : 'the treasury'} cash.`);
  const e = d.enterprise;
  if (e && ['takeover', 'startup', 'rescue'].includes(d.kind)) {
    const yearly = e.revenueAnnualMinor - e.costAnnualMinor;
    const loan = d.kind === 'rescue' && d.terms.protection === 1;
    const share = d.kind === 'rescue' ? d.terms.stake : d.terms.stake;
    if (loan) {
      const interest = (cash / 1.01) * 0.08;
      profit = { text: `Expected profit about ${m(interest)} a year in interest (8% on the loan), plus the loan back over ${d.terms.months} months.`, tone: 'good' };
      gets.push('A senior secured loan repaid with interest.');
      risks.push('If the company still fails, recovery is limited to the secured value.');
    } else {
      const mine = yearly * share;
      profit = mine > 0
        ? { text: `Expected profit about ${m(mine)} a year (${Math.round(share * 100)}% of the company's ${m(yearly)} yearly profit). It pays back the ${m(cash)} in about ${(cash / mine).toFixed(1)} years.`, tone: 'good' }
        : { text: `No profit expected now: the company earns ${m(yearly)} a year. Only a turnaround makes this pay.`, tone: 'bad' };
      gets.push(`${Math.round(share * 100)}% ownership${share > 0.5 ? ', which is control' : ''}, and that share of its profits.`);
      if (d.kind === 'takeover') {
        const premium = d.terms.priceFactor - 1;
        pays.push(`${premium >= 0 ? `${(premium * 100).toFixed(0)}% above` : `${(-premium * 100).toFixed(0)}% below`} market value, which is an upfront cost.`);
        risks.push('About 1 in 4 takeovers fail to integrate: costs +8%, sales −5%. A rival bid can win if your price is lower.');
      } else if (d.kind === 'startup') risks.push('Young companies can lose money. Later funding rounds dilute your share unless you join them.');
      else risks.push('A rescue can fail and equity can lose value straight away.');
    }
  } else if (d.kind === 'export' && d.product) {
    const spot = exportSpot(s, d.product);
    const volume = d.volume ?? 0;
    if (d.template === 'export:lng') {
      const gain = volume * (d.terms.priceFactor - 1);
      profit = { text: `${gain >= 0 ? 'Expected gain' : 'Expected loss'} about ${money(Math.abs(gain))} a year for PETRONAS at today's gas price (a fixed price protects you if gas falls).`, tone: gain >= 0 ? 'good' : 'neutral' };
      gets.push('A price hedge: PETRONAS gains if gas falls below the contract price.');
    } else {
      gets.push(`About ${money(volume * EXPORT_ADDITIONALITY)} a year of extra exports (half the contract is new business), which lifts GDP and jobs.`);
      profit = { text: `No direct cash profit. The return is extra exports of about ${money(volume * EXPORT_ADDITIONALITY)} a year, which lifts GDP, jobs and tax. Price: ${(d.terms.priceFactor * 100).toFixed(0)}% of today's spot (${spot.toFixed(2)}).`, tone: 'neutral' };
    }
    pays.push('The bond comes back at the end if you deliver; leaving early forfeits half.');
    risks.push('If the sector runs above capacity you miss deliveries and pay a 25% penalty on the shortfall.');
  } else if (d.kind === 'supply') {
    const fuel = d.template === 'supply:fuel';
    const spend = fuel ? (d.volume ?? 0) * 365 * 3 * s.external.oil : 0;
    const diff = spend * (d.terms.priceFactor - 1);
    profit = { text: fuel
      ? `No profit: this is price protection. At today's price it ${diff >= 0 ? 'costs' : 'saves'} about ${money(Math.abs(diff))} a year compared with buying on the spot market.`
      : 'No direct profit: this lowers the steel cost for participating factories and locks the price.', tone: 'neutral' };
    gets.push(`A locked price at ${(d.terms.priceFactor * 100).toFixed(0)}% of today's for ${d.terms.months} months${d.terms.protection > 0 ? `, ${Math.round(d.terms.protection * 100)}% following the market` : ''}.`);
    pays.push('Collateral comes back at the end; leaving early costs up to 20% of it.');
    risks.push('If the market price falls a lot you still pay the locked price.');
  } else if (d.kind === 'concession') {
    const q = concessionQuote(d);
    profit = { text: `No profit: this buys a public project. You pay ${m(q.contribution)} now and about ${m(q.serviceDaily * 365)} a year afterwards.`, tone: 'neutral' };
    gets.push('The project gets built by a private company without all the cost up front; its benefits start when it is complete.');
    pays.push(`About ${m(q.serviceDaily * 365)} a year in service payments for ${(d.terms.months / 12).toFixed(1)} years.`);
  } else if (d.kind === 'investment') {
    const p = s.fdi.pledges.find((x) => x.id === d.pledgeId);
    if (p) {
      profit = { text: `No direct profit. A ${m(cash)} grant brings ${money(p.amount)} of investment and about ${p.jobs.toLocaleString('en-MY')} jobs: ${cash > 0 ? `${(p.amount / Math.max(1, cash / 100)).toFixed(1)}× your money, returning` : 'at no cost to you, returning'} as output, wages and tax.`, tone: 'neutral' };
      gets.push(`${money(p.amount)} of private investment and about ${p.jobs.toLocaleString('en-MY')} jobs once it operates.`);
    }
    risks.push('If delivery slips more than 90 days you lose unpaid support and can claw back 25% of grants paid.');
  } else if (d.kind === 'diligence') {
    gets.push('A report on the company before you decide on a deal.');
  }
  return { profit, gets, pays, risks };
}
