// Competition bests (feature gaps #9, 11/8). Built from the Final shows on an athlete's history (showHistory.ts), never
// stored: one row per implement, the best competition result on it, and the show it came from. Iron Podium sells a
// version of this as Premium; here it falls out of linked results.
//
// "Best" follows one rule for every scoring type: the heaviest load the athlete completed something at, then the
// performance at that load. Reps: heaviest weight with a rep, then most reps. Max: heaviest weight. Time or distance:
// heaviest weight with a finished course, then fastest; with no finish, the longest distance. Medley: heaviest weight,
// then most implements, then fastest. Events without a listed weight (bodyweight carries, fixed implements) compare on
// performance alone. Two shows at different loads are not the same test, so the row names the load with the result.

import { implementLabel } from '@/lib/events/spec';
import type { ScoringType } from '../types';
import type { HistoryEventResult, ShowHistoryEntry } from './showHistory';
import { formatShowDate } from './showHistory';

export interface CompetitionBest {
  /** Group key: the implement id, or the normalized event name when no implement was set. */
  key: string;
  label: string;
  scoringType: ScoringType;
  /** The result, e.g. "8 reps at 250 lb", "455 lb", "28.40 s at 600 lb (50 ft)". */
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

/** Sort tuple: bigger is better, compared lexicographically. */
function rank(e: HistoryEventResult): number[] {
  switch (e.scoringType) {
    case 'max_weight':
      return [e.maxWeightLbs];
    case 'reps':
      return [e.reps > 0 ? e.weightLbs : -1, e.reps];
    case 'time_or_distance':
      return e.finished ? [1, e.weightLbs, -e.timeSeconds] : [0, e.weightLbs, e.distanceFeet];
    case 'time_or_implements':
      return e.finished || e.implementsCompleted > 0 ? [e.weightLbs, e.implementsCompleted, e.finished ? -e.timeSeconds : -Infinity] : [-1];
    case 'max_time':
      return e.timeSeconds > 0 ? [e.weightLbs, e.timeSeconds] : [-1];
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

const lb = (w: number) => `${Number.isInteger(w) ? w : w.toFixed(1)} lb`;

export function formatBestResult(e: HistoryEventResult): string {
  const load = e.weightLbs > 0 ? ` at ${lb(e.weightLbs)}` : '';
  const course = e.courseFeet ? ` (${e.courseFeet} ft)` : '';
  switch (e.scoringType) {
    case 'max_weight':
      return lb(e.maxWeightLbs);
    case 'reps':
      return `${e.reps} rep${e.reps === 1 ? '' : 's'}${load}`;
    case 'time_or_distance':
      return e.finished ? `${formatSeconds(e.timeSeconds)}${load}${course}` : `${e.distanceFeet} ft${load}${course ? ` of ${e.courseFeet}` : ''}`;
    case 'time_or_implements': {
      const n = `${e.implementsCompleted} implement${e.implementsCompleted === 1 ? '' : 's'}`;
      return e.finished ? `${formatSeconds(e.timeSeconds)}${load}` : `${n}${load}`;
    }
    case 'max_time':
      return e.timeSeconds > 0 ? `${formatSeconds(e.timeSeconds)} hold${load}` : '';
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
