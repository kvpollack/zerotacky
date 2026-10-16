import type { ThemeDef } from './types';

export const STORAGE_KEY = 'ZEROTACKY_OFFLINE_STATE_V2';
export const ALL_POSSIBLE_PLATES = [100, 55, 45, 35, 25, 15, 10, 5, 2.5];

export const SNAPSHOT_STORAGE_KEY = 'ZEROTACKY_SNAPSHOTS_V1';
export const SNAPSHOT_LIMIT = 8;
export const SNAPSHOT_MIN_GAP_MS = 60_000;
export const ROLE_STORAGE_KEY = 'ZEROTACKY_ROLE_V1';
export const THEME_STORAGE_KEY = 'ZEROTACKY_THEME_V1';
export const DEFAULT_THEME_ID = 'steel';
export const DAYLIGHT_THEME_ID = 'daylight';

export const THEMES: ThemeDef[] = [
  { id: 'steel', name: 'Calibrated Steel', tagline: 'Graphite • Comp Red • Calibrated Blue', surface: '#111317', primary: '#E11D48', secondary: '#2563EB' },
  { id: 'volt', name: 'Power Plant Volt', tagline: 'Midnight • Cyan • Neon Volt', surface: '#0B1120', primary: '#06B6D4', secondary: '#84CC16' },
  { id: 'brass', name: 'Iron & Brass', tagline: 'Charcoal • Brass • Rust Crimson', surface: '#171614', primary: '#D4AF37', secondary: '#B91C1C' },
  { id: 'navy', name: 'Federation Navy', tagline: 'Oxford Navy • Sky • Gold Medal', surface: '#0A1128', primary: '#38BDF8', secondary: '#FACC15' },
  { id: 'timber', name: 'Highland Timber', tagline: 'Pine Slate • Copper • Sage', surface: '#0D1713', primary: '#D97706', secondary: '#10B981' },
  { id: 'cobalt', name: 'Titanium & Cobalt', tagline: 'Titanium • Cobalt • Teal', surface: '#18181B', primary: '#3B82F6', secondary: '#14B8A6' },
  { id: 'venom', name: 'Spotlight Venom', tagline: 'Obsidian • Violet • Laser Rose', surface: '#0D0B14', primary: '#8B5CF6', secondary: '#F43F5E' },
  { id: 'daylight', name: 'Outdoor Daylight', tagline: 'Chalk • White • Royal Cobalt', surface: '#F8FAFC', primary: '#1D4ED8', secondary: '#09090B' },
];
