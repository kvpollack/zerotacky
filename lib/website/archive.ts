// #11 (11/9): results archive imported from strongmanresults.com (CC BY 4.0) and, later, openstrongman.org (CC0).
// Shapes mirror the 050 RPC JSON. Facts as published; nothing here is official or ours. The credit line is a license
// condition, not decoration: every surface that shows archive rows renders ARCHIVE_CREDIT.

export const ARCHIVE_CREDIT = {
  text: 'Archive results via strongmanresults.com (CC BY 4.0); original scoring published on Iron Podium. ZeroTacky is not affiliated with either.',
  sourceName: 'strongmanresults.com',
  sourceUrl: 'https://strongmanresults.com',
  licenseName: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
  originalName: 'Iron Podium',
} as const;

export interface ArchiveEvent {
  num: number | null;
  event: string;
  type: string | null;        // reps | max | time | distance | medley as published, or null
  lift: string | null;        // canonical lift when the source mapped one
  unit: string | null;        // reps | lb | kg | sec | ft ...
  raw: string | null;         // exactly as published ("2+0:13")
  value: number | null;       // parsed by the source
  points: number | null;
}

export interface ArchiveCompetition {
  id: number;
  slug: string;
  name: string;
  date: string;               // YYYY-MM-DD
  sanction: string | null;    // sc | uss | psl
  city: string | null;
  state: string | null;
  division: string;
  place: number | null;
  points: number | null;
  weightClass: string | null;
  classKind: string | null;
  enteredAs: string;
  fieldSize: number;
  events: ArchiveEvent[];
}

export interface ArchiveSearchHit {
  key: string;
  name: string;
  competitions: number;
  firstDate: string;
  lastDate: string;
  states: string[];
  linked: boolean;
}

export interface ArchiveLink {
  id: string;
  key: string;
  status: 'pending' | 'approved' | 'rejected';
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  name: string | null;
  competitions: number;
}

export interface AdminArchiveLink extends ArchiveLink {
  username: string | null;
  displayName: string | null;
  location: string | null;
  email: string | null;
  states: string[];
  lastDate: string | null;
}

export interface ArchiveForProfile {
  keys: string[];
  competitions: ArchiveCompetition[];
}

/** Same rule as SQL zt_archive_norm: lower, letters and digits only, single spaces. */
export function normalizeArchiveKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

const SANCTIONS: Record<string, string> = { sc: 'Strongman Corporation', uss: 'United States Strongman', psl: 'PSL' };
export function sanctionLabel(code: string | null | undefined): string {
  if (!code) return '';
  return SANCTIONS[code.toLowerCase()] ?? code.toUpperCase();
}

const SUFFIX = (n: number) => {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) { case 1: return `${n}st`; case 2: return `${n}nd`; case 3: return `${n}rd`; default: return `${n}th`; }
};
export function formatArchivePlace(c: Pick<ArchiveCompetition, 'place' | 'fieldSize'>): string {
  if (c.place == null) return 'No place';
  return c.fieldSize > 1 ? `${SUFFIX(c.place)} of ${c.fieldSize}` : SUFFIX(c.place);
}

export function formatArchivePlaceCity(c: Pick<ArchiveCompetition, 'city' | 'state'>): string {
  return [c.city, c.state].filter((s) => s && s.trim()).join(', ');
}

/** "3 reps" / "200 lb" / "28.40 s" from the parsed value and unit; falls back to the raw text. */
export function formatArchiveResult(e: ArchiveEvent): string {
  if (e.value == null || !Number.isFinite(e.value)) return e.raw ?? '';
  const v = e.value;
  const u = (e.unit ?? '').toLowerCase();
  if (u === 'reps') return `${trimNum(v)} ${v === 1 ? 'rep' : 'reps'}`;
  if (u === 'sec' || u === 's') return `${v.toFixed(2)} s`;
  if (u === 'lb' || u === 'lbs' || u === 'kg' || u === 'ft' || u === 'm') return `${trimNum(v)} ${u === 'lbs' ? 'lb' : u}`;
  return u ? `${trimNum(v)} ${u}` : trimNum(v);
}
function trimNum(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

export interface ArchiveSummary {
  competitions: number;
  podiums: number;
  wins: number;
  firstDate: string | null;
  lastDate: string | null;
  states: string[];
}
export function summarizeArchive(cs: ArchiveCompetition[]): ArchiveSummary {
  const dates = cs.map((c) => c.date).filter(Boolean).sort();
  const states = Array.from(new Set(cs.map((c) => c.state).filter((s): s is string => !!s))).sort();
  return {
    competitions: cs.length,
    podiums: cs.filter((c) => c.place != null && c.place <= 3 && c.fieldSize > 1).length,
    wins: cs.filter((c) => c.place === 1 && c.fieldSize > 1).length,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    states,
  };
}

/** Rows newest first; identical slug + division (two approved keys covering the same entry) collapse to one. */
export function dedupeArchive(cs: ArchiveCompetition[]): ArchiveCompetition[] {
  const seen = new Set<string>();
  const out: ArchiveCompetition[] = [];
  for (const c of [...cs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.name.localeCompare(b.name)))) {
    const k = `${c.slug}|${c.division}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push(c);
  }
  return out;
}

/** Account-page signal: does the archive name look like this profile? Word overlap on the normalized keys. */
export function nameSimilarity(a: string, b: string): 'same' | 'close' | 'different' {
  const wa = new Set(normalizeArchiveKey(a).split(' ').filter(Boolean));
  const wb = new Set(normalizeArchiveKey(b).split(' ').filter(Boolean));
  if (!wa.size || !wb.size) return 'different';
  if (wa.size === wb.size && [...wa].every((w) => wb.has(w))) return 'same';
  const shared = [...wa].filter((w) => wb.has(w)).length;
  return shared >= 1 && shared >= Math.min(wa.size, wb.size) - 1 ? 'close' : 'different';
}

// ---- browser RPC wrappers (account page, admin queue) ----
import type { SupabaseClient } from '@supabase/supabase-js';
function rpcErr(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
}
export async function searchArchive(sb: SupabaseClient, name: string): Promise<ArchiveSearchHit[]> {
  const { data, error } = await sb.rpc('zt_archive_search', { p_name: name });
  if (error) throw new Error(rpcErr(error));
  return (data ?? []) as ArchiveSearchHit[];
}
export async function claimArchive(sb: SupabaseClient, key: string, note?: string): Promise<ArchiveLink> {
  const { data, error } = await sb.rpc('zt_archive_claim', { p_key: key, p_note: note ?? null });
  if (error) throw new Error(rpcErr(error));
  return data as ArchiveLink;
}
export async function withdrawArchiveClaim(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.rpc('zt_archive_withdraw', { p_id: id });
  if (error) throw new Error(rpcErr(error));
}
export async function fetchMyArchiveLinks(sb: SupabaseClient): Promise<ArchiveLink[]> {
  const { data, error } = await sb.rpc('zt_my_archive_links');
  if (error) throw new Error(rpcErr(error));
  return (data ?? []) as ArchiveLink[];
}
export async function fetchAdminArchiveLinks(sb: SupabaseClient): Promise<AdminArchiveLink[]> {
  const { data, error } = await sb.rpc('zt_list_archive_links');
  if (error) throw new Error(rpcErr(error));
  return (data ?? []) as AdminArchiveLink[];
}
export async function decideArchiveLink(sb: SupabaseClient, id: string, approve: boolean): Promise<ArchiveLink> {
  const { data, error } = await sb.rpc('zt_decide_archive_link', { p_id: id, p_approve: approve });
  if (error) throw new Error(rpcErr(error));
  return data as ArchiveLink;
}
