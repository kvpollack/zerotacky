// 053 adopt an archive show (Kurt 11/9): a promoter or gym owner turns an archive competition (050) into a completed
// ZeroTacky meet under their account. The engine never rescores an adopted meet (events carry `imported`, results carry
// importedPoints / importedDisplay, overall places come from meet_imported_placings) and every surface prints the
// credit line as a disclaimer. Thin wrappers over the RPCs plus the pure helpers the UI and tests share.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ArchiveSearchRow {
  slug: string;
  name: string;
  date: string;
  sanction: string | null;
  city: string | null;
  state: string | null;
  athletes: number;
  divisions: number;
  events: number;
  adopted: { slug: string; id: string; mine: boolean } | null;
}
export interface AdoptResult { meetId: string; slug: string; athletes: number; events: number; results: number }

export const IMPORT_DISCLAIMER_CAP = 'Imported results';

/** Short label for a list card or a banner headline. */
export function importedHeadline(sourceName: string): string {
  return sourceName === 'strongmanresults.com'
    ? 'Results imported from Iron Podium via strongmanresults.com'
    : `Results imported from ${sourceName || 'an outside source'}`;
}

/** "Parkesburg, PA" / "PA" / "" */
export function archivePlace(r: Pick<ArchiveSearchRow, 'city' | 'state'>): string {
  return [r.city, r.state].filter((s): s is string => !!s && s.trim().length > 0).join(', ');
}

/** "32 athletes · 12 divisions · 5 events" */
export function archiveCounts(r: Pick<ArchiveSearchRow, 'athletes' | 'divisions' | 'events'>): string {
  const n = (v: number, one: string) => `${v} ${v === 1 ? one : one + 's'}`;
  return `${n(r.athletes, 'athlete')} · ${n(r.divisions, 'division')} · ${n(r.events, 'event')}`;
}

export type AdoptState = 'open' | 'mine' | 'taken';
export function adoptState(r: Pick<ArchiveSearchRow, 'adopted'>): AdoptState {
  if (!r.adopted) return 'open';
  return r.adopted.mine ? 'mine' : 'taken';
}

/** A search box that reads like a year goes to the year filter; everything else matches name / city / state. */
export function cleanArchiveQuery(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 80);
}

function rpcErr(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

export async function searchArchiveCompetitions(sb: SupabaseClient, q: string, limit = 20): Promise<ArchiveSearchRow[]> {
  const { data, error } = await sb.rpc('zt_archive_competition_search', { p_q: cleanArchiveQuery(q), p_limit: limit });
  if (error) throw new Error(rpcErr(error));
  return (data ?? []) as ArchiveSearchRow[];
}

export async function adoptArchiveCompetition(sb: SupabaseClient, slug: string, hostGymId?: string | null): Promise<AdoptResult> {
  const { data, error } = await sb.rpc('zt_adopt_archive_competition', { p_slug: slug, p_host_gym_id: hostGymId || null });
  if (error) throw new Error(rpcErr(error));
  return data as AdoptResult;
}
