// Where the judge was (Astra DR3-02, 11/3): a reload used to send every phone back to the first station, first
// division, first event and lot 1. The selection is saved per meet so a phone that drops mid-group comes back to
// the same sheet; anything that no longer exists in the meet falls back the old way. Pure, so test/selection.test.mjs
// can drive it without a browser.
import type { Athlete, Division, EventDef, Meet, Result } from './types';
import { stationEvents, stationById } from './engine/eventOrder';

export const SELECTION_KEY = 'ZEROTACKY_SELECTION_V1';

export type ScorerSelection = { meet: string; station: string; division: string; event: string; athlete: string };

type MeetLike = Pick<Meet, 'id' | 'stations'> & { slug?: string | null };
type StateLike = { meet: MeetLike; divisions: Division[]; events: EventDef[]; athletes: Athlete[] };

export function meetKey(meet: MeetLike): string {
  return String(meet.id || meet.slug || '');
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function readSelection(storage: StorageLike | undefined, key: string): ScorerSelection | null {
  if (!storage || !key) return null;
  try {
    const raw = storage.getItem(SELECTION_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Partial<ScorerSelection>;
    if (!j || j.meet !== key) return null;
    return { meet: key, station: String(j.station ?? ''), division: String(j.division ?? ''), event: String(j.event ?? ''), athlete: String(j.athlete ?? '') };
  } catch {
    return null;
  }
}

export function writeSelection(storage: StorageLike | undefined, sel: ScorerSelection): void {
  if (!storage || !sel.meet) return;
  try { storage.setItem(SELECTION_KEY, JSON.stringify(sel)); } catch { /* storage full or blocked: the next load falls back */ }
}

/** The saved selection checked against the current meet. Each part that is missing or stale takes the default the
 *  app used before (first station, first division on it, first event, lot by run order = empty athlete). */
export function restoreSelection(saved: ScorerSelection | null, state: StateLike): Omit<ScorerSelection, 'meet'> {
  const stationIds = (state.meet.stations ?? []).map((s) => s.id);
  const defaultStation = stationIds[0] ?? 'A';
  const station = saved && (saved.station === 'ALL' || stationIds.includes(saved.station)) ? saved.station : defaultStation;
  const onStation = state.divisions.filter((d) => (station === 'ALL' ? true : d.flight === station));
  const divisionPool = onStation.length > 0 ? onStation : state.divisions;
  const division = saved && divisionPool.some((d) => d.id === saved.division) ? saved.division : (divisionPool[0]?.id ?? '');
  const event = saved && state.events.some((e) => e.id === saved.event) ? saved.event : (state.events[0]?.id ?? '');
  const athlete = saved && state.athletes.some((a) => a.id === saved.athlete && a.divisionId === division) ? saved.athlete : '';
  return { station, division, event, athlete };
}

/** Where a judge lands after tapping a station chip (Astra DR2-01 + DR3-12): the earliest unfinished event in the
 *  station's own order, and within it the first division on that station with an unlocked active athlete. Falls
 *  back to the station's first event and first division when everything is locked. */
export function stationLanding(
  meet: MeetLike,
  stationId: string,
  divisions: Division[],
  events: EventDef[],
  athletes: Athlete[],
  results: Result[]
): { divisionId: string; eventId: string } | null {
  const onStation = divisions.filter((d) => (stationId === 'ALL' ? true : d.flight === stationId));
  if (onStation.length === 0) return null;
  const ordered = stationEvents(stationById(meet, stationId), events);
  const locked = new Set(results.filter((r) => r.locked).map((r) => `${r.eventId}|${r.athleteId}`));
  for (const ev of ordered) {
    for (const d of onStation) {
      const open = athletes.some((a) => a.divisionId === d.id && a.status === 'active' && !locked.has(`${ev.id}|${a.id}`));
      if (open) return { divisionId: d.id, eventId: ev.id };
    }
  }
  return { divisionId: onStation[0].id, eventId: ordered[0]?.id ?? '' };
}
