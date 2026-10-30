import type { CompanySeed, TickerId } from '../types/game';
import { MY_COMPANIES } from './companies.my';
import { US_COMPANIES } from './companies.us';

export const COMPANIES: CompanySeed[] = [...MY_COMPANIES, ...US_COMPANIES];
export const COMPANY_BY_ID: Record<TickerId, CompanySeed> = Object.fromEntries(COMPANIES.map((c) => [c.id, c]));
export const currencyOf = (id: TickerId) => (id.startsWith('MY:') ? 'MYR' : 'USD') as 'MYR' | 'USD';
