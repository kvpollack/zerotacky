// Public athlete profiles (020_athlete_directory.sql, ROADMAP s7). Reads come from the `zt_public_profiles` view,
// which only returns opted-in rows and only the public columns; this file maps a view row to what the pages render
// and holds the pure filter the directory uses. No demo fixtures: a build without a backend shows an empty directory.

import { cleanPRs, cleanSocials, favoriteLiftLabel, type ProfilePR, type ProfileSocials } from '../auth/profile';

export const PUBLIC_PROFILE_COLS =
  'id,username,display_name,is_athlete,is_promoter,is_gym_owner,is_trainer,trainer_in_person,trainer_online,' +
  'favorite_lift,favorite_lift_note,location,home_gym_name,prs,socials,avatar_path,updated_at';

export interface PublicProfileRow {
  id: string;
  username: string;
  display_name: string;
  is_athlete: boolean;
  is_promoter: boolean;
  is_gym_owner: boolean;
  is_trainer: boolean;
  trainer_in_person: boolean;
  trainer_online: boolean;
  favorite_lift: string;
  favorite_lift_note: string;
  location: string;
  home_gym_name: string;
  prs: unknown;
  socials: unknown;
  avatar_path: string;
  updated_at: string | null;
}

export type AthleteRole = 'athlete' | 'promoter' | 'gym_owner' | 'trainer';

export interface PublicAthlete {
  id: string;
  username: string;
  displayName: string;        // display_name, else @username
  roles: AthleteRole[];
  badges: string[];           // "Athlete", "Trainer (in person, online)" ...
  favoriteLift: string;       // label, '' when unset
  favoriteLiftNote: string;
  location: string;           // as entered (Kurt 10/21: no state-level hiding for now)
  state: string;              // 2-letter guess from the end of `location`, '' when none
  homeGymName: string;
  trainerInPerson: boolean;   // only meaningful when roles has 'trainer'
  trainerOnline: boolean;
  prs: ProfilePR[];
  socials: ProfileSocials;
  avatarUrl: string;          // public storage URL or ''
  updatedAt: string | null;
}

export const ROLE_OPTIONS: ReadonlyArray<{ id: AthleteRole; label: string }> = [
  { id: 'athlete', label: 'Athlete' },
  { id: 'promoter', label: 'Promoter' },
  { id: 'gym_owner', label: 'Gym owner' },
  { id: 'trainer', label: 'Trainer' },
];

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME',
  'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI',
  'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
]);
const STATE_NAMES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
  delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI',
  minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH',
  oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD',
  tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'washington dc': 'DC', 'washington, dc': 'DC', 'district of columbia': 'DC',
};

const NAME_TO_CODE = new Map(Object.entries(STATE_NAMES));
const ZIP_TAIL = /\s+\d{5}(-\d{4})?$/;
const COUNTRY = /^(usa?|u\.s\.a?\.?|united states( of america)?)$/i;
// Same country words glued to the end of a single component: "Austin TX United States", "Columbus Ohio USA".
const COUNTRY_TAIL = /\s+(usa|u\.s\.a?\.?|united states( of america)?)\.?$/i;

// One comma-separated component -> state code or ''. "PA", "PA 19014", "Pennsylvania", "West Virginia 25301".
function stateFromComponent(component: string): string {
  const c = component.trim().replace(ZIP_TAIL, '').trim();
  if (!c) return '';
  const upper = c.toUpperCase().replace(/\./g, '');
  if (upper.length === 2 && US_STATES.has(upper)) return upper;
  return NAME_TO_CODE.get(c.toLowerCase().replace(/\s+/g, ' ')) ?? '';
}

// "Aston, PA", "Aston PA 19014", "Kansas City, Missouri", "Charleston, West Virginia", "Columbus, Ohio, USA" -> code;
// "Nashville", "Kansas City", "London, UK", "in the gym" -> ''. The state is read from the END of the location (Astra
// AD-M2: a substring scan put Kansas City, Missouri in KS and West Virginia in VA), with trailing country dropped.
export function stateFromLocation(location: string): string {
  const parts = (location ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  while (parts.length && COUNTRY.test(parts[parts.length - 1])) parts.pop();
  if (!parts.length) return '';
  const last = parts[parts.length - 1];
  const whole = stateFromComponent(last);
  if (whole) return whole;
  // Single component with spaces ("Aston PA 19014", "Charleston West Virginia", "Columbus Ohio", "Austin TX United
  // States"): drop a trailing country and zip, then try the trailing three, two and one words as a state name, then the
  // trailing word as a code. One-word names are a guess ("Port Washington" reads WA); the filter is a convenience.
  const words = last.replace(COUNTRY_TAIL, '').replace(ZIP_TAIL, '').trim().split(/\s+/);
  if (words.length >= 2) {
    for (const n of [3, 2, 1]) {
      if (words.length <= n) continue;
      const code = NAME_TO_CODE.get(words.slice(-n).join(' ').toLowerCase());
      if (code) return code;
    }
    const one = words[words.length - 1].toUpperCase().replace(/\./g, '');
    if (one.length === 2 && US_STATES.has(one)) return one;   // "Aston PA"
  }
  return '';
}

// Query-string filters for /athletes (Astra AD-RL2): a state code we know, a role we offer, or ALL.
export function cleanStateParam(v: string | string[] | undefined): string {
  const s = (Array.isArray(v) ? v[0] : v ?? '').trim().toUpperCase();
  return US_STATES.has(s) ? s : 'ALL';
}
export function cleanModeParam(v: string | string[] | undefined): string {
  const s = (Array.isArray(v) ? v[0] : v ?? '').trim().toLowerCase().replace(/-/g, '_');
  return TRAINER_MODE_OPTIONS.some((o) => o.id === s) ? s : 'ALL';
}
export function cleanRoleParam(v: string | string[] | undefined): string {
  const s = (Array.isArray(v) ? v[0] : v ?? '').trim().toLowerCase().replace(/-/g, '_');
  return ROLE_OPTIONS.some((o) => o.id === s) ? s : 'ALL';
}
export function cleanSearchParam(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v ?? '').trim().slice(0, 60);
}

export function avatarUrlFromPath(supabaseUrl: string | null | undefined, path: string): string {
  const p = (path ?? '').trim();
  if (!p || !supabaseUrl) return '';
  if (p.includes('..') || p.startsWith('/')) return '';
  return `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/avatars/${p.split('/').map(encodeURIComponent).join('/')}`;
}

export function rolesOf(row: Pick<PublicProfileRow, 'is_athlete' | 'is_promoter' | 'is_gym_owner' | 'is_trainer'>): AthleteRole[] {
  const out: AthleteRole[] = [];
  if (row.is_athlete) out.push('athlete');
  if (row.is_promoter) out.push('promoter');
  if (row.is_gym_owner) out.push('gym_owner');
  if (row.is_trainer) out.push('trainer');
  return out;
}

export function mapPublicProfileRow(row: PublicProfileRow, supabaseUrl: string | null | undefined): PublicAthlete {
  const roles = rolesOf(row);
  const trainerBits = [row.trainer_in_person ? 'in person' : '', row.trainer_online ? 'online' : ''].filter(Boolean);
  const badges = roles.map((r) => {
    const label = ROLE_OPTIONS.find((o) => o.id === r)?.label ?? r;
    return r === 'trainer' && trainerBits.length ? `${label} (${trainerBits.join(', ')})` : label;
  });
  const username = String(row.username ?? '').trim();
  const displayName = String(row.display_name ?? '').trim() || `@${username}`;
  return {
    id: row.id,
    username,
    displayName,
    roles,
    badges,
    favoriteLift: favoriteLiftLabel(row.favorite_lift ?? ''),
    favoriteLiftNote: String(row.favorite_lift_note ?? '').trim(),
    location: String(row.location ?? '').trim(),
    state: stateFromLocation(row.location ?? ''),
    homeGymName: String(row.home_gym_name ?? '').trim(),
    trainerInPerson: !!row.is_trainer && !!row.trainer_in_person,
    trainerOnline: !!row.is_trainer && !!row.trainer_online,
    prs: cleanPRs(row.prs),
    socials: cleanSocials(row.socials),
    avatarUrl: avatarUrlFromPath(supabaseUrl, row.avatar_path ?? ''),
    updatedAt: row.updated_at ?? null,
  };
}

export interface AthleteFilterQuery {
  search?: string;
  state?: string;   // 'ALL' or a code
  role?: string;    // 'ALL' or an AthleteRole
  mode?: string;    // 'ALL' | 'in_person' | 'online' (trainers only; /trainers)
}

export const TRAINER_MODE_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'in_person', label: 'In person' },
  { id: 'online', label: 'Online' },
];

export function filterPublicAthletes(list: PublicAthlete[], q: AthleteFilterQuery): PublicAthlete[] {
  const search = (q.search ?? '').trim().toLowerCase().replace(/^@/, '');
  const state = (q.state ?? 'ALL').trim().toUpperCase() || 'ALL';
  const role = (q.role ?? 'ALL').trim().toLowerCase() || 'all';
  const mode = (q.mode ?? 'ALL').trim().toLowerCase() || 'all';
  return list.filter((a) => {
    if (state !== 'ALL' && a.state !== state) return false;
    if (role !== 'all' && !a.roles.includes(role as AthleteRole)) return false;
    if (mode === 'in_person' && !a.trainerInPerson) return false;
    if (mode === 'online' && !a.trainerOnline) return false;
    if (search && !a.displayName.toLowerCase().includes(search) && !a.username.includes(search)) return false;
    return true;
  });
}

// Directory order: name, then username, so the list is stable between loads.
export function sortAthletes(list: PublicAthlete[]): PublicAthlete[] {
  return [...list].sort((a, b) => a.displayName.localeCompare(b.displayName) || a.username.localeCompare(b.username));
}

export function collectAthleteStates(list: PublicAthlete[]): string[] {
  return [...new Set(list.map((a) => a.state).filter(Boolean))].sort();
}

// Usernames arrive from the URL; keep the lookup to the shape the database allows.
export function cleanUsernameParam(raw: string | null | undefined): string {
  let decoded = raw ?? '';
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    return '';   // malformed percent-encoding (Astra AD-L3): not a username, never a throw
  }
  const u = decoded.trim().replace(/^@+/, '').toLowerCase();
  return /^[a-z0-9_]{3,30}$/.test(u) ? u : '';
}
