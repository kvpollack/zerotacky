// Hosting record for a gym page (feature gaps #19, 11/8): the shows a gym hosted, split into upcoming and past, with the
// headline numbers a gym owner quotes ("hosted 4 shows since 2024"). Pure; the gym page feeds it the public show list.
import type { PublicShowSummary } from './types';

export interface HostingRecord {
  upcoming: PublicShowSummary[];
  past: PublicShowSummary[];
  total: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Past shows whose promoter marked results Final: these have a post-meet report worth linking. */
  reportable: Set<string>;
}

export function buildHostingRecord(shows: PublicShowSummary[], today: string): HostingRecord {
  const sorted = [...shows].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const isPast = (s: PublicShowSummary) => s.competitionStatus === 'completed' || (!!s.date && s.date < today && s.competitionStatus !== 'live');
  const past = sorted.filter(isPast).reverse();
  const upcoming = sorted.filter((s) => !isPast(s));
  const dated = sorted.map((s) => s.date).filter(Boolean);
  return {
    upcoming,
    past,
    total: shows.length,
    firstDate: dated[0] ?? null,
    lastDate: dated[dated.length - 1] ?? null,
    reportable: new Set(past.filter((s) => s.competitionStatus === 'completed' && !s.externalUrl).map((s) => s.slug)),
  };
}
