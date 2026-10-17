'use client';

import { useMemo } from 'react';
import { getSupabase } from '../auth/supabaseBrowser';
import { readSyncEnv } from '../sync/client';
import type { PromoterApi } from './contract';
import { createSupabaseDb } from './db';
import { createSupabasePromoterApi } from './supabaseApi';

let liveApiSingleton: PromoterApi | null = null;

// True when NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are configured.
// Used by UI banners to hide the amber "data lives in this browser tab" preview notice when live.
export function isLiveBackend(): boolean {
  return readSyncEnv() !== null;
}

// ---------------------------------------------------------------------------------------------------------------
// Fixture backend, loaded lazily (Astra H1, 10/17). fixtureApi.ts pulls fixtures.ts (demo meets, seeded
// registrations with emails and emergency contacts) into whatever bundle imports it statically. The public
// /register page and the dashboard only need it when no Supabase env is configured, so it is imported on first
// use through import(): the bundler emits it as a separate chunk that a live deployment never downloads.
// Every PromoterApi method is async, so a method-forwarding wrapper can await the import without changing
// the contract.
// ---------------------------------------------------------------------------------------------------------------

type FixtureModule = typeof import('./fixtureApi');

let fixtureModulePromise: Promise<FixtureModule> | null = null;

function loadFixtureModule(): Promise<FixtureModule> {
  if (!fixtureModulePromise) fixtureModulePromise = import('./fixtureApi');
  return fixtureModulePromise;
}

const PROMOTER_API_METHODS = [
  'getCurrentUser',
  'updateProfile',
  'listMyMeets',
  'getMeet',
  'createMeet',
  'saveMeetState',
  'updateListing',
  'rotateJoinCode',
  'archiveMeet',
  'listRegistrations',
  'setRegistrationStatus',
  'getPublicMeetBySlug',
  'submitRegistration',
] as const;

// Compile-time check: adding a method to PromoterApi without listing it here is a type error.
type ListedMethod = (typeof PROMOTER_API_METHODS)[number];
type MissingMethod = Exclude<keyof PromoterApi, ListedMethod>;
type ExtraMethod = Exclude<ListedMethod, keyof PromoterApi>;
const _methodsCoverContract: [MissingMethod, ExtraMethod] extends [never, never] ? true : never = true;
void _methodsCoverContract;

let lazyFixtureApi: PromoterApi | null = null;

function getLazyFixtureApi(): PromoterApi {
  if (lazyFixtureApi) return lazyFixtureApi;
  const api: Record<string, unknown> = {};
  for (const method of PROMOTER_API_METHODS) {
    api[method] = async (...args: unknown[]) => {
      const mod = await loadFixtureModule();
      const real = mod.getFixturePromoterApi() as unknown as Record<string, (...a: unknown[]) => unknown>;
      return real[method](...args);
    };
  }
  lazyFixtureApi = api as unknown as PromoterApi;
  return lazyFixtureApi;
}

// Dev-only: the ?signedout=1 preview of the signed-out dashboard. No effect when the live backend is configured
// (Supabase Auth owns the session there).
export async function setFixtureSignedOutForDev(signedOut: boolean): Promise<void> {
  if (isLiveBackend()) return;
  const mod = await loadFixtureModule();
  mod.getFixturePromoterApi().setSignedOutForDev(signedOut);
}

function getLiveApi(client: NonNullable<ReturnType<typeof getSupabase>>): PromoterApi {
  if (!liveApiSingleton) {
    liveApiSingleton = createSupabasePromoterApi(createSupabaseDb(client));
  }
  return liveApiSingleton;
}

// Non-hook accessor for event handlers or effects outside React hooks (e.g. RegisterClient).
export function getPromoterApi(): PromoterApi {
  const client = getSupabase();
  if (!client) {
    return getLazyFixtureApi();
  }
  return getLiveApi(client);
}

// Hook for promoter dashboard and registration components: returns the memoised Supabase-backed
// PromoterApi when `getSupabase()` is non-null, or the (lazily loaded) in-memory fixture API when no backend is
// configured.
export function usePromoterApi(): PromoterApi {
  const client = getSupabase();
  return useMemo(() => (client ? getLiveApi(client) : getLazyFixtureApi()), [client]);
}
