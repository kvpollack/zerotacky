// Pure formatting for the website sheets (Phase 3, 11/2). No Date locale calls: the ISO day is split as text so the
// server and the client agree, and a show on the 14th is the 14th in every time zone.
import type { PublicShowSummary } from './types';
import { describeShowLifecycle } from './filters';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "2026-10-24" -> { day: "24", rest: "Oct 2026" }. Anything else -> { day: "", rest: input }. */
export function splitIsoDate(iso: string | null | undefined): { day: string; rest: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return { day: '', rest: iso ?? '' };
  const mon = MONTHS[Number(m[2]) - 1] ?? m[2];
  return { day: m[3], rest: `${mon} ${m[1]}` };
}

/** "2026-10-24" -> "Sat 24 Oct 2026"; falls back to the input when it is not an ISO day. */
export function longIsoDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso ?? '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DAYS[d.getUTCDay()]} ${m[3]} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** "24 Oct" for the facts strip. */
export function shortIsoDate(iso: string | null | undefined): string {
  const s = splitIsoDate(iso);
  return s.day ? `${s.day} ${s.rest.split(' ')[0]}` : s.rest;
}

/** Venue line for a results-table row: "The Power Plant Gym, York PA". Repeated placeholders ("Not provided") collapse to one. */
export function venueLine(v: PublicShowSummary['venue']): string {
  const seen = new Set<string>();
  const keep = (s: string | undefined): s is string => {
    const k = (s ?? '').trim().toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  };
  const facility = keep(v.facilityName) ? v.facilityName : '';
  const place = [v.city, v.state].filter(keep).join(' ');
  return facility && place ? `${facility}, ${place}` : facility || place;
}

export type ShowRowStatus = { text: string; live: boolean };

/** One status phrase per row, the way the results table reads it. Live rows are set in pen. */
export function showRowStatus(s: Pick<PublicShowSummary, 'competitionStatus' | 'registrationStatus' | 'resultsStatus' | 'externalUrl'>): ShowRowStatus {
  if (s.externalUrl) return { text: 'Upcoming · Registers elsewhere', live: false };
  const life = describeShowLifecycle(s.competitionStatus, s.registrationStatus, s.resultsStatus);
  if (s.competitionStatus === 'live') return { text: `${life.competitionLabel} · ${life.resultsLabel}`, live: true };
  if (s.competitionStatus === 'completed') return { text: life.resultsLabel, live: false };
  if (s.competitionStatus === 'upcoming') return { text: `${life.competitionLabel} · ${life.registrationLabel}`, live: false };
  return { text: life.competitionLabel, live: false };
}

/** "$75 (Venmo or cash at weigh-in)" -> { amount: "$75", note: "(Venmo or cash at weigh-in)" }; no leading amount -> amount "". */
export function splitFee(display: string | null | undefined): { amount: string; note: string } {
  const m = /^\s*((?:US)?\$?\s?\d[\d,]*(?:\.\d+)?)\s*([\s\S]*)$/.exec(display ?? '');
  if (!m) return { amount: '', note: (display ?? '').trim() };
  return { amount: m[1].replace(/\s+/g, ''), note: m[2].trim() };
}

/** The row's "Open" link: the live board when there is one, otherwise the show page. */
export function showRowLink(s: Pick<PublicShowSummary, 'slug' | 'competitionStatus' | 'liveScoreboardPath' | 'externalUrl'>): { href: string; label: string; external?: boolean } {
  if (s.externalUrl) return { href: s.externalUrl, label: 'Listing', external: true };
  if (s.competitionStatus === 'live' && s.liveScoreboardPath) return { href: s.liveScoreboardPath, label: 'Live board' };
  if (s.competitionStatus === 'completed') return { href: `/shows/${s.slug}`, label: 'Results' };
  return { href: `/shows/${s.slug}`, label: 'Show details' };
}
