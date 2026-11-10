// "Which group fits me?" (11/10, feature gaps #13 novice group picker). Pure: rank a show's divisions against three
// gym numbers an athlete with no strongman history can supply (a deadlift, any overhead press, the heaviest thing they
// can pick up and walk with). Each event maps to one of those lanes from its spec implement and name; its division
// weight (lb) is compared to the lane number and graded. A division fits when every graded event sits inside the band,
// is a stretch when one event is over it, and is heavy otherwise. Divisions without published weights are unrated and
// get the promoter's text instead of a verdict. The output is a suggestion, never a rule: promoters move athletes.
import type { Division, DivisionFormat, EventDef } from '@/lib/types';
import type { DivisionGroupingStyle } from './types';
import { normalizeEventSpec } from '@/lib/events/spec';
import { eventWeightDisplay } from './format';

export type Lane = 'deadlift' | 'overhead' | 'carry' | 'pull' | 'unknown';
export type Verdict = 'clear' | 'reach' | 'heavy' | 'unrated';
export type Fit = 'fits' | 'stretch' | 'heavy' | 'unrated';
export type Unit = 'lb' | 'kg';

export interface PickerNumbers {
  deadlift: number | null;   // lb
  overhead: number | null;   // lb, any bar or dumbbell
  carry: number | null;      // lb, heaviest pick-up-and-walk (total, both hands)
}

export interface EventVerdict {
  eventId: string;
  eventNumber: number;
  name: string;
  lane: Lane;
  weightLb: number | null;   // the division's main weight when numeric
  weightText: string;        // what the show page prints for that cell ('' when the promoter left it out)
  ratio: number | null;      // division weight / athlete number for the lane
  verdict: Verdict;
}

export interface DivisionFit {
  divisionId: string;
  name: string;
  fit: Fit;
  graded: number;            // events with a verdict other than unrated
  overCount: number;         // events graded heavy
  reachCount: number;
  maxRatio: number | null;
  events: EventVerdict[];
  line: string;              // one sentence for the card
}

export interface PickerResult {
  divisions: DivisionFit[];  // ranked, recommended first
  recommendedId: string | null;
  note: string;              // why the recommendation, or what is missing
}

export const LANE_LABELS: Record<Lane, string> = {
  deadlift: 'deadlift',
  overhead: 'overhead press',
  carry: 'carry',
  pull: 'pull / drag',
  unknown: 'other',
};

// Reps / carry events compare the implement weight to a 1RM-ish number, so the band sits well under 1.0; a max-weight
// event's division weight is the opener, so it sits lower still.
const BAND = { reps: { clear: 0.75, reach: 0.9 }, max: { clear: 0.7, reach: 0.85 }, carry: { clear: 0.8, reach: 1.0 } } as const;

const CARRY_IMPLEMENTS = new Set(['yoke', 'farmers', 'frame', 'husafell', 'sandbag', 'keg', 'atlas_stones', 'natural_stone', 'loading_medley', 'tire', 'power_stairs', 'conans_wheel', 'duck_walk']);
const OVERHEAD_IMPLEMENTS = new Set(['log', 'circus_dumbbell', 'viking_press']);
const PULL_IMPLEMENTS = new Set(['truck_pull', 'arm_over_arm']);

/** Which gym number an event compares against. Name wins over implement for bars (an axle can be a deadlift or a press). */
export function eventLane(ev: Pick<EventDef, 'name' | 'spec' | 'scoringType'>): Lane {
  const name = ev.name.toLowerCase();
  const implement = normalizeEventSpec(ev.spec)?.implement;
  // Astra GP-07 / GP-09: holds, throws, tosses, pushes (not a push press) and bench / chest / floor presses are not a
  // deadlift, an overhead press or a carry; they stay unrated rather than being compared to an unrelated gym number.
  if (/\bhold\b|throw|toss|\bpush(?!\s*press)\b|bench|chest|floor press|incline/.test(name)) return 'unknown';
  if (/deadlift|\bdl\b|pull[- ]?through/.test(name) && !/truck|sled|arm/.test(name)) return 'deadlift';
  if (/press|clean|overhead|jerk|\bohp\b|viking|log\b|circus|dumbbell/.test(name)) return 'overhead';
  if (/truck|sled|arm[- ]over|drag|harness|rope/.test(name)) return 'pull';
  if (/carry|yoke|farmer|sandbag|stone|keg|load|medley|husafell|frame|tire|stairs|conan|duck|walk/.test(name)) return 'carry';
  if (implement === 'car_deadlift') return 'deadlift';
  if (implement && OVERHEAD_IMPLEMENTS.has(implement)) return 'overhead';
  if (implement && PULL_IMPLEMENTS.has(implement)) return 'pull';
  if (implement && CARRY_IMPLEMENTS.has(implement)) return 'carry';
  if (implement === 'axle' || implement === 'barbell') return ev.scoringType === 'max_weight' ? 'overhead' : 'deadlift';
  return 'unknown';
}

function laneNumber(nums: PickerNumbers, lane: Lane): number | null {
  if (lane === 'deadlift') return nums.deadlift;
  if (lane === 'overhead') return nums.overhead;
  if (lane === 'carry') return nums.carry;
  return null;
}

function grade(ev: EventDef, lane: Lane, ratio: number): Verdict {
  const band = lane === 'carry' ? BAND.carry : ev.scoringType === 'max_weight' ? BAND.max : BAND.reps;
  if (ratio <= band.clear) return 'clear';
  if (ratio <= band.reach) return 'reach';
  return 'heavy';
}

/** The numeric weight the show page prints for this cell (per-hand weights doubled for the carry lane), else null. */
export function divisionWeightLb(ev: EventDef, divisionId: string, lane: Lane): number | null {
  const w = ev.divisionWeights?.[divisionId];
  if (typeof w !== 'number' || w <= 0) return null;
  // Astra GP-11: the empty implement is added first, then a per-hand carry is doubled (both apply at once for farmers
  // handles loaded with plates), matching the scorer's plate maths.
  let total = ev.weightIsAddedPlatesOnly ? w + (ev.implementEmptyWeight || 0) : w;
  if (ev.weightEntryMode === 'per_hand' && lane === 'carry') total *= 2;
  return total;
}

export function gradeEvent(ev: EventDef, division: Division, nums: PickerNumbers): EventVerdict {
  const lane = eventLane(ev);
  const weightLb = divisionWeightLb(ev, division.id, lane);
  const weightText = eventWeightDisplay(ev, division.id).main;
  const mine = laneNumber(nums, lane);
  const base = { eventId: ev.id, eventNumber: ev.eventNumber, name: ev.name, lane, weightLb, weightText };
  if (weightLb === null || mine === null || mine <= 0) return { ...base, ratio: null, verdict: 'unrated' };
  const ratio = weightLb / mine;
  return { ...base, ratio, verdict: grade(ev, lane, ratio) };
}

function fitLine(fit: Fit, events: EventVerdict[], graded: number): string {
  const heavy = events.filter((e) => e.verdict === 'heavy').map((e) => e.name);
  const reach = events.filter((e) => e.verdict === 'reach').map((e) => e.name);
  const unknown = events.filter((e) => e.verdict === 'unrated' && e.weightLb !== null && e.lane !== 'unknown').map((e) => e.name);
  const noWeight = events.filter((e) => e.weightLb === null).map((e) => e.name);
  if (fit === 'unrated') {
    return noWeight.length === events.length
      ? 'No target weights published for this group. Ask the promoter, they can place you.'
      : `Nothing to compare yet. Enter a number for ${unknown.length ? LANE_LABELS[events.find((e) => e.name === unknown[0])!.lane] : 'at least one lift'}.`;
  }
  const parts: string[] = [];
  if (fit === 'fits') parts.push(reach.length ? `${list(reach)} ${reach.length === 1 ? 'is' : 'are'} the ${reach.length === 1 ? 'one' : 'ones'} to work on; the rest is comfortable` : 'Every compared weight is comfortable');
  // Astra GP-10: "above the band" is what was measured (the band sits under 1.0, so a weight can be above it and still
  // under the athlete's number).
  if (fit === 'stretch') parts.push(`${list(heavy)} ${heavy.length === 1 ? 'is' : 'are'} above your comparison band${reach.length ? `, ${list(reach)} close to it` : ''}`);
  if (fit === 'heavy') parts.push(`${list(heavy)} ${heavy.length === 1 ? 'is' : 'are'} above your comparison band`);
  if (graded < events.length) {
    const rest = events.length - graded;
    parts.push(`${rest} event${rest === 1 ? '' : 's'} not compared (${list([...noWeight, ...unknown, ...events.filter((e) => e.lane === 'unknown' || e.lane === 'pull').map((e) => e.name)].filter((v, i, a) => a.indexOf(v) === i))})`);
  }
  return `${parts.join('; ')}.`;
}

function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function fitDivision(division: Division, events: EventDef[], nums: PickerNumbers): DivisionFit {
  const graded = events.map((ev) => gradeEvent(ev, division, nums));
  const scored = graded.filter((g) => g.verdict !== 'unrated');
  const overCount = scored.filter((g) => g.verdict === 'heavy').length;
  const reachCount = scored.filter((g) => g.verdict === 'reach').length;
  const maxRatio = scored.length ? Math.max(...scored.map((g) => g.ratio as number)) : null;
  let fit: Fit;
  if (!scored.length) fit = 'unrated';
  else if (overCount === 0) fit = 'fits';
  else if (overCount === 1 && (maxRatio as number) <= 1.1) fit = 'stretch';
  else fit = 'heavy';
  return { divisionId: division.id, name: division.name, fit, graded: scored.length, overCount, reachCount, maxRatio, events: graded, line: fitLine(fit, graded, scored.length) };
}

const FIT_ORDER: Record<Fit, number> = { fits: 0, stretch: 1, heavy: 2, unrated: 3 };

/** Rank: fitting divisions first, the heaviest fit (largest maxRatio) on top so a capable athlete is not sent to the
 *  lightest group; then stretches lightest first; then heavy; unrated last in the promoter's order. */
export function pickGroups(divisions: Division[], events: EventDef[], nums: PickerNumbers): PickerResult {
  const sortedDivs = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder);
  const sortedEvents = [...events].sort((a, b) => a.eventNumber - b.eventNumber);
  const fits = sortedDivs.map((d) => fitDivision(d, sortedEvents, nums));
  const ranked = [...fits].sort((a, b) => {
    if (FIT_ORDER[a.fit] !== FIT_ORDER[b.fit]) return FIT_ORDER[a.fit] - FIT_ORDER[b.fit];
    if (a.fit === 'fits') return (b.maxRatio ?? 0) - (a.maxRatio ?? 0);
    if (a.fit === 'unrated') return 0;
    return (a.maxRatio ?? 0) - (b.maxRatio ?? 0);
  });
  const hasNumbers = nums.deadlift || nums.overhead || nums.carry;
  const anyGraded = fits.some((f) => f.graded > 0);
  const anyWeights = fits.some((f) => f.events.some((e) => e.weightLb !== null));
  let recommendedId: string | null = null;
  let note: string;
  if (!anyWeights) note = 'This show has not published target weights, so there is nothing to compare. The division descriptions and the promoter are your guide.';
  else if (!hasNumbers) note = 'Enter a number or two and the groups are ranked against the published weights.';
  else if (!anyGraded) note = 'None of the published weights match the lifts you entered. Try a different number, or ask the promoter.';
  else {
    const top = ranked[0];
    recommendedId = top.divisionId;
    const rated = ranked.filter((f) => f.fit !== 'unrated').length;
    const unratedNote = rated < ranked.length ? ` ${ranked.length - rated} group${ranked.length - rated === 1 ? ' has' : 's have'} no weights to compare and ${ranked.length - rated === 1 ? 'is' : 'are'} listed last, unranked.` : '';
    note = top.fit === 'fits'
      ? `${top.name} is the heaviest group where every compared weight is inside your comparison band.${unratedNote}`
      : `No group clears every compared weight; ${top.name} is the closest of the ${rated} rated.${unratedNote} Promoters expect this and will place you.`;
  }
  return { divisions: ranked, recommendedId, note };
}

/** Form text to pounds. "315", "315 lb", "140 kg", "140kg x 3" (first number), unit from the text or the toggle. */
export function parseLiftInput(text: string, unit: Unit): number | null {
  const m = /(\d+(?:\.\d+)?)/.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const isKg = /kg|kilo/i.test(text) || (unit === 'kg' && !/lb|pound/i.test(text));
  return Math.round(isKg ? n * LB_PER_KG : n);
}

const LB_PER_KG = 2.20462;

/** Astra GP-08: the three inputs are typed in the toggle's unit, so flipping the toggle converts what is on screen and
 *  the athlete's strength stays the same. Text with its own unit ("140 kg") is left alone: parseLiftInput reads it. */
export function convertDisplayUnit(text: string, from: Unit, to: Unit): string {
  if (from === to) return text;
  const t = text.trim();
  if (!t || /kg|kilo|lb|pound/i.test(t) || !/^\d+(\.\d+)?$/.test(t)) return text;
  const n = Number(t);
  return String(to === 'kg' ? Math.round(n / LB_PER_KG) : Math.round(n * LB_PER_KG));
}

/** A pounds value as the input should show it in the given unit (Astra GP-09: PR seeds are canonical pounds). */
export function lbToDisplay(lb: number | null, unit: Unit): string {
  if (lb === null || !Number.isFinite(lb) || lb <= 0) return '';
  return String(unit === 'kg' ? Math.round(lb / LB_PER_KG) : Math.round(lb));
}

/** Seed the three inputs from profile PRs ("Log press" / "315 lb"): one per lane, first match wins. */
export function numbersFromPRs(prs: Array<{ lift: string; value: string }>): PickerNumbers {
  const out: PickerNumbers = { deadlift: null, overhead: null, carry: null };
  for (const pr of prs) {
    const lane = eventLane({ name: pr.lift, scoringType: 'reps' });
    if (lane === 'deadlift' || lane === 'overhead' || lane === 'carry') {
      if (out[lane] === null) out[lane] = parseLiftInput(pr.value, 'lb');
    }
  }
  return out;
}

/** Gendered division names ("Open Women", "Novice Men", "Men's HW", "Ladies Novice") so the panel can filter; null when
 *  the name does not say (strength groups, open-gender teams, teen classes). Women is tested first because "women"
 *  contains "men". */
export function divisionGenderTag(name: string): 'women' | 'men' | null {
  const n = name.toLowerCase();
  if (/\b(women|woman|women's|womens|female|ladies|w)\b/.test(n) || /\bw\s*(hw|lw|mw|shw|open|novice)\b/.test(n)) return 'women';
  if (/\b(men|man|men's|mens|male|m)\b/.test(n) || /\bm\s*(hw|lw|mw|shw|open|novice)\b/.test(n)) return 'men';
  return null;
}

export function inferDivisionGroupingStyle(divisionLabels: string[]): DivisionGroupingStyle {
  if (divisionLabels.length === 0) return 'mixed';
  const hasInclusive = divisionLabels.some((n) => /\b(group|tier)\s*\d+/i.test(n));
  const hasWeightClass = divisionLabels.some((n) => /\b(\d+\s*(kg|lb|lbs)|heavyweight|middleweight|lightweight|novice|open|masters)\b/i.test(n));
  if (hasInclusive && !hasWeightClass) return 'inclusive_strength_groups';
  if (hasWeightClass && !hasInclusive) return 'traditional_weight_classes';
  return 'mixed';
}

// 054: the promoter's division format wins over the name-based guess. 'weight_classes' is traditional whatever the
// names say; 'custom' can never read as traditional (a custom meet whose names look like classes shows as Mixed);
// unset keeps the inference above.
export function resolveDivisionGroupingStyle(format: DivisionFormat | null | undefined, divisionLabels: string[]): DivisionGroupingStyle {
  if (format === 'weight_classes') return 'traditional_weight_classes';
  const inferred = inferDivisionGroupingStyle(divisionLabels);
  if (format === 'custom' && inferred === 'traditional_weight_classes') return 'mixed';
  return inferred;
}

/** 054 (Kurt 11/10): the helper is for non-traditional classes only. The promoter's division format decides; a meet that
 *  never chose falls back to the name-based grouping style and hides the helper when the names read as weight classes.
 *  Completed shows have standings to read instead, and the helper has nothing to compare without events. */
export function showsGroupPicker(
  show: { divisionFormat?: DivisionFormat | null; divisionGroupingStyle: DivisionGroupingStyle; competitionStatus: string },
  eventCount: number,
): boolean {
  if (show.competitionStatus === 'completed' || eventCount === 0) return false;
  if (show.divisionFormat === 'weight_classes') return false;
  if (show.divisionFormat === 'custom') return true;
  return show.divisionGroupingStyle !== 'traditional_weight_classes';
}

export const VERDICT_LABELS: Record<Verdict, string> = { clear: 'Comfortable', reach: 'Within reach', heavy: 'Above band', unrated: 'Not compared' };
export const FIT_LABELS: Record<Fit, string> = { fits: 'Fits', stretch: 'A stretch', heavy: 'Heavy for now', unrated: 'No weights' };
