// Pure formatting for the website sheets (Phase 3, 11/2). No Date locale calls: the ISO day is split as text so the
// server and the client agree, and a show on the 14th is the 14th in every time zone.
import type { PublicShowSummary, ShowRegistrationStatus } from './types';
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

/** "20 Nov 2026, 08:22" in the reader's own time zone, for an admin stamp (filed, submitted). Call it in the browser:
 *  the server and the reader can sit in different zones. "" when the value is not a date. (UI group A, 11/27, S23:
 *  one queue printed "11/20/2026, 8:22:19 AM" and the other "2026-11-20".) */
export function stampDateTime(value: string | Date | null | undefined): string {
  const d = value instanceof Date ? value : new Date(value ?? '');
  if (Number.isNaN(d.getTime())) return '';
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/** "24 Oct" for the facts strip. */
export function shortIsoDate(iso: string | null | undefined): string {
  const s = splitIsoDate(iso);
  return s.day ? `${s.day} ${s.rest.split(' ')[0]}` : s.rest;
}

/** The data layer fills a missing city or state with "Not provided" (supabaseShows). A place line never prints that
 *  word as if it were a town: the part is dropped (UI group A, 11/27, part 2 S12). */
function realPart(s: string | null | undefined): string {
  const t = (s ?? '').trim();
  return /^not provided$/i.test(t) ? '' : t;
}

/** "York, PA"; "Oslo" when there is no state; "" when there is neither. Never a trailing comma. */
export function placeLine(city: string | null | undefined, state: string | null | undefined, sep = ', '): string {
  return [realPart(city), realPart(state)].filter(Boolean).join(sep);
}

/** Venue line for a results-table row: "The Power Plant Gym, York PA". A part the listing has not supplied is left
 *  out, a repeated part prints once, and a venue with nothing on file is "" (the caller decides what to print). */
export function venueLine(v: PublicShowSummary['venue']): string {
  const seen = new Set<string>();
  const keep = (s: string | null | undefined): string => {
    const t = realPart(s);
    const k = t.toLowerCase();
    if (!k || seen.has(k)) return '';
    seen.add(k);
    return t;
  };
  const facility = keep(v.facilityName);
  const place = [keep(v.city), keep(v.state)].filter(Boolean).join(' ');
  return facility && place ? `${facility}, ${place}` : facility || place;
}

/** "The Power Plant Gym, York, PA" for a header line (title bands, the dashboard row); the same rules as placeLine,
 *  and a facility named after its town prints once. */
export function venueWithPlace(v: { facilityName?: string | null; city?: string | null; state?: string | null } | null | undefined): string {
  if (!v) return '';
  const facility = realPart(v.facilityName);
  const named = facility.toLowerCase() === realPart(v.city).toLowerCase() ? '' : facility;
  return [named, placeLine(v.city, v.state)].filter(Boolean).join(', ');
}

/** Registration as the short phrase that follows a "Registration" label: "Open", not "Registration Open" (the title
 *  band read "REGISTRATION: REGISTRATION OPEN"). `full` is an open show at its cap, where a new entry is waitlisted.
 *  null when registration does not apply to the show (an imported or scored-only meet): the caller drops the slot
 *  instead of printing "N/A". */
export function registrationShort(status: ShowRegistrationStatus, opts: { full?: boolean } = {}): string | null {
  if (status === 'not_applicable') return null;
  if (status === 'open') return opts.full ? 'Full · Waitlist' : 'Open';
  const map: Record<Exclude<ShowRegistrationStatus, 'open' | 'not_applicable'>, string> = {
    closed: 'Closed', waitlist: 'Waitlist only', day_of_only: 'Day-of entry only', not_provided: 'Not provided',
  };
  return map[status];
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
