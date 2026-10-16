// Data-access boundary for the ZeroTacky public website.
// - Runs out-of-the-box without backend credentials using explicit demo fixtures.
// - Never silently substitutes demo content when a real backend request is explicitly requested and fails.
// - Reuses lib/sync/meetApi.ts (fetchMeetBySlug) when inspecting a live published Supabase meet.

import { createSyncClient, readSyncEnv } from '../sync/client';
import { fetchMeetBySlug } from '../sync/meetApi';
import {
  DEMO_GYM_LISTINGS,
  DEMO_PERSONAS,
  DEMO_SHOW_RECORDS,
  toPublicShowSummary,
} from './fixtures';
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

export async function listPublicShows(
  opts: { mode?: DataSourceMode } = {}
): Promise<DataResult<PublicShowSummary[]>> {
  const mode = opts.mode ?? 'demo';

  if (mode === 'demo') {
    const summaries = DEMO_SHOW_RECORDS.map(toPublicShowSummary);
    return { source: 'demo', data: summaries, error: null };
  }

  // Real backend directory listing requires explicit discovery approval & lifecycle columns
  // (see WEBSITE_HANDOFF.md). We do not scrape unapproved test meets from `meets` or silently fall back.
  const env = readSyncEnv();
  if (!env) {
    return {
      source: 'live_supabase',
      data: null,
      error: 'Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY) are not configured.',
    };
  }

  return {
    source: 'live_supabase',
    data: null,
    error:
      'Public directory discovery policy is not yet enabled on the `meets` table. Use demo fixtures or open a known scoreboard at /m/[slug].',
  };
}

export async function getPublicShowBySlug(
  slug: string,
  opts: { mode?: DataSourceMode } = {}
): Promise<DataResult<PublicShowRecord>> {
  const cleanSlug = decodeURIComponent(slug).trim().toLowerCase();
  const mode = opts.mode ?? 'demo';

  if (mode === 'demo') {
    const found = DEMO_SHOW_RECORDS.find((s) => s.slug.toLowerCase() === cleanSlug) ?? null;
    return { source: 'demo', data: found, error: null };
  }

  // Explicit live_supabase lookup via existing fetchMeetBySlug
  const env = readSyncEnv();
  if (!env) {
    return {
      source: 'live_supabase',
      data: null,
      error: 'Live Supabase sync is not configured on this build.',
    };
  }

  try {
    const client = createSyncClient(env);
    const remote = await fetchMeetBySlug(client, cleanSlug);
    if (!remote) {
      return { source: 'live_supabase', data: null, error: null };
    }

    // Map remote Meet state without inferring venue, federation, registration, or finalized status.
    const mapped: PublicShowRecord = {
      id: remote.state.meet.id,
      slug: remote.slug,
      name: remote.state.meet.name,
      date: remote.state.meet.date || 'Not provided',
      venue: {
        city: 'Not provided',
        state: 'Not provided',
        country: 'US',
      },
      federation: undefined,
      divisionGroupingStyle: 'mixed',
      divisionLabels: remote.state.divisions.map((d) => d.name),
      implementTags: [],
      competitionStatus: 'live',
      registrationStatus: 'not_provided',
      resultsStatus: 'provisional',
      isDemoFixture: remote.isDemo,
      liveScoreboardPath: `/m/${remote.slug}`,
      lastUpdatedIso: remote.latestServerAt ?? remote.updatedAt ?? undefined,
      registration: {
        status: 'not_provided',
      },
      // Strip athlete bodyweights/personal notes from public website view
      state: {
        ...remote.state,
        athletes: remote.state.athletes.map((a) => ({
          id: a.id,
          divisionId: a.divisionId,
          name: a.name,
          lotNumber: a.lotNumber,
          status: a.status,
        })),
      },
    };

    return { source: 'live_supabase', data: mapped, error: null };
  } catch (err) {
    // Never silently substitute demo data when a real-data request fails.
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