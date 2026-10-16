// Browser-side Supabase client for accounts (v2). One instance per tab; null when NEXT_PUBLIC_SUPABASE_* is not set,
// so the scorer keeps working exactly as before on builds without a backend. Live sync still goes through
// lib/sync/client.ts (PostgREST over fetch); this client exists for auth + the profiles table.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSyncEnv } from '@/lib/sync/client';

let instance: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (instance !== undefined) return instance;
  if (typeof window === 'undefined') return null; // never cache on the server
  const env = readSyncEnv();
  instance = env
    ? createClient(env.url, env.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'zt-auth-v1' },
      })
    : null;
  return instance;
}

// Where magic links / confirmation emails send the browser back to. Supabase checks it against the Auth URL
// allow list (Kurt owns that list: localhost, Vercel previews, https://www.zerotacky.com/**).
export function accountRedirectUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}/website/account`;
}
