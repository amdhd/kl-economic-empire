import type { Deal } from '../types/deals';

/** Player-facing groups for the Deal Room filter chips (D-119). Display only: nothing in the simulation reads these. */
export type DealCategoryId = 'fdi' | 'supply' | 'export' | 'enterprise' | 'advisory' | 'other';

export const DEAL_CATEGORIES: { id: DealCategoryId; label: string }[] = [
  { id: 'fdi', label: 'Foreign investment' },
  { id: 'supply', label: 'Long-term supply' },
  { id: 'export', label: 'Export contracts' },
  { id: 'enterprise', label: 'Enterprise & rescue' },
  { id: 'advisory', label: 'Advisory' },
  { id: 'other', label: 'Other' },
];

const BY_KIND: Record<string, DealCategoryId> = {
  investment: 'fdi',
  supply: 'supply',
  export: 'export',
  concession: 'enterprise',
  startup: 'enterprise',
  rescue: 'enterprise',
  takeover: 'enterprise',
  diligence: 'advisory',
};

/** Category of a deal from its template prefix, pledge link or kind; anything unrecognised is 'other'. */
export function dealCategory(d: Pick<Deal, 'kind' | 'template' | 'pledgeId'>): DealCategoryId {
  if (d.pledgeId !== undefined) return 'fdi';
  const byKind = BY_KIND[d.kind];
  if (byKind) return byKind;
  const prefix = d.template.split(':')[0];
  return BY_KIND[prefix] ?? 'other';
}

/** Count of deals per category for the list the player is looking at (already narrowed to the tab). */
export function countDealCategories(deals: Pick<Deal, 'kind' | 'template' | 'pledgeId'>[]): Record<DealCategoryId, number> {
  const out: Record<DealCategoryId, number> = { fdi: 0, supply: 0, export: 0, enterprise: 0, advisory: 0, other: 0 };
  for (const d of deals) out[dealCategory(d)] += 1;
  return out;
}
