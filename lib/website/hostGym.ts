// Host gym lookup for the promoter Listing tab (026, 10/27). Reads the public `gyms` columns (015 grant) through the
// signed-in client; no RPC needed. Only directory gyms that are still listed (unclaimed or claimed) are offered.
import type { SupabaseClient } from '@supabase/supabase-js';

export interface HostGymOption {
  id: string;
  slug: string;
  name: string;
  streetAddress: string;
  city: string;
  state: string;
  zip: string;
}

interface GymPickRow {
  id: string;
  slug: string;
  name: string;
  street_address: string;
  city: string;
  state: string;
  zip: string;
}

const COLS = 'id,slug,name,street_address,city,state,zip';

function toOption(r: GymPickRow): HostGymOption {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    streetAddress: r.street_address ?? '',
    city: r.city ?? '',
    state: r.state ?? '',
    zip: r.zip ?? '',
  };
}

// PostgREST `ilike` pattern: escape the wildcard characters a user may type so "100%" does not match everything.
export function gymSearchPattern(q: string): string {
  const clean = q.trim().replace(/[%_\\]/g, (c) => `\\${c}`).replace(/[,()]/g, ' ');
  return `%${clean}%`;
}

export async function searchHostGyms(sb: SupabaseClient, q: string, limit = 8): Promise<HostGymOption[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const { data, error } = await sb
    .from('gyms')
    .select(COLS)
    .in('status', ['unclaimed', 'claimed'])
    .ilike('name', gymSearchPattern(term))
    .order('name', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as GymPickRow[]).map(toOption);
}

export async function fetchHostGym(sb: SupabaseClient, id: string): Promise<HostGymOption | null> {
  const { data, error } = await sb.from('gyms').select(COLS).eq('id', id).in('status', ['unclaimed', 'claimed']).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toOption(data as GymPickRow) : null;
}

export function hostGymAddressLine(g: HostGymOption): string {
  const cityState = [g.city, g.state].filter(Boolean).join(', ');
  return [g.streetAddress, cityState, g.zip].filter(Boolean).join(' · ') || 'Address not provided';
}
