import type { RngState, SectorId } from './game';
export type DealKind =
  'diligence' | 'investment' | 'concession' | 'supply' | 'startup' | 'rescue' | 'takeover';
export type DealStatus =
  'opportunity' | 'negotiating' | 'agreed' | 'active' | 'completed' | 'rejected' | 'expired' | 'failed';
export type DealPayer = 'treasury' | 'fund' | 'strategic';
export interface Deal {
  id: number;
  template: string;
  kind: DealKind;
  name: string;
  counterparty: string;
  sector: SectorId;
  status: DealStatus;
  payer: DealPayer;
  offeredDay: number;
  deadline: number;
  nextDay: number;
  version: number;
  rounds: number;
  priceMinor: number;
  escrowMinor: number;
  paidMinor: number;
  committedMinor: number;
  guaranteeMinor: number;
  arrearsMinor: number;
  valueMinor: number;
  terms: {
    incentive: number;
    localShare: number;
    jobsShare: number;
    months: number;
    priceFactor: number;
    stake: number;
    protection: number;
  };
  rivalPriceFactor?: number;
  rivalBidMinor?: number;
  integrationEndDay?: number;
  integrationDone?: boolean;
  closingFeeMinor?: number;
  trancheDay?: number;
  receivedMinor?: number;
  enterprise?: PrivateEnterprise;
  investedMinor?: number;
  volume?: number;
  delivered?: number;
  lockedPrice?: number;
  effectInfra?: Partial<Record<SectorId, number>>;
  effectService?: number;
  unpaidDays?: number;
  assetCostMinor?: number;
  serviceDailyMinor?: number;
  operationEndDay?: number;
  fdiDay?: number;
  privateCashMinor?: number;
  claimMinor?: number;
  pledgeId?: number;
  projectId?: number;
  progress: number;
  lastDay: number;
  note: string;
  history: { day: number; text: string }[];
}
export interface DealsState {
  lastOfferDay?: number;
  enabled: boolean;
  startDay: number;
  rng: RngState;
  nextId: number;
  items: Deal[];
  journal: { dealId: number; day: number; kind: string; minor: number }[];
}
export interface PrivateEnterprise {
  nextPaymentDay?: number;
  interestMinor?: number;
  missedPayments?: number;
  retainedMinor?: number;
  cashMinor: number;
  capitalMinor: number;
  debtMinor: number;
  payablesMinor: number;
  publicShare: number;
  privateShare: number;
  publicLoanMinor: number;
  revenueAnnualMinor: number;
  costAnnualMinor: number;
  pendingCapexMinor: number;
  openedDay: number;
  nextRoundDay: number;
  roundDone: boolean;
  quality: number;
  unpaidDays: number;
  buyerCashMinor: number;
  sellerCashMinor: number;
}
