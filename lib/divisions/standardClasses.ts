// Standard bodyweight class tables (054, Kurt 11/10): a promoter on "Standard weight classes" adds a whole federation
// table in one tap instead of typing each cap. Pure data + one builder; the Divisions step owns the UI.
// Sources checked 11/10/2026: Strongman Corporation Athlete Info Overview (kg-only from 1/1/2026, amateur/pro open
// classes; masters variants differ and are not offered); IPF Technical Rules (classes unchanged since 2019; the
// sub-junior/junior 53 / 43 kg classes are not offered). Caps are the heaviest bodyweight allowed; null = heavyweight.

export type StandardClassSetId = 'strongman_corp_2026' | 'ipf';
export type ClassSex = 'women' | 'men';

export interface StandardClassSet {
  id: StandardClassSetId;
  label: string;
  note: string;
  women: Array<number | null>;
  men: Array<number | null>;
}

export const STANDARD_CLASS_SETS: ReadonlyArray<StandardClassSet> = [
  {
    id: 'strongman_corp_2026',
    label: 'Strongman Corporation (2026, kg)',
    note: 'Open amateur and pro classes. 57 kg women and 120 kg men are amateur-only; masters tables differ.',
    women: [57, 64, 73, 82, null],
    men: [80, 90, 105, 120, null],
  },
  {
    id: 'ipf',
    label: 'IPF powerlifting (kg)',
    note: 'Open classes. Sub-junior and junior lifters also have 43 kg (women) and 53 kg (men).',
    women: [47, 52, 57, 63, 69, 76, 84, null],
    men: [59, 66, 74, 83, 93, 105, 120, null],
  },
];

export interface StandardClassDivision {
  name: string;
  weightCapKg: number | null;
}

export function standardClassName(sex: ClassSex, cap: number | null, heaviestCap: number): string {
  const who = sex === 'women' ? 'Women' : 'Men';
  return cap === null ? `${who} Heavyweight (${heaviestCap}kg+)` : `${who} ${cap}kg`;
}

/** The divisions a set produces for the chosen sexes, in table order (women first). */
export function standardClassDivisions(setId: StandardClassSetId, sexes: { women: boolean; men: boolean }): StandardClassDivision[] {
  const set = STANDARD_CLASS_SETS.find((s) => s.id === setId);
  if (!set) return [];
  const out: StandardClassDivision[] = [];
  for (const sex of ['women', 'men'] as const) {
    if (!sexes[sex]) continue;
    const caps = set[sex];
    const heaviest = Math.max(...caps.filter((c): c is number => c !== null));
    for (const cap of caps) out.push({ name: standardClassName(sex, cap, heaviest), weightCapKg: cap });
  }
  return out;
}

/** Drops classes whose name already exists on the meet (case-insensitive), so a second tap adds nothing twice. */
export function missingStandardClasses(wanted: StandardClassDivision[], existingNames: string[]): StandardClassDivision[] {
  const have = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  return wanted.filter((w) => !have.has(w.name.toLowerCase()));
}
