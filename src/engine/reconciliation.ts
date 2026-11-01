import { BASELINE } from '../data/economic-baseline';
import type { GovMonthFlows, MonthlyReport } from '../types/game';
import { isInflow } from './government';
import { toMinor } from './util';

/** Reconcile integer cash movements, never rounded sums of mixed stock/flow values. */
export function reconcileMonth(
  previous: MonthlyReport | undefined,
  flows: GovMonthFlows,
  treasury: number,
  debt: number,
  opening = { treasury: BASELINE.treasury, debt: BASELINE.debt },
): NonNullable<MonthlyReport['reconciliation']> {
  // Carry last month's closing balances in sen (D-102): the report's ringgit floats cannot hold every sen above about RM35tn.
  const openingTreasuryMinor = previous?.reconciliation?.closingTreasuryMinor ?? toMinor(previous?.treasury ?? opening.treasury);
  const openingDebtMinor = previous?.reconciliation?.closingDebtMinor ?? toMinor(previous?.debt ?? opening.debt);
  const netCashMinor = (Object.keys(flows) as (keyof GovMonthFlows)[]).reduce(
    (total, kind) => total + toMinor(flows[kind]) * (isInflow(kind) ? 1 : -1),
    0,
  );
  return {
    openingTreasuryMinor,
    closingTreasuryMinor: treasury,
    netCashMinor,
    cashResidualMinor: treasury - openingTreasuryMinor - netCashMinor,
    openingDebtMinor,
    closingDebtMinor: debt,
    debtResidualMinor: debt - openingDebtMinor - toMinor(flows.borrowing) + toMinor(flows.principal),
  };
}
