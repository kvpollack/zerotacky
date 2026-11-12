// Structured event spec helpers (11/4, starter). Pure: the promoter's event form validates and normalizes with these,
// the show page describes with them, tests cover them. The implement list carries the gym-directory equipment ids it
// maps to, so the later "train for this show" filter can join a show's events to gyms without a second vocabulary.
import type { EquipmentRule, EventSpec, ImplementKind, MeetUnits } from '@/lib/types';
import { COURSE_MAX, distanceUnit, distanceUnitWord } from '@/lib/units';

export const IMPLEMENTS: ReadonlyArray<{ id: ImplementKind; label: string; gymEquipment: string[] }> = [
  { id: 'log', label: 'Log', gymEquipment: ['log'] },
  { id: 'axle', label: 'Axle', gymEquipment: ['axle'] },
  { id: 'barbell', label: 'Barbell', gymEquipment: [] },
  { id: 'circus_dumbbell', label: 'Circus dumbbell', gymEquipment: ['circus_db'] },
  { id: 'viking_press', label: 'Viking press', gymEquipment: ['viking_press'] },
  { id: 'yoke', label: 'Yoke', gymEquipment: ['yoke'] },
  { id: 'farmers', label: "Farmer's handles", gymEquipment: ['farmers'] },
  { id: 'frame', label: 'Frame', gymEquipment: ['frame'] },
  { id: 'husafell', label: 'Husafell stone', gymEquipment: ['husafell'] },
  { id: 'sandbag', label: 'Sandbag', gymEquipment: ['sandbags'] },
  { id: 'keg', label: 'Keg', gymEquipment: ['kegs'] },
  { id: 'atlas_stones', label: 'Atlas stones', gymEquipment: ['stones'] },
  { id: 'natural_stone', label: 'Natural stone', gymEquipment: ['natural_stones'] },
  { id: 'loading_medley', label: 'Loading medley', gymEquipment: ['loading_platform'] },
  { id: 'car_deadlift', label: 'Car deadlift', gymEquipment: ['car_deadlift'] },
  { id: 'truck_pull', label: 'Truck / sled pull', gymEquipment: ['pull_harness'] },
  { id: 'arm_over_arm', label: 'Arm-over-arm', gymEquipment: ['arm_over_arm'] },
  { id: 'tire', label: 'Tire flip', gymEquipment: ['tire'] },
  { id: 'power_stairs', label: 'Power stairs', gymEquipment: ['power_stairs'] },
  { id: 'conans_wheel', label: "Conan's wheel", gymEquipment: ['conans_wheel'] },
  { id: 'duck_walk', label: 'Duck walk', gymEquipment: [] },
  { id: 'other', label: 'Other (describe)', gymEquipment: [] },
];

export const EQUIPMENT_RULES: ReadonlyArray<{ id: EquipmentRule; label: string }> = [
  { id: 'tacky', label: 'Tacky' },
  { id: 'straps', label: 'Straps' },
  { id: 'belt', label: 'Belt' },
  { id: 'sleeves', label: 'Sleeves' },
  { id: 'wraps', label: 'Wraps' },
  { id: 'chalk', label: 'Chalk' },
  { id: 'suit', label: 'Suit' },
];

// courseFeetMax is the imperial cap (a mile); a metric meet caps at COURSE_MAX.metric meters (059). The spec key stays
// `courseFeet` and holds the meet's distance unit.
export const SPEC_LIMITS = { implementNote: 80, notes: 280, videoUrl: 500, courseFeetMax: COURSE_MAX.imperial } as const;

const IMPLEMENT_IDS = new Set<string>(IMPLEMENTS.map((i) => i.id));
const RULE_IDS = new Set<string>(EQUIPMENT_RULES.map((r) => r.id));

export function implementLabel(id: ImplementKind | undefined): string {
  return IMPLEMENTS.find((i) => i.id === id)?.label ?? '';
}

export function ruleLabel(id: EquipmentRule): string {
  return EQUIPMENT_RULES.find((r) => r.id === id)?.label ?? id;
}

/** Raw form values (strings / arrays as typed). `normalizeEventSpec` cleans; `validateEventSpec` explains a refusal. */
export interface EventSpecInput {
  implement?: string;
  implementNote?: string;
  courseFeet?: string | number;
  allowed?: string[];
  notAllowed?: string[];
  videoUrl?: string;
  notes?: string;
}

/** Text fields accept strings only; anything else (null, number, object) reads as empty (Astra recheck 11/5). */
function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function cleanRules(list: unknown): EquipmentRule[] {
  const out: EquipmentRule[] = [];
  if (!Array.isArray(list)) return out;
  for (const r of list) {
    const k = str(r).toLowerCase();
    if (RULE_IDS.has(k) && !out.includes(k as EquipmentRule)) out.push(k as EquipmentRule);
  }
  return out;
}

/** Returns a spec with only the filled fields, or undefined when nothing is filled. Does not refuse; validate first. */
export function normalizeEventSpec(input: EventSpecInput | EventSpec | null | undefined, units: MeetUnits = 'imperial'): EventSpec | undefined {
  if (!input) return undefined;
  const out: EventSpec = {};
  const impl = str(input.implement);
  if (IMPLEMENT_IDS.has(impl)) out.implement = impl as ImplementKind;
  const note = str(input.implementNote);
  if (note) out.implementNote = note.slice(0, SPEC_LIMITS.implementNote);
  const rawFeet = input.courseFeet;
  const feet = typeof rawFeet === 'number' ? rawFeet : typeof rawFeet === 'string' && rawFeet.trim() !== '' ? Number(rawFeet) : NaN;
  // Half-foot steps, the form's own step (Astra BR-08): what validation accepts is what normalization keeps.
  if (Number.isFinite(feet) && feet >= 1 && feet <= COURSE_MAX[units]) out.courseFeet = Math.round(feet * 2) / 2;
  const allowed = cleanRules(input.allowed);
  const notAllowed = cleanRules(input.notAllowed).filter((r) => !allowed.includes(r));
  if (allowed.length) out.allowed = allowed;
  if (notAllowed.length) out.notAllowed = notAllowed;
  const url = str(input.videoUrl);
  if (url) out.videoUrl = url;
  const notes = str(input.notes);
  if (notes) out.notes = notes.slice(0, SPEC_LIMITS.notes);
  return Object.keys(out).length ? out : undefined;
}

/** Null when the input is acceptable, else the message the form shows. Checked on the raw input, before normalize. */
export function validateEventSpec(input: EventSpecInput | null | undefined, units: MeetUnits = 'imperial'): string | null {
  if (!input) return null;
  for (const k of ['implement', 'implementNote', 'videoUrl', 'notes'] as const) {
    const v = (input as Record<string, unknown>)[k];
    if (v !== undefined && v !== null && typeof v !== 'string') return 'Event spec fields must be text.';
  }
  for (const k of ['allowed', 'notAllowed'] as const) {
    const v = (input as Record<string, unknown>)[k];
    if (v !== undefined && v !== null && (!Array.isArray(v) || v.some((r) => typeof r !== 'string'))) return 'Equipment rules must be a list of rule names.';
  }
  const impl = str(input.implement);
  if (impl && !IMPLEMENT_IDS.has(impl)) return 'Pick an implement from the list.';
  if (impl === 'other' && !str(input.implementNote)) return 'Describe the implement when you pick "Other".';
  if (str(input.implementNote).length > SPEC_LIMITS.implementNote) return `Implement note is limited to ${SPEC_LIMITS.implementNote} characters.`;
  const rawFeet = input.courseFeet;
  if (rawFeet !== '' && rawFeet !== undefined && rawFeet !== null) {
    const feet = Number(rawFeet);
    if (!Number.isFinite(feet) || feet < 1 || feet > COURSE_MAX[units]) return `Course distance is in ${distanceUnitWord(units)}, between 1 and ${COURSE_MAX[units]}.`;
    if (Math.abs(feet * 2 - Math.round(feet * 2)) > 1e-9) return `Course distance is in half-${units === 'metric' ? 'meter' : 'foot'} steps (50 or 50.5).`;
  }
  const allowed = cleanRules(input.allowed);
  const both = cleanRules(input.notAllowed).filter((r) => allowed.includes(r));
  if (both.length) return `${ruleLabel(both[0])} cannot be both allowed and not allowed.`;
  const url = str(input.videoUrl);
  if (url) {
    if (url.length > SPEC_LIMITS.videoUrl) return `Video link is limited to ${SPEC_LIMITS.videoUrl} characters.`;
    if (!safeVideoUrl(url)) return 'Video link must start with http:// or https://.';
  }
  if (str(input.notes).length > SPEC_LIMITS.notes) return `Notes are limited to ${SPEC_LIMITS.notes} characters.`;
  return null;
}

/** The video link, only when it is a real http(s) URL; null for anything else (javascript:, data:, bare hosts). The show
 *  page renders the link through this, so a spec that reached the database by some other path cannot plant a bad href
 *  (Astra BR-05). The server trigger in 040 refuses such a spec as well; this is the second lock. */
export function safeVideoUrl(url: string | null | undefined): string | null {
  const s = String(url ?? '').trim();
  if (!s || s.length > SPEC_LIMITS.videoUrl) return null;
  let u: URL | null = null;
  try { u = new URL(s); } catch { u = null; }
  return u && (u.protocol === 'http:' || u.protocol === 'https:') ? s : null;
}

/** 230 -> 104 (whole kilograms; the exact conversion is 104.33). */
export function lbToKg(lb: number): number {
  return Math.round(lb * 0.45359237);
}

/** "104 kg" for a positive pound value, "<1 kg" under half a kilogram (a positive load never reads as zero mass,
 *  Astra BR-08), '' otherwise. */
export function kgLabel(lb: number | null | undefined): string {
  if (typeof lb !== 'number' || !Number.isFinite(lb) || lb <= 0) return '';
  const kg = lbToKg(lb);
  return kg === 0 ? '<1 kg' : `${kg} kg`;
}

/** Short segments for one line under the event name: implement, course, equipment. The video link is separate.
 *  The spec is normalized first, so a malformed object that reached the database by another path (a null rule member,
 *  Astra recheck 11/5) renders as whatever is valid in it instead of crashing the show page. */
export function specSegments(raw: EventSpec | undefined, units: MeetUnits = 'imperial'): string[] {
  const spec = normalizeEventSpec(raw, units);
  if (!spec) return [];
  const out: string[] = [];
  if (spec.implement) {
    const label = spec.implement === 'other' ? (spec.implementNote || 'Other implement') : implementLabel(spec.implement);
    out.push(spec.implement !== 'other' && spec.implementNote ? `${label} (${spec.implementNote})` : label);
  } else if (spec.implementNote) out.push(spec.implementNote);
  if (spec.courseFeet) out.push(`${spec.courseFeet} ${distanceUnit(units)} course`);
  if (spec.allowed?.length) out.push(`${spec.allowed.map(ruleLabel).join(', ')} allowed`);
  if (spec.notAllowed?.length) out.push(`No ${spec.notAllowed.map((r) => ruleLabel(r).toLowerCase()).join(', ')}`);
  return out;
}

/** The notes as text, '' for anything that is not a non-empty string (render-safe). */
export function specNotes(raw: EventSpec | undefined): string {
  return normalizeEventSpec(raw)?.notes ?? '';
}

/** True when the spec has anything an athlete would read (used to decide whether to render a line at all). */
export function specHasContent(raw: EventSpec | undefined): boolean {
  const spec = normalizeEventSpec(raw);
  return !!spec && (specSegments(spec).length > 0 || !!safeVideoUrl(spec.videoUrl) || !!spec.notes);
}
