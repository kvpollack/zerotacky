// "You're up" (11/6, feature gaps #7b). A follower on the phone board picks an athlete (themselves, a teammate, a kid)
// and the board tells them where that athlete stands on the live station: on the platform, on deck, N away, scored, or
// waiting for their division to be called. Pure: takes the same state + live rows the board already polls and reuses
// the TV running-order model, so the phone and the TV never disagree. The browser Notification is optional sugar and
// only fires while the page is open (iOS needs the page added to the Home Screen first; no server push here).

import type { AppState, Athlete, Division, Station } from '../types';
import type { LiveStateRow } from '../sync/meetApi';
import { buildSheetA, defaultStations } from './model';

export type UpStatus =
  | { kind: 'unknown' }                                           // athlete not on the roster any more
  | { kind: 'waiting'; athlete: Athlete; division: Division; stationLabel: string }   // division not live on its station
  | { kind: 'up'; athlete: Athlete; division: Division; stationLabel: string; eventName: string; eventIndex: number; eventCount: number }
  | { kind: 'on_deck'; athlete: Athlete; division: Division; stationLabel: string; eventName: string; away: number }
  | { kind: 'queued'; athlete: Athlete; division: Division; stationLabel: string; eventName: string; away: number }
  | { kind: 'scored'; athlete: Athlete; division: Division; stationLabel: string; eventName: string; result: string; nextEventName: string | null };

export function stationFor(state: AppState, division: Division): Station {
  const stations = state.meet.stations?.length ? state.meet.stations : defaultStations(state);
  return stations.find((s) => s.id === division.flight) ?? stations[0];
}

export function upStatus(state: AppState, live: LiveStateRow[], athleteId: string | null | undefined): UpStatus {
  if (!athleteId) return { kind: 'unknown' };
  const athlete = state.athletes.find((a) => a.id === athleteId && a.status === 'active');
  if (!athlete) return { kind: 'unknown' };
  const division = state.divisions.find((d) => d.id === athlete.divisionId);
  if (!division) return { kind: 'unknown' };
  const station = stationFor(state, division);
  const base = { athlete, division, stationLabel: station.label };
  const sheet = buildSheetA(state, live, station);
  if (!sheet || !sheet.division || sheet.division.id !== division.id || !sheet.event) return { kind: 'waiting', ...base };
  const row = sheet.parts.find((p) => p.athleteId === athlete.id);
  const eventName = sheet.event.name;
  if (!row) return { kind: 'waiting', ...base };
  if (row.status === 'live') return { kind: 'up', ...base, eventName, eventIndex: sheet.eventIndex, eventCount: sheet.eventCount };
  if (row.status === 'scored' || row.status === 'locked') {
    return { kind: 'scored', ...base, eventName, result: row.result, nextEventName: sheet.next?.name ?? null };
  }
  // unscored and not live: count the unscored rows between the live athlete and this one
  const liveIdx = sheet.runPosition > 0 ? sheet.runPosition - 1 : -1;
  let away = 0;
  for (let i = liveIdx + 1; i < sheet.parts.length; i += 1) {
    const p = sheet.parts[i];
    if (p.athleteId === athlete.id) break;
    if (p.status === '' || p.status === 'on deck') away += 1;
  }
  if (row.status === 'on deck') return { kind: 'on_deck', ...base, eventName, away: away + 1 };
  return { kind: 'queued', ...base, eventName, away: away + 1 };
}

/** One line for the banner and the notification body. */
export function upLine(s: UpStatus): { title: string; detail: string; tone: 'up' | 'soon' | 'calm' } {
  switch (s.kind) {
    case 'up':
      return { title: `${s.athlete.name} is up`, detail: `${s.stationLabel} · ${s.eventName} (event ${s.eventIndex} of ${s.eventCount})`, tone: 'up' };
    case 'on_deck':
      return { title: `${s.athlete.name} is on deck`, detail: `${s.away === 1 ? 'Next' : `${s.away} away`} on ${s.stationLabel} · ${s.eventName}`, tone: 'soon' };
    case 'queued':
      return { title: `${s.athlete.name}: ${s.away} away`, detail: `${s.stationLabel} · ${s.eventName}`, tone: 'calm' };
    case 'scored':
      return { title: `${s.athlete.name}: ${s.eventName} done`, detail: `${s.result ? `${s.result} · ` : ''}${s.nextEventName ? `Next up for the division: ${s.nextEventName}` : 'Last event on this station'}`, tone: 'calm' };
    case 'waiting':
      return { title: `${s.athlete.name}: waiting`, detail: `${s.division.name} is not on ${s.stationLabel} yet`, tone: 'calm' };
    default:
      return { title: 'Athlete not found', detail: 'They may have been removed from the roster.', tone: 'calm' };
  }
}

/** Fire a notification on the transition into on deck / up (never twice for the same state). Returns the new key. */
export function notifyKey(s: UpStatus): string | null {
  if (s.kind === 'up') return `up:${s.athlete.id}:${s.eventName}`;
  if (s.kind === 'on_deck') return `deck:${s.athlete.id}:${s.eventName}`;
  return null;
}

export const FOLLOW_KEY = (slug: string) => `zt:follow:${slug}`;
