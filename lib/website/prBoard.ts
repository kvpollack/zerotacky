// Competition bests (feature gaps #9, 11/8). Built from the Final shows on an athlete's history (showHistory.ts), never
// stored: one row per implement, the best competition result on it, and the show it came from. Iron Podium sells a
// version of this as Premium; here it falls out of linked results.
//
// "Best" follows one rule for every scoring type: the heaviest load the athlete completed something at, then the
// performance at that load. Reps: heaviest weight with a rep, then most reps. Max: heaviest weight. Time or distance:
// heaviest weight with a finished course, then fastest; with no finish, the longest distance. Medley: heaviest weight,
// then most implements, then fastest. Events without a listed weight (bodyweight carries, fixed implements) compare on
// performance alone. Two shows at different loads are not the same test, so the row names the load with the result.
//
// 059 session 2: a show's numbers are stored in its own unit. Ranking converts every load and distance to pounds and
// feet first (`toLb` / `toFt`) so a 115 kg log beats a 250 lb one; the printed result keeps the show's unit and adds the
// pound figure beside a metric one, since the board sits next to imperial rows.

import { implementLabel } from '@/lib/events/spec';
import { distanceUnit, mirrorWeightLabel, toFt, toLb, weightUnit } from '@/lib/units';
import type { MeetUnits, ScoringType } from '../types';
import type { HistoryEventResult, ShowHistoryEntry } from './showHistory';
import { formatShowDate } from './showHistory';

export interface CompetitionBest {
  /** Group key: the implement id, or the normalized event name when no implement was set. */
  key: string;
  label: string;
  scoringType: ScoringType;
  /** The unit system of the show the best came from. */
  units: MeetUnits;
  /** The result in that show's unit, e.g. "8 reps at 250 lb", "455 lb", "28.40 s at 600 lb (50 ft)", "115 kg (254 lb)". */
  result: string;
  /** Where it happened. */
  showName: string;
  showHref: string;
  date: string | null;
  dateLabel: string;
  divisionName: string;
  /** How many Final shows contributed to this implement. */
  appearances: number;
}

export function normalizeEventKey(name: string): string {
  return name.toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(for|max|reps?|time|medley|carry|press|lift|pull)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function groupKey(e: HistoryEventResult): { key: string; label: string } {
  if (e.implement && e.implement !== 'other') return { key: `impl:${e.implement}`, label: implementLabel(e.implement) };
  if (e.implement === 'other' && e.implementNote) return { key: `other:${e.implementNote.toLowerCase()}`, label: e.implementNote };
  const norm = normalizeEventKey(e.eventName);
  return { key: `name:${norm || e.eventName.toLowerCase()}`, label: e.eventName };
}

/** Sort tuple: bigger is better, compared lexicographically. Loads in pounds, distances in feet, whatever the show used. */
function rank(e: HistoryEventResult): number[] {
  const w = toLb(e.weightLbs, e.units);
  switch (e.scoringType) {
    case 'max_weight':
      return [toLb(e.maxWeightLbs, e.units)];
    case 'reps':
      return [e.reps > 0 ? w : -1, e.reps];
    case 'time_or_distance':
      return e.finished ? [1, w, -e.timeSeconds] : [0, w, toFt(e.distanceFeet, e.units)];
    case 'time_or_implements':
      return e.finished || e.implementsCompleted > 0 ? [w, e.implementsCompleted, e.finished ? -e.timeSeconds : -Infinity] : [-1];
    case 'max_time':
      return e.timeSeconds > 0 ? [w, e.timeSeconds] : [-1];
    default:
      return [-1];
  }
}

function better(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -Infinity, y = b[i] ?? -Infinity;
    if (x !== y) return x > y;
  }
  return false;
}

export function formatSeconds(s: number): string {
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const rest = s - m * 60;
    return `${m}:${rest < 10 ? '0' : ''}${rest.toFixed(2)}`;
  }
  return `${s.toFixed(2)} s`;
}

const num = (w: number) => (Number.isInteger(w) ? String(w) : w.toFixed(1));
/** "250 lb" on an imperial show; "115 kg (254 lb)" on a metric one. */
function load(w: number, units: MeetUnits): string {
  const mirror = units === 'metric' ? ` (${mirrorWeightLabel(w, units)})` : '';
  return `${num(w)} ${weightUnit(units)}${mirror}`;
}

export function formatBestResult(e: HistoryEventResult): string {
  const u = e.units ?? 'imperial';
  const ft = distanceUnit(u);
  const load_ = e.weightLbs > 0 ? ` at ${load(e.weightLbs, u)}` : '';
  const course = e.courseFeet ? ` (${e.courseFeet} ${ft})` : '';
  switch (e.scoringType) {
    case 'max_weight':
      return load(e.maxWeightLbs, u);
    case 'reps':
      return `${e.reps} rep${e.reps === 1 ? '' : 's'}${load_}`;
    case 'time_or_distance':
      return e.finished ? `${formatSeconds(e.timeSeconds)}${load_}${course}` : `${e.distanceFeet} ${ft}${load_}${course ? ` of ${e.courseFeet}` : ''}`;
    case 'time_or_implements': {
      const n = `${e.implementsCompleted} implement${e.implementsCompleted === 1 ? '' : 's'}`;
      return e.finished ? `${formatSeconds(e.timeSeconds)}${load_}` : `${n}${load_}`;
    }
    case 'max_time':
      return e.timeSeconds > 0 ? `${formatSeconds(e.timeSeconds)} hold${load_}` : '';
    default:
      return '';
  }
}

/** Pure: bests across Final shows, sorted by label. Scratched shows carry no events and add nothing. */
export function competitionBests(history: ShowHistoryEntry[]): CompetitionBest[] {
  const groups = new Map<string, { label: string; best: HistoryEventResult; entry: ShowHistoryEntry; rank: number[]; shows: Set<string> }>();
  for (const entry of history) {
    for (const e of entry.events ?? []) {
      const { key, label } = groupKey(e);
      const r = rank(e);
      if (r[0] === -1) continue;
      const g = groups.get(key);
      if (!g) {
        groups.set(key, { label, best: e, entry, rank: r, shows: new Set([entry.meetId]) });
        continue;
      }
      g.shows.add(entry.meetId);
      // Same rank: keep the newer show (history arrives newest first, so the first seen wins).
      if (better(r, g.rank)) { g.best = e; g.entry = entry; g.rank = r; }
    }
  }
  return [...groups.entries()]
    .map(([key, g]) => ({
      key,
      label: g.label,
      scoringType: g.best.scoringType,
      units: g.best.units ?? 'imperial',
      result: formatBestResult(g.best),
      showName: g.entry.name,
      showHref: g.entry.href,
      date: g.entry.date,
      dateLabel: formatShowDate(g.entry.date),
      divisionName: g.entry.divisionName,
      appearances: g.shows.size,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
