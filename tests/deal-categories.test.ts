import { describe, expect, it } from 'vitest';
import { countDealCategories, dealCategory } from '../src/engine/deal-categories';

const d = (kind: string, template = kind, pledgeId?: number) => ({ kind, template, pledgeId }) as never;

describe('deal categories', () => {
  it('maps each deal kind to its player-facing group', () => {
    expect(dealCategory(d('investment', 'investment:pledge', 4))).toBe('fdi');
    expect(dealCategory(d('supply', 'supply:fuel'))).toBe('supply');
    expect(dealCategory(d('supply', 'supply:steel'))).toBe('supply');
    expect(dealCategory(d('export', 'export:halal'))).toBe('export');
    for (const k of ['concession', 'startup', 'rescue', 'takeover']) expect(dealCategory(d(k))).toBe('enterprise');
    expect(dealCategory(d('diligence'))).toBe('advisory');
  });
  it('treats any deal with a pledge as foreign investment and unknown kinds as other', () => {
    expect(dealCategory(d('concession', 'x', 2))).toBe('fdi');
    expect(dealCategory(d('mystery', 'mystery:thing'))).toBe('other');
    expect(dealCategory(d('mystery', 'supply:gas'))).toBe('supply');
  });
  it('counts a list per category', () => {
    const c = countDealCategories([d('investment'), d('investment'), d('export'), d('diligence'), d('zzz')]);
    expect(c).toEqual({ fdi: 2, supply: 0, export: 1, enterprise: 0, advisory: 1, other: 1 });
  });
});
