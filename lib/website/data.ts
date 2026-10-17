// Data-access boundary for the ZeroTacky public website (`/website`, `/shows`, `/shows/[slug]`, `/gyms`).
// - Uses `readSyncEnv()` + `createSyncClient(env)` so these functions run identically in Server Components
//   and in the browser.
// - When Supabase env vars are present, `listPublicShows` and `getPublicShowBySlug` read publicly listed
//   (`is_public_listed = true`, `is_demo = false`) meets from Supabase.
// - When Supabase env vars are absent, falls back to the in-memory `DEMO_SHOW_RECORDS` fixtures so the
//   offline demo build keeps working with no backend.
// - When Supabase env vars are present AND `process.env.NEXT_PUBLIC_ZT_DEMO_SHOWS === '1'`, demo fixtures
//   are appended with `isDemoFixture: true` (default off).

import type { MeetListingRow } from '../promoter/db';
import { createSyncClient, readSyncEnv, type SyncClient } from '../sync/client';
import type { AthleteRow, DivisionRow, EventRow, ResultRow } from '../sync/mapping';
import { latestServerAt } from '../sync/meetApi';
import {
  DEMO_GYM_LISTINGS,
  DEMO_PERSONAS,
  DEMO_SHOW_RECORDS,
  toPublicShowSummary,
} from './fixtures';
import {
  mapMeetBundleToPublicShowRecord,
  mapMeetRowToPublicShowSummary,
  PUBLIC_SHOW_MEET_COLS,
} from './supabaseShows';
import type {
  DemoPersonaProfile,
  PublicShowRecord,
  PublicShowSummary,
  StrongmanGymListing,
} from './types';

export type DataSourceMode = 'demo' | 'live_supabase';

export interface DataResult<T> {
  source: DataSourceMode;
  data: T | null;
  error: string | null;
}

export interface ShowDataOptions {
  mode?: DataSourceMode;
  client?: SyncClient | null;
  includeDemoShows?: boolean;
}

function shouldIncludeDemoShows(opts?: ShowDataOptions): boolean {
  if (opts?.includeDemoShows !== undefined) return opts.includeDemoShows;
  return process.env.NEXT_PUBLIC_ZT_DEMO_SHOWS === '1';
}

function resolveClient(opts?: ShowDataOptions): SyncClient | null {
  if (opts?.mode === 'demo') return null;
  if (opts?.client !== undefined) return opts.client;
  const env = readSyncEnv();
  return env ? createSyncClient(env) : null;
}

export async function listPublicShows(
  opts: ShowDataOptions = {}
): Promise<DataResult<PublicShowSummary[]>> {
  if (opts.mode === 'demo') {
    return {
      source: 'demo',
      data: DEMO_SHOW_RECORDS.map(toPublicShowSummary),
      error: null,
    };
  }

  const client = resolveClient(opts);
  if (!client) {
    if (opts.mode === 'live_supabase') {
      return {
        source: 'live_supabase',
        data: null,
        error: 'Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY) are not configured.',
      };
    }
    return {
      source: 'demo',
      data: DEMO_SHOW_RECORDS.map(toPublicShowSummary),
      error: null,
    };
  }

  try {
    const meets = await client.select<MeetListingRow>(
      'meets',
      `is_public_listed=eq.true&is_demo=eq.false&select=${PUBLIC_SHOW_MEET_COLS}&order=date.asc.nullslast`
    );

    let liveSummaries: PublicShowSummary[] = [];
    if (meets.length > 0) {
      const idList = meets.map((m) => m.id).join(',');
      const inFilter = `meet_id=in.(${idList})`;
      const [divisions, events] = await Promise.all([
        client.select<DivisionRow>('divisions', `${inFilter}&order=sort_order.asc`),
        client.select<EventRow>('events', `${inFilter}&order=event_number.asc`),
      ]);

      const divsByMeet = new Map<string, DivisionRow[]>();
      for (const d of divisions ?? []) {
        const list = divsByMeet.get(d.meet_id) ?? [];
        list.push(d);
        divsByMeet.set(d.meet_id, list);
      }

      const evsByMeet = new Map<string, EventRow[]>();
      for (const e of events ?? []) {
        const list = evsByMeet.get(e.meet_id) ?? [];
        list.push(e);
        evsByMeet.set(e.meet_id, list);
      }

      liveSummaries = meets.map((m) =>
        mapMeetRowToPublicShowSummary(m, divsByMeet.get(m.id) ?? [], evsByMeet.get(m.id) ?? [])
      );
    }

    if (shouldIncludeDemoShows(opts)) {
      const liveSlugs = new Set(liveSummaries.map((s) => s.slug.toLowerCase()));
      const demoExtras = DEMO_SHOW_RECORDS.filter(
        (d) => !liveSlugs.has(d.slug.toLowerCase())
      ).map((d) => ({ ...toPublicShowSummary(d), isDemoFixture: true }));
      liveSummaries = [...liveSummaries, ...demoExtras];
    }

    return {
      source: 'live_supabase',
      data: liveSummaries,
      error: null,
    };
  } catch (err) {
    return {
      source: 'live_supabase',
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getPublicShowBySlug(
  slug: string,
  opts: ShowDataOptions = {}
): Promise<DataResult<PublicShowRecord>> {
  const cleanSlug = decodeURIComponent(slug ?? '').trim().toLowerCase();
  if (!cleanSlug) {
    return { source: opts.mode === 'live_supabase' ? 'live_supabase' : 'demo', data: null, error: null };
  }

  if (opts.mode === 'demo') {
    const found = DEMO_SHOW_RECORDS.find((s) => s.slug.toLowerCase() === cleanSlug) ?? null;
    return { source: 'demo', data: found, error: null };
  }

  const client = resolveClient(opts);
  if (!client) {
    if (opts.mode === 'live_supabase') {
      return {
        source: 'live_supabase',
        data: null,
        error: 'Live Supabase sync is not configured on this build.',
      };
    }
    const found = DEMO_SHOW_RECORDS.find((s) => s.slug.toLowerCase() === cleanSlug) ?? null;
    return { source: 'demo', data: found, error: null };
  }

  try {
    const meets = await client.select<MeetListingRow>(
      'meets',
      `slug=eq.${encodeURIComponent(cleanSlug)}&is_public_listed=eq.true&is_demo=eq.false&select=${PUBLIC_SHOW_MEET_COLS}&limit=1`
    );

    if (!meets || meets.length === 0) {
      if (shouldIncludeDemoShows(opts)) {
        const demoFound = DEMO_SHOW_RECORDS.find((s) => s.slug.toLowerCase() === cleanSlug) ?? null;
        if (demoFound) {
          return {
            source: 'live_supabase',
            data: { ...demoFound, isDemoFixture: true },
            error: null,
          };
        }
      }
      return { source: 'live_supabase', data: null, error: null };
    }

    const meet = meets[0];
    const q = `meet_id=eq.${meet.id}`;
    const [divisions, events, athletes, results] = await Promise.all([
      client.select<DivisionRow>('divisions', `${q}&order=sort_order.asc`),
      client.select<EventRow>('events', `${q}&order=event_number.asc`),
      client.select<AthleteRow>('athletes', q),
      client.select<ResultRow>('results', q),
    ]);

    const mapped = mapMeetBundleToPublicShowRecord({
      meet,
      divisions: divisions ?? [],
      events: events ?? [],
      athletes: athletes ?? [],
      results: results ?? [],
      latestServerAt: latestServerAt(results ?? []),
    });

    return { source: 'live_supabase', data: mapped, error: null };
  } catch (err) {
    return {
      source: 'live_supabase',
      data: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function listPublicGyms(): Promise<DataResult<StrongmanGymListing[]>> {
  return {
    source: 'demo',
    data: DEMO_GYM_LISTINGS,
    error: null,
  };
}

export async function getPublicGymBySlug(
  slug: string
): Promise<DataResult<StrongmanGymListing>> {
  const cleanSlug = decodeURIComponent(slug).trim().toLowerCase();
  const found = DEMO_GYM_LISTINGS.find((g) => g.slug.toLowerCase() === cleanSlug) ?? null;
  return {
    source: 'demo',
    data: found,
    error: null,
  };
}

export function listDemoPersonas(): DemoPersonaProfile[] {
  return DEMO_PERSONAS;
}
