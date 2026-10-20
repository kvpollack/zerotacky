// Profile row (supabase/003_auth.sql + 013_profile_fields.sql). One account can be athlete, promoter, gym owner,
// and trainer at once; the flags are self-declared and only shape the UI. Authorization stays on meets.owner_id /
// meet_members (RLS). The "about you" fields (Kurt 10/20) are optional and shown only on the account page for now.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProfilePR {
  lift: string;   // "Log press"
  value: string;  // "315 lb", "140 kg x 3"
}

export type SocialKey = 'instagram' | 'youtube' | 'tiktok' | 'x' | 'facebook' | 'website';
export type ProfileSocials = Partial<Record<SocialKey, string>>;

export interface Profile {
  id: string;
  email: string | null;
  display_name: string;
  is_athlete: boolean;
  is_promoter: boolean;
  is_gym_owner: boolean;
  favorite_lift: string;        // one of FAVORITE_LIFT_OPTIONS ids, or ''
  favorite_lift_note: string;   // free text: variation, best number, why
  location: string;
  home_gym_name: string;
  prs: ProfilePR[];             // up to 3
  is_trainer: boolean;
  trainer_in_person: boolean;
  trainer_online: boolean;
  socials: ProfileSocials;      // handles without @, website as a URL
  avatar_path: string;          // storage path in the avatars bucket, '<uid>/avatar-<ts>.<ext>' or ''
  created_at: string;
  updated_at: string;
}

export type ProfilePatch = Partial<Omit<Profile, 'id' | 'email' | 'created_at' | 'updated_at'>>;

export const PROFILE_COLUMNS =
  'id,email,display_name,is_athlete,is_promoter,is_gym_owner,favorite_lift,favorite_lift_note,location,home_gym_name,prs,' +
  'is_trainer,trainer_in_person,trainer_online,socials,avatar_path,created_at,updated_at';

export const FAVORITE_LIFT_OPTIONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'log', label: 'Log press' },
  { id: 'axle', label: 'Axle press' },
  { id: 'circus_db', label: 'Circus dumbbell' },
  { id: 'deadlift', label: 'Deadlift' },
  { id: 'yoke', label: 'Yoke' },
  { id: 'farmers', label: "Farmer's carry" },
  { id: 'stones', label: 'Atlas stones' },
  { id: 'sandbag', label: 'Sandbag' },
  { id: 'keg', label: 'Keg' },
  { id: 'husafell', label: 'Husafell / Conan\u2019s wheel' },
  { id: 'truck_pull', label: 'Truck pull' },
  { id: 'other', label: 'Other' },
];

export const SOCIAL_KEYS: ReadonlyArray<{ key: SocialKey; label: string; placeholder: string }> = [
  { key: 'instagram', label: 'Instagram', placeholder: 'handle' },
  { key: 'tiktok', label: 'TikTok', placeholder: 'handle' },
  { key: 'youtube', label: 'YouTube', placeholder: 'channel handle' },
  { key: 'x', label: 'X', placeholder: 'handle' },
  { key: 'facebook', label: 'Facebook', placeholder: 'page or profile name' },
  { key: 'website', label: 'Website', placeholder: 'https://' },
];

export const MAX_PRS = 3;
const LIMITS = { display_name: 80, favorite_lift: 40, favorite_lift_note: 120, location: 80, home_gym_name: 80, pr_lift: 40, pr_value: 40, handle: 60, website: 200, avatar_path: 200 } as const;

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

// "@kurt", "https://www.instagram.com/kurt/", "instagram.com/kurt?x=1" all become "kurt".
export function cleanHandle(raw: unknown): string {
  let s = str(raw, 400);
  if (!s) return '';
  // Only treat the first segment as a host when it was written like a link; "kurt.lifts" alone is a handle.
  const linkLike = /^(https?:\/\/|www\.)/i.test(s);
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (linkLike || /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(s)) s = s.replace(/^[^/]+\/?/, '');
  s = s.split(/[?#]/)[0].replace(/\/+$/, '');
  s = s.replace(/^@+/, '');
  return s.slice(0, LIMITS.handle);
}

// Websites keep a scheme so the UI can link them; anything that is not http(s) is dropped.
export function cleanWebsite(raw: unknown): string {
  let s = str(raw, 400);
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    if (!u.hostname.includes('.')) return '';
    return u.toString().slice(0, LIMITS.website);
  } catch {
    return '';
  }
}

export function cleanSocials(raw: unknown): ProfileSocials {
  const out: ProfileSocials = {};
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const { key } of SOCIAL_KEYS) {
    const v = key === 'website' ? cleanWebsite(r[key]) : cleanHandle(r[key]);
    if (v) out[key] = v;
  }
  return out;
}

export function cleanPRs(raw: unknown): ProfilePR[] {
  if (!Array.isArray(raw)) return [];
  const out: ProfilePR[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const lift = str((item as { lift?: unknown }).lift, LIMITS.pr_lift);
    const value = str((item as { value?: unknown }).value, LIMITS.pr_value);
    if (!lift && !value) continue;
    out.push({ lift, value });
    if (out.length >= MAX_PRS) break;
  }
  return out;
}

// Trim, cap, and drop anything the form could not have produced. Pure so the tests can hit it directly; the
// database check constraints in 013 are the backstop.
export function cleanProfilePatch(patch: ProfilePatch): ProfilePatch {
  const c: ProfilePatch = {};
  if ('display_name' in patch) c.display_name = str(patch.display_name, LIMITS.display_name);
  for (const k of ['is_athlete', 'is_promoter', 'is_gym_owner', 'is_trainer', 'trainer_in_person', 'trainer_online'] as const) {
    if (k in patch) c[k] = !!patch[k];
  }
  if ('favorite_lift' in patch) {
    const id = str(patch.favorite_lift, LIMITS.favorite_lift);
    c.favorite_lift = FAVORITE_LIFT_OPTIONS.some((o) => o.id === id) ? id : '';
  }
  if ('favorite_lift_note' in patch) c.favorite_lift_note = str(patch.favorite_lift_note, LIMITS.favorite_lift_note);
  if ('location' in patch) c.location = str(patch.location, LIMITS.location);
  if ('home_gym_name' in patch) c.home_gym_name = str(patch.home_gym_name, LIMITS.home_gym_name);
  if ('prs' in patch) c.prs = cleanPRs(patch.prs);
  if ('socials' in patch) c.socials = cleanSocials(patch.socials);
  if ('avatar_path' in patch) c.avatar_path = str(patch.avatar_path, LIMITS.avatar_path);
  // A trainer who is neither in-person nor online is still a trainer; a non-trainer has neither.
  if (c.is_trainer === false) { c.trainer_in_person = false; c.trainer_online = false; }
  return c;
}

// Rows written before 013 (or a fake client in tests) may lack the new columns; fill them so the UI never sees undefined.
export function normalizeProfile(row: Partial<Profile> & Pick<Profile, 'id'>): Profile {
  return {
    id: row.id,
    email: row.email ?? null,
    display_name: row.display_name ?? '',
    is_athlete: !!row.is_athlete,
    is_promoter: !!row.is_promoter,
    is_gym_owner: !!row.is_gym_owner,
    favorite_lift: row.favorite_lift ?? '',
    favorite_lift_note: row.favorite_lift_note ?? '',
    location: row.location ?? '',
    home_gym_name: row.home_gym_name ?? '',
    prs: cleanPRs(row.prs),
    is_trainer: !!row.is_trainer,
    trainer_in_person: !!row.trainer_in_person,
    trainer_online: !!row.trainer_online,
    socials: cleanSocials(row.socials),
    avatar_path: row.avatar_path ?? '',
    created_at: row.created_at ?? '',
    updated_at: row.updated_at ?? '',
  };
}

export async function fetchProfile(sb: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await sb.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? normalizeProfile(data as unknown as Partial<Profile> & Pick<Profile, 'id'>) : null;
}

export async function saveProfile(sb: SupabaseClient, userId: string, patch: ProfilePatch): Promise<Profile> {
  const clean = cleanProfilePatch(patch);
  const { data, error } = await sb.from('profiles').update(clean).eq('id', userId).select(PROFILE_COLUMNS).single();
  if (error) throw new Error(error.message);
  return normalizeProfile(data as unknown as Partial<Profile> & Pick<Profile, 'id'>);
}

// What to call the person in the UI: display name, else the part of the email before @.
export function profileLabel(p: Pick<Profile, 'display_name' | 'email'> | null | undefined, fallbackEmail?: string | null): string {
  const name = p?.display_name?.trim();
  if (name) return name;
  const email = p?.email ?? fallbackEmail ?? '';
  return email.includes('@') ? email.split('@')[0] : email || 'Account';
}

export function roleBadges(p: Partial<Pick<Profile, 'is_athlete' | 'is_promoter' | 'is_gym_owner' | 'is_trainer'>> | null | undefined): string[] {
  if (!p) return [];
  const out: string[] = [];
  if (p.is_athlete) out.push('Athlete');
  if (p.is_promoter) out.push('Promoter');
  if (p.is_gym_owner) out.push('Gym owner');
  if (p.is_trainer) out.push('Trainer');
  return out;
}

export function favoriteLiftLabel(id: string): string {
  return FAVORITE_LIFT_OPTIONS.find((o) => o.id === id)?.label ?? '';
}

// Link for a social entry; handles map to the network's profile URL, website is used as-is.
export function socialUrl(key: SocialKey, value: string): string {
  const v = encodeURIComponent(value);
  switch (key) {
    case 'instagram': return `https://www.instagram.com/${v}/`;
    case 'tiktok': return `https://www.tiktok.com/@${v}`;
    case 'youtube': return `https://www.youtube.com/@${v}`;
    case 'x': return `https://x.com/${v}`;
    case 'facebook': return `https://www.facebook.com/${v}`;
    case 'website': return value;
  }
}
