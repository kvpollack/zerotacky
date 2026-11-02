// Pure helpers for the Phase 5 scorer shell (no React): which nav tabs a role sees, the SHEET cell of the title
// block for each tab, the station chips, and the TV control state the live screen shows. Tested in test/scorer.test.mjs.
import type { Division, EventDef, Meet, Station } from '@/lib/types';

export type Tab = 'judge' | 'pitcrew' | 'standings' | 'setup';
export type RoleLock = 'admin' | 'judge' | 'pitcrew' | 'spectator';

export type NavTab = { id: Tab; label: string; glyph: string };

const ROLES: Record<Tab, RoleLock[]> = {
  judge: ['admin', 'judge'],
  pitcrew: ['admin', 'pitcrew', 'judge', 'spectator'],
  standings: ['admin', 'judge', 'pitcrew', 'spectator'],
  setup: ['admin'],
};

/** The bottom strip, in order, filtered by role. Spectators see the floor view as "Next Up" (Kurt 10/19). */
export function navTabs(role: RoleLock): NavTab[] {
  const all: NavTab[] = [
    { id: 'judge', label: 'Judge Pad', glyph: '\u25A1' },
    { id: 'pitcrew', label: role === 'spectator' ? 'Next Up' : 'Pit Crew', glyph: '\u25B6' },
    { id: 'standings', label: 'Standings', glyph: '\u2261' },
    { id: 'setup', label: 'Meet Setup', glyph: '\u2630' },
  ];
  return all.filter((t) => ROLES[t.id].includes(role));
}

export const SETUP_SECTIONS = [
  { id: 'meet', n: 1, label: 'Meet Details & Rules' },
  { id: 'divisions', n: 2, label: 'Divisions' },
  { id: 'events', n: 3, label: 'Events' },
  { id: 'stations', n: 4, label: 'Stations & Floor Plan' },
  { id: 'athletes', n: 5, label: 'Athletes' },
  { id: 'meets', n: 6, label: 'Meets, Demo Presets & Readiness Check' },
] as const;
export type SetupSectionId = (typeof SETUP_SECTIONS)[number]['id'];

/** SHEET cell of the title block. */
export function sheetLabel(tab: Tab, opts: { event?: EventDef | null; eventCount?: number; setupSection?: SetupSectionId }): string {
  switch (tab) {
    case 'judge':
    case 'pitcrew':
      return opts.event ? `E${opts.event.eventNumber}${opts.eventCount ? ` of ${opts.eventCount}` : ''}` : 'No event';
    case 'standings':
      return 'Standings';
    case 'setup': {
      const s = SETUP_SECTIONS.find((x) => x.id === opts.setupSection);
      return `Setup ${s ? s.n : 1} of ${SETUP_SECTIONS.length}`;
    }
  }
}

/** Station chips: the meet's stations (or the two defaults) plus All. Mirrors the old Header. */
export function stationChips(meet: Pick<Meet, 'stations'>): Array<{ id: string; label: string }> {
  const stations: Station[] =
    Array.isArray(meet.stations) && meet.stations.length > 0
      ? meet.stations
      : [{ id: 'A', label: 'Station 1' } as Station, { id: 'B', label: 'Station 2' } as Station];
  return [...stations.map((s) => ({ id: s.id, label: s.label })), { id: 'ALL', label: 'All' }];
}

/** Division option text: the station in brackets, the way the old picker read. */
export function divisionOption(d: Division, stations: Array<{ id: string; label: string }>): string {
  const st = stations.find((s) => s.id === d.flight);
  return `[${st ? st.label : `Unassigned (${d.flight})`}] ${d.name}`;
}

export type TvSheet = 'a' | 'b';
export type TvMode = 'home' | 'dark';
export type TvControl = { sheet: TvSheet; mode: TvMode };
export const TV_DEFAULT: TvControl = { sheet: 'a', mode: 'home' };

/** What the live screen shows while a TV control change is in flight or has failed. */
export function tvControlWord(state: 'idle' | 'saving' | 'error' | 'offline'): string {
  switch (state) {
    case 'saving': return 'Sending';
    case 'error': return 'Not sent';
    case 'offline': return 'Join the meet to drive the TV';
    default: return '';
  }
}

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
export const ordinal = (n: number): string => ORDINAL[n - 1] ?? `${n}th`;
