// Check-in desk rules (045, 11/6, feature gaps #8). Pure helpers shared by the desk section and its tests: kilogram
// parsing as the scale reads it, the lb mirror, the class check against a division cap, and the federation wording
// the desk shows above the table. No React, no fixtures.

export const KG_PER_LB = 0.45359237;
export const LB_PER_KG = 2.2046226218;
export const DESK_KG_MIN = 20;
export const DESK_KG_MAX = 300;

/** '92.4', '92,4', '92.45 kg' -> 92.45 (two decimals kept as typed, never rounded up to a class). Out of range or junk = null. */
export function parseKg(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw >= DESK_KG_MIN && raw <= DESK_KG_MAX ? Math.round(raw * 100) / 100 : null;
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase().replace(/\s*kgs?$/, '').replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n >= DESK_KG_MIN && n <= DESK_KG_MAX ? n : null;
}

/** Pounds typed at a desk that only has an lb scale: converted to kg, two decimals, same range rule. */
export function lbToKg(lb: number): number {
  return Math.round(lb * KG_PER_LB * 100) / 100;
}
export function kgToLb(kg: number): number {
  return Math.round(kg * LB_PER_KG * 10) / 10;
}

export type ClassCheck =
  | { status: 'none' }                              // no cap on the division, or no weigh-in yet
  | { status: 'ok'; marginKg: number }               // under the cap by this much
  | { status: 'over'; overByKg: number };            // over the cap

/** Strict: the cap is inclusive (a 90.00 kg reading makes a 90 kg class), anything above it is over, no rounding. */
export function classCheck(weighedKg: number | null | undefined, capKg: number | null | undefined): ClassCheck {
  if (weighedKg === null || weighedKg === undefined || capKg === null || capKg === undefined) return { status: 'none' };
  const diff = Math.round((capKg - weighedKg) * 100) / 100;
  return diff >= 0 ? { status: 'ok', marginKg: diff } : { status: 'over', overByKg: -diff };
}

export function formatKg(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return '';
  return `${kg.toFixed(2).replace(/\.?0+$/, '')} kg`;
}

export interface DeskPreset { id: 'sc' | 'uss' | 'generic'; title: string; lines: string[] }

/** The wording above the desk table. Only the Strongman Corporation rules are stated as rules; the rest is advice. */
export function deskPreset(federation: string | null | undefined): DeskPreset {
  const f = (federation ?? '').toLowerCase();
  if (/strongman corp|\bsc\b|strongman corporation/.test(f)) {
    return {
      id: 'sc',
      title: 'Strongman Corporation weigh-in',
      lines: [
        'Weigh-in may happen up to 24 hours before the first event.',
        'Record kilograms as the scale reads them. No rounding.',
        'Combined classes weigh in under the heavier class: set that cap on the division.',
      ],
    };
  }
  if (/\buss\b|united states strongman/.test(f)) {
    return {
      id: 'uss',
      title: 'United States Strongman weigh-in',
      lines: ['Record kilograms as the scale reads them. Confirm the weigh-in window and class caps with the federation rulebook.'],
    };
  }
  return {
    id: 'generic',
    title: 'Weigh-in',
    lines: ['Record kilograms as the scale reads them. Set a cap on any division that has a weight limit and the desk flags anyone over it.'],
  };
}

export interface DeskCounts { roster: number; checkedIn: number; weighed: number; over: number }
