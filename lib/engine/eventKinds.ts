// Event kinds (11/11, scoring audit vs Iron Podium items 1, 2, 3, 5): one place for the scoring-type list, its labels
// and the per-event words the standings, the judge pad, the setup sheet and the public pages all print. Pure.
import type { EventDef, MaxTiebreak, ScoringType } from '../types';

export const SCORING_TYPES: readonly ScoringType[] = ['reps', 'max_weight', 'time_or_distance', 'time_or_implements', 'max_time'];

export function isScoringType(v: unknown): v is ScoringType {
  return typeof v === 'string' && (SCORING_TYPES as readonly string[]).includes(v);
}

/** Unknown or legacy values read as 'reps', the way meetBuilder always has. */
export function normalizeScoringType(v: unknown): ScoringType {
  return isScoringType(v) ? v : 'reps';
}

export function normalizeMaxTiebreak(v: unknown): MaxTiebreak | undefined {
  return v === 'attempts' ? 'attempts' : v === 'none' ? 'none' : undefined;
}

export const IMPLEMENT_LABEL_DEFAULT = 'impl';
export const IMPLEMENT_LABEL_MAX = 12;

/** Trimmed, control characters out, 1..12 characters; anything else = absent (the default word). */
export function normalizeImplementLabel(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!s || s.length > IMPLEMENT_LABEL_MAX) return undefined;
  return s === IMPLEMENT_LABEL_DEFAULT ? undefined : s;
}

type KindBits = Pick<EventDef, 'scoringType'> & Partial<Pick<EventDef, 'maxFormat' | 'maxTiebreak' | 'distanceOnly' | 'implementLabel'>>;

/** The word for one implement on a stones / medley event: "impl" unless the promoter named it. */
export function implementWord(ev: KindBits): string {
  return normalizeImplementLabel(ev.implementLabel) ?? IMPLEMENT_LABEL_DEFAULT;
}

/** Does the time cap decide anything on this event? Holds and max-distance events ignore the clock. */
export function usesTimeCap(ev: KindBits): boolean {
  if (ev.scoringType === 'max_time') return false;
  if (ev.scoringType === 'time_or_distance' && ev.distanceOnly) return false;
  return true;
}

export type LabelStyle = 'short' | 'long' | 'setup';

const SHORT: Record<ScoringType, string> = {
  reps: 'Reps', max_weight: 'Max weight', time_or_distance: 'Time or distance', time_or_implements: 'Time or implements', max_time: 'Max time',
};
const LONG: Record<ScoringType, string> = {
  reps: 'Most Reps',
  max_weight: 'Max Weight',
  time_or_distance: 'Fastest Time / Distance if Capped',
  time_or_implements: 'Implements + Time / Split Tiebreaker',
  max_time: 'Longest Hold',
};
const SETUP: Record<ScoringType, string> = {
  reps: 'Reps', max_weight: 'Max Wt', time_or_distance: 'Time / Dist', time_or_implements: 'Stones / Impl', max_time: 'Hold',
};

/** Human label for how an event scores, aware of the per-event variants the plain type name hides. */
export function scoringTypeLabel(ev: KindBits, style: LabelStyle = 'short'): string {
  const t = ev.scoringType;
  if (t === 'time_or_distance' && ev.distanceOnly) {
    return style === 'long' ? 'Furthest Distance' : style === 'setup' ? 'Max Dist' : 'Max distance';
  }
  if (t === 'max_weight' && ev.maxFormat === 'rising_bar') {
    return style === 'long' ? 'Max Weight (Rising Bar)' : style === 'setup' ? 'Rising Bar' : 'Max weight (rising bar)';
  }
  if (t === 'time_or_implements' && ev.implementLabel) {
    const w = implementWord(ev);
    const cap = w.charAt(0).toUpperCase() + w.slice(1);
    return style === 'long' ? `${cap} + Time / Split Tiebreaker` : style === 'setup' ? cap : `Time or ${w}`;
  }
  const table = style === 'long' ? LONG : style === 'setup' ? SETUP : SHORT;
  return table[t] ?? 'Scored';
}

/** One-line rule text for the public pages and the setup help. */
export function scoringRuleText(ev: KindBits): string {
  switch (ev.scoringType) {
    case 'reps': return 'Most reps inside the time cap.';
    case 'max_weight':
      return ev.maxTiebreak === 'attempts'
        ? 'Heaviest good lift; a tie goes to the athlete who made it on an earlier attempt (Wessels rule).'
        : 'Heaviest good lift; ties split the points.';
    case 'time_or_distance':
      return ev.distanceOnly ? 'Furthest mark wins; no finish time.' : 'Fastest finish; anyone who does not finish is ranked by distance.';
    case 'time_or_implements': {
      const w = implementWord(ev);
      return `All ${w} in the fastest time; fewer ${w} rank by count, then by the split on the last one.`;
    }
    case 'max_time': return 'Longest hold wins; the clock stops when the athlete drops.';
    default: return '';
  }
}
