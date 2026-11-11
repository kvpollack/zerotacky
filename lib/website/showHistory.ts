// Show history for public athlete pages (023, 10/26). The RPC `zt_athlete_show_history` says which Final shows a
// public profile competed in and as which roster athlete; the placing is computed here from the public meet data
// with the same engine the board uses (via standingsAdapter), never stored or re-implemented.

import type { AthleteRow, DivisionRow, EventRow, MeetRow, ResultRow } from '../sync/mapping';
import { effectiveMaxWeight, scoringField } from '@/lib/engine/scoring';
import type { ImplementKind, ScoringType } from '../types';
import { rowsToState } from '../sync/mapping';
import { buildDivisionResultsView } from './standingsAdapter';
import type { PublicShowRecord } from './types';

export interface ShowHistoryRow {
  meet_id: string;
  slug: string;
  name: string;
  date: string | null;
  is_public_listed: boolean;
  venue_city: string | null;
  venue_state: string | null;
  division_id: string;
  division_name: string;
  athlete_id: string;
  athlete_name: string;
  athlete_status: 'active' | 'withdrawn';
}

export interface ShowHistoryBundle {
  meet: MeetRow;
  divisions: DivisionRow[];
  events: EventRow[];
  athletes: AthleteRow[];
  results: ResultRow[];
}

export interface ShowHistoryEntry {
  meetId: string;
  slug: string;
  name: string;
  date: string | null;
  /** `/shows/<slug>` when the show is listed, otherwise the public board. */
  href: string;
  venue: string | null;
  divisionName: string;
  athleteName: string;
  /** 1-based overall place in the division; null when the athlete was scratched or has no scored events. */
  place: number | null;
  isTied: boolean;
  fieldSize: number;
  totalPoints: number;
  eventWins: number;
  eventCount: number;
  withdrawn: boolean;
  /** 11/10 IG result card: the meet slug when the show is listed and the athlete placed, else null. */
  cardSlug: string | null;
  athleteId: string;
  /** 11/8 (#9 PR board): this athlete's scored result on each event, with the load they faced. Empty when withdrawn. */
  events: HistoryEventResult[];
}

export interface HistoryEventResult {
  eventId: string;
  eventName: string;
  scoringType: ScoringType;
  implement: ImplementKind | null;
  implementNote: string | null;
  /** The division's listed weight in lb for the tier the athlete lifted (light tier when they took the trump), 0 = none. */
  weightLbs: number;
  courseFeet: number | null;
  timeCapSeconds: number;
  reps: number;
  timeSeconds: number;
  /** Time counts only when the course was finished inside the cap. */
  finished: boolean;
  distanceFeet: number;
  implementsCompleted: number;
  maxWeightLbs: number;
}

export const PLACE_SUFFIX = (n: number): string => {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
};

export function showHistoryHref(row: Pick<ShowHistoryRow, 'slug' | 'is_public_listed'>): string {
  return row.is_public_listed ? `/shows/${encodeURIComponent(row.slug)}` : `/m/${encodeURIComponent(row.slug)}`;
}

export function venueLabel(row: Pick<ShowHistoryRow, 'venue_city' | 'venue_state'>): string | null {
  const parts = [row.venue_city, row.venue_state].map((p) => (p ?? '').trim()).filter((p) => p && !/^not provided$/i.test(p));
  return parts.length ? parts.join(', ') : null;
}

/** Pure: one history entry from the RPC row and the meet's public data. Returns null when the roster row is gone. */
export function buildShowHistoryEntry(row: ShowHistoryRow, bundle: ShowHistoryBundle): ShowHistoryEntry | null {
  const state = rowsToState(bundle);
  const division = state.divisions.find((d) => d.id === row.division_id);
  const athlete = state.athletes.find((a) => a.id === row.athlete_id);
  if (!division || !athlete) return null;

  // standingsAdapter wants a PublicShowRecord; only `state`, the two statuses and supplied placements are read.
  const show = {
    state,
    competitionStatus: 'completed',
    resultsStatus: 'final',
    suppliedDivisionPlacements: undefined,
  } as unknown as PublicShowRecord;
  const view = buildDivisionResultsView(show, division);
  // Astra PS-07: the denominator is the points field the engine ranked (scratches with no score excluded, mid-meet
  // withdrawals kept), so a placing can never read "3rd of 2".
  const divisionAthletes = state.athletes.filter((a) => a.divisionId === division.id);
  const field = scoringField(divisionAthletes, state.results, state.events);
  const mine = view.standings.find((s) => s.athleteId === athlete.id);
  const scored = mine ? Object.keys(mine.eventBreakdown).length : 0;
  const withdrawn = athlete.status === 'withdrawn';
  const events: HistoryEventResult[] = withdrawn ? [] : state.events.flatMap((ev) => {
    const r = state.results.find((x) => x.eventId === ev.id && x.athleteId === athlete.id);
    if (!r || r.didNotStart) return [];
    const time = r.timeSeconds ?? 0;
    // a hold's time always counts; a max-distance event never has a finish
    const finished = ev.scoringType === 'max_time' ? time > 0 : ev.distanceOnly ? false : time > 0 && time <= ev.timeCapSeconds;
    const light = r.tier === 'light' && ev.hasTrumpWeight ? ev.divisionLightWeights?.[division.id] : undefined;
    const weight = typeof light === 'number' && light > 0 ? light : (ev.divisionWeights?.[division.id] ?? 0);
    const out: HistoryEventResult = {
      eventId: ev.id,
      eventName: ev.name,
      scoringType: ev.scoringType,
      implement: ev.spec?.implement ?? null,
      implementNote: ev.spec?.implementNote ?? null,
      weightLbs: weight > 0 ? weight : 0,
      courseFeet: ev.spec?.courseFeet ?? null,
      timeCapSeconds: ev.timeCapSeconds,
      reps: r.reps ?? 0,
      timeSeconds: time,
      finished,
      distanceFeet: r.distanceFeet ?? 0,
      implementsCompleted: r.implementsCompleted ?? 0,
      maxWeightLbs: effectiveMaxWeight(r),
    };
    const has = out.reps > 0 || finished || out.distanceFeet > 0 || out.implementsCompleted > 0 || out.maxWeightLbs > 0;
    return has ? [out] : [];
  });

  return {
    meetId: row.meet_id,
    slug: row.slug,
    name: row.name,
    date: row.date,
    href: showHistoryHref(row),
    venue: venueLabel(row),
    divisionName: division.name,
    athleteName: athlete.name,
    place: mine && !withdrawn && scored > 0 ? mine.overallPlace : null,
    isTied: Boolean(mine?.isTiedOverall),
    fieldSize: field.length,
    totalPoints: mine?.totalPoints ?? 0,
    eventWins: mine?.eventWins ?? 0,
    eventCount: state.events.length,
    withdrawn,
    cardSlug: row.is_public_listed && mine && !withdrawn && scored > 0 ? row.slug : null,
    athleteId: athlete.id,
    events,
  };
}

export function formatPlace(e: Pick<ShowHistoryEntry, 'place' | 'isTied' | 'fieldSize' | 'withdrawn'>): string {
  if (e.withdrawn) return 'Scratched';
  if (e.place == null) return 'No score';
  const of = e.fieldSize > 0 ? ` of ${e.fieldSize}` : '';
  return `${e.isTied ? 'T-' : ''}${PLACE_SUFFIX(e.place)}${of}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `2026-10-24` -> `Oct 24, 2026`, parsed by hand so the server's timezone cannot shift the day. */
export function formatShowDate(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso ?? '';
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return iso ?? '';
  return `${month} ${Number(m[3])}, ${m[1]}`;
}
