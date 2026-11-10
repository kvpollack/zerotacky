// Overall podium tiebreak rules (11/10 scoring audit against Iron Podium, docs/getting_started "Strongman Point
// System"). One list feeds the engine comparator, the meet builder, the scorer sheet and the public labels, so the
// words a promoter picks are the words the standings print.
import type { StandingRow, TiebreakerRule } from '../types';

export interface TiebreakerOption {
  value: TiebreakerRule;
  label: string;
  short: string;      // standings header: "Tiebreaker: <short>"
  explain: string;    // builder / setup sheet note
}

export const TIEBREAKER_OPTIONS: readonly TiebreakerOption[] = [
  {
    value: 'lookback',
    label: 'Lookback (standard)',
    short: 'Lookback: most 1sts, then 2nds, then 3rds',
    explain: 'The way Iron Podium and most sanctioned meets break a tie: more event 1st places wins; level on 1sts, more 2nd places; level again, more 3rd places. Still level: the athletes share the place.',
  },
  {
    value: 'bodyweight',
    label: 'Bodyweight',
    short: 'Lighter bodyweight',
    explain: 'The lighter athlete at weigh-in places higher. Athletes without a recorded bodyweight, or at the same bodyweight, share the place.',
  },
  {
    value: 'event_wins',
    label: 'Most Event Wins',
    short: 'Most Event Wins, then Final Event',
    explain: 'The athlete with more event wins places higher. If that is level too, more points in the final event wins. Still level after both: the athletes share the place.',
  },
  {
    value: 'final_event',
    label: 'Final Event Score',
    short: 'Final Event Score, then Event Wins',
    explain: 'The athlete with more points in the final event places higher. If that is level too, more event wins. Still level after both: the athletes share the place.',
  },
  {
    value: 'none',
    label: 'No tiebreaker',
    short: 'None (ties share the place)',
    explain: 'Athletes on the same total points share the place. Pick this when the meet director settles ties by hand.',
  },
];

export const DEFAULT_TIEBREAKER: TiebreakerRule = 'lookback';

export function isTiebreakerRule(v: unknown): v is TiebreakerRule {
  return TIEBREAKER_OPTIONS.some((o) => o.value === v);
}

export function normalizeTiebreakerRule(v: unknown): TiebreakerRule {
  return isTiebreakerRule(v) ? v : DEFAULT_TIEBREAKER;
}

export function describeTiebreaker(rule: TiebreakerRule | string | undefined): TiebreakerOption {
  return TIEBREAKER_OPTIONS.find((o) => o.value === rule) ?? TIEBREAKER_OPTIONS[0];
}

// Negative = a ahead of b, 0 = level (shared place). Total points are compared by the caller first.
export function compareTiebreak(a: StandingRow, b: StandingRow, rule: TiebreakerRule): number {
  switch (rule) {
    case 'lookback':
      for (let i = 0; i < 3; i++) {
        if (b.placeCounts[i] !== a.placeCounts[i]) return b.placeCounts[i] - a.placeCounts[i];
      }
      return 0;
    case 'bodyweight': {
      const wa = a.bodyweight ?? 0, wb = b.bodyweight ?? 0;
      if (wa > 0 && wb > 0 && wa !== wb) return wa - wb;
      return 0;
    }
    case 'event_wins':
      if (b.eventWins !== a.eventWins) return b.eventWins - a.eventWins;
      return b.finalEventPoints - a.finalEventPoints;
    case 'final_event':
      if (b.finalEventPoints !== a.finalEventPoints) return b.finalEventPoints - a.finalEventPoints;
      return b.eventWins - a.eventWins;
    default:
      return 0;
  }
}
