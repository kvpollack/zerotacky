// IG-sized result cards (Kurt's newcomer strategy, 11/10 night): one athlete's finish at one show as a PNG an athlete
// posts straight to Instagram. Pure data here; the pixels live in resultCardImage.tsx and the route under
// app/shows/[slug]/card/[athleteId]. Reads the same adapter as the show page so the card can never disagree with
// the standings table.
import { buildDivisionResultsView } from './standingsAdapter';
import { scoringField } from '../engine/scoring';
import { longIsoDate } from './sheetFormat';
import type { PublicShowRecord } from './types';

export type ResultCardSize = 'square' | 'story' | 'link';

export const RESULT_CARD_SIZES: Record<ResultCardSize, { width: number; height: number; label: string; hint: string }> = {
  square: { width: 1080, height: 1080, label: 'Square', hint: 'Instagram post' },
  story: { width: 1080, height: 1920, label: 'Story', hint: 'Instagram or Facebook story' },
  link: { width: 1200, height: 630, label: 'Wide', hint: 'Facebook post, group, link preview' },
};

export function isResultCardSize(v: unknown): v is ResultCardSize {
  return v === 'square' || v === 'story' || v === 'link';
}

export function resultCardHref(slug: string, athleteId: string, size: ResultCardSize): string {
  return `/shows/${encodeURIComponent(slug)}/card/${encodeURIComponent(athleteId)}?size=${size}`;
}

export function resultCardFileName(data: ResultCardData, size: ResultCardSize): string {
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${slugify(data.athleteName) || 'athlete'}-${slugify(data.meetName) || 'result'}-${size}.png`;
}

export interface ResultCardEvent {
  eventNumber: number;
  name: string;
  display: string;   // the mark as the standings print it ("18 reps", "42.30s")
  points: number;
  place: number;
  tied: boolean;
  scored: boolean;   // false when the event has no result for this athlete
}

export interface ResultCardData {
  slug: string;
  meetName: string;
  dateLabel: string;
  venueLabel: string;
  athleteName: string;
  divisionName: string;
  fieldSize: number;          // athletes who scored something (scratches with no score excluded)
  place: number | null;       // null = scratched before scoring
  isTied: boolean;
  placeLabel: string;         // "2nd of 7", "T-2nd of 7", "Scratched"
  totalPoints: number;
  eventWins: number;
  events: ResultCardEvent[];
  statusLabel: 'Official Final' | 'Provisional' | 'Live';
  isDemo: boolean;
}

export const PLACE_SUFFIX = (n: number): string => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
};

/** Null when the show has no standings yet (upcoming) or the athlete is not on it. */
export function buildResultCardData(show: PublicShowRecord, athleteId: string): ResultCardData | null {
  if (show.competitionStatus !== 'completed' && show.competitionStatus !== 'live') return null;
  const athlete = show.state.athletes.find((a) => a.id === athleteId);
  if (!athlete) return null;
  const division = show.state.divisions.find((d) => d.id === athlete.divisionId);
  if (!division) return null;
  const view = buildDivisionResultsView(show, division);
  const mine = view.standings.find((s) => s.athleteId === athleteId);
  if (!mine) return null;
  const sortedEvents = [...show.state.events].sort((a, b) => a.eventNumber - b.eventNumber);
  const events: ResultCardEvent[] = sortedEvents.map((ev) => {
    const cell = mine.eventBreakdown[ev.id];
    return {
      eventNumber: ev.eventNumber,
      name: ev.name,
      display: cell?.display ?? '—',
      points: cell?.points ?? 0,
      place: cell?.place ?? 0,
      tied: Boolean(cell?.isTied),
      scored: Boolean(cell),
    };
  });
  const scoredSomething = events.some((e) => e.scored && e.points > 0) || mine.totalPoints > 0;
  // Field = the engine's points field (scratches with no score sit at N+1 and are not counted), as on the profile.
  const field = scoringField(view.athletes, show.state.results, sortedEvents).length;
  const scratched = mine.status === 'withdrawn' && !scoredSomething;
  const place = scratched ? null : mine.overallPlace;
  const placeLabel = scratched ? 'Scratched' : `${mine.isTiedOverall ? 'T-' : ''}${PLACE_SUFFIX(mine.overallPlace)} of ${field}`;
  const where = [show.venue.facilityName, show.venue.city, show.venue.state].filter(Boolean).join(', ');
  return {
    slug: show.slug,
    meetName: show.name,
    dateLabel: show.date ? longIsoDate(show.date) : '',
    venueLabel: where,
    athleteName: athlete.name,
    divisionName: division.name,
    fieldSize: field,
    place,
    isTied: Boolean(mine.isTiedOverall) && !scratched,
    placeLabel,
    totalPoints: mine.totalPoints,
    eventWins: mine.eventWins,
    events,
    statusLabel: show.competitionStatus === 'live' ? 'Live' : view.isOfficialFinal ? 'Official Final' : 'Provisional',
    isDemo: Boolean(show.isDemoFixture),
  };
}
