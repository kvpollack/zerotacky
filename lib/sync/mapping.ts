// Pure AppState <-> Supabase row mapping. No I/O. Unit-tested in test/sync.test.mjs.
import type { AppState, Athlete, Division, EventDef, Meet, Result } from '../types';
import { normalizeCollarWeight } from '../engine/plates';

export interface MeetRow {
  id: string; slug: string; name: string; date: string | null; owner_id?: string | null;
  join_code?: string; admin_pin: string | null; run_order_method: string; tiebreaker_rule: string;
  available_plates: number[]; collar_weight_per_pair: number; stations: { id: string; label: string; eventOrder?: string[] }[];
  is_demo: boolean;
  updated_at?: string;   // server-side; set by zt_publish_meet, read by pullChanges as the config watermark
}
export interface DivisionRow { id: string; meet_id: string; name: string; flight: string; sort_order: number }
export interface EventRow {
  id: string; meet_id: string; event_number: number; name: string; scoring_type: string;
  time_cap_seconds: number; lanes: number; loading_points: number; weight_entry_mode: string;
  implement_empty_weight: number; config: Record<string, unknown>;
}
export interface AthleteRow {
  id: string; meet_id: string; division_id: string; name: string; bodyweight: number | null;
  lot_number: number; status: string; rack_heights: Record<string, string>;
}
export interface ResultRow {
  id: string; meet_id: string; event_id: string; athlete_id: string; payload: Record<string, unknown>;
  locked: boolean; updated_at: string; updated_by: string | null;
  server_at?: string;   // set by the database on every write; the pull watermark (client clocks drift)
}

const EVENT_COLUMNS = new Set([
  'id', 'meetId', 'eventNumber', 'name', 'scoringType', 'timeCapSeconds', 'lanes',
  'loadingPoints', 'weightEntryMode', 'implementEmptyWeight',
]);

// ---------- to rows ----------
export interface PublishExtra {
  slug: string;
  meetId?: string;          // remote uuid; defaults to meet.id (joined devices already hold the uuid)
  stations?: MeetRow['stations'];
  isDemo?: boolean;
  deviceId?: string;
}

export function meetToRow(meet: Meet, extra: PublishExtra): MeetRow {
  return {
    id: extra.meetId ?? meet.id,
    slug: extra.slug,
    name: meet.name,
    date: meet.date || null,
    admin_pin: meet.adminPin || null,   // null = keep the server's PIN (008); a joined phone never holds it
    run_order_method: meet.runOrderMethod,
    tiebreaker_rule: meet.tiebreakerRule,
    available_plates: [...meet.availablePlates],
    collar_weight_per_pair: meet.collarWeightPerPair,
    stations: extra.stations ?? meet.stations ?? [{ id: 'A', label: 'Station 1' }, { id: 'B', label: 'Station 2' }],
    is_demo: extra.isDemo ?? !!meet.isDemo,
  };
}

export function divisionToRow(d: Division, meetId: string = d.meetId): DivisionRow {
  return { id: d.id, meet_id: meetId, name: d.name, flight: d.flight, sort_order: d.sortOrder };
}

export function eventToRow(e: EventDef, meetId: string = e.meetId): EventRow {
  const config: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(e)) if (!EVENT_COLUMNS.has(k) && v !== undefined) config[k] = v;
  return {
    id: e.id, meet_id: meetId, event_number: e.eventNumber, name: e.name, scoring_type: e.scoringType,
    time_cap_seconds: e.timeCapSeconds, lanes: e.lanes, loading_points: e.loadingPoints,
    weight_entry_mode: e.weightEntryMode, implement_empty_weight: e.implementEmptyWeight, config,
  };
}

export function athleteToRow(a: Athlete, meetId: string): AthleteRow {
  return {
    id: a.id, meet_id: meetId, division_id: a.divisionId, name: a.name, bodyweight: a.bodyweight ?? null,
    lot_number: a.lotNumber, status: a.status, rack_heights: a.rackHeights ?? {},
  };
}

export function resultToRow(r: Result, meetId: string, deviceId: string | null = null): ResultRow {
  const { id, eventId, athleteId, locked, updatedAt, ...payload } = r;
  return {
    id, meet_id: meetId, event_id: eventId, athlete_id: athleteId, payload,
    locked: !!locked, updated_at: new Date(updatedAt || Date.now()).toISOString(), updated_by: deviceId,
  };
}

// ---------- from rows ----------
export function rowToMeet(row: MeetRow): Meet {
  return {
    id: row.id, name: row.name, date: row.date ?? '', adminPin: row.admin_pin ?? undefined,
    runOrderMethod: row.run_order_method as Meet['runOrderMethod'],
    tiebreakerRule: row.tiebreaker_rule as Meet['tiebreakerRule'],
    availablePlates: [...row.available_plates].map(Number).sort((a, b) => b - a),
    collarWeightPerPair: Number(row.collar_weight_per_pair),
    slug: row.slug,
    isDemo: !!row.is_demo,
    ...(Array.isArray(row.stations) && row.stations.length > 0
      ? {
          stations: row.stations.map((st) => ({
            id: String(st.id),
            label: String(st.label),
            // per-station event order (10/21); dropping it here would silently reset phones to meet order
            ...(Array.isArray(st.eventOrder) ? { eventOrder: st.eventOrder.filter((x): x is string => typeof x === 'string') } : {}),
          })),
        }
      : {}),
  };
}

export function rowToDivision(row: DivisionRow): Division {
  return { id: row.id, meetId: row.meet_id, name: row.name, flight: row.flight, sortOrder: row.sort_order };
}

export function rowToEvent(row: EventRow): EventDef {
  // PS-09: a string or junk collar value in config is coerced or dropped; absent stays absent (no key), so the legacy
  // meet-level fallback and the preset round-trip tests both hold.
  const config = { ...(row.config as Partial<EventDef>) };
  const collar = normalizeCollarWeight((row.config as Record<string, unknown>).collarWeightPerPair);
  if (collar === undefined) delete config.collarWeightPerPair; else config.collarWeightPerPair = collar;
  return {
    ...config,
    id: row.id, meetId: row.meet_id, eventNumber: row.event_number, name: row.name,
    scoringType: row.scoring_type as EventDef['scoringType'], timeCapSeconds: Number(row.time_cap_seconds),
    lanes: row.lanes, loadingPoints: row.loading_points as EventDef['loadingPoints'],
    weightEntryMode: row.weight_entry_mode as EventDef['weightEntryMode'],
    implementEmptyWeight: Number(row.implement_empty_weight),
    divisionWeights: ((row.config as Partial<EventDef>).divisionWeights ?? {}) as Record<string, number>,
  };
}

export function rowToAthlete(row: AthleteRow): Athlete {
  const a: Athlete = {
    id: row.id, divisionId: row.division_id, name: row.name, lotNumber: row.lot_number,
    status: row.status as Athlete['status'], rackHeights: row.rack_heights ?? {},
  };
  if (row.bodyweight !== null && row.bodyweight !== undefined) a.bodyweight = Number(row.bodyweight);
  return a;
}

export function rowToResult(row: ResultRow): Result {
  return {
    ...(row.payload as Partial<Result>),
    id: row.id, eventId: row.event_id, athleteId: row.athlete_id,
    ...(row.locked ? { locked: true } : {}),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export function stateToRows(state: AppState, extra: PublishExtra) {
  const meetId = extra.meetId ?? state.meet.id;
  return {
    meet: meetToRow(state.meet, { ...extra, meetId }),
    divisions: state.divisions.map((d) => divisionToRow(d, meetId)),
    events: state.events.map((e) => eventToRow(e, meetId)),
    athletes: state.athletes.map((a) => athleteToRow(a, meetId)),
    results: state.results.map((r) => resultToRow(r, meetId, extra.deviceId ?? null)),
  };
}

export function rowsToState(rows: { meet: MeetRow; divisions: DivisionRow[]; events: EventRow[]; athletes: AthleteRow[]; results: ResultRow[] }): AppState {
  return {
    meet: rowToMeet(rows.meet),
    divisions: rows.divisions.map(rowToDivision).sort((a, b) => a.sortOrder - b.sortOrder),
    events: rows.events.map(rowToEvent).sort((a, b) => a.eventNumber - b.eventNumber),
    athletes: rows.athletes.map(rowToAthlete),
    results: rows.results.map(rowToResult),
  };
}

// Last-writer-wins merge of incoming results into local results. Pure.
export function mergeResults(local: Result[], incoming: Result[]): { merged: Result[]; changed: boolean } {
  const byId = new Map(local.map((r) => [r.id, r]));
  let changed = false;
  for (const inc of incoming) {
    const cur = byId.get(inc.id);
    if (!cur || (inc.updatedAt ?? 0) > (cur.updatedAt ?? 0)) { byId.set(inc.id, inc); changed = true; }
  }
  return { merged: changed ? Array.from(byId.values()) : local, changed };
}
