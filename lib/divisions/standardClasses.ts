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

/** Drops classes the meet already has, so a second tap adds nothing twice. A class is "had" when a division carries the
 *  same name (case-insensitive), or (Astra GP-06) the same gender and the same kg cap after the promoter renamed it; a
 *  renamed heavyweight (no cap) matches a capless division of that gender whose name reads as open / heavyweight. */
export function missingStandardClasses(
  wanted: StandardClassDivision[],
  existing: Array<string | { name: string; weightCapKg?: number | null }>,
): StandardClassDivision[] {
  const rows = existing.map((e) => (typeof e === 'string' ? { name: e, weightCapKg: null as number | null } : { name: e.name, weightCapKg: e.weightCapKg ?? null }));
  const names = new Set(rows.map((r) => r.name.trim().toLowerCase()));
  const sexOf = (name: string): ClassSex | null => (/\b(women|women's|womens|female|ladies|w)\b/i.test(name) ? 'women' : /\b(men|men's|mens|male|m)\b/i.test(name) ? 'men' : null);
  return wanted.filter((w) => {
    if (names.has(w.name.toLowerCase())) return false;
    const sex = sexOf(w.name);
    return !rows.some((r) => {
      if (sexOf(r.name) !== sex) return false;
      if (w.weightCapKg !== null) return r.weightCapKg !== null && Math.abs(r.weightCapKg - w.weightCapKg) < 0.01;
      return r.weightCapKg === null && /heavy|\bhw\b|\bshw\b|open|unlimited|\+/i.test(r.name);
    });
  });
}
