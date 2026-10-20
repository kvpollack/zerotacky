// Pure export / import helpers. No DOM access; the UI layer handles download/share.
import type { AppState, Division, EventDef } from './types';
import { scoreSingleEvent, calculateDivisionStandings } from './engine';

export const EXPORT_FORMAT = 'zerotacky-meet';
export const EXPORT_VERSION = 1;

export interface MeetExport {
  format: typeof EXPORT_FORMAT;
  version: number;
  exportedAt: string;
  state: AppState;
}

export function exportStateJson(state: AppState, now: Date = new Date()): string {
  const payload: MeetExport = { format: EXPORT_FORMAT, version: EXPORT_VERSION, exportedAt: now.toISOString(), state };
  return JSON.stringify(payload, null, 2);
}

function isArray(v: unknown): v is unknown[] { return Array.isArray(v); }

// Accepts either a MeetExport wrapper or a bare AppState (what localStorage holds).
export function parseImportedState(text: string): AppState {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error('Not valid JSON.'); }
  if (!raw || typeof raw !== 'object') throw new Error('Not a ZeroTacky file.');
  const obj = raw as Record<string, unknown>;
  const state = (obj.format === EXPORT_FORMAT ? obj.state : obj) as Record<string, unknown> | undefined;
  if (!state || typeof state !== 'object') throw new Error('Not a ZeroTacky file.');
  const meet = state.meet as Record<string, unknown> | undefined;
  if (!meet || typeof meet.id !== 'string' || typeof meet.name !== 'string') throw new Error('Missing meet.');
  for (const key of ['divisions', 'athletes', 'events', 'results']) {
    if (!isArray(state[key])) throw new Error(`Missing ${key}.`);
  }
  const s = state as unknown as AppState;
  const divIds = new Set(s.divisions.map((d) => d.id));
  const athIds = new Set(s.athletes.map((a) => a.id));
  const evIds = new Set(s.events.map((e) => e.id));
  for (const a of s.athletes) if (!divIds.has(a.divisionId)) throw new Error(`Athlete ${a.name} references unknown division ${a.divisionId}.`);
  for (const r of s.results) {
    if (!athIds.has(r.athleteId) || !evIds.has(r.eventId)) throw new Error(`Result ${r.id} references unknown athlete or event.`);
  }
  return {
    meet: { ...s.meet, availablePlates: [...(s.meet.availablePlates ?? [])] },
    divisions: s.divisions, athletes: s.athletes, events: s.events, results: s.results,
  };
}

function csvCell(v: unknown): string {
  const str = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function sortedEvents(events: EventDef[]): EventDef[] {
  return [...events].sort((a, b) => a.eventNumber - b.eventNumber);
}

// One row per athlete: division, athlete, lot, status, then per event score/place/points, then totals.
export function resultsToCsv(state: AppState): string {
  const events = sortedEvents(state.events);
  const header: unknown[] = ['Division', 'Flight', 'Athlete', 'Lot', 'Status'];
  for (const e of events) header.push(`Ev${e.eventNumber} ${e.name}`, `Ev${e.eventNumber} Place`, `Ev${e.eventNumber} Pts`);
  header.push('Total Pts', 'Event Wins', 'Overall Place');
  const rows: unknown[][] = [header];

  const divisions = [...state.divisions].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const div of divisions) {
    const athletes = state.athletes.filter((a) => a.divisionId === div.id);
    if (athletes.length === 0) continue;
    const standings = calculateDivisionStandings(div, athletes, state.events, state.results, state.meet.tiebreakerRule);
    const perEvent = new Map(events.map((e) => [e.id, new Map(scoreSingleEvent(e, athletes, state.results).map((r) => [r.athleteId, r]))]));
    const scoredEventIds = new Set(events.filter((e) => state.results.some((r) => r.eventId === e.id)).map((e) => e.id));
    for (const st of standings) {
      const a = athletes.find((x) => x.id === st.athleteId)!;
      const row: unknown[] = [div.name, div.flight, a.name, a.lotNumber, a.status];
      for (const e of events) {
        const r = perEvent.get(e.id)!.get(a.id);
        if (!scoredEventIds.has(e.id) || !r) row.push('', '', '');
        else row.push(r.displayScore, r.place, r.points);
      }
      row.push(st.totalPoints, st.eventWins, st.overallPlace);
      rows.push(row);
    }
  }
  return toCsv(rows);
}

// Plain text for a results post (Iron Podium thread, Instagram caption).
export function standingsText(state: AppState, divisionsFilter?: Division[]): string {
  const events = sortedEvents(state.events);
  const divisions = (divisionsFilter ?? state.divisions).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const lines: string[] = [state.meet.name.toUpperCase()];
  if (state.meet.date) lines.push(state.meet.date);
  for (const div of divisions) {
    const athletes = state.athletes.filter((a) => a.divisionId === div.id);
    if (athletes.length === 0) continue;
    lines.push('', `${div.name}`);
    const standings = calculateDivisionStandings(div, athletes, events, state.results, state.meet.tiebreakerRule);
    for (const st of standings) {
      const scratched = st.status === 'withdrawn' ? ' (scratched)' : '';
      lines.push(`${st.isTiedOverall ? 'T-' : ''}${st.overallPlace}. ${st.athleteName}${scratched} - ${st.totalPoints} pts`);
    }
  }
  return lines.join('\n');
}

export function backupFilename(state: AppState, now: Date = new Date()): string {
  const slug = state.meet.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40).replace(/^-+|-+$/g, '') || 'meet';
  const stamp = now.toISOString().replace(/[:T]/g, '-').slice(0, 16);
  return `zerotacky-${slug}-${stamp}`;
}
