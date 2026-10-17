// Promoter dashboard contract (v2, 10/16; revised 10/16 night after Astra's audit: public registration model,
// emergencyContact, athleteId linkage, split counts, promoterContact; revised 10/17 after Astra's second audit:
// authorization matrix, save revision check, cap policy on accept, waiver version, linked-athlete protection). Slate owns this file and the Supabase
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
  waiverVersion: string | null; // sha-256 prefix of the waiver text the athlete saw (RegistrationSubmission.waiverVersion); null for rows older than 10/17
  paid: boolean;
  createdAt: string;
}

// What the public /register/<slug> page may see. Built from the owner detail by an allowlist; it must never carry
// joinCode, adminPin, registrant or profile emails, emergency contacts or the results table. The one deliberate
// contact is listing.promoterContact, the promoter's chosen public email or phone. If a field is not listed here it
// does not reach the browser of an unauthenticated visitor. Unlisted (isPublicListed=false) is not private: the slug
// still resolves for anyone who has the link; only /shows discovery is affected. Demo meets never resolve.
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
  waiverVersion: string;         // identifies the waiver text shown (first 12 hex chars of sha-256 of legal/WAIVER.md as rendered); stored with the request
}

export interface ApiResult<T> {
  data: T | null;
  error: string | null;        // human-readable; UI shows it verbatim
}

// Authorization matrix (Astra C1, 10/17). "Owner" means meets.owner_id = auth.uid() or a meet_members row, verified
// server-side; profile role flags are self-declared preferences and never grant meet access. A join-code device is
// not an account member: it writes athletes/results/live_state through the scorer, never through this API.
//
//   method                 anonymous            signed-in owner/member     other signed-in account
//   getCurrentUser         null                 own identity               own identity
//   updateProfile          deny                 own row only               own row only
//   listMyMeets            deny                 own/member meets           own/member meets (may be empty)
//   getMeet                deny                 allow                      deny (error)
//   createMeet             deny                 new meet, owner = caller   new meet, owner = caller
//   saveMeetState          deny                 allow (integrity rules)    deny
//   updateListing          deny                 allow                      deny
//   rotateJoinCode         deny                 allow                      deny
//   archiveMeet            deny                 allow                      deny
//   listRegistrations      deny                 allow (incl. emergency)    deny
//   setRegistrationStatus  deny                 allow (ownership resolved from the stored request's meet)  deny
//   getPublicMeetBySlug    public projection    same                       same
//   submitRegistration     server-validated     same                       same (userId stamped when signed in)
//
// Every write is one transaction on the server (an RPC): accept = create athlete + link + status together; save =
// revision check + reference validation + config/roster upsert, results untouched. data and error are never both
// set; a successful write followed by a failed re-read reports the write as done and the refresh as failed.
export interface PromoterApi {
  // session
  getCurrentUser(): Promise<ApiResult<PromoterUser | null>>;   // null = signed out (UI shows sign-in prompt)
  updateProfile(patch: Partial<Pick<PromoterUser, 'displayName' | 'roles'>>): Promise<ApiResult<PromoterUser>>;

  // meets I own
  listMyMeets(): Promise<ApiResult<PromoterMeetSummary[]>>;
  getMeet(serverId: string): Promise<ApiResult<PromoterMeetDetail>>;
  createMeet(input: { name: string; date: string; slug?: string }): Promise<ApiResult<PromoterMeetDetail>>;
  // config + roster; results are read-only here. Refused (error, nothing written) when: a removed athlete, event or
  // division still owns results (the chain result -> athlete -> division is checked, not just ids); a removed athlete
  // is linked to an accepted registration (decline or withdraw the request first); opts.expectedUpdatedAt is given and
  // differs from the server's summary.updatedAt (someone else saved; reload and redo).
  saveMeetState(serverId: string, state: AppState, opts?: { expectedUpdatedAt?: string }): Promise<ApiResult<PromoterMeetDetail>>;
  updateListing(serverId: string, patch: Partial<MeetListing>): Promise<ApiResult<PromoterMeetSummary>>;
  rotateJoinCode(serverId: string): Promise<ApiResult<{ joinCode: string }>>;
  archiveMeet(serverId: string): Promise<ApiResult<{ ok: true }>>;   // soft: competitionStatus -> 'completed', isPublicListed unchanged

  // registrations (M4; fixture only until the schema lands)
  listRegistrations(serverId: string): Promise<ApiResult<RegistrationRequest[]>>;
  // accept: validates the division still exists, refuses when the roster is at listing.athleteCap (raise the cap first;
  // there is no silent override), creates the state.athletes row, stores athleteId on the request.
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
