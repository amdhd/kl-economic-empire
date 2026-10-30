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
): NonNullable<MonthlyReport['reconciliation']> {
  const openingTreasuryMinor = toMinor(previous?.treasury ?? BASELINE.treasury);
  const openingDebtMinor = toMinor(previous?.debt ?? BASELINE.debt);
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
