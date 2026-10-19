// Profile row (supabase/003_auth.sql). One account can be athlete, promoter and gym owner at once; the flags
// are self-declared and only shape the UI. Authorization stays on meets.owner_id / meet_members (RLS).
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  email: string | null;
  display_name: string;
  is_athlete: boolean;
  is_promoter: boolean;
  is_gym_owner: boolean;
  created_at: string;
  updated_at: string;
}

export type ProfilePatch = Partial<Pick<Profile, 'display_name' | 'is_athlete' | 'is_promoter' | 'is_gym_owner'>>;

export const PROFILE_COLUMNS = 'id,email,display_name,is_athlete,is_promoter,is_gym_owner,created_at,updated_at';

export async function fetchProfile(sb: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data, error } = await sb.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile | null) ?? null;
}

export async function saveProfile(sb: SupabaseClient, userId: string, patch: ProfilePatch): Promise<Profile> {
  const clean: ProfilePatch = { ...patch };
  if (typeof clean.display_name === 'string') clean.display_name = clean.display_name.trim().slice(0, 80);
  const { data, error } = await sb.from('profiles').update(clean).eq('id', userId).select(PROFILE_COLUMNS).single();
  if (error) throw new Error(error.message);
  return data as Profile;
}

// What to call the person in the UI: display name, else the part of the email before @.
export function profileLabel(p: Pick<Profile, 'display_name' | 'email'> | null | undefined, fallbackEmail?: string | null): string {
  const name = p?.display_name?.trim();
  if (name) return name;
  const email = p?.email ?? fallbackEmail ?? '';
  return email.includes('@') ? email.split('@')[0] : email || 'Account';
}

export function roleBadges(p: Pick<Profile, 'is_athlete' | 'is_promoter' | 'is_gym_owner'> | null | undefined): string[] {
  if (!p) return [];
  const out: string[] = [];
  if (p.is_athlete) out.push('Athlete');
  if (p.is_promoter) out.push('Promoter');
  if (p.is_gym_owner) out.push('Gym owner');
  return out;
}
