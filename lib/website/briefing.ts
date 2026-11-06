// Briefing cards (046, 11/6, feature gaps #12). One card per station for the judges and loaders on it: who is on the
// station, the events it runs in order with the weights per division, the structured spec (implement, course, equipment
// rules) and notes, plus the meet-wide standards the head judge sets at the rules meeting. A last card lists the
// floating crew (scorer, emcee, medic, state rep) and the promoter's contact. `briefingHtml` is a self-contained
// document the editor opens in a new tab and prints. Pure functions, no React.
import type { Division, EventDef, Station } from '../types';
import { stationEvents } from '../engine/eventOrder';
import { kgLabel, safeVideoUrl, specNotes, specSegments } from '../events/spec';
import { staffByStation, staffRoleLabel, type MeetStaff } from './extras';
import type { MeetSchedule } from './schedule';

export interface BriefingInput {
  meetName: string;
  meetDate: string;              // YYYY-MM-DD or ''
  federation?: string | null;
  promoterContact?: string | null;
  schedule?: MeetSchedule | null;
  stations: Station[];
  divisions: Division[];
  events: EventDef[];
  staff: MeetStaff[] | null | undefined;
}

export interface BriefingEventLine {
  number: number;
  name: string;
  scoring: string;               // 'Reps in 60 s', 'Max weight', ...
  loads: string[];               // 'Novice Women: 180 lb (82 kg)'
  spec: string[];                // specSegments
  notes: string;
  videoUrl: string | null;
  heightLabel?: string;
}

export interface BriefingCard {
  title: string;                 // 'Station 1' or 'Floating crew'
  people: Array<{ name: string; role: string; note?: string }>;
  divisions: string[];
  events: BriefingEventLine[];
  floating: boolean;
}

const SCORING: Record<EventDef['scoringType'], string> = {
  reps: 'Reps', max_weight: 'Max weight', time_or_distance: 'Time or distance', time_or_implements: 'Time or implements',
};

export function scoringLabel(e: EventDef): string {
  const base = SCORING[e.scoringType] ?? 'Scored';
  if (e.scoringType === 'max_weight' && e.maxFormat === 'rising_bar') return 'Max weight (rising bar)';
  return e.timeCapSeconds > 0 ? `${base}, ${e.timeCapSeconds} s cap` : base;
}

function loadLines(e: EventDef, divs: Division[]): string[] {
  const out: string[] = [];
  for (const d of divs) {
    const lb = e.divisionWeights?.[d.id];
    if (typeof lb !== 'number' || !Number.isFinite(lb) || lb <= 0) continue;
    const light = e.divisionLightWeights?.[d.id];
    const kg = kgLabel(lb);
    let s = `${d.name}: ${lb} lb${kg ? ` (${kg})` : ''}`;
    if (e.hasTrumpWeight && typeof light === 'number' && light > 0) s += `, light ${light} lb${kgLabel(light) ? ` (${kgLabel(light)})` : ''}`;
    const h = e.divisionDefaultHeights?.[d.id];
    if (h) s += `, ${e.heightLabel || 'height'} ${h}`;
    out.push(s);
  }
  return out;
}

export function briefingCards(input: BriefingInput): BriefingCard[] {
  const stations = input.stations.length ? input.stations : [{ id: 'A', label: 'Station 1' }];
  const grouped = staffByStation(input.staff, stations);
  const groups = new Map(grouped.map((g) => [g.station, g.people] as const));
  // MD-15: two stations with the same label get the id appended so the cards stay distinguishable
  const labelCount = new Map<string, number>();
  for (const s of stations) labelCount.set(s.label, (labelCount.get(s.label) ?? 0) + 1);
  const titleOf = (st: Station) => ((labelCount.get(st.label) ?? 0) > 1 ? `${st.label} (${st.id})` : st.label);
  const cards: BriefingCard[] = stations.map((st) => {
    const divs = input.divisions.filter((d) => d.flight === st.id || (d.flight === 'ALL' && stations.length === 1));
    const events = stationEvents(st, input.events);
    return {
      title: titleOf(st),
      people: (groups.get(st.id) ?? []).map((p) => ({ name: p.name, role: staffRoleLabel(p.role), note: p.note })),
      divisions: divs.map((d) => d.name),
      events: events.map((e) => ({
        number: e.eventNumber,
        name: e.name,
        scoring: scoringLabel(e),
        loads: loadLines(e, divs),
        spec: specSegments(e.spec),
        notes: specNotes(e.spec),
        videoUrl: safeVideoUrl(e.spec?.videoUrl),
        heightLabel: e.hasHeightCallout ? e.heightLabel || 'Height' : undefined,
      })),
      floating: false,
    };
  });
  // staff on a station name that matches no station, plus the floating crew
  const extra: BriefingCard['people'] = [];
  const ids = new Set(stations.map((s) => s.id));
  for (const g of grouped) {
    if (ids.has(g.station)) continue;
    for (const p of g.people) extra.push({ name: p.name, role: g.station ? `${staffRoleLabel(p.role)} (${g.label})` : staffRoleLabel(p.role), note: p.note });
  }
  cards.push({ title: 'Floating crew', people: extra, divisions: [], events: [], floating: true });
  return cards;
}

/** Standards every card carries. Generic on purpose: the head judge's rules meeting and the sanctioning body's
 *  rulebook set the specifics, so this never contradicts them. */
export function standardsLines(input: Pick<BriefingInput, 'federation' | 'staff'>): string[] {
  const lines = [
    'Standards are set at the rules meeting by the head judge. Judge what was briefed, the same way for every athlete.',
    'Call what you see. Signal clearly (down call, good or no lift) and let the scorer record it before the next attempt.',
    'The judge\'s call stands on the floor. An athlete or coach with a dispute goes to the head judge, not the station judge.',
    'Safety first: stop an attempt when the athlete, loaders or spectators are at risk, and keep the lane clear while loading.',
    'Loaders: confirm the weight for the next division with the judge before the first athlete steps up.',
  ];
  const fed = input.federation?.trim() ?? '';
  if (fed && !/^(unsanctioned|none|n\/a|independent)$/i.test(fed)) lines.push(`${fed} sanction: the federation rulebook applies where it differs from this card.`);
  if (!(input.staff ?? []).some((p) => p.role === 'state_rep')) lines.push('No state rep is listed. Check whether your sanction needs one on site.');
  if (!(input.staff ?? []).some((p) => p.role === 'medic')) lines.push('No medic is listed. Know where the first-aid kit is and who calls 911.');
  return lines;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** A printable HTML document: one card per page. */
export function briefingHtml(input: BriefingInput): string {
  const cards = briefingCards(input);
  const standards = standardsLines(input);
  const when = [input.meetDate, input.schedule?.start ? `first event ${input.schedule.start}` : '', input.schedule?.rulesMeeting ? `rules meeting ${input.schedule.rulesMeeting}` : '']
    .filter(Boolean).join(' · ');
  const contact = input.promoterContact?.trim() ? `Promoter: ${esc(input.promoterContact.trim())}` : '';
  const body = cards.map((c) => `
<section class="card">
  <header><div class="meet">${esc(input.meetName)}</div><h1>${esc(c.title)}</h1><div class="when">${esc(when)}</div></header>
  <h2>Crew</h2>
  ${c.people.length ? `<ul class="people">${c.people.map((p) => `<li><b>${esc(p.name)}</b> <span>${esc(p.role)}</span>${p.note ? `<i>${esc(p.note)}</i>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Nobody assigned yet.</p>'}
  ${c.floating ? '' : `<h2>Divisions on this station</h2><p>${c.divisions.length ? esc(c.divisions.join(', ')) : '<span class="muted">None assigned; every division runs here when the meet has one station.</span>'}</p>
  <h2>Events in running order</h2>
  ${c.events.length ? `<ol class="events">${c.events.map((e) => `<li>
    <div class="ev"><b>Ev ${e.number}: ${esc(e.name)}</b> <span>${esc(e.scoring)}</span></div>
    ${e.spec.length ? `<div class="spec">${esc(e.spec.join(' · '))}</div>` : ''}
    ${e.loads.length ? `<ul class="loads">${e.loads.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<div class="muted">No weights set for these divisions.</div>'}
    ${e.notes ? `<div class="notes">${esc(e.notes)}</div>` : ''}
    ${e.videoUrl ? `<div class="video">Demo video: ${esc(e.videoUrl)}</div>` : ''}
  </li>`).join('')}</ol>` : '<p class="muted">No events yet.</p>'}`}
  <h2>Standards</h2>
  <ul class="std">${standards.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
  ${contact ? `<footer>${contact}</footer>` : ''}
</section>`).join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(input.meetName)}: briefing cards</title>
<style>
  body { font: 13px/1.4 -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; background: #f4f4f4; }
  .bar { position: sticky; top: 0; background: #111; color: #fff; padding: 10px 16px; display: flex; gap: 12px; align-items: center; }
  .bar button { font: inherit; font-weight: 800; padding: 6px 14px; border-radius: 8px; border: 0; background: #fff; color: #111; cursor: pointer; }
  .card { background: #fff; margin: 16px auto; max-width: 760px; padding: 24px 28px; border: 1px solid #ddd; border-radius: 12px; page-break-after: always; break-after: page; }
  header .meet { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #666; }
  h1 { margin: 2px 0 0; font-size: 26px; } header .when { color: #444; margin-bottom: 8px; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; margin: 16px 0 6px; color: #333; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
  ul, ol { margin: 0; padding-left: 18px; } li { margin: 3px 0; }
  .people li span { color: #555; margin-left: 6px; } .people li i { display: block; color: #555; font-style: normal; font-size: 12px; }
  .events > li { margin: 8px 0; } .ev span { color: #555; margin-left: 6px; } .spec, .notes, .video { font-size: 12px; color: #333; margin-top: 2px; }
  .loads { margin-top: 2px; } .muted { color: #777; } .std li { font-size: 12px; }
  footer { margin-top: 16px; font-size: 12px; color: #444; }
  @media print { body { background: #fff; } .bar { display: none; } .card { border: 0; margin: 0; max-width: none; padding: 0 0 12px; } }
</style></head>
<body><div class="bar"><b>Briefing cards</b> <span>${cards.length} pages, one per station plus the floating crew</span> <button onclick="window.print()">Print</button></div>
${body}
</body></html>`;
}
