// View models for the venue TV (/m/<slug>?layout=tv), UI transition Phase 2. Pure functions over AppState +
// live_state + tv_control so the sheets stay thin and this file carries the tests (test/tv.test.mjs).
//
// Sheet A, the drawing: one station, its current event and athlete, the running order as a parts list.
// Sheet B, the card: one division's standings, 12 items a page, the pages rotate.
// Idle: no station is live and the meet is not completed.
import type { AppState, Athlete, Division, EventDef, Result, StandingRow, Station } from '../types';
import type { LiveStateRow } from '../sync/meetApi';
import { calculateDivisionStandings, scoreSingleEvent, generateEventRunOrder, describeSetup, stationEvents, nextEventOnStation, stationPosition, implementWord, usesTimeCap } from '../engine';
import { revFromCount } from '../../components/sheet/TitleBlock';

export type TvSheet = 'a' | 'b';
export type TvMode = 'home' | 'dark';
export const PAGE_SIZE = 12;
export const PAGE_MS = 8000;
export const PARTS_ROWS = 10;      // Sheet A running order: at least this many ruled rows
export const PARTS_MAX = 14;       // ...and at most this many; longer orders show a window around the live athlete

export const isSheet = (v: unknown): v is TvSheet => v === 'a' || v === 'b';
export const isMode = (v: unknown): v is TvMode => v === 'home' || v === 'dark';

export function defaultStations(state: AppState): Station[] {
  return state.meet.stations?.length ? state.meet.stations : [{ id: 'A', label: 'Station 1' }, { id: 'B', label: 'Station 2' }];
}

/** The station the TV draws: the one asked for, else the first with a live row, else the first. */
export function pickStation(state: AppState, live: LiveStateRow[], wanted?: string | null): Station {
  const all = defaultStations(state);
  const asked = wanted ? all.find((s) => s.id.toLowerCase() === wanted.toLowerCase()) : undefined;
  if (asked) return asked;
  const withLive = all.find((s) => live.some((l) => l.station === s.id && l.current_event_id));
  return withLive ?? all[0];
}

export function liveFor(live: LiveStateRow[], station: Station): LiveStateRow | undefined {
  return live.find((l) => l.station === station.id);
}

/** REV advances on every locked score; the title block shows the letter. */
export function revFor(results: Result[], divisionAthletes?: Athlete[]): string {
  const ids = divisionAthletes ? new Set(divisionAthletes.map((a) => a.id)) : null;
  return revFromCount(results.filter((r) => r.locked && (!ids || ids.has(r.athleteId))).length);
}

export function formatSheetDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' });
  const mon = d.toLocaleDateString('en-US', { month: 'short' });
  return `${wd} ${d.getDate()} ${mon} ${d.getFullYear()}`;
}

export function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : name;
}

export function formatCap(seconds: number | undefined): string {
  if (!seconds) return '';
  return seconds % 60 === 0 && seconds >= 120 ? `${seconds / 60} min cap` : `${seconds} s cap`;
}

/** One line describing what the event asks of a division: "5 stones 250-350 lb · 60 s cap". */
export function eventSpec(ev: EventDef, divisionId: string): string {
  const setup = describeSetup(ev, divisionId);
  const bits: string[] = [];
  if (ev.scoringType === 'time_or_implements' && ev.implementCount) bits.push(`${ev.implementCount} ${ev.implementLabel ? implementWord(ev) : 'implements'}`);
  if (setup && setup !== '—') bits.push(setup);
  if (ev.scoringType === 'max_weight' && ev.maxFormat === 'rising_bar') bits.push('rising bar');
  if (ev.scoringType === 'max_weight' && ev.maxTiebreak === 'attempts') bits.push('Wessels tiebreak');
  if (ev.scoringType === 'reps') bits.push('reps');
  if (ev.scoringType === 'time_or_distance') bits.push(ev.distanceOnly ? 'max distance' : 'time / distance');
  if (ev.scoringType === 'max_time') bits.push('longest hold');
  const cap = usesTimeCap(ev) ? formatCap(ev.timeCapSeconds) : '';
  if (cap) bits.push(cap);
  return bits.join(' · ');
}

export type PartsRow = {
  item: number;
  lot: number;
  name: string;
  athleteId: string;
  result: string;      // display, '' until scored
  points: string;      // '' until scored
  status: 'locked' | 'scored' | 'live' | 'on deck' | '';
};

export type SheetAModel = {
  station: Station;
  division: Division | null;
  event: EventDef | null;
  eventIndex: number;          // 1-based position on the station
  eventCount: number;
  spec: string;
  athlete: Athlete | null;
  lane2: Athlete | null;
  mark: { value: string; cap: string; pen: boolean };   // the big cell: the result when scored, the target otherwise
  status: string;              // 'Scored' | 'On platform' | 'Idle'
  ladder: { label: string; value: string; state: 'good' | 'fail' | 'pass' | 'pending' | 'spec' }[];
  ladderTitle: string;
  parts: PartsRow[];
  runPosition: number;         // 1-based index of the live athlete in the running order, 0 if unknown
  onDeck: Athlete[];
  next: EventDef | null;
  nextSpec: string;
  rev: string;
};

export function buildSheetA(state: AppState, live: LiveStateRow[], station: Station): SheetAModel | null {
  const l = liveFor(live, station);
  const event = state.events.find((e) => e.id === l?.current_event_id) ?? null;
  const division = state.divisions.find((d) => d.id === l?.current_division_id) ?? null;
  if (!l || !event || !division) return null;
  const divAth = state.athletes.filter((a) => a.divisionId === division.id);
  const athlete = divAth.find((a) => a.id === l.current_athlete_id) ?? null;
  const lane2 = divAth.find((a) => a.id === l.lane2_athlete_id) ?? null;
  const onStation = stationEvents(station, state.events);
  const scored = scoreSingleEvent(event, divAth, state.results, state.events);
  const byAth = new Map(scored.map((r) => [r.athleteId, r]));
  const hasResult = (id: string) => state.results.some((r) => r.eventId === event.id && r.athleteId === id && (r.locked || resultFilled(r)));
  const order = generateEventRunOrder(event, division, divAth, state.events, state.results, state.meet.runOrderMethod, state.meet.stations);
  let runPosition = 0;
  const parts: PartsRow[] = order.map((o, i) => {
    const sr = byAth.get(o.athlete.id);
    const done = hasResult(o.athlete.id);
    const isLive = o.athlete.id === athlete?.id || o.athlete.id === lane2?.id;
    if (o.athlete.id === athlete?.id) runPosition = i + 1;
    const locked = state.results.some((r) => r.eventId === event.id && r.athleteId === o.athlete.id && r.locked);
    return {
      item: i + 1,
      lot: o.athlete.lotNumber,
      name: o.athlete.name,
      athleteId: o.athlete.id,
      result: done && sr ? sr.displayScore : '',
      points: done && sr ? fmtPts(sr.points) : '',
      status: isLive ? 'live' : locked ? 'locked' : done ? 'scored' : '',
    };
  });
  // on deck: the next two unscored, not live, in running order
  const onDeck: Athlete[] = [];
  let seenLive = runPosition === 0;
  for (const p of parts) {
    if (p.status === 'live') { seenLive = true; continue; }
    if (!seenLive) continue;
    if (p.status === '' && onDeck.length < 2) {
      const a = divAth.find((x) => x.id === p.athleteId);
      if (a) onDeck.push(a);
    }
  }
  for (const p of parts) if (onDeck.some((a) => a.id === p.athleteId)) p.status = 'on deck';

  const mine = athlete ? state.results.find((r) => r.eventId === event.id && r.athleteId === athlete.id) : undefined;
  const mySr = athlete ? byAth.get(athlete.id) : undefined;
  const scoredNow = !!athlete && hasResult(athlete.id) && !!mySr;
  const target = describeSetup(event, division.id);
  const mark = scoredNow
    ? { value: mySr!.displayScore, cap: mine?.locked ? 'Result · locked' : 'Result', pen: true }
    : { value: target === '—' ? eventSpec(event, division.id) : target, cap: 'Target', pen: false };
  const status = !athlete ? 'Idle' : scoredNow ? 'Scored' : 'On platform';

  // the ladder: rising-bar attempts when the event has them, else the per-division spec
  let ladder: SheetAModel['ladder'] = [];
  let ladderTitle = 'Divisions on this event';
  if (event.scoringType === 'max_weight' && event.maxFormat === 'rising_bar' && event.risingBarWeights?.length) {
    ladderTitle = 'Rising bar';
    ladder = event.risingBarWeights.map((w) => {
      const st = mine?.risingBarAttempts?.[String(w)];
      return { label: `${w} lb`, value: st === 'good' ? 'Good' : st === 'fail' ? 'No lift' : st === 'pass' ? 'Pass' : 'Pending', state: st === 'good' ? 'good' : st === 'fail' ? 'fail' : st === 'pass' ? 'pass' : 'pending' };
    });
  } else {
    ladder = state.divisions.filter((d) => d.flight === station.id).map((d) => ({ label: d.name, value: eventSpec(event, d.id) || '—', state: 'spec' as const }));
  }

  const next = nextEventOnStation(station, state.events, event.id) ?? null;
  return {
    station, division, event,
    eventIndex: Math.max(1, stationPosition(station, state.events, event.id)),
    eventCount: onStation.length,
    spec: eventSpec(event, division.id),
    athlete, lane2, mark, status, ladder, ladderTitle, parts, runPosition, onDeck, next,
    nextSpec: next ? eventSpec(next, division.id) : '',
    rev: revFor(state.results, divAth),
  };
}

function resultFilled(r: Result): boolean {
  return r.didNotStart === true || r.reps !== undefined || r.timeSeconds !== undefined || r.distanceFeet !== undefined
    || r.implementsCompleted !== undefined || r.maxWeightLbs !== undefined || !!(r.risingBarAttempts && Object.keys(r.risingBarAttempts).length);
}

/** The slice of the running order Sheet A shows: everything when it fits, else PARTS_MAX rows around the live athlete. */
export function partsWindow(parts: PartsRow[], runPosition: number, max = PARTS_MAX): PartsRow[] {
  if (parts.length <= max) return parts;
  const start = Math.max(0, Math.min(Math.max(0, runPosition - 3), parts.length - max));
  return parts.slice(start, start + max);
}

export function fmtPts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export type CardRow = {
  place: number;
  tied: boolean;
  lot: number;
  name: string;
  athleteId: string;
  withdrawn: boolean;
  cells: { points: string; display: string; win: boolean; empty: boolean }[];   // one per event column
  total: string;
};

export type SheetBPage = {
  division: Division;
  events: EventDef[];           // the columns, in meet order
  liveEventId: string | null;
  liveAthleteIds: string[];
  rows: CardRow[];
  from: number;                 // 1-based item numbers on this page
  to: number;
  count: number;
  page: number;                 // 1-based
  pages: number;
  afterEvent: EventDef | null;  // last event with any score in this division
  rev: string;
};

export function buildSheetB(state: AppState, live: LiveStateRow[], division: Division, pageSize = PAGE_SIZE): SheetBPage[] {
  const divAth = state.athletes.filter((a) => a.divisionId === division.id);
  if (divAth.length === 0) return [];
  const events = [...state.events].sort((a, b) => a.eventNumber - b.eventNumber);
  const standings: StandingRow[] = calculateDivisionStandings(division, divAth, events, state.results, state.meet.tiebreakerRule);
  const st = live.find((l) => l.station === division.flight);
  const liveEventId = st?.current_division_id === division.id ? st.current_event_id : null;
  const liveAthleteIds = st?.current_division_id === division.id ? [st.current_athlete_id, st.lane2_athlete_id].filter((x): x is string => !!x) : [];
  const divIds = new Set(divAth.map((a) => a.id));
  const scoredEvents = events.filter((e) => state.results.some((r) => r.eventId === e.id && divIds.has(r.athleteId)));
  const afterEvent = scoredEvents[scoredEvents.length - 1] ?? null;
  const winners = new Map<string, Set<string>>();
  for (const e of scoredEvents) {
    const top = scoreSingleEvent(e, divAth, state.results, events).filter((r) => r.place === 1 && !r.isZero).map((r) => r.athleteId);
    winners.set(e.id, new Set(top));
  }
  const rows: CardRow[] = standings.map((s) => {
    const a = divAth.find((x) => x.id === s.athleteId);
    return {
      place: s.overallPlace,
      tied: !!s.isTiedOverall,
      lot: a?.lotNumber ?? 0,
      name: s.athleteName,
      athleteId: s.athleteId,
      withdrawn: s.status === 'withdrawn',
      cells: events.map((e) => {
        const b = s.eventBreakdown[e.id];
        const has = !!b && state.results.some((r) => r.eventId === e.id && r.athleteId === s.athleteId);
        return { points: has ? fmtPts(b.points) : '', display: has ? b.display : '', win: has && (winners.get(e.id)?.has(s.athleteId) ?? false), empty: !has };
      }),
      total: events.some((e) => state.results.some((r) => r.eventId === e.id && r.athleteId === s.athleteId)) ? fmtPts(s.totalPoints) : '',
    };
  });
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const rev = revFor(state.results, divAth);
  return Array.from({ length: pages }, (_, i) => ({
    division, events, liveEventId, liveAthleteIds,
    rows: rows.slice(i * pageSize, (i + 1) * pageSize),
    from: i * pageSize + 1,
    to: Math.min(rows.length, (i + 1) * pageSize),
    count: rows.length,
    page: i + 1,
    pages,
    afterEvent, rev,
  }));
}

/** Every page of every division the TV should cycle through (one division asked for, or all of them). */
export function buildCardPages(state: AppState, live: LiveStateRow[], divisionId: string | null, pageSize = PAGE_SIZE): SheetBPage[] {
  const liveDiv = new Set(live.filter((l) => l.current_event_id).map((l) => l.current_division_id));
  // live divisions first (the board opens on what is happening), then meet order
  const divs = divisionId
    ? state.divisions.filter((d) => d.id === divisionId)
    : [...state.divisions].sort((a, b) => Number(liveDiv.has(b.id)) - Number(liveDiv.has(a.id)) || a.sortOrder - b.sortOrder);
  return divs.flatMap((d) => buildSheetB(state, live, d, pageSize));
}

export type IdleModel = {
  schedule: { event: EventDef; divisions: string[]; spec: string }[];
  stations: Station[];
  rev: string;
};

export function buildIdle(state: AppState): IdleModel {
  const events = [...state.events].sort((a, b) => a.eventNumber - b.eventNumber);
  return {
    schedule: events.map((e) => {
      const divs = state.divisions.filter((d) => e.divisionWeights?.[d.id] !== undefined || Object.keys(e.divisionWeights ?? {}).length === 0);
      const first = divs[0] ?? state.divisions[0];
      return { event: e, divisions: divs.map((d) => d.name), spec: first ? eventSpec(e, first.id) : '' };
    }),
    stations: defaultStations(state),
    rev: revFor(state.results),
  };
}

export function venueLine(v: { facilityName?: string; city?: string; state?: string } | null | undefined): string {
  if (!v) return '—';
  const place = [v.city, v.state].filter(Boolean).join(' ');
  return [v.facilityName, place].filter(Boolean).join(', ') || '—';
}
