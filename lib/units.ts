// lib/units.ts (059): a meet is run in pounds and feet or in kilograms and meters. Every stored number (division
// weights, rising bar, plates, tare, course, result maxWeightLbs / distanceFeet) is in the MEET's unit; this module only
// knows how to label it and how to convert when two meets are compared (PR board, group picker, show history: session 2).
// The engine (scoring, plates, transitions) is arithmetic and never reads the unit. Pure, no I/O.
import { ALL_POSSIBLE_PLATES } from './constants';
import type { MeetUnits } from './types';

export type { MeetUnits };
export const MEET_UNITS: readonly MeetUnits[] = ['imperial', 'metric'];
export const DEFAULT_UNITS: MeetUnits = 'imperial';

export const LB_PER_KG = 2.2046226218;
export const KG_PER_LB = 0.45359237;
export const FT_PER_M = 3.280839895;
export const M_PER_FT = 0.3048;

/** Common kg plate set (red 25 to the 1.25 change plate). Imperial stays ALL_POSSIBLE_PLATES. */
export const METRIC_PLATES: readonly number[] = [25, 20, 15, 10, 5, 2.5, 1.25];
export const DEFAULT_PLATES: Record<MeetUnits, readonly number[]> = { imperial: ALL_POSSIBLE_PLATES, metric: METRIC_PLATES };

/** Longest course the spec form accepts: a mile, or a mile in meters. */
export const COURSE_MAX: Record<MeetUnits, number> = { imperial: 5280, metric: 1610 };

export function isMeetUnits(v: unknown): v is MeetUnits {
  return v === 'imperial' || v === 'metric';
}
export function normalizeUnits(v: unknown): MeetUnits {
  return v === 'metric' ? 'metric' : 'imperial';
}

export const UNITS_OPTIONS: ReadonlyArray<{ id: MeetUnits; label: string; help: string }> = [
  { id: 'imperial', label: 'Pounds and feet', help: 'lb plates, weights in lb, courses and marks in ft.' },
  { id: 'metric', label: 'Kilograms and meters', help: 'kg plates, weights in kg, courses and marks in m.' },
];

/** 'lb' / 'kg'. `plural` gives 'lbs' for imperial where the UI already said "lbs" (kg has no plural). */
export function weightUnit(units: MeetUnits | undefined, opts: { plural?: boolean } = {}): 'lb' | 'lbs' | 'kg' {
  if (units === 'metric') return 'kg';
  return opts.plural ? 'lbs' : 'lb';
}
/** 'ft' / 'm'. */
export function distanceUnit(units: MeetUnits | undefined): 'ft' | 'm' {
  return units === 'metric' ? 'm' : 'ft';
}
export function weightUnitWord(units: MeetUnits | undefined): 'pounds' | 'kilograms' {
  return units === 'metric' ? 'kilograms' : 'pounds';
}
export function distanceUnitWord(units: MeetUnits | undefined): 'feet' | 'meters' {
  return units === 'metric' ? 'meters' : 'feet';
}

/** "250 lb" / "250 kg". Numbers print as stored (the promoter typed them). */
export function fmtWeight(w: number, units: MeetUnits | undefined, opts: { plural?: boolean } = {}): string {
  return `${w} ${weightUnit(units, opts)}`;
}
/** "50 ft" / "15 m". */
export function fmtDistance(d: number, units: MeetUnits | undefined): string {
  return `${d} ${distanceUnit(units)}`;
}

/** Whole-number conversion of a stored weight for the mirror label beside it: a kg reading on an imperial meet, an lb
 *  reading on a metric one. 230 lb -> 104 kg; 100 kg -> 220 lb. */
export function mirrorWeight(w: number, units: MeetUnits | undefined): number {
  return units === 'metric' ? Math.round(w * LB_PER_KG) : Math.round(w * KG_PER_LB);
}
/** "104 kg" beside an imperial weight, "220 lb" beside a metric one; "<1 kg" / "<1 lb" for a positive load that rounds
 *  to zero (a positive load never reads as zero mass, Astra BR-08); '' for nothing. */
export function mirrorWeightLabel(w: number | null | undefined, units: MeetUnits | undefined): string {
  if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0) return '';
  const other = mirrorWeight(w, units);
  const u = units === 'metric' ? 'lb' : 'kg';
  return other === 0 ? `<1 ${u}` : `${other} ${u}`;
}

/** Canonical pounds / feet for a stored number, used where meets are compared. One decimal. */
export function toLb(w: number, units: MeetUnits | undefined): number {
  return units === 'metric' ? Math.round(w * LB_PER_KG * 10) / 10 : w;
}
export function toFt(d: number, units: MeetUnits | undefined): number {
  return units === 'metric' ? Math.round(d * FT_PER_M * 10) / 10 : d;
}
export function fromLb(lb: number, units: MeetUnits | undefined): number {
  return units === 'metric' ? Math.round(lb * KG_PER_LB * 10) / 10 : lb;
}
export function fromFt(ft: number, units: MeetUnits | undefined): number {
  return units === 'metric' ? Math.round(ft * M_PER_FT * 10) / 10 : ft;
}

/** True when the plate inventory is exactly the default set of some unit (so a unit flip may swap it for the other
 *  default without losing a promoter's custom inventory). */
export function isDefaultPlateSet(plates: readonly number[], units: MeetUnits): boolean {
  const d = DEFAULT_PLATES[units];
  const a = [...plates].sort((x, y) => y - x);
  return a.length === d.length && a.every((p, i) => p === d[i]);
}
