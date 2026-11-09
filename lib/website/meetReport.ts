// Post-meet report (feature gaps #19, 11/8). One printable page for the host gym and the promoter after a show: the
// field (entered, scored, scratched), every division's podium, event winners, where the athletes came from (linked
// public profiles by home gym, counts only, from zt_meet_report_origins), sponsors and the livestream. Built from the
// same public data as the show page plus the standings adapter, nothing stored. Final results say so; provisional ones
// are labelled.

import { toCsv } from '@/lib/export';
import type { DivisionResultsView, PublicShowRecord, ShowVenue } from './types';
import { longIsoDate, venueLine } from './sheetFormat';

export interface ReportOrigins {
  linked: number;
  public: number;
  homeGyms: { name: string; slug: string | null; n: number }[];
}

export interface ReportPodiumRow {
  place: number;
  tied: boolean;
  name: string;
  points: number;
  eventWins: number;
}

export interface ReportDivision {
  id: string;
  name: string;
  entered: number;
  scored: number;
  scratched: number;
  podium: ReportPodiumRow[];
}

export interface ReportEventWinner {
  eventName: string;
  winners: { division: string; name: string; display: string }[];
}

export interface MeetReport {
  showName: string;
  showSlug: string;
  showDate: string;
  dateLabel: string;
  venue: string;
  federation: string | null;
  hostGym: { slug: string; name: string } | null;
  promoterName: string | null;
  isFinal: boolean;
  isDemo: boolean;
  totals: { entered: number; scored: number; scratched: number; divisions: number; events: number };
  divisions: ReportDivision[];
  eventWinners: ReportEventWinner[];
  origins: ReportOrigins | null;
  sponsors: { name: string; url: string | null }[];
  livestreamUrl: string | null;
}

export function reportHref(slug: string): string {
  return `/shows/${encodeURIComponent(slug)}/report`;
}

const PLACEHOLDER = /^not provided$/i;
/** The data layer fills a missing city/state with "Not provided"; the report header omits the venue instead of printing that. */
function withoutPlaceholders(v: ShowVenue): ShowVenue {
  const clean = (s: string | undefined) => (s && !PLACEHOLDER.test(s.trim()) ? s : '');
  return { ...v, facilityName: clean(v.facilityName) || undefined, city: clean(v.city), state: clean(v.state) };
}

export function buildMeetReport(show: PublicShowRecord, views: DivisionResultsView[], origins: ReportOrigins | null): MeetReport {
  const { state } = show;
  const active = state.athletes.filter((a) => a.status === 'active');
  const scratched = state.athletes.length - active.length;
  const scoredIds = new Set(state.results.filter((r) => !r.didNotStart).map((r) => r.athleteId));
  const divisions: ReportDivision[] = [...state.divisions]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((d) => {
      const view = views.find((v) => v.division.id === d.id);
      const mine = state.athletes.filter((a) => a.divisionId === d.id);
      const standings = view?.standings ?? [];
      const podium = standings
        .filter((s) => s.overallPlace <= 3 && s.totalPoints > 0)
        .map((s) => ({ place: s.overallPlace, tied: Boolean(s.isTiedOverall), name: s.athleteName, points: s.totalPoints, eventWins: s.eventWins }));
      return {
        id: d.id,
        name: d.name,
        entered: mine.length,
        scored: mine.filter((a) => scoredIds.has(a.id)).length,
        scratched: mine.filter((a) => a.status !== 'active').length,
        podium,
      };
    });
  const eventWinners: ReportEventWinner[] = [...state.events]
    .sort((a, b) => a.eventNumber - b.eventNumber)
    .map((ev) => ({
      eventName: ev.name,
      winners: divisions.flatMap((d) => {
        const view = views.find((v) => v.division.id === d.id);
        const board = view?.eventScoreboards[ev.id] ?? [];
        const top = board.filter((r) => r.place === 1 && !r.isZero);
        return top.map((r) => ({ division: d.name, name: r.athleteName, display: r.displayScore }));
      }),
    }))
    .filter((e) => e.winners.length > 0);
  return {
    showName: show.name,
    showSlug: show.slug,
    showDate: show.date,
    dateLabel: longIsoDate(show.date),
    venue: venueLine(withoutPlaceholders(show.venue)),
    federation: show.federation ?? null,
    hostGym: show.hostGymSlug && show.hostGymName ? { slug: show.hostGymSlug, name: show.hostGymName } : null,
    promoterName: show.promoterName ?? null,
    isFinal: show.resultsStatus === 'final',
    isDemo: show.isDemoFixture,
    totals: {
      entered: state.athletes.length,
      scored: active.filter((a) => scoredIds.has(a.id)).length,
      scratched,
      divisions: state.divisions.length,
      events: state.events.length,
    },
    divisions,
    eventWinners,
    origins,
    sponsors: (show.sponsors ?? []).map((s) => ({ name: s.name, url: s.url ?? null })),
    livestreamUrl: show.livestreamUrl ?? null,
  };
}

/** CSV: one row per podium place, then one per event winner, so a gym can paste the headline numbers anywhere. */
export function meetReportCsv(r: MeetReport): string {
  const rows: unknown[][] = [
    ['Show', r.showName], ['Date', r.showDate], ['Venue', r.venue], ['Host gym', r.hostGym?.name ?? ''], ['Results', r.isFinal ? 'Final' : 'Provisional'],
    ['Athletes entered', r.totals.entered], ['Athletes scored', r.totals.scored], ['Scratched', r.totals.scratched], ['Divisions', r.totals.divisions], ['Events', r.totals.events],
    [],
    ['Division', 'Place', 'Athlete', 'Points', 'Event wins'],
    ...r.divisions.flatMap((d) => d.podium.map((p) => [d.name, `${p.tied ? 'T-' : ''}${p.place}`, p.name, p.points, p.eventWins])),
    [],
    ['Event', 'Division', 'Winner', 'Result'],
    ...r.eventWinners.flatMap((e) => e.winners.map((w) => [e.eventName, w.division, w.name, w.display])),
  ];
  if (r.origins) {
    rows.push([], ['Home gym', 'Athletes'], ...r.origins.homeGyms.map((g) => [g.name, g.n]));
  }
  return toCsv(rows);
}

export function meetReportFilename(r: MeetReport): string {
  return `${r.showSlug}-report.csv`;
}
