// "My Gym" (016, 10/20): a claimed listing's owner edits it from /website/account/gym. Reads go through the
// zt_my_gyms RPC (own rows only, owner_id included); writes are a plain update on `gyms`, which RLS limits to the
// owner's claimed rows and the column grant limits to the listing fields below. Slug, status and provenance never
// leave the server's hands. The server-side helpers here take a SupabaseClient so the account page and tests share them.

import type { SupabaseClient } from '@supabase/supabase-js';
import { GYM_EQUIPMENT } from './gymEquipment';
import type { DayPassAvailability } from './types';
import type { GymRow } from './supabaseGyms';

export interface MyGymRow extends GymRow {
  owner_id: string | null;
  socials: Record<string, string> | null;
}

export interface MyClaimRow {
  id: string;
  gym_id: string;
  kind: 'claim' | 'report';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  gym?: { slug: string; name: string; city: string; state: string } | null;
}

// Everything the owner may change; mirrors the UPDATE column grant in 016 minus lat/lng (set from the zip, below).
export interface GymPatch {
  name: string;
  gym_type: 'strongman' | 'powerlifting' | 'mixed';
  street_address: string;
  city: string;
  state: string;
  zip: string;
  website_url: string;
  phone: string;
  instagram: string;
  contact: string;
  day_pass_availability: DayPassAvailability;
  day_pass_price: string;
  day_pass_url: string;
  drop_in_policy: string;
  drop_in_hours: string;
  equipment: string[];
  equipment_notes: Record<string, string>;
  socials: Record<string, string>;
}

export const GYM_TYPES: ReadonlyArray<{ id: GymPatch['gym_type']; label: string; hint: string }> = [
  { id: 'strongman', label: 'Strongman', hint: 'Implements first; barbells too.' },
  { id: 'powerlifting', label: 'Powerlifting', hint: 'Comp racks, calibrated plates, platforms.' },
  { id: 'mixed', label: 'Both', hint: 'Strongman and powerlifting under one roof.' },
];

export const DAY_PASS_OPTIONS: ReadonlyArray<{ id: DayPassAvailability; label: string }> = [
  { id: 'available', label: 'Yes, walk in or buy online' },
  { id: 'by_appointment', label: 'By appointment, contact us first' },
  { id: 'not_available', label: 'No day passes' },
  { id: 'not_provided', label: 'Prefer not to say' },
];

export const GYM_SOCIAL_KEYS: ReadonlyArray<{ key: string; label: string; placeholder: string }> = [
  { key: 'facebook', label: 'Facebook', placeholder: 'facebook.com/yourgym' },
  { key: 'tiktok', label: 'TikTok', placeholder: '@yourgym' },
  { key: 'youtube', label: 'YouTube', placeholder: 'youtube.com/@yourgym' },
];

// Same ceilings as gyms_len_chk in 015 so a save never bounces on a constraint the form could have caught.
export const GYM_LIMITS = {
  name: 120, street_address: 160, city: 80, website_url: 300, phone: 30, instagram: 60, contact: 200,
  day_pass_price: 60, day_pass_url: 300, drop_in_policy: 600, drop_in_hours: 200, equipment_note: 160, social: 200,
} as const;

const KNOWN_EQUIPMENT = new Set(GYM_EQUIPMENT.map((e) => e.id));
const TYPES = new Set<string>(GYM_TYPES.map((t) => t.id));
const PASS = new Set<string>(DAY_PASS_OPTIONS.map((o) => o.id));

function clip(v: unknown, max: number): string {
  return String(v ?? '').trim().slice(0, max);
}

function cleanUrl(v: string): string {
  const s = v.trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function patchFromRow(row: MyGymRow): GymPatch {
  return {
    name: row.name,
    gym_type: row.gym_type,
    street_address: row.street_address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    website_url: row.website_url,
    phone: row.phone,
    instagram: row.instagram,
    contact: row.contact,
    day_pass_availability: row.day_pass_availability,
    day_pass_price: row.day_pass_price,
    day_pass_url: row.day_pass_url,
    drop_in_policy: row.drop_in_policy,
    drop_in_hours: row.drop_in_hours,
    equipment: [...(row.equipment ?? [])],
    equipment_notes: { ...(row.equipment_notes ?? {}) },
    socials: { ...(row.socials ?? {}) },
  };
}

// Trim, clip, normalise. Unknown equipment ids and notes for equipment the gym does not list are dropped; empty
// socials are dropped; the state is upper-cased; URLs get a scheme. Returns null with a message when the row would
// not be a usable listing.
export function cleanGymPatch(p: GymPatch): { patch: GymPatch; problem: null } | { patch: null; problem: string } {
  const name = clip(p.name, GYM_LIMITS.name);
  if (name.length < 2) return { patch: null, problem: 'Give the gym a name.' };
  const state = String(p.state ?? '').trim().toUpperCase(); // validate the whole value: clipping 'New York' to 'NE' would pass
  if (state && !/^[A-Z]{2}$/.test(state)) return { patch: null, problem: 'State is the two-letter code, like PA.' };
  const zip = String(p.zip ?? '').trim();
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) return { patch: null, problem: 'Zip is 5 digits (12345 or 12345-6789).' };
  const city = clip(p.city, GYM_LIMITS.city);
  if (!city || !state) return { patch: null, problem: 'City and state are needed so athletes can find you.' };
  const gym_type = TYPES.has(p.gym_type) ? p.gym_type : 'mixed';
  const day_pass_availability = PASS.has(p.day_pass_availability) ? p.day_pass_availability : 'not_provided';
  const equipment = Array.from(new Set((p.equipment ?? []).filter((id) => KNOWN_EQUIPMENT.has(id))));
  const equipment_notes: Record<string, string> = {};
  for (const id of equipment) {
    const note = clip(p.equipment_notes?.[id], GYM_LIMITS.equipment_note);
    if (note) equipment_notes[id] = note;
  }
  const socials: Record<string, string> = {};
  for (const sk of GYM_SOCIAL_KEYS) {
    const v = clip(p.socials?.[sk.key], GYM_LIMITS.social);
    if (v) socials[sk.key] = v;
  }
  return {
    problem: null,
    patch: {
      name, gym_type, city, state, zip,
      street_address: clip(p.street_address, GYM_LIMITS.street_address),
      website_url: cleanUrl(clip(p.website_url, GYM_LIMITS.website_url)),
      phone: clip(p.phone, GYM_LIMITS.phone),
      instagram: clip(p.instagram, GYM_LIMITS.instagram).replace(/^@/, ''),
      contact: clip(p.contact, GYM_LIMITS.contact),
      day_pass_availability,
      day_pass_price: clip(p.day_pass_price, GYM_LIMITS.day_pass_price),
      day_pass_url: cleanUrl(clip(p.day_pass_url, GYM_LIMITS.day_pass_url)),
      drop_in_policy: clip(p.drop_in_policy, GYM_LIMITS.drop_in_policy),
      drop_in_hours: clip(p.drop_in_hours, GYM_LIMITS.drop_in_hours),
      equipment, equipment_notes, socials,
    },
  };
}

export function patchKey(p: GymPatch): string {
  const c = cleanGymPatch(p);
  return c.patch ? JSON.stringify(c.patch) : JSON.stringify(p);
}

export async function fetchMyGyms(sb: SupabaseClient): Promise<MyGymRow[]> {
  const { data, error } = await sb.rpc('zt_my_gyms');
  if (error) throw error;
  return (data ?? []) as MyGymRow[];
}

export async function fetchMyClaims(sb: SupabaseClient): Promise<MyClaimRow[]> {
  const { data, error } = await sb.from('gym_claims').select('id,gym_id,kind,status,created_at').eq('kind', 'claim').order('created_at', { ascending: false });
  if (error) throw error;
  const claims = (data ?? []) as MyClaimRow[];
  const ids = Array.from(new Set(claims.map((c) => c.gym_id)));
  if (ids.length === 0) return claims;
  const g = await sb.from('gyms').select('id,slug,name,city,state').in('id', ids);
  if (g.error) throw g.error;
  const byId = new Map((g.data ?? []).map((r) => [r.id as string, r as { id: string; slug: string; name: string; city: string; state: string }]));
  return claims.map((c) => ({ ...c, gym: byId.get(c.gym_id) ?? null }));
}

// Zip centroid from the site's own static table (/api/zip). A moved gym keeps a sensible pin without a geocoder key.
export async function zipLatLng(zip: string, fetchImpl: typeof fetch = fetch): Promise<{ lat: number; lng: number } | null> {
  const z = zip.trim().slice(0, 5);
  if (!/^\d{5}$/.test(z)) return null;
  try {
    const res = await fetchImpl(`/api/zip/${z}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { lat?: number; lng?: number };
    return typeof j.lat === 'number' && typeof j.lng === 'number' ? { lat: j.lat, lng: j.lng } : null;
  } catch {
    return null;
  }
}

export async function saveMyGym(sb: SupabaseClient, id: string, patch: GymPatch, pin: { lat: number; lng: number } | null): Promise<MyGymRow> {
  const body: Record<string, unknown> = { ...patch };
  if (pin) { body.lat = pin.lat; body.lng = pin.lng; }
  const { error } = await sb.from('gyms').update(body).eq('id', id);
  if (error) throw error;
  const rows = await fetchMyGyms(sb);
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error('Saved, but the listing did not come back. Reload the page.');
  return row;
}

// ---------- 017: add my gym + admin approval ----------
export interface AddGymInput {
  name: string; gym_type: GymPatch['gym_type']; street_address: string; city: string; state: string; zip: string;
  website_url: string; phone: string; instagram: string; contact: string; role: string; message: string;
}

export function cleanAddGym(i: AddGymInput): { input: AddGymInput; problem: null } | { input: null; problem: string } {
  const name = clip(i.name, GYM_LIMITS.name);
  if (name.length < 2) return { input: null, problem: 'Give the gym a name.' };
  const state = String(i.state ?? '').trim().toUpperCase();
  const city = clip(i.city, GYM_LIMITS.city);
  if (!city || !/^[A-Z]{2}$/.test(state)) return { input: null, problem: 'City and the two-letter state are needed.' };
  const zip = String(i.zip ?? '').trim();
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) return { input: null, problem: 'Zip is 5 digits (12345 or 12345-6789).' };
  const website_url = cleanUrl(clip(i.website_url, GYM_LIMITS.website_url));
  const instagram = clip(i.instagram, GYM_LIMITS.instagram).replace(/^@/, '');
  if (!website_url && !instagram) return { input: null, problem: 'A website or an Instagram handle is needed so we can confirm the gym exists.' };
  return {
    problem: null,
    input: {
      name, city, state, zip, website_url, instagram,
      gym_type: TYPES.has(i.gym_type) ? i.gym_type : 'mixed',
      street_address: clip(i.street_address, GYM_LIMITS.street_address),
      phone: clip(i.phone, GYM_LIMITS.phone),
      contact: clip(i.contact, GYM_LIMITS.contact),
      role: clip(i.role, 40),
      message: clip(i.message, 1000),
    },
  };
}

export async function addMyGym(sb: SupabaseClient, i: AddGymInput, pin: { lat: number; lng: number } | null): Promise<MyGymRow> {
  const { data, error } = await sb.rpc('zt_add_gym', {
    p_name: i.name, p_gym_type: i.gym_type, p_street: i.street_address, p_city: i.city, p_state: i.state, p_zip: i.zip,
    p_website: i.website_url, p_phone: i.phone, p_instagram: i.instagram, p_contact: i.contact, p_role: i.role, p_message: i.message,
    p_lat: pin?.lat ?? null, p_lng: pin?.lng ?? null,
  });
  if (error) throw error;
  return data as MyGymRow;
}

export interface AdminClaimRow {
  id: string; kind: 'claim' | 'report'; status: string; name: string; email: string; role: string; message: string;
  user_id: string | null; created_at: string; gym_id: string; gym_slug: string; gym_name: string; gym_city: string; gym_state: string;
  gym_status: 'pending' | 'unclaimed' | 'claimed' | 'removed'; gym_website: string; gym_source_url: string;
  claimant_display_name: string | null; pending_claims_on_gym: number;
}

export async function fetchIsAdmin(sb: SupabaseClient): Promise<boolean> {
  const { data, error } = await sb.rpc('zt_is_admin');
  if (error) return false;
  return data === true;
}

export async function fetchAdminClaims(sb: SupabaseClient): Promise<AdminClaimRow[]> {
  const { data, error } = await sb.rpc('zt_list_gym_claims');
  if (error) throw error;
  return (data ?? []) as AdminClaimRow[];
}

export async function adminApproveClaim(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.rpc('zt_approve_gym_claim', { p_claim: id });
  if (error) throw error;
}
export async function adminRejectClaim(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.rpc('zt_reject_gym_claim', { p_claim: id });
  if (error) throw error;
}
export async function adminResolveReport(sb: SupabaseClient, id: string, handled: boolean): Promise<void> {
  const { error } = await sb.rpc('zt_resolve_gym_report', { p_claim: id, p_handled: handled });
  if (error) throw error;
}
export async function adminRemoveGym(sb: SupabaseClient, gymId: string): Promise<void> {
  const { error } = await sb.rpc('zt_remove_gym', { p_gym: gymId });
  if (error) throw error;
}

// Host of the claimant's email vs the gym's website host: the quickest honest signal an approver has.
export function emailMatchesSite(email: string, website: string): 'match' | 'mismatch' | 'generic' | 'unknown' {
  const dom = email.split('@')[1]?.toLowerCase().trim();
  if (!dom) return 'unknown';
  const generic = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'me.com', 'live.com', 'proton.me', 'protonmail.com']);
  if (generic.has(dom)) return 'generic';
  if (!website.trim()) return 'unknown';
  let host = '';
  try { host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.toLowerCase(); } catch { return 'unknown'; }
  host = host.replace(/^www\./, '');
  return host === dom || host.endsWith('.' + dom) || dom.endsWith('.' + host) ? 'match' : 'mismatch';
}
