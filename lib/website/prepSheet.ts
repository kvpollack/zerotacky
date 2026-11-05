// Comp-prep sheet (11/5, feature gaps #15). Pure: turn a show's events into rows an athlete or coach can program from,
// for one division or for every division, and the same rows as CSV. The print view at /shows/[slug]/prep and the CSV
// download both read from here. Weights come from eventWeightDisplay (lb with kg beside) and the spec readers in
// lib/events/spec.ts, so a prep sheet never says more than the show page does.
import type { Division, EventDef } from '@/lib/types';
import { implementLabel, normalizeEventSpec, ruleLabel, safeVideoUrl, specNotes } from '@/lib/events/spec';
import { toCsv } from '@/lib/export';
import { eventWeightDisplay } from './format';
import type { PublicShowRecord } from './types';

export const SCORING_LABELS: Record<string, string> = {
  reps: 'For reps',
  max_weight: 'Max weight',
  time_or_distance: 'Fastest time / distance if capped',
  time_or_implements: 'Implements + time',
};

export interface PrepWeight {
  divisionId: string;
  divisionName: string;
  main: string;   // "230 lbs", "230 lbs / hand", a height, a callout, or '' when the promoter left it out
  kg: string;     // "104 kg" or ''
  setup: string;  // "Bar height: 18 in" or ''
}

export interface PrepRow {
  eventNumber: number;
  name: string;
  scoring: string;
  timeCapSeconds: number;
  implement: string;      // label, with the note in parentheses; '' when not given
  courseFeet: number | null;
  allowed: string;        // "Tacky, Belt" or ''
  notAllowed: string;
  risingBar: string;      // "200 → 240 → 280 lb" or ''
  notes: string;          // spec notes, then the fixed implement description when there is no spec implement
  videoUrl: string;       // http(s) only, else ''
  weights: PrepWeight[];  // one entry (division chosen) or one per division
}

export interface PrepSheet {
  showName: string;
  showDate: string;      // YYYY-MM-DD
  showSlug: string;
  division: Pick<Division, 'id' | 'name'> | null;
  divisions: Array<Pick<Division, 'id' | 'name'>>; // every division, sorted, for the picker
  rows: PrepRow[];
}

const sortDivs = (divs: Division[]) => [...divs].sort((a, b) => a.sortOrder - b.sortOrder);
const sortEvents = (evs: EventDef[]) => [...evs].sort((a, b) => a.eventNumber - b.eventNumber);

function implementText(ev: EventDef): string {
  const spec = normalizeEventSpec(ev.spec);
  if (!spec?.implement) return spec?.implementNote ?? '';
  if (spec.implement === 'other') return spec.implementNote || 'Other implement';
  return spec.implementNote ? `${implementLabel(spec.implement)} (${spec.implementNote})` : implementLabel(spec.implement);
}

export function buildPrepRow(ev: EventDef, divisions: Division[]): PrepRow {
  const spec = normalizeEventSpec(ev.spec);
  const notes = [specNotes(ev.spec), !spec?.implement && ev.fixedImplementDescription ? ev.fixedImplementDescription : '']
    .filter(Boolean).join(' ');
  return {
    eventNumber: ev.eventNumber,
    name: ev.name,
    scoring: SCORING_LABELS[ev.scoringType] ?? ev.scoringType,
    timeCapSeconds: ev.timeCapSeconds,
    implement: implementText(ev),
    courseFeet: spec?.courseFeet ?? null,
    allowed: (spec?.allowed ?? []).map(ruleLabel).join(', '),
    notAllowed: (spec?.notAllowed ?? []).map(ruleLabel).join(', '),
    risingBar: ev.maxFormat === 'rising_bar' && ev.risingBarWeights?.length ? `${ev.risingBarWeights.join(' \u2192 ')} lb` : '',
    notes,
    videoUrl: safeVideoUrl(spec?.videoUrl) ?? '',
    weights: divisions.map((d) => {
      const w = eventWeightDisplay(ev, d.id);
      return { divisionId: d.id, divisionName: d.name, main: w.main, kg: w.kg ?? '', setup: w.setup ?? '' };
    }),
  };
}

/** The sheet for one division (`divisionId` on the show) or every division (null or an unknown id). */
export function buildPrepSheet(show: PublicShowRecord, divisionId: string | null | undefined): PrepSheet {
  const divisions = sortDivs(show.state.divisions);
  const chosen = divisionId ? divisions.find((d) => d.id === divisionId) ?? null : null;
  const scope = chosen ? [chosen] : divisions;
  return {
    showName: show.name,
    showDate: show.date,
    showSlug: show.slug,
    division: chosen ? { id: chosen.id, name: chosen.name } : null,
    divisions: divisions.map((d) => ({ id: d.id, name: d.name })),
    rows: sortEvents(show.state.events).map((ev) => buildPrepRow(ev, scope)),
  };
}

/** One row per event. One division: a Weight / kg / Setup trio. Every division: a Weight column per division (lb with kg). */
export function prepSheetCsv(sheet: PrepSheet): string {
  const head: unknown[] = ['Event', 'Name', 'Scoring', 'Time cap (s)', 'Implement', 'Course (ft)', 'Allowed', 'Not allowed', 'Rising bar'];
  if (sheet.division) head.push(`Weight (${sheet.division.name})`, 'kg', 'Setup');
  else for (const d of sheet.divisions) head.push(`Weight (${d.name})`);
  head.push('Notes', 'Video');
  const rows: unknown[][] = [head];
  for (const r of sheet.rows) {
    const row: unknown[] = [r.eventNumber, r.name, r.scoring, r.timeCapSeconds, r.implement, r.courseFeet ?? '', r.allowed, r.notAllowed, r.risingBar];
    if (sheet.division) {
      const w = r.weights[0];
      row.push(w?.main ?? '', w?.kg ?? '', w?.setup ?? '');
    } else {
      for (const w of r.weights) row.push([w.main, w.kg && `(${w.kg})`, w.setup].filter(Boolean).join(' '));
    }
    row.push(r.notes, r.videoUrl);
    rows.push(row);
  }
  return toCsv(rows);
}

const fileSlug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'division';

export function prepSheetFilename(sheet: PrepSheet): string {
  return `${sheet.showSlug}-prep${sheet.division ? `-${fileSlug(sheet.division.name)}` : ''}.csv`;
}

export function prepSheetHref(slug: string, divisionId?: string | null): string {
  const base = `/shows/${encodeURIComponent(slug)}/prep`;
  return divisionId && divisionId !== 'ALL' ? `${base}?division=${encodeURIComponent(divisionId)}` : base;
}

/** "1:30" for 90, "60s" for 60 and under, "" for a non-positive cap. */
export function timeCapLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds <= 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
