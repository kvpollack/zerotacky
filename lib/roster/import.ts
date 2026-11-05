// Roster import with columns (11/5, feature gaps #6). Pure: parse a pasted or uploaded spreadsheet (CSV / TSV /
// semicolon), guess which column is which, and build a plan the UI previews before `applyRosterImport` (meetBuilder)
// adds the athletes. Nothing here touches React or the server. Iron Podium exports PDF only, so the target is the
// generic spreadsheet a promoter keeps: Name (or First + Last), Division/Class, Bodyweight, Lot.
import type { Athlete, Division } from '@/lib/types';

export type RosterField = 'name' | 'firstName' | 'lastName' | 'division' | 'bodyweight' | 'lot';
export type ColumnTarget = RosterField | 'ignore';

export const ROSTER_FIELD_LABELS: Record<ColumnTarget, string> = {
  ignore: 'Ignore',
  name: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  division: 'Division',
  bodyweight: 'Bodyweight',
  lot: 'Lot #',
};
export const COLUMN_TARGETS: ColumnTarget[] = ['ignore', 'name', 'firstName', 'lastName', 'division', 'bodyweight', 'lot'];

/** Header aliases, lowercased and stripped of punctuation. Longer / more specific aliases first. */
const ALIASES: Array<[RosterField, string[]]> = [
  ['firstName', ['first name', 'firstname', 'first', 'fname', 'given name', 'given']],
  ['lastName', ['last name', 'lastname', 'last', 'lname', 'surname', 'family name']],
  ['name', ['athlete name', 'full name', 'fullname', 'competitor name', 'competitor', 'athlete', 'lifter', 'name']],
  ['division', ['division', 'div', 'class', 'weight class', 'weightclass', 'category', 'cat', 'group', 'flight']],
  ['bodyweight', ['bodyweight', 'body weight', 'bw', 'weigh in', 'weighin', 'weigh-in', 'bwt', 'weight lb', 'weight lbs', 'weight kg', 'weight']],
  ['lot', ['lot number', 'lot no', 'lot', 'lot #', 'draw', 'order', 'run order', 'start order', 'bib', 'no', '#']],
];

const MAX_ROWS = 500;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9#]+/g, ' ').trim();
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const same = (a: string, b: string) => squash(a).toLowerCase() === squash(b).toLowerCase();

// ---------- Parsing ----------

export function detectDelimiter(text: string): ',' | '\t' | ';' {
  const first = text.split(/\r?\n/).find((l) => l.trim().length > 0) ?? '';
  if (first.includes('\t')) return '\t';
  const commas = (first.match(/,/g) ?? []).length;
  const semis = (first.match(/;/g) ?? []).length;
  return semis > commas ? ';' : ',';
}

/** RFC 4180-ish: quoted fields may hold the delimiter, doubled quotes and newlines. Blank lines are dropped. */
export function parseDelimited(text: string, delimiter?: ',' | '\t' | ';'): string[][] {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const d = delimiter ?? detectDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') { quoted = true; continue; }
    if (ch === d) { row.push(cell); cell = ''; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
      row = [];
      continue;
    }
    cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row.map((c) => c.trim()));
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows.map((r) => (r.length < width ? [...r, ...new Array(width - r.length).fill('')] : r));
}

export function headerField(cell: string): RosterField | null {
  const n = norm(cell);
  if (!n) return null;
  for (const [field, names] of ALIASES) if (names.includes(n)) return field;
  return null;
}

/** True when the first row reads like headers: at least one known alias and no cell that looks like a bodyweight. */
export function looksLikeHeader(firstRow: string[]): boolean {
  if (!firstRow || firstRow.length === 0) return false;
  const known = firstRow.filter((c) => headerField(c) !== null).length;
  if (known === 0) return false;
  const numeric = firstRow.filter((c) => /^\d+(\.\d+)?$/.test(c.trim())).length;
  return numeric === 0;
}

/** One target per column; a field is claimed once (first column wins). Without headers: first column = name. */
export function guessMapping(firstRow: string[], hasHeader: boolean): ColumnTarget[] {
  const width = firstRow.length;
  const out: ColumnTarget[] = new Array(width).fill('ignore');
  if (!hasHeader) {
    if (width > 0) out[0] = 'name';
    return out;
  }
  const taken = new Set<RosterField>();
  firstRow.forEach((cell, i) => {
    const f = headerField(cell);
    if (f && !taken.has(f)) { out[i] = f; taken.add(f); }
  });
  return out;
}

// ---------- Values ----------

/** "231", "231 lb", "105 kg", "105kg" -> pounds, 1 decimal. Header unit (kg) applies to bare numbers. */
export function parseBodyweight(raw: string, headerUnit: 'lb' | 'kg' = 'lb'): number | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*(lbs?|kgs?|kilos?|pounds?)?$/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2] ? (m[2].startsWith('k') ? 'kg' : 'lb') : headerUnit;
  const lb = unit === 'kg' ? n * 2.2046226218 : n;
  return Math.round(lb * 10) / 10;
}

export function parseLot(raw: string): number | null {
  const m = String(raw ?? '').trim().match(/^#?\s*(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

export function headerUnit(headerCell: string | undefined): 'lb' | 'kg' {
  return /\bkgs?\b|kilo/i.test(headerCell ?? '') ? 'kg' : 'lb';
}

// ---------- Plan ----------

export interface PlannedRow {
  line: number;             // 1-based line in the pasted text (header counted)
  name: string;
  divisionName: string;
  divisionId: string | null; // existing division, or null when it will be created
  bodyweight?: number;
  lotNumber?: number;
  /** Why this row will not be added (empty = it will be). */
  skip: 'no_name' | 'duplicate' | null;
  notes: string[];
}

export interface RosterPlan {
  rows: PlannedRow[];
  /** Division names to create, in first-seen order. */
  newDivisions: string[];
  adding: number;
  skipped: number;
  truncated: number;        // rows past MAX_ROWS, dropped
  problems: string[];       // plan-level refusals: nothing can be imported while any remain
}

export interface PlanInput {
  rows: string[][];
  mapping: ColumnTarget[];
  hasHeader: boolean;
  divisions: Division[];
  athletes: Athlete[];
  /** Used when no division column is mapped or a row's division cell is blank. */
  defaultDivisionId: string;
}

export function buildRosterPlan(input: PlanInput): RosterPlan {
  const { mapping, hasHeader, divisions, athletes } = input;
  const header = hasHeader ? input.rows[0] ?? [] : [];
  const dataRows = hasHeader ? input.rows.slice(1) : input.rows;
  const col = (f: RosterField) => mapping.indexOf(f);
  const problems: string[] = [];
  const hasName = col('name') >= 0 || col('firstName') >= 0 || col('lastName') >= 0;
  if (!hasName) problems.push('Pick the column that holds the athlete name (or first and last name).');
  const defaultDiv = divisions.find((d) => d.id === input.defaultDivisionId) ?? null;
  if (col('division') < 0 && !defaultDiv) problems.push('Pick a division for the athletes, or map a Division column.');
  const unit = headerUnit(col('bodyweight') >= 0 ? header[col('bodyweight')] : undefined);

  const truncated = Math.max(0, dataRows.length - MAX_ROWS);
  const kept = dataRows.slice(0, MAX_ROWS);
  const newDivisions: string[] = [];
  const seen = new Map<string, Set<string>>(); // division key -> lowercased names added in this plan
  const takenLots = new Map<string, Set<number>>();
  for (const a of athletes) {
    if (!takenLots.has(a.divisionId)) takenLots.set(a.divisionId, new Set());
    takenLots.get(a.divisionId)!.add(a.lotNumber);
  }
  const rows: PlannedRow[] = kept.map((cells, idx) => {
    const line = idx + 1 + (hasHeader ? 1 : 0);
    const notes: string[] = [];
    const get = (f: RosterField) => (col(f) >= 0 ? cells[col(f)] ?? '' : '');
    let name = squash(get('name'));
    if (!name) name = squash(`${get('firstName')} ${get('lastName')}`);
    const rawDiv = squash(get('division'));
    let divisionName = rawDiv;
    let divisionId: string | null = null;
    if (rawDiv) {
      const existing = divisions.find((d) => same(d.name, rawDiv));
      if (existing) { divisionId = existing.id; divisionName = existing.name; }
      else {
        const pending = newDivisions.find((n) => same(n, rawDiv));
        if (pending) divisionName = pending; else newDivisions.push(rawDiv);
      }
    } else if (defaultDiv) {
      divisionId = defaultDiv.id;
      divisionName = defaultDiv.name;
      if (col('division') >= 0) notes.push(`No division given; goes to ${defaultDiv.name}.`);
    }
    const row: PlannedRow = { line, name, divisionName, divisionId, skip: null, notes };
    if (!name) { row.skip = 'no_name'; return row; }

    const divKey = divisionId ?? `new:${divisionName.toLowerCase()}`;
    const dupOnRoster = divisionId !== null && athletes.some((a) => a.divisionId === divisionId && same(a.name, name));
    const dupInPaste = seen.get(divKey)?.has(name.toLowerCase()) ?? false;
    if (dupOnRoster || dupInPaste) {
      row.skip = 'duplicate';
      notes.push(dupOnRoster ? 'Already on the roster in this division.' : 'Listed twice in the paste.');
      return row;
    }
    if (!seen.has(divKey)) seen.set(divKey, new Set());
    seen.get(divKey)!.add(name.toLowerCase());

    const bwRaw = get('bodyweight');
    if (bwRaw) {
      const bw = parseBodyweight(bwRaw, unit);
      if (bw === null) notes.push(`Bodyweight "${bwRaw}" not read; left blank.`);
      else row.bodyweight = bw;
    }
    const lotRaw = get('lot');
    if (lotRaw) {
      const lot = parseLot(lotRaw);
      if (lot === null) notes.push(`Lot "${lotRaw}" not read; next free lot.`);
      else {
        if (!takenLots.has(divKey)) takenLots.set(divKey, new Set());
        const used = takenLots.get(divKey)!;
        if (used.has(lot)) notes.push(`Lot ${lot} is taken; next free lot.`);
        else { used.add(lot); row.lotNumber = lot; }
      }
    }
    return row;
  });
  const adding = problems.length ? 0 : rows.filter((r) => r.skip === null).length;
  const skipped = rows.filter((r) => r.skip !== null).length;
  if (!problems.length && adding === 0 && rows.length > 0) problems.push('Nothing to add: every row is blank or already on the roster.');
  if (rows.length === 0) problems.push('No athlete rows found.');
  return { rows, newDivisions, adding, skipped, truncated, problems };
}

export function describePlan(plan: RosterPlan): string {
  if (plan.problems.length) return plan.problems[0];
  const divs = new Set(plan.rows.filter((r) => r.skip === null).map((r) => r.divisionName.toLowerCase())).size;
  const parts = [`Add ${plan.adding} athlete${plan.adding === 1 ? '' : 's'} to ${divs} division${divs === 1 ? '' : 's'}`];
  if (plan.newDivisions.length) parts.push(`${plan.newDivisions.length} new: ${plan.newDivisions.join(', ')}`);
  if (plan.skipped) parts.push(`${plan.skipped} skipped`);
  if (plan.truncated) parts.push(`${plan.truncated} past the ${MAX_ROWS}-row limit dropped`);
  return parts.join('. ') + '.';
}

export const ROSTER_IMPORT_MAX_ROWS = MAX_ROWS;
