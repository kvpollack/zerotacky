// Pure, immutable meet builder functions & state normaliser.
// Unit-tested in test/meetBuilder.test.mjs.

import type {
  AppState,
  Athlete,
  AthleteStatus,
  Division,
  EventDef,
  LoadingPoints,
  Meet,
  PitCrewCallout,
  Result,
  ScoringType,
  Station,
  WeightEntryMode,
} from './types';
import { ALL_POSSIBLE_PLATES } from './constants';
import { getInitialSeedState, MEET_PRESETS } from './presets';
import { normalizeEventOrder } from './engine/eventOrder';

export const DEFAULT_STATIONS: Station[] = [
  { id: 'A', label: 'Station 1' },
  { id: 'B', label: 'Station 2' },
];

const DEMO_PRESET_IDS = new Set(MEET_PRESETS.map((p) => p.id));

let idCounter = 0;
function makeId(prefix: string): string {
  const now = Date.now();
  idCounter = (idCounter + 1) % 100000;
  return idCounter === 1 ? `${prefix}-${now}` : `${prefix}-${now}-${idCounter}`;
}

export function slugify(name: string): string {
  const cleaned = String(name ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return cleaned || 'meet';
}

export function createBlankMeet(name: string, date?: string): AppState {
  const trimmedName = String(name ?? '').trim() || 'Untitled Meet';
  const meetDate =
    date !== undefined && String(date).trim() !== ''
      ? String(date).trim()
      : new Date().toISOString().slice(0, 10);
  const id = makeId('meet');

  return {
    meet: {
      id,
      name: trimmedName,
      date: meetDate,
      slug: slugify(trimmedName),
      isDemo: false,
      stations: DEFAULT_STATIONS.map((s) => ({ ...s })),
      runOrderMethod: 'reverse_overall',
      tiebreakerRule: 'event_wins',
      availablePlates: [...ALL_POSSIBLE_PLATES],
      collarWeightPerPair: 0,
      adminPin: '1050',
    },
    divisions: [],
    athletes: [],
    events: [],
    results: [],
  };
}

export function normalizeState(raw: unknown): AppState {
  if (!raw || typeof raw !== 'object') {
    return normalizeState(getInitialSeedState());
  }

  const candidate = raw as Record<string, unknown>;
  const unwrapped =
    candidate.state && typeof candidate.state === 'object'
      ? (candidate.state as Record<string, unknown>)
      : candidate;

  const rawMeet = unwrapped.meet as Record<string, unknown> | undefined;
  if (!rawMeet || typeof rawMeet !== 'object' || typeof rawMeet.name !== 'string') {
    return normalizeState(getInitialSeedState());
  }

  const presetId = typeof rawMeet.presetId === 'string' ? rawMeet.presetId : undefined;
  const isDemo =
    typeof rawMeet.isDemo === 'boolean'
      ? rawMeet.isDemo
      : Boolean(presetId && DEMO_PRESET_IDS.has(presetId));

  const rawStations = Array.isArray(rawMeet.stations) ? rawMeet.stations : [];
  const stations: Station[] =
    rawStations.length > 0
      ? rawStations
          .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
          .map((s, idx) => {
            const id = String(s.id ?? '').trim() || String.fromCharCode(65 + idx);
            // 'Stn 1' was the default label until 10/16; upgrade saved meets so the rename reaches phones.
            const label = (String(s.label ?? '').trim() || `Station ${idx + 1}`).replace(/^Stn (\d+)$/, 'Station $1');
            const rawOrder = Array.isArray(s.eventOrder) ? s.eventOrder.filter((x): x is string => typeof x === 'string') : undefined;
            return rawOrder && rawOrder.length > 0 ? { id, label, eventOrder: rawOrder } : { id, label };
          })
      : DEFAULT_STATIONS.map((s) => ({ ...s }));

  const meetId = String(rawMeet.id ?? '').trim() || makeId('meet');
  const meetName = String(rawMeet.name).trim() || 'Untitled Meet';
  const slug =
    typeof rawMeet.slug === 'string' && rawMeet.slug.trim() !== ''
      ? slugify(rawMeet.slug)
      : slugify(meetName);

  const availablePlates = Array.isArray(rawMeet.availablePlates)
    ? rawMeet.availablePlates
        .map((p) => Number(p))
        .filter((p) => !Number.isNaN(p) && p > 0)
        .sort((a, b) => b - a)
    : [...ALL_POSSIBLE_PLATES];

  const meet: Meet = {
    ...(presetId ? { presetId } : {}),
    id: meetId,
    name: meetName,
    date: typeof rawMeet.date === 'string' ? rawMeet.date : '',
    runOrderMethod:
      rawMeet.runOrderMethod === 'reverse_previous_event' || rawMeet.runOrderMethod === 'lot_order'
        ? rawMeet.runOrderMethod
        : 'reverse_overall',
    tiebreakerRule: rawMeet.tiebreakerRule === 'final_event' ? 'final_event' : 'event_wins',
    availablePlates,
    collarWeightPerPair: Number(rawMeet.collarWeightPerPair) || 0,
    // Absent stays absent (R1, Astra rehearsal 10/17): a phone that joined by code never receives the PIN (007), and
    // filling in '1050' here made useRoleLock compare locally instead of asking the server. createBlankMeet and the
    // presets still start a fresh local meet at '1050'.
    ...(typeof rawMeet.adminPin === 'string' && rawMeet.adminPin.trim() !== '' ? { adminPin: rawMeet.adminPin.trim() } : {}),
    isDemo,
    stations,
    slug,
  };

  const rawDivisions = Array.isArray(unwrapped.divisions) ? unwrapped.divisions : [];
  const divisions: Division[] = rawDivisions
    .filter((d): d is Record<string, unknown> => Boolean(d && typeof d === 'object'))
    .map((d, idx) => ({
      id: String(d.id ?? makeId('div')),
      meetId: String(d.meetId ?? meetId),
      name: String(d.name ?? `Division ${idx + 1}`),
      flight: String(d.flight ?? stations[0]?.id ?? 'A'),
      sortOrder: typeof d.sortOrder === 'number' ? d.sortOrder : idx + 1,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((d, idx) => ({ ...d, sortOrder: idx + 1 }));

  const rawAthletes = Array.isArray(unwrapped.athletes) ? unwrapped.athletes : [];
  const athletes: Athlete[] = rawAthletes
    .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === 'object'))
    .map((a, idx) => {
      const ath: Athlete = {
        id: String(a.id ?? makeId('ath')),
        divisionId: String(a.divisionId ?? divisions[0]?.id ?? ''),
        name: String(a.name ?? `Athlete ${idx + 1}`),
        lotNumber: typeof a.lotNumber === 'number' ? a.lotNumber : idx + 1,
        status: a.status === 'withdrawn' ? 'withdrawn' : 'active',
        rackHeights:
          a.rackHeights && typeof a.rackHeights === 'object'
            ? { ...(a.rackHeights as Record<string, string>) }
            : {},
      };
      if (typeof a.bodyweight === 'number' && !Number.isNaN(a.bodyweight)) {
        ath.bodyweight = a.bodyweight;
      }
      return ath;
    });

  const rawEvents = Array.isArray(unwrapped.events) ? unwrapped.events : [];
  const events: EventDef[] = rawEvents
    .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object'))
    .map((e, idx) => {
      const scoringType: ScoringType =
        e.scoringType === 'max_weight' ||
        e.scoringType === 'time_or_distance' ||
        e.scoringType === 'time_or_implements'
          ? e.scoringType
          : 'reps';

      const loadingPoints: LoadingPoints = [0, 1, 2, 4].includes(Number(e.loadingPoints))
        ? (Number(e.loadingPoints) as LoadingPoints)
        : 2;

      const weightEntryMode: WeightEntryMode =
        loadingPoints === 4 && e.weightEntryMode === 'per_hand' ? 'per_hand' : 'total';

      const ev: EventDef = {
        ...(e as unknown as EventDef),
        id: String(e.id ?? makeId('ev')),
        meetId: String(e.meetId ?? meetId),
        eventNumber: typeof e.eventNumber === 'number' ? e.eventNumber : idx + 1,
        name: String(e.name ?? `Event ${idx + 1}`),
        scoringType,
        timeCapSeconds: Number(e.timeCapSeconds) > 0 ? Number(e.timeCapSeconds) : 60,
        lanes: Number(e.lanes) === 2 ? 2 : 1,
        loadingPoints,
        weightEntryMode,
        implementEmptyWeight: Number(e.implementEmptyWeight) || 0,
        divisionWeights:
          e.divisionWeights && typeof e.divisionWeights === 'object'
            ? { ...(e.divisionWeights as Record<string, number>) }
            : {},
      };

      if (scoringType === 'time_or_implements') {
        ev.implementCount =
          typeof e.implementCount === 'number' && e.implementCount > 0 ? e.implementCount : 5;
      }
      return ev;
    })
    .sort((a, b) => a.eventNumber - b.eventNumber)
    .map((e, idx) => ({ ...e, eventNumber: idx + 1 }));

  // Station event orders are only meaningful against the events we just parsed (10/21).
  meet.stations = syncStationEventOrders(meet.stations ?? [], events);

  const rawResults = Array.isArray(unwrapped.results) ? unwrapped.results : [];
  const results: Result[] = rawResults
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
    .map((r) => ({
      ...(r as unknown as Result),
      id: String(r.id ?? `${r.eventId}_${r.athleteId}`),
      eventId: String(r.eventId ?? ''),
      athleteId: String(r.athleteId ?? ''),
      updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
    }));

  return { meet, divisions, athletes, events, results };
}

// ---------- Stations ----------

// Keep each station's optional event order valid against the current events (10/21). Stations without a custom order,
// or whose order equals the meet order, carry no `eventOrder` key at all.
function syncStationEventOrders(stations: Station[], events: EventDef[]): Station[] {
  return stations.map((s) => {
    const order = normalizeEventOrder(s.eventOrder, events);
    const next: Station = { id: s.id, label: s.label };
    if (order) next.eventOrder = order;
    return next;
  });
}

// Meets that never set stations keep `stations` absent (DEFAULT_STATIONS apply at read time).
function meetWithSyncedStations(meet: Meet, events: EventDef[]): Meet {
  if (!meet.stations) return meet;
  return { ...meet, stations: syncStationEventOrders(meet.stations, events) };
}

export function addStation(
  state: AppState,
  input?: { id?: string; label?: string }
): AppState {
  const existing = state.meet.stations ?? DEFAULT_STATIONS;
  // Astra R-M4 (10/19): a division still pointing at a removed station keeps that dead id, so a new station must not
  // reuse it, or the division would silently land on the new station without the promoter choosing it.
  const usedIds = new Set([...existing.map((s) => s.id), ...state.divisions.map((d) => d.flight)]);
  let nextId = input?.id?.trim() || '';
  if (!nextId || usedIds.has(nextId)) {
    let code = 65; // 'A'
    while (usedIds.has(String.fromCharCode(code))) code++;
    nextId = String.fromCharCode(code);
  }
  const nextLabel = input?.label?.trim() || `Station ${existing.length + 1}`;
  const stations = [...existing.map((s) => ({ ...s })), { id: nextId, label: nextLabel }];
  return { ...state, meet: { ...state.meet, stations } };
}

export function updateStation(
  state: AppState,
  stationId: string,
  patch: { label?: string; eventOrder?: string[] | null }
): AppState {
  const existing = state.meet.stations ?? DEFAULT_STATIONS;
  const stations = existing.map((s) => {
    if (s.id !== stationId) return { ...s };
    const next: Station = { ...s };
    if (patch.label !== undefined) next.label = patch.label;
    if ('eventOrder' in patch) {
      // null or a meet-order list clears the override; anything else is normalised against the current events.
      const order = normalizeEventOrder(patch.eventOrder ?? undefined, state.events);
      if (order) next.eventOrder = order;
      else delete next.eventOrder;
    }
    return next;
  });
  return { ...state, meet: { ...state.meet, stations } };
}

export function removeStation(state: AppState, stationId: string): AppState {
  const existing = state.meet.stations ?? DEFAULT_STATIONS;
  if (existing.length <= 1) return state;
  const nextStations = existing.filter((s) => s.id !== stationId).map((s) => ({ ...s }));
  if (nextStations.length === 0 || nextStations.length === existing.length) return state;
  return { ...state, meet: { ...state.meet, stations: nextStations } };
}

// ---------- Divisions ----------

export function addDivision(
  state: AppState,
  input: { id?: string; name: string; flight?: string }
): AppState {
  const trimmedName = String(input.name ?? '').trim() || `Division ${state.divisions.length + 1}`;
  const defaultStation = state.meet.stations?.[0]?.id ?? 'A';
  const flight = String(input.flight ?? '').trim() || defaultStation;
  const div: Division = {
    id: input.id?.trim() || makeId('div'),
    meetId: state.meet.id,
    name: trimmedName,
    flight,
    sortOrder: state.divisions.length + 1,
  };
  return {
    ...state,
    divisions: [...state.divisions, div],
  };
}

export function updateDivision(
  state: AppState,
  divisionId: string,
  patch: Partial<Pick<Division, 'name' | 'flight' | 'sortOrder'>>
): AppState {
  if (!state.divisions.some((d) => d.id === divisionId)) return state;
  const divisions = state.divisions.map((d) => {
    if (d.id !== divisionId) return d;
    return {
      ...d,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.flight !== undefined ? { flight: patch.flight } : {}),
      ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
    };
  });
  return { ...state, divisions };
}

function omitKey<T extends Record<string, unknown> | undefined>(
  map: T,
  keyToRemove: string
): T {
  if (!map || typeof map !== 'object') return map;
  const next: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(map)) {
    if (k !== keyToRemove) next[k] = v;
  }
  return next as T;
}

export function removeDivision(state: AppState, divisionId: string): AppState {
  if (!state.divisions.some((d) => d.id === divisionId)) return state;

  const divisions = state.divisions
    .filter((d) => d.id !== divisionId)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((d, idx) => ({ ...d, sortOrder: idx + 1 }));

  const removedAthleteIds = new Set(
    state.athletes.filter((a) => a.divisionId === divisionId).map((a) => a.id)
  );
  const athletes = state.athletes.filter((a) => a.divisionId !== divisionId);
  const results = state.results.filter((r) => !removedAthleteIds.has(r.athleteId));

  const events = state.events.map((ev) => {
    const updated: EventDef = {
      ...ev,
      divisionWeights: omitKey(ev.divisionWeights, divisionId) ?? {},
    };
    if (ev.divisionLightWeights) {
      updated.divisionLightWeights = omitKey(ev.divisionLightWeights, divisionId);
    }
    if (ev.divisionDefaultHeights) {
      updated.divisionDefaultHeights = omitKey(ev.divisionDefaultHeights, divisionId);
    }
    if (ev.pitCrewCallout?.byDivision) {
      updated.pitCrewCallout = {
        ...ev.pitCrewCallout,
        byDivision: omitKey(ev.pitCrewCallout.byDivision, divisionId) ?? {},
      };
    }
    return updated;
  });

  return {
    ...state,
    divisions,
    athletes,
    events,
    results,
  };
}

export function reorderDivisions(state: AppState, orderedIds: string[]): AppState {
  const byId = new Map(state.divisions.map((d) => [d.id, d]));
  const seen = new Set<string>();
  const reordered: Division[] = [];

  for (const id of orderedIds) {
    const div = byId.get(id);
    if (div && !seen.has(id)) {
      reordered.push(div);
      seen.add(id);
    }
  }
  for (const div of state.divisions) {
    if (!seen.has(div.id)) {
      reordered.push(div);
      seen.add(div.id);
    }
  }

  return {
    ...state,
    divisions: reordered.map((d, idx) => ({ ...d, sortOrder: idx + 1 })),
  };
}

// ---------- Events ----------

function sanitizeEventFields(
  base: EventDef,
  patch: Partial<EventDef>
): EventDef {
  const merged: EventDef = { ...base, ...patch };
  const loadingPoints: LoadingPoints = [0, 1, 2, 4].includes(Number(merged.loadingPoints))
    ? (Number(merged.loadingPoints) as LoadingPoints)
    : 2;
  const weightEntryMode: WeightEntryMode =
    loadingPoints === 4 && merged.weightEntryMode === 'per_hand' ? 'per_hand' : 'total';

  const result: EventDef = {
    ...merged,
    loadingPoints,
    weightEntryMode,
    lanes: Number(merged.lanes) === 2 ? 2 : 1,
    timeCapSeconds: Number(merged.timeCapSeconds) > 0 ? Number(merged.timeCapSeconds) : 60,
    implementEmptyWeight: Number(merged.implementEmptyWeight) || 0,
    divisionWeights: { ...(merged.divisionWeights ?? {}) },
  };

  if (result.scoringType === 'time_or_implements') {
    result.implementCount =
      typeof result.implementCount === 'number' && result.implementCount > 0
        ? Math.round(result.implementCount)
        : 5;
  }

  // The patch's byDivision is authoritative (a division left out is cleared); only carry forward the
  // previous stats for divisions the patch keeps, so editing a headline does not drop its stat chips.
  if (patch.pitCrewCallout && base.pitCrewCallout?.byDivision) {
    const mergedByDiv: PitCrewCallout['byDivision'] = {};
    for (const [divId, nextEntry] of Object.entries(patch.pitCrewCallout.byDivision ?? {})) {
      if (!nextEntry) continue;
      const prevEntry = base.pitCrewCallout.byDivision[divId];
      mergedByDiv[divId] = {
        ...(prevEntry?.stats ? { stats: prevEntry.stats } : {}),
        ...nextEntry,
      };
    }
    result.pitCrewCallout = {
      title: patch.pitCrewCallout.title ?? base.pitCrewCallout.title ?? '',
      byDivision: mergedByDiv,
    };
  }

  return result;
}

export function addEvent(
  state: AppState,
  input: Partial<EventDef> & { name: string; scoringType?: ScoringType }
): AppState {
  const eventNumber = state.events.length + 1;
  const scoringType: ScoringType = input.scoringType ?? 'reps';
  const defaultWeights: Record<string, number> = {};
  for (const div of state.divisions) {
    defaultWeights[div.id] = Number(input.divisionWeights?.[div.id]) || 0;
  }

  const base: EventDef = {
    id: input.id?.trim() || makeId('ev'),
    meetId: state.meet.id,
    eventNumber,
    name: String(input.name ?? '').trim() || `Event ${eventNumber}`,
    scoringType,
    timeCapSeconds: 60,
    lanes: 1,
    loadingPoints: scoringType === 'time_or_implements' ? 0 : 2,
    weightEntryMode: 'total',
    implementEmptyWeight: 0,
    divisionWeights: defaultWeights,
    hasTrumpWeight: false,
  };

  const created = sanitizeEventFields(base, {
    ...input,
    id: base.id,
    meetId: state.meet.id,
    eventNumber,
    name: base.name,
    divisionWeights: { ...defaultWeights, ...(input.divisionWeights ?? {}) },
  });

  const events = [...state.events, created];
  return {
    ...state,
    meet: meetWithSyncedStations(state.meet, events),
    events,
  };
}

export function updateEvent(
  state: AppState,
  eventId: string,
  patch: Partial<EventDef>
): AppState {
  if (!state.events.some((e) => e.id === eventId)) return state;
  const events = state.events.map((ev) =>
    ev.id === eventId
      ? sanitizeEventFields(ev, { ...patch, id: ev.id, meetId: ev.meetId, eventNumber: ev.eventNumber })
      : ev
  );
  return { ...state, events };
}

export function removeEvent(state: AppState, eventId: string): AppState {
  if (!state.events.some((e) => e.id === eventId)) return state;

  const events = state.events
    .filter((e) => e.id !== eventId)
    .sort((a, b) => a.eventNumber - b.eventNumber)
    .map((e, idx) => ({ ...e, eventNumber: idx + 1 }));

  const results = state.results.filter((r) => r.eventId !== eventId);

  const athletes = state.athletes.map((a) => {
    if (!a.rackHeights || !(eventId in a.rackHeights)) return a;
    return {
      ...a,
      rackHeights: omitKey(a.rackHeights, eventId) ?? {},
    };
  });

  return {
    ...state,
    meet: meetWithSyncedStations(state.meet, events),
    events,
    results,
    athletes,
  };
}

export function reorderEvents(state: AppState, orderedIds: string[]): AppState {
  const byId = new Map(state.events.map((e) => [e.id, e]));
  const seen = new Set<string>();
  const reordered: EventDef[] = [];

  for (const id of orderedIds) {
    const ev = byId.get(id);
    if (ev && !seen.has(id)) {
      reordered.push(ev);
      seen.add(id);
    }
  }
  for (const ev of state.events) {
    if (!seen.has(ev.id)) {
      reordered.push(ev);
      seen.add(ev.id);
    }
  }

  const events = reordered.map((e, idx) => ({ ...e, eventNumber: idx + 1 }));
  return {
    ...state,
    meet: meetWithSyncedStations(state.meet, events),
    events,
  };
}

// ---------- Athletes & Lots ----------

export function addAthlete(
  state: AppState,
  input: {
    id?: string;
    divisionId: string;
    name: string;
    bodyweight?: number;
    lotNumber?: number;
    status?: AthleteStatus;
    rackHeights?: Record<string, string>;
  }
): AppState {
  const trimmedName = String(input.name ?? '').trim();
  if (!trimmedName) return state;

  const divAthletes = state.athletes.filter((a) => a.divisionId === input.divisionId);
  const maxLot = divAthletes.reduce((m, a) => Math.max(m, a.lotNumber || 0), 0);
  const lotNumber =
    input.lotNumber !== undefined && Number(input.lotNumber) > 0
      ? Number(input.lotNumber)
      : maxLot + 1;

  const newAthlete: Athlete = {
    id: input.id?.trim() || makeId('ath'),
    divisionId: input.divisionId,
    name: trimmedName,
    lotNumber,
    status: input.status === 'withdrawn' ? 'withdrawn' : 'active',
    rackHeights: { ...(input.rackHeights ?? {}) },
  };
  if (typeof input.bodyweight === 'number' && !Number.isNaN(input.bodyweight)) {
    newAthlete.bodyweight = input.bodyweight;
  }

  return {
    ...state,
    athletes: [...state.athletes, newAthlete],
  };
}

export function bulkAddAthletes(
  state: AppState,
  divisionId: string,
  namesText: string
): AppState {
  const lines = String(namesText ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let nextState = state;
  for (const name of lines) {
    nextState = addAthlete(nextState, { divisionId, name });
  }
  return nextState;
}

export function updateAthlete(
  state: AppState,
  athleteId: string,
  patch: Partial<Omit<Athlete, 'id'>>
): AppState {
  if (!state.athletes.some((a) => a.id === athleteId)) return state;
  const athletes = state.athletes.map((a) => {
    if (a.id !== athleteId) return a;
    return {
      ...a,
      ...patch,
      id: a.id,
      ...(patch.lotNumber !== undefined ? { lotNumber: Number(patch.lotNumber) || 1 } : {}),
    };
  });
  return { ...state, athletes };
}

export function removeAthlete(state: AppState, athleteId: string): AppState {
  if (!state.athletes.some((a) => a.id === athleteId)) return state;
  return {
    ...state,
    athletes: state.athletes.filter((a) => a.id !== athleteId),
    results: state.results.filter((r) => r.athleteId !== athleteId),
  };
}

export function moveAthlete(
  state: AppState,
  athleteId: string,
  toDivisionId: string
): AppState {
  const targetAth = state.athletes.find((a) => a.id === athleteId);
  if (!targetAth || targetAth.divisionId === toDivisionId) return state;
  if (!state.divisions.some((d) => d.id === toDivisionId)) return state;

  const targetDivAthletes = state.athletes.filter((a) => a.divisionId === toDivisionId);
  const maxLot = targetDivAthletes.reduce((m, a) => Math.max(m, a.lotNumber || 0), 0);
  const nextLot = maxLot + 1;

  const athletes = state.athletes.map((a) =>
    a.id === athleteId ? { ...a, divisionId: toDivisionId, lotNumber: nextLot } : a
  );
  return { ...state, athletes };
}

export function shuffleLots(
  state: AppState,
  divisionId: string,
  rng: () => number = Math.random
): AppState {
  const divAthletes = state.athletes.filter((a) => a.divisionId === divisionId);
  if (divAthletes.length === 0) return state;

  const shuffledIds = divAthletes.map((a) => a.id);
  for (let i = shuffledIds.length - 1; i > 0; i--) {
    const raw = rng();
    const clamped = Math.max(0, Math.min(0.999999999, Number.isFinite(raw) ? raw : 0));
    const j = Math.floor(clamped * (i + 1));
    const tmp = shuffledIds[i];
    shuffledIds[i] = shuffledIds[j];
    shuffledIds[j] = tmp;
  }

  const lotByAthleteId = new Map<string, number>();
  shuffledIds.forEach((id, idx) => {
    lotByAthleteId.set(id, idx + 1);
  });

  const athletes = state.athletes.map((a) =>
    lotByAthleteId.has(a.id) ? { ...a, lotNumber: lotByAthleteId.get(a.id)! } : a
  );
  return { ...state, athletes };
}

// ---------- Validation ----------

export function validateMeet(state: AppState): { ok: boolean; problems: string[] } {
  const problems: string[] = [];

  if (!state.meet?.name || !state.meet.name.trim()) {
    problems.push('Meet name is required.');
  }

  const stations = state.meet?.stations ?? [];
  if (stations.length === 0) {
    problems.push('Meet must have at least one station.');
  }
  const stationIds = new Set(stations.map((s) => s.id));

  if (state.divisions.length === 0) {
    problems.push('Meet has no divisions.');
  }
  if (state.events.length === 0) {
    problems.push('Meet has no events.');
  }
  if (state.athletes.length === 0) {
    problems.push('Meet has no athletes.');
  }

  const sortedDivisions = [...state.divisions].sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedEvents = [...state.events].sort((a, b) => a.eventNumber - b.eventNumber);

  for (const div of sortedDivisions) {
    if (stationIds.size > 0 && !stationIds.has(div.flight)) {
      problems.push(`${div.name} is assigned to unknown station ${div.flight}.`);
    }

    const divAthletes = state.athletes.filter((a) => a.divisionId === div.id);
    const activeAthletes = divAthletes.filter((a) => a.status === 'active');

    if (activeAthletes.length === 0) {
      problems.push(`${div.name} has no athletes`);
    }

    const lotCounts = new Map<number, number>();
    for (const a of activeAthletes) {
      lotCounts.set(a.lotNumber, (lotCounts.get(a.lotNumber) ?? 0) + 1);
    }
    for (const [lot, count] of lotCounts.entries()) {
      if (count === 2) {
        problems.push(`Two athletes in ${div.name} share lot ${lot}`);
      } else if (count > 2) {
        problems.push(`${count} athletes in ${div.name} share lot ${lot}`);
      }
    }
  }

  for (const ev of sortedEvents) {
    if (!(ev.timeCapSeconds > 0)) {
      problems.push(`Event ${ev.eventNumber} (${ev.name}) must have a time cap greater than 0s`);
    }

    const isRisingBar = ev.scoringType === 'max_weight' && ev.maxFormat === 'rising_bar';
    if (isRisingBar) {
      const weights = ev.risingBarWeights ?? [];
      if (weights.length === 0) {
        problems.push(`Event ${ev.eventNumber} is rising bar but has no bar weights`);
      } else {
        const ascending = weights.every(
          (w, idx) => typeof w === 'number' && w > 0 && (idx === 0 || w > weights[idx - 1])
        );
        if (!ascending) {
          problems.push(`Event ${ev.eventNumber} rising bar weights must be ascending positive numbers`);
        }
      }
    }

    if (
      ev.scoringType === 'time_or_implements' &&
      ev.implementCount !== undefined &&
      !(ev.implementCount >= 1)
    ) {
      problems.push(`Event ${ev.eventNumber} must have at least 1 implement`);
    }

    for (const div of sortedDivisions) {
      const rawW = ev.divisionWeights?.[div.id];
      const hasPositiveWeight = typeof rawW === 'number' && !Number.isNaN(rawW) && rawW > 0;
      const hasNonNegativeAddedWeight =
        Boolean(ev.weightIsAddedPlatesOnly) &&
        typeof rawW === 'number' &&
        !Number.isNaN(rawW) &&
        rawW >= 0;
      const hasFixedDesc =
        ev.loadingPoints === 0 &&
        (Boolean(ev.fixedImplementDescription?.trim()) ||
          Boolean(ev.pitCrewCallout?.byDivision?.[div.id]?.headline?.trim()) ||
          ev.scoringType === 'time_or_implements');
      const hasRisingWeights =
        isRisingBar && Array.isArray(ev.risingBarWeights) && ev.risingBarWeights.length > 0;

      if (!hasPositiveWeight && !hasNonNegativeAddedWeight && !hasFixedDesc && !hasRisingWeights) {
        problems.push(`Ev ${ev.eventNumber} has no weight for ${div.name}`);
      }

      if (ev.scoringType === 'reps' && ev.hasTrumpWeight) {
        const lightW = ev.divisionLightWeights?.[div.id];
        if (!(typeof lightW === 'number' && lightW > 0)) {
          problems.push(`Ev ${ev.eventNumber} has no light weight for ${div.name}`);
        }
      }
    }
  }

  return {
    ok: problems.length === 0,
    problems,
  };
}