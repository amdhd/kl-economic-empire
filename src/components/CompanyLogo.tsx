import { COMPANY_BY_ID } from '../data/companies';
import { SECTORS } from '../data/economic-baseline';
import { LOGOS } from '../data/logos';
import type { TickerId } from '../types/game';

/** Text monogram used where no logo file exists (and on the map when a logo fails to load). */
export function monogram(id: TickerId): string {
  const c = COMPANY_BY_ID[id];
  if (!c) return '?';
  return c.exchange === 'US' ? c.code.replace('.B', '') : c.displayName.replace(/[^A-Za-z ]/g, '').split(' ').map((w) => w[0]).join('').slice(0, 3).toUpperCase();
}
export const logoUrl = (id: TickerId) => (LOGOS[id] ? `${import.meta.env.BASE_URL}logos/${LOGOS[id]}` : null);

/** Company/issuer logo (trademark of its owner; see docs/data-sources.md), with a monogram fallback. */
export function CompanyLogo({ id, size = 22 }: { id: TickerId; size?: number }) {
  const url = logoUrl(id);
  const c = COMPANY_BY_ID[id];
  if (url) return <img src={url} alt={`${c?.displayName ?? id} logo`} width={size} height={size} className="inline-block shrink-0 rounded bg-white object-contain p-[2px] align-middle" style={{ width: size, height: size }} loading="lazy" />;
  return <span className="inline-grid shrink-0 place-items-center rounded align-middle text-[9px] font-bold text-white" style={{ width: size, height: size, background: c?.exchange === 'US' ? '#1e3a8a' : c ? SECTORS[c.sector].color : '#475569' }} aria-hidden="true">{monogram(id)}</span>;
}
