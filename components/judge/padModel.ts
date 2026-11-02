// UI transition Phase 4 (11/2): the judge pad's pure model. Everything the pad derives from a result, the
// clock and the sync status lives here so it can be unit-tested without React (test/pad.test.mjs).
//
// The attempt log is the judge's tape: one entry per GOOD / NO LIFT press (plus the weight for rising-bar
// events). It rides on the result as `attemptLog` (results sync as a JSON payload, so no mapping or SQL
// changes). The engine never reads it: reps, implementsCompleted, splitTimeSeconds and risingBarAttempts
// stay the scored fields and are recomputed from the log on every press, so an old phone without the log
// and a new one agree on the score.
import type { EventDef, Result, RisingBarStatus, ScoringType } from '@/lib/types';

export type AttemptKind = 'good' | 'no';
export type AttemptEntry = { kind: AttemptKind; at: number; split?: number; weight?: number };

export type SyncState = 'off' | 'idle' | 'syncing' | 'offline' | 'error';
export type SyncStatus = { state: SyncState; pending: number; lastSyncAt: number | null; error: string | null };

export const IMPLEMENT_DEFAULT = 5;

/** mm:ss.d, like the mockup's 00:42.6. Negative or NaN reads as zero. */
export function formatClock(seconds: number): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  const tenths = Math.floor(rem * 10) / 10;
  return `${String(m).padStart(2, '0')}:${tenths.toFixed(1).padStart(4, '0')}`;
}

/** Split or finish stamp, two decimals, as the engine prints them. */
export function formatSeconds(seconds: number | undefined): string {
  return seconds === undefined || seconds === null || !Number.isFinite(seconds) ? '' : `${Number(seconds).toFixed(2)} s`;
}

export type ClockWord = 'ready' | 'running' | 'stopped' | 'over';
export function clockWord(elapsed: number, running: boolean, capSeconds: number): ClockWord {
  if (capSeconds > 0 && elapsed >= capSeconds) return 'over';
  if (running) return 'running';
  return elapsed > 0 ? 'stopped' : 'ready';
}

// ---------- attempt log ----------

export function logOf(r: Partial<Result> | undefined): AttemptEntry[] {
  const log = (r as { attemptLog?: unknown } | undefined)?.attemptLog;
  return Array.isArray(log) ? (log as AttemptEntry[]) : [];
}

export type StoneRow = { n: number; state: 'good' | 'no' | 'pending'; split?: number; misses: number };

/** Stones 1..count from the log: a good press completes the current stone, a no-lift press is a miss on it. */
export function stoneRows(log: AttemptEntry[], count: number): StoneRow[] {
  const rows: StoneRow[] = Array.from({ length: Math.max(1, count) }, (_, i) => ({ n: i + 1, state: 'pending', misses: 0 }));
  let idx = 0;
  for (const e of log) {
    if (idx >= rows.length) break;
    if (e.kind === 'good') {
      rows[idx] = { ...rows[idx], state: 'good', split: e.split };
      idx += 1;
    } else {
      rows[idx] = { ...rows[idx], state: 'no', misses: rows[idx].misses + 1 };
    }
  }
  return rows;
}

/** Scored fields the engine reads, recomputed from the log for a stones / medley event. */
export function implementsFromLog(log: AttemptEntry[]): { implementsCompleted: number; splitTimeSeconds: number | undefined } {
  const goods = log.filter((e) => e.kind === 'good');
  const last = goods[goods.length - 1];
  return { implementsCompleted: goods.length, splitTimeSeconds: last?.split };
}

/** Reps and no-reps from the log. */
export function repsFromLog(log: AttemptEntry[]): { reps: number; noReps: number } {
  let reps = 0, noReps = 0;
  for (const e of log) (e.kind === 'good' ? reps++ : noReps++);
  return { reps, noReps };
}

/** Rising bar: the weight the next press scores. The tapped weight if any, else the lowest weight still pending. */
export function currentBarWeight(weights: number[], attempts: Record<string, RisingBarStatus> | undefined, picked: number | null): number | null {
  if (picked !== null && weights.includes(picked)) return picked;
  const w = weights.find((x) => !attempts?.[x] || attempts[x] === 'pending');
  return w ?? null;
}

/** Best good weight on the bar, else the typed override, else 0. */
export function bestWeight(r: Partial<Result>): number {
  const goods = Object.entries(r.risingBarAttempts ?? {}).filter(([, st]) => st === 'good').map(([w]) => Number(w));
  const best = goods.length ? Math.max(...goods) : 0;
  return Math.max(best, r.maxWeightLbs ?? 0);
}

/** Press GOOD / NO LIFT on a result: returns the patch to save. `split` is the clock at the press. */
export function pressPatch(ev: Pick<EventDef, 'scoringType' | 'implementCount' | 'risingBarWeights'>, r: Partial<Result>, kind: AttemptKind, split: number, weight: number | null = null): Partial<Result> {
  const at = Date.now();
  switch (ev.scoringType) {
    case 'time_or_implements': {
      const count = ev.implementCount || IMPLEMENT_DEFAULT;
      const log = logOf(r);
      const done = implementsFromLog(log).implementsCompleted;
      if (kind === 'good' && done >= count) return {};
      const next = [...log, { kind, at, split }];
      return { attemptLog: next, ...implementsFromLog(next), didNotStart: false } as Partial<Result>;
    }
    case 'reps': {
      const next = [...logOf(r), { kind, at }];
      return { attemptLog: next, reps: repsFromLog(next).reps, didNotStart: false } as Partial<Result>;
    }
    case 'max_weight': {
      if (weight === null) return {};
      const next = [...logOf(r), { kind, at, weight }];
      return {
        attemptLog: next,
        risingBarAttempts: { ...(r.risingBarAttempts ?? {}), [weight]: kind === 'good' ? 'good' : 'fail' },
        didNotStart: false,
      } as Partial<Result>;
    }
    case 'time_or_distance':
      // good = finish at the clock; no = DNF (time cleared, distance decides)
      return kind === 'good' ? { timeSeconds: split, didNotStart: false } : { timeSeconds: 0, didNotStart: false };
    default:
      return {};
  }
}

/** Undo the last press. Results written by an older pad (no log) step the count down instead. */
export function undoPatch(ev: Pick<EventDef, 'scoringType'>, r: Partial<Result>): Partial<Result> {
  const log = logOf(r);
  switch (ev.scoringType) {
    case 'time_or_implements': {
      if (log.length === 0) return { implementsCompleted: Math.max(0, (r.implementsCompleted ?? 0) - 1) };
      const next = log.slice(0, -1);
      return { attemptLog: next, ...implementsFromLog(next) } as Partial<Result>;
    }
    case 'reps': {
      if (log.length === 0) return { reps: Math.max(0, (r.reps ?? 0) - 1) };
      const next = log.slice(0, -1);
      return { attemptLog: next, reps: repsFromLog(next).reps } as Partial<Result>;
    }
    case 'max_weight': {
      const last = log[log.length - 1];
      if (!last || last.weight === undefined) return {};
      const attempts = { ...(r.risingBarAttempts ?? {}) };
      delete attempts[last.weight];
      return { attemptLog: log.slice(0, -1), risingBarAttempts: attempts } as Partial<Result>;
    }
    case 'time_or_distance':
      return { timeSeconds: 0 };
    default:
      return {};
  }
}

/** Is there anything on this result the judge could undo? */
export function canUndo(ev: Pick<EventDef, 'scoringType'>, r: Partial<Result>): boolean {
  if (logOf(r).length > 0) return true;
  switch (ev.scoringType) {
    case 'time_or_implements': return (r.implementsCompleted ?? 0) > 0;
    case 'reps': return (r.reps ?? 0) > 0;
    case 'time_or_distance': return (r.timeSeconds ?? 0) > 0;
    default: return false;
  }
}

/** Has the judge recorded anything for this athlete yet (drives the between-athletes order table)? */
export function hasEntry(r: Partial<Result>): boolean {
  return logOf(r).length > 0 || (r.reps ?? 0) > 0 || (r.implementsCompleted ?? 0) > 0 || (r.timeSeconds ?? 0) > 0
    || (r.distanceFeet ?? 0) > 0 || (r.maxWeightLbs ?? 0) > 0 || Object.keys(r.risingBarAttempts ?? {}).length > 0
    || !!r.didNotStart || !!r.locked;
}

// ---------- labels ----------

export type KeyLabels = { good: string; no: string; qtyCap: string };
export function keyLabels(type: ScoringType): KeyLabels {
  switch (type) {
    case 'reps': return { good: 'Good rep', no: 'No rep', qtyCap: 'reps' };
    case 'max_weight': return { good: 'Good lift', no: 'No lift', qtyCap: 'best' };
    case 'time_or_distance': return { good: 'Finish', no: 'DNF', qtyCap: 'finish' };
    case 'time_or_implements':
    default: return { good: 'Good lift', no: 'No lift', qtyCap: 'stones' };
  }
}

/** The SYNC cell. Filled square = live, hollow = not; never a colour. */
export function syncLabel(enabled: boolean, status: SyncStatus | undefined): { filled: boolean; text: string } {
  if (!enabled || !status) return { filled: false, text: 'Local' };
  const n = status.pending > 0 ? ` ${status.pending}` : '';
  switch (status.state) {
    case 'idle': return { filled: true, text: `Live${n}` };
    case 'syncing': return { filled: true, text: `Syncing${n}` };
    case 'offline': return { filled: false, text: `Offline${n}` };
    case 'error': return { filled: false, text: `Error${n}` };
    default: return { filled: false, text: 'Not linked' };
  }
}

/** hh:mm for the locked stamp and the offline notice. */
export function clockTime(ms: number | null | undefined): string {
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
