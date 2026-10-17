// Promoter dashboard contract (v2, 10/16; revised 10/16 night after Astra's audit: public registration model,
// emergencyContact, athleteId linkage, split counts, promoterContact). Slate owns this file and the Supabase
// implementation; Argon builds the UI against it using the fixture implementation. Both implement PromoterApi.
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
  registrationDeadline: string | null;  // YYYY-MM-DD; submissions after this date are refused unless the status is 'waitlist'
  athleteCap: number | null;            // integer; when accepted roster >= cap, new submissions go to 'waitlist' (status permitting) or are refused
  promoterContact: string | null;       // public: email or phone athletes may use; shown on /register and in the waiver
}

export interface PromoterMeetSummary {
  serverId: string;            // meets.id on the server (uuid)
  slug: string;
  name: string;
  date: string;                // YYYY-MM-DD or ''
  listing: MeetListing;
  divisionCount: number;
  athleteCount: number;        // roster rows in state.athletes (accepted registrations plus hand-added athletes)
  pendingCount: number;        // registration requests still awaiting a decision
  registrationCount: number;   // requests with status 'accepted' (always <= athleteCount)
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
  emergencyContact: string;    // owner-only: never serialized into public pages
  athleteId: string | null;    // state.athletes row created on accept; null until then. Roster rows are matched by this id, never by name
  status: 'pending' | 'accepted' | 'declined' | 'withdrawn';
  waitlisted: boolean;         // true when the submission was taken under registrationStatus 'waitlist' (past deadline or at cap); still 'pending' until the promoter decides
  waiverAcceptedAt: string | null;
  paid: boolean;
  createdAt: string;
}

// What the public /register/<slug> page may see. Built server-side from the owner detail by an allowlist; it must
// never carry joinCode, adminPin, emails, emergency contacts or the results table. If a field is not listed here it
// does not reach the browser of an unauthenticated visitor.
export interface PublicRegistrationMeet {
  slug: string;
  name: string;
  date: string;
  listing: Pick<MeetListing, 'competitionStatus' | 'registrationStatus' | 'entryFeeDisplay' | 'registrationDeadline' | 'athleteCap' | 'federation' | 'venue' | 'promoterContact'>;
  promoterDisplayName: string;   // for the waiver's organizer line
  divisions: Array<{ id: string; name: string; targetWeights: Array<{ eventName: string; weight: number | null }> }>;
  acceptedCount: number;         // roster rows holding a spot (accepted requests plus hand-added athletes); compared against athleteCap
}

export interface RegistrationSubmission {
  slug: string;
  divisionId: string;
  athleteName: string;
  email: string;
  emergencyContact: string;
  waiverAccepted: true;          // the form cannot submit without it
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
  // accept: validates the division still exists, creates the state.athletes row, stores athleteId on the request.
  // decline/withdraw of an accepted request removes exactly that athleteId's row, and only if it has no results.
  setRegistrationStatus(id: string, status: RegistrationRequest['status']): Promise<ApiResult<RegistrationRequest>>;

  // public side (no session). Both are safe to call from a server component and from the browser.
  getPublicMeetBySlug(slug: string): Promise<ApiResult<PublicRegistrationMeet | null>>;   // null = unknown slug -> 404
  // 'waitlist' is returned when registrationStatus is 'waitlist' (the request is stored pending with waitlisted=true);
  // closed/not_provided/day_of_only/not_applicable, a passed deadline under 'open', or a full roster under 'open' are errors.
  submitRegistration(input: RegistrationSubmission): Promise<ApiResult<{ id: string; status: 'pending' | 'waitlist' }>>;
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
    promoterContact: null,
  };
}

export type { Meet };
