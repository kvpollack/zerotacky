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
  wisconsin: 'WI', wyoming: 'WY', 'washington dc': 'DC', 'washington, dc': 'DC',
};

// "Aston, PA", "Aston PA 19014", "Pennsylvania", "Columbus, Ohio, USA" -> state code; anything else ''.
export function stateFromLocation(location: string): string {
  const loc = (location ?? '').trim();
  if (!loc) return '';
  // A code wins when it ends the string or is followed only by a zip ("Aston PA 19014"); "in the gym" is not Indiana.
  const tokens = loc.toUpperCase().replace(/\b(U\.?S\.?A?\.?|UNITED STATES)\b/g, '').split(/[\s,]+/).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i].replace(/[^A-Z]/g, '');
    const rest = tokens.slice(i + 1);
    if (t.length === 2 && tokens[i].length === 2 && US_STATES.has(t) && rest.every((r) => /^\d{5}(-\d{4})?$/.test(r))) return t;
  }
  const lower = loc.toLowerCase();
  for (const [name, code] of Object.entries(STATE_NAMES)) {
    if (new RegExp(`(^|[\\s,])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[\\s,])`).test(lower)) return code;
  }
  return '';
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
}

export function filterPublicAthletes(list: PublicAthlete[], q: AthleteFilterQuery): PublicAthlete[] {
  const search = (q.search ?? '').trim().toLowerCase().replace(/^@/, '');
  const state = (q.state ?? 'ALL').trim().toUpperCase() || 'ALL';
  const role = (q.role ?? 'ALL').trim().toLowerCase() || 'all';
  return list.filter((a) => {
    if (state !== 'ALL' && a.state !== state) return false;
    if (role !== 'all' && !a.roles.includes(role as AthleteRole)) return false;
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
  const u = decodeURIComponent(raw ?? '').trim().replace(/^@+/, '').toLowerCase();
  return /^[a-z0-9_]{3,30}$/.test(u) ? u : '';
}
