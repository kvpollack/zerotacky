// Federation results pack (feature 1, 11/3). Pure helpers; the promoter's Meet Day tab downloads, copies and opens them.
// Strongman Corporation's rule: a show not scored on Iron Podium emails its results to admin@strongmancorporation.com
// within 7 days, or keeps a live results link viewable for 365 days (feature report ref 48). SC publishes no file
// layout, so the CSV is a sheet a state rep can read: a title block (meet, date, venue, federation, promoter contact,
// where it was scored, the results link) then one row per athlete, places first.
import type { AppState, Division, EventDef } from './types';
import { scoreSingleEvent, calculateDivisionStandings } from './engine';
import { toCsv, standingsText } from './export';

export const SC_RESULTS_EMAIL = 'admin@strongmancorporation.com';
export const SC_RESULTS_WINDOW_DAYS = 7;

export interface FederationPackMeta {
  venue?: { facilityName?: string; city: string; state: string } | null;
  federation?: string | null;
  promoterContact?: string | null;
  resultsUrl: string;   // absolute public show URL; stays viewable once the results are marked submitted (037)
}

function sortedEvents(events: EventDef[]): EventDef[] {
  return [...events].sort((a, b) => a.eventNumber - b.eventNumber);
}

export function venueLine(venue: FederationPackMeta['venue']): string {
  if (!venue) return '';
  return [venue.facilityName, [venue.city, venue.state].filter(Boolean).join(', ')].filter((s) => s && s.trim()).join(', ');
}

/** Title block + results table, places first within each division. Scratched athletes keep their place with a note. */
export function federationResultsCsv(state: AppState, meta: FederationPackMeta): string {
  const events = sortedEvents(state.events);
  const rows: unknown[][] = [
    ['Meet', state.meet.name],
    ['Date', state.meet.date || ''],
    ['Venue', venueLine(meta.venue)],
    ['Federation', meta.federation ?? ''],
    ['Promoter contact', meta.promoterContact ?? ''],
    ['Scored on', 'ZeroTacky'],
    ['Results link', meta.resultsUrl],
    [],
  ];
  const header: unknown[] = ['Division', 'Place', 'Athlete', 'Bodyweight', 'Status'];
  for (const e of events) header.push(`Ev${e.eventNumber} ${e.name}`, `Ev${e.eventNumber} Pts`);
  header.push('Total Pts', 'Event Wins');
  rows.push(header);

  const divisions: Division[] = [...state.divisions].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const div of divisions) {
    const athletes = state.athletes.filter((a) => a.divisionId === div.id);
    if (athletes.length === 0) continue;
    const standings = calculateDivisionStandings(div, athletes, state.events, state.results, state.meet.tiebreakerRule);
    const perEvent = new Map(events.map((e) => [e.id, new Map(scoreSingleEvent(e, athletes, state.results, state.events).map((r) => [r.athleteId, r]))]));
    const scored = new Set(events.filter((e) => state.results.some((r) => r.eventId === e.id)).map((e) => e.id));
    for (const st of standings) {
      const a = athletes.find((x) => x.id === st.athleteId)!;
      const row: unknown[] = [
        div.name,
        `${st.isTiedOverall ? 'T-' : ''}${st.overallPlace}`,
        a.name,
        a.bodyweight ?? '',
        st.status === 'withdrawn' ? 'Scratched' : '',
      ];
      for (const e of events) {
        const r = perEvent.get(e.id)!.get(a.id);
        if (!scored.has(e.id) || !r) row.push('', '');
        else row.push(r.displayScore, r.points);
      }
      row.push(st.totalPoints, st.eventWins);
      rows.push(row);
    }
  }
  return toCsv(rows);
}

export function federationCsvFilename(state: AppState): string {
  const slug = state.meet.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-+|-+$/g, '') || 'meet';
  return `${slug}-results-${state.meet.date || 'undated'}.csv`;
}

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  mailto: string;
  standingsIncluded: boolean;
}

// Some mail clients drop a mailto: past about 2,000 characters, so the standings ride in the body only while the
// whole link stays under that; otherwise the body points at the CSV and the link.
const MAILTO_LIMIT = 1900;

export function federationEmailDraft(state: AppState, meta: FederationPackMeta, to: string = SC_RESULTS_EMAIL): EmailDraft {
  const where = venueLine(meta.venue);
  const subject = `${state.meet.name} results${state.meet.date ? `, ${state.meet.date}` : ''}`;
  const intro = [
    'Hello,',
    '',
    `Results for ${state.meet.name}${state.meet.date ? ` (${state.meet.date}${where ? `, ${where}` : ''})` : where ? ` (${where})` : ''} are attached as a CSV and are live at:`,
    meta.resultsUrl,
    '',
    ...(meta.federation ? [`Federation: ${meta.federation}`] : []),
    ...(meta.promoterContact ? [`Promoter contact: ${meta.promoterContact}`] : []),
  ];
  const outro = ['', 'Scored on ZeroTacky.'];
  const build = (withStandings: boolean) => {
    const body = [...intro, ...(withStandings ? ['', standingsText(state)] : ['', 'Final standings are in the attached CSV and at the link above.']), ...outro].join('\n');
    const mailto = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    return { to, subject, body, mailto, standingsIncluded: withStandings };
  };
  const full = build(true);
  return full.mailto.length <= MAILTO_LIMIT ? full : build(false);
}
