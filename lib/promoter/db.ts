// Narrow database interface for `createSupabasePromoterApi` and its thin supabase-js adapter.
// Business rules, validation, and contract shape mapping live in `lib/promoter/supabaseApi.ts`;
// this module only translates method calls into supabase-js queries/RPCs.

import type { SupabaseClient } from '@supabase/supabase-js';
import { PROFILE_COLUMNS, cleanProfilePatch, normalizeProfile, type Profile, type ProfilePatch } from '../auth/profile';
import type {
  AthleteRow,
  DivisionRow,
  EventRow,
  MeetRow,
  ResultRow,
} from '../sync/mapping';
import type {
  ResultsFinalizationStatus,
  ShowCompetitionStatus,
  ShowRegistrationStatus,
  ShowVenue,
} from '../website/types';

export interface MeetListingColumns {
  competition_status: ShowCompetitionStatus;
  registration_status: ShowRegistrationStatus;
  results_status: ResultsFinalizationStatus;
  is_public_listed: boolean;
  venue: ShowVenue | null;
  federation: string | null;
  entry_fee_display: string | null;
  registration_deadline: string | null;
  athlete_cap: number | null;
  promoter_contact: string | null;
  host_gym_id: string | null;
  theme: Record<string, unknown> | null;
  auto_accept?: boolean;   // 032; optional so older fixtures and public rows (not granted) still type
}

export interface MeetListingRow extends MeetRow, MeetListingColumns {
  created_at?: string;
  updated_at?: string;
}

export interface PromoterMeetRow extends MeetListingRow {
  division_count: number;
  athlete_count: number;
  pending_count: number;
  registration_count: number;
}

export interface RegistrationRow {
  id: string;
  meet_id: string;
  user_id: string | null;
  athlete_id: string | null;
  division_id: string;
  name: string;
  email: string;
  bodyweight: number | null;
  emergency_contact: string;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'waitlist';
  waitlisted: boolean;
  paid: boolean;
  waiver_accepted_at: string | null;
  waiver_version: string | null;
  date_of_birth?: string | null;    // 009; absent from rows read before the migration
  guardian_name?: string | null;    // 009; absent from rows read before the migration
  guardian_contact?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicMeetBundle {
  meet: MeetListingRow;
  promoter_display_name: string;
  divisions: DivisionRow[];
  events: EventRow[];
  accepted_count: number;
}

export interface MeetChildrenRows {
  divisions: DivisionRow[];
  events: EventRow[];
  athletes: AthleteRow[];
  results: ResultRow[];
}

export interface AuthUserRow {
  id: string;
  email: string | null;
}

export interface PromoterDb {
  getUser(): Promise<AuthUserRow | null>;
  selectProfile(userId: string): Promise<Profile | null>;
  updateProfile(userId: string, patch: ProfilePatch): Promise<Profile>;

  selectMyMeets(): Promise<PromoterMeetRow[]>;
  selectMeet(meetId: string): Promise<PromoterMeetRow | null>;
  selectChildren(meetId: string): Promise<MeetChildrenRows>;
  // 007: zt_update_listing RPC (owner check, enum/cap/deadline validation, C3 revision check). Returns the meets row.
  updateMeetListing(meetId: string, patch: Partial<MeetListingColumns>, expectedUpdatedAt?: string | null): Promise<void>;

  selectRegistrations(meetId: string): Promise<RegistrationRow[]>;
  selectPublicMeetBySlug(slug: string): Promise<PublicMeetBundle | null>;

  rpc<T = unknown>(fn: string, params: Record<string, unknown>): Promise<T>;
}

export function createSupabaseDb(client: SupabaseClient): PromoterDb {
  return {
    async getUser(): Promise<AuthUserRow | null> {
      const { data, error } = await client.auth.getSession();
      if (error) throw new Error(error.message);
      const u = data.session?.user;
      if (!u) return null;
      return { id: u.id, email: u.email ?? null };
    },

    async selectProfile(userId: string): Promise<Profile | null> {
      const { data, error } = await client
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Profile | null) ?? null;
    },

    async updateProfile(userId: string, patch: ProfilePatch): Promise<Profile> {
      const { data, error } = await client
        .from('profiles')
        .update(cleanProfilePatch(patch))
        .eq('id', userId)
        .select(PROFILE_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return normalizeProfile(data as unknown as Partial<Profile> & Pick<Profile, 'id'>);
    },

    async selectMyMeets(): Promise<PromoterMeetRow[]> {
      const { data, error } = await client.rpc('zt_my_meets');
      if (error) throw new Error(error.message);
      return (Array.isArray(data) ? data : []) as PromoterMeetRow[];
    },

    async selectMeet(meetId: string): Promise<PromoterMeetRow | null> {
      const { data, error } = await client.rpc('zt_get_my_meet', { p_meet_id: meetId });
      if (error) throw new Error(error.message);
      if (!data || typeof data !== 'object' || !('id' in data)) return null;
      return data as PromoterMeetRow;
    },

    async selectChildren(meetId: string): Promise<MeetChildrenRows> {
      const [divRes, evRes, athRes, resRes] = await Promise.all([
        client.from('divisions').select('*').eq('meet_id', meetId).order('sort_order', { ascending: true }),
        client.from('events').select('*').eq('meet_id', meetId).order('event_number', { ascending: true }),
        client.from('athletes').select('*').eq('meet_id', meetId),
        client.from('results').select('*').eq('meet_id', meetId),
      ]);
      if (divRes.error) throw new Error(divRes.error.message);
      if (evRes.error) throw new Error(evRes.error.message);
      if (athRes.error) throw new Error(athRes.error.message);
      if (resRes.error) throw new Error(resRes.error.message);
      return {
        divisions: (divRes.data ?? []) as DivisionRow[],
        events: (evRes.data ?? []) as EventRow[],
        athletes: (athRes.data ?? []) as AthleteRow[],
        results: (resRes.data ?? []) as ResultRow[],
      };
    },

    async updateMeetListing(meetId: string, patch: Partial<MeetListingColumns>, expectedUpdatedAt: string | null = null): Promise<void> {
      const { error } = await client.rpc('zt_update_listing', {
        p_meet_id: meetId,
        p_patch: patch,
        p_expected_updated_at: expectedUpdatedAt ?? null,
      });
      if (error) throw new Error(error.message);
    },

    async selectRegistrations(meetId: string): Promise<RegistrationRow[]> {
      const { data, error } = await client.rpc('zt_list_meet_registrations', { p_meet_id: meetId });
      if (error) throw new Error(error.message);
      return (Array.isArray(data) ? data : []) as RegistrationRow[];
    },

    async selectPublicMeetBySlug(slug: string): Promise<PublicMeetBundle | null> {
      const { data, error } = await client.rpc('zt_public_meet_by_slug', { p_slug: slug });
      if (error) throw new Error(error.message);
      if (!data || typeof data !== 'object' || !('meet' in data)) return null;
      return data as PublicMeetBundle;
    },

    async rpc<T = unknown>(fn: string, params: Record<string, unknown>): Promise<T> {
      const { data, error } = await client.rpc(fn, params);
      if (error) throw new Error(error.message);
      return data as T;
    },
  };
}

export type { AthleteRow, DivisionRow, EventRow, MeetRow, ResultRow };
