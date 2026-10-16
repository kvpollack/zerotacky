// Promoter dashboard contract (v2, 10/16). Slate owns this file and the Supabase implementation;
// Argon builds the UI against it using the fixture implementation. Both implement PromoterApi.
//
// Vocabulary: a "meet" here is the same object the meet-day scorer runs (AppState: meet, divisions, events,
// athletes, results). The dashboard adds listing/lifecycle fields that live on the server row, not in AppState.

import type { AppState, Meet } from '../types';
import type {
  ShowCompetitionStatus,
  ShowRegistrationStatus,
  ResultsFinalizationStatus,
  ShowVenue,
} from '../website/types';

export interface PromoterUser {
  id: string;             // auth.users.id (uuid)
  email: string;
  displayName: string;
  roles: { athlete: boolean; promoter: boolean; gymOwner: boolean };  // one account can hold several
}

// Server-side listing fields for a meet the promoter owns. Mirrors the planned `meets` columns
// (competition_status, registration_status, results_status, is_public_listed, venue_json, federation).
export interface MeetListing {
  competitionStatus: ShowCompetitionStatus;
  registrationStatus: ShowRegistrationStatus;
  resultsStatus: ResultsFinalizationStatus;
  isPublicListed: boolean;      // false = invisible on /shows (default for new and test meets)
  venue: ShowVenue | null;
  federation: string | null;    // free text, e.g. "USS", "Strongman Corporation", "Unsanctioned"
  entryFeeDisplay: string | null;
  registrationDeadline: string | null;  // YYYY-MM-DD
  athleteCap: number | null;
}

export interface PromoterMeetSummary {
  serverId: string;            // meets.id on the server (uuid)
  slug: string;
  name: string;
  date: string;                // YYYY-MM-DD or ''
  listing: MeetListing;
  divisionCount: number;
  athleteCount: number;
  registrationCount: number;   // athletes who registered through the site (subset of athleteCount)
  updatedAt: string;           // ISO
  joinCode: string | null;     // only present for the owner; shown on the dashboard, never on public pages
}

export interface PromoterMeetDetail {
  summary: PromoterMeetSummary;
  state: AppState;             // full meet config + roster + results, same shape the scorer uses
}

// Registration rows arrive from athletes on the public site (M4) and become roster entries when accepted.
export interface RegistrationRequest {
  id: string;
  meetServerId: string;
  divisionId: string;
  athleteName: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  waiverAcceptedAt: string | null;
  paid: boolean;
  createdAt: string;
}

export interface ApiResult<T> {
  data: T | null;
  error: string | null;        // human-readable; UI shows it verbatim
}

export interface PromoterApi {
  // session
  getCurrentUser(): Promise<ApiResult<PromoterUser | null>>;   // null = signed out (UI shows sign-in prompt)
  updateProfile(patch: Partial<Pick<PromoterUser, 'displayName' | 'roles'>>): Promise<ApiResult<PromoterUser>>;

  // meets I own
  listMyMeets(): Promise<ApiResult<PromoterMeetSummary[]>>;
  getMeet(serverId: string): Promise<ApiResult<PromoterMeetDetail>>;
  createMeet(input: { name: string; date: string; slug?: string }): Promise<ApiResult<PromoterMeetDetail>>;
  saveMeetState(serverId: string, state: AppState): Promise<ApiResult<PromoterMeetDetail>>;   // config + roster; results are read-only here
  updateListing(serverId: string, patch: Partial<MeetListing>): Promise<ApiResult<PromoterMeetSummary>>;
  rotateJoinCode(serverId: string): Promise<ApiResult<{ joinCode: string }>>;
  archiveMeet(serverId: string): Promise<ApiResult<{ ok: true }>>;   // soft: competitionStatus -> 'completed', isPublicListed unchanged

  // registrations (M4; fixture only until the schema lands)
  listRegistrations(serverId: string): Promise<ApiResult<RegistrationRequest[]>>;
  setRegistrationStatus(id: string, status: RegistrationRequest['status']): Promise<ApiResult<RegistrationRequest>>;
}

// Helper every implementation shares.
export function emptyListing(): MeetListing {
  return {
    competitionStatus: 'upcoming',
    registrationStatus: 'not_provided',
    resultsStatus: 'not_started',
    isPublicListed: false,
    venue: null,
    federation: null,
    entryFeeDisplay: null,
    registrationDeadline: null,
    athleteCap: null,
  };
}

export type { Meet };
