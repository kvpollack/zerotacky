// Promoter dashboard contract (v2, 10/16; revised 10/16 night after Astra's audit: public registration model,
// emergencyContact, athleteId linkage, split counts, promoterContact; revised 10/17 after Astra's second audit:
// authorization matrix, save revision check, cap policy on accept, waiver version, linked-athlete protection). Slate owns this file and the Supabase
// implementation; Argon builds the UI against it using the fixture implementation. Both implement PromoterApi.
//
// Vocabulary: a "meet" here is the same object the meet-day scorer runs (AppState: meet, divisions, events,
// athletes, results). The dashboard adds listing/lifecycle fields that live on the server row, not in AppState.

import type { AppState, DivisionFormat, Meet, MeetUnits } from '../types';
import type {
  ShowCompetitionStatus,
  ShowRegistrationStatus,
  ResultsFinalizationStatus,
  ShowVenue,
} from '../website/types';
import type { ZtTheme } from '../website/theme';
import type { MeetSchedule } from '../website/schedule';
import type { MeetSponsor, MeetStaff } from '../website/extras';

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
  athleteCap: number | null;            // integer; when the accepted roster >= cap, new submissions go to 'waitlist' (034)
  promoterContact: string | null;       // public: email or phone athletes may use; shown on /register and in the waiver
  hostGymId: string | null;             // 026: directory gym hosting the show (links the show page and the gym page); venue stays the address
  theme: ZtTheme | null;                // 030: the show's own colours (public show page + board); null = ZeroTacky default
  autoAccept: boolean;                  // 032: entries go straight to the roster (default); false = the promoter reviews each one
  resultsSubmittedAt: string | null;    // 037: ISO; when the promoter marked the results as sent to the federation. Read-only here.
  schedule: MeetSchedule | null;        // 044: meet-day timeline (check-in, weigh-in, rules meeting, first event, finish); null = not provided
  sponsors: MeetSponsor[] | null;       // 046 (#14): up to 6, public (show page, boards); null = none
  livestreamUrl: string | null;         // 046 (#17): https link, public; null = none
  staff: MeetStaff[] | null;            // 046 (#12): judges, volunteers, state rep; PRIVATE (never on a public page); null = none
  importedFrom: ImportedFrom | null;    // 053: adopted archive show; read-only, the show page prints the credit as a disclaimer
}
export interface ImportedFrom {
  source: string;        // 'sr' | 'os'
  sourceName: string;    // 'strongmanresults.com'
  archiveSlug: string;
  credit: string;        // the disclaimer line, verbatim
  importedAt: string;
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

export interface DeletedMeet {
  id: string;
  name: string;
  deleted: { divisions: number; events: number; athletes: number; results: number; registrations: number };
}

// Athlete side of My Meets (010, Kurt 10/19): one row per meet the signed-in account follows or registered for.
// A registration beats a follow for the same meet. The UI buckets rows with `bucketAthleteMeets` (lib/promoter/rules):
// Following (kind 'follow'), Registered (registration, meet not completed), Completed (registration, meet completed).
// 023: a roster athlete linked to a ZeroTacky account (show history on the public athlete page). Links arrive from
// accepted registrations automatically; the promoter adds the rest by username (hand-entered rosters).
export interface AthleteAccountLink {
  athleteId: string;
  username: string;
  displayName: string;
  fromRegistration: boolean;
}

// 048 result claims (feature gaps #9, 11/8): an athlete asks for a roster row on a completed show; the promoter approves
// (writes the 023 link) or rejects. `alreadyLinked` tells the promoter the row was linked some other way meanwhile.
export type ResultClaimStatus = 'pending' | 'approved' | 'rejected';
export interface ResultClaim {
  id: string;
  meetServerId: string;
  slug: string;
  meetName: string;
  meetDate: string | null;
  athleteId: string;
  athleteName: string | null;
  divisionName: string | null;
  username: string | null;
  displayName: string | null;
  note: string | null;
  status: ResultClaimStatus;
  createdAt: string;
  resolvedAt: string | null;
  alreadyLinked: boolean;
}
export interface ClaimStatus {
  linkedAthleteIds: string[];
  myAthleteId: string | null;
  myClaim: ResultClaim | null;
}
export const CLAIM_NOTE_MAX = 200;

export interface MyAthleteMeet {
  meetServerId: string;
  slug: string;
  name: string;
  date: string;                      // YYYY-MM-DD or ''
  competitionStatus: ShowCompetitionStatus;
  resultsStatus: ResultsFinalizationStatus;
  isPublicListed: boolean;           // false = the show page is reachable by link only
  kind: 'registration' | 'follow';
  following: boolean; // true when a meet_follows row exists, even when the row's kind is 'registration'
  registrationStatus: RegistrationRequest['status'] | null;
  waitlisted: boolean;
  divisionName: string | null;
  createdAt: string;                 // when the follow or registration was made
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
  dateOfBirth: string | null;  // 009: YYYY-MM-DD; owner-only, never public. Null for rows older than 10/19. Age is judged on the meet date (rules.ageOnDate)
  guardian: RegistrationGuardian | null; // 009: set when the athlete is under 18 on meet day and a parent/guardian registered them; owner-only, never public
  paid: boolean;
  createdAt: string;
  teamId?: string | null;          // 055: the team this entry is on (team divisions only)
  teamName?: string | null;
  lookingForPartner?: boolean;     // 055: on the division's partner board
}

// 055: teams. A team competes as one roster row; members register one at a time and form up afterwards.
export interface TeamMember {
  registrationId: string;
  name: string;            // full for teammates and the promoter; "Pat M." on the partner board
  status: 'pending' | 'accepted';
  isCaptain: boolean;
}
export interface Team {
  id: string;
  meetId: string;
  divisionId: string;
  name: string;
  joinCode: string | null;   // only for members and the promoter
  captainUserId: string | null;
  athleteId: string | null;  // the shared roster row once a member is accepted
  teamSize: number;
  activeCount: number;
  members: TeamMember[];
}
export interface PartnerBoardEntry {
  registrationId: string;
  name: string;              // short form
  teamName: string | null;   // on a team with space, or solo
  spotsOpen: number;
}
// The signed-in athlete's live entry for one show (zt_my_registration); null when they have none.
export interface MyRegistration {
  registrationId: string;
  status: 'pending' | 'accepted';
  waitlisted: boolean;
  divisionId: string;
  divisionName: string;
  teamSize: number;
  lookingForPartner: boolean;
  team: Team | null;
  board: PartnerBoardEntry[];
}

// 045 (feature gaps #8): check-in desk. One row per roster athlete the desk has touched; everything else is absent.
export interface DeskCheckin {
  athleteId: string;
  checkedInAt: string | null;
  weighedKg: number | null;       // as the scale read it (two decimals kept, never rounded to a class)
  weighedAt: string | null;
  paperWaiverAt: string | null;   // a paper waiver signed at the desk (walk-ups, or an online waiver that is missing)
  cardVerifiedAt: string | null;  // the desk saw a membership card
  note: string | null;            // <= 120
}
export interface DeskState {
  caps: Record<string, number>;          // divisionId -> weight cap in kg (only divisions that have one)
  checkins: Record<string, DeskCheckin>; // athleteId -> row
}
export interface DeskPatch {
  checkedIn?: boolean;
  weighedKg?: number | null;   // null clears
  paperWaiver?: boolean;
  cardVerified?: boolean;
  note?: string | null;
  divisionId?: string;         // reclass: refused on the server once the athlete has a result
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
  divisionFormat?: DivisionFormat;   // 054: the promoter's choice (null = not chosen)
  units: MeetUnits;                  // 059: the unit the target weights are in
  groupPickerShown: boolean;         // 056 (Astra GP-02): the show page's gate, resolved server-side style; step 1 links to the helper only when true
  divisions: Array<{ id: string; name: string; weightCapKg?: number; teamSize?: number; targetWeights: Array<{ eventName: string; weight: number | null }> }>;
  acceptedCount: number;         // roster rows holding a spot (accepted requests plus hand-added athletes); compared against athleteCap
}

// 009: a parent or legal guardian registering an athlete under 18 (legal/WAIVER.md section 7).
export interface RegistrationGuardian {
  name: string;     // 2..80 chars
  contact: string;  // phone with 7+ digits or an email; 160 max
}

export interface RegistrationSubmission {
  slug: string;
  divisionId: string;
  athleteName: string;
  email: string;
  emergencyContact: string;
  dateOfBirth: string;                   // 009: YYYY-MM-DD. Server derives the age on the meet date: under 12 refused, under 18 needs a guardian
  guardian: RegistrationGuardian | null; // required when the athlete is under 18 on meet day, ignored otherwise
  waiverAccepted: true;          // the form cannot submit without it
  waiverVersion: string;         // identifies the waiver text shown (first 12 hex chars of sha-256 of legal/WAIVER.md as rendered); stored with the request
  teamCode?: string;             // 055: join this team at submit (team divisions; same division, space left)
  lookingForPartner?: boolean;   // 055: list me on the division's partner board (team divisions)
}

export interface ApiResult<T> {
  data: T | null;
  error: string | null;        // human-readable; UI shows it verbatim
  // Astra gate C2 (10/17 pm): true when the write itself succeeded and only the re-read that builds `data` failed.
  // The UI reloads instead of retrying; a retry would hit "slug already used" or re-apply an edit that is saved.
  committed?: boolean;
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
//   listMyAthleteMeets     deny                 own follows + registrations (any account)
//   followShow             deny                 own row; listed non-demo meets only (any account)
//   deleteMeet             deny                 owner only (not members)   deny
//   listRegistrations      deny                 allow (incl. emergency)    deny
//   setRegistrationStatus  deny                 allow (ownership resolved from the stored request's meet)  deny
//   getPublicMeetBySlug    public projection    same                       same
//   submitRegistration     server-validated     same                       same (userId stamped when signed in)
//
// Every write is one transaction on the server (an RPC, including updateListing since 007): accept = create athlete +
// link + status together; save = revision check + reference validation + config/roster upsert, results untouched.
// data and error are never both set; a successful write followed by a failed re-read returns error + committed: true.
//
// Outside this API: a volunteer join code lets a phone read the meet (without admin_pin since 007) and write
// athletes/results/live_state through the scorer; the admin PIN is checked server-side (zt_check_admin_pin, throttled),
// never compared on a joined phone. The legacy publish key is a full capability: a signed-in phone that sends it with
// its JWT claims an ownerless meet (006); without it, an ownerless meet is refused.
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
  // opts.expectedUpdatedAt: the summary.updatedAt the Listing tab loaded (C3, same rule as saveMeetState).
  updateListing(serverId: string, patch: Partial<MeetListing>, opts?: { expectedUpdatedAt?: string | null }): Promise<ApiResult<PromoterMeetSummary>>;
  rotateJoinCode(serverId: string): Promise<ApiResult<{ joinCode: string }>>;
  archiveMeet(serverId: string): Promise<ApiResult<{ ok: true }>>;   // soft: competitionStatus -> 'completed', isPublicListed unchanged
  // hard delete (010), owner only. Refused for live/completed meets. When the meet holds any divisions, events, athletes,
  // results or registrations the server requires opts.confirmName to equal the meet name (case-insensitive, trimmed);
  // an empty draft deletes without it. Everything under the meet goes with it (cascades). Returns what was removed.
  deleteMeet(serverId: string, opts?: { confirmName?: string }): Promise<ApiResult<DeletedMeet>>;
  // 037 retention guard (feature 1): owner only, meet completed with final results. Sets listing.resultsSubmittedAt once;
  // from then on the meet cannot be deleted and its show page stays reachable when unlisted.
  markResultsSubmitted(serverId: string): Promise<ApiResult<{ resultsSubmittedAt: string }>>;
  // 045 check-in desk (feature gaps #8): owner or member. updateDeskAthlete also moves the athlete (reclass) and mirrors
  // a kg weigh-in into the roster's bodyweight (lb), so callers reload the meet afterwards. setDivisionCap(null) clears.
  getDesk(serverId: string): Promise<ApiResult<DeskState>>;
  updateDeskAthlete(serverId: string, athleteId: string, patch: DeskPatch): Promise<ApiResult<DeskCheckin>>;
  setDivisionCap(serverId: string, divisionId: string, capKg: number | null): Promise<ApiResult<{ divisionId: string; capKg: number | null }>>;

  // athlete side of My Meets (010). followShow(slug, false) unfollows. Demo fixtures cannot be followed (no server row).
  listMyAthleteMeets(): Promise<ApiResult<MyAthleteMeet[]>>;
  followShow(slug: string, follow: boolean): Promise<ApiResult<{ slug: string; following: boolean }>>;

  // registrations (M4; fixture only until the schema lands)
  listRegistrations(serverId: string): Promise<ApiResult<RegistrationRequest[]>>;
  // 023 show history: which roster athletes are linked to an account, and link/unlink one by username (null or ''
  // unlinks). Owner or member only; the server rejects a username already linked to another athlete on the meet.
  listAthleteAccounts(serverId: string): Promise<ApiResult<AthleteAccountLink[]>>;
  linkAthleteAccount(serverId: string, athleteId: string, username: string | null): Promise<ApiResult<AthleteAccountLink | null>>;
  // 048 result claims (#9). Athlete side: status on one show (signed in only), claim a roster row on a completed
  // show (one pending claim per account per show; needs a username), withdraw a pending claim, list mine. Promoter
  // side (owner or member): list the meet's claims (pending first), approve (links the row) or reject.
  getClaimStatus(serverId: string): Promise<ApiResult<ClaimStatus>>;
  claimResult(serverId: string, athleteId: string, note: string | null): Promise<ApiResult<ResultClaim>>;
  withdrawClaim(claimId: string): Promise<ApiResult<{ id: string; withdrawn: true }>>;
  listMyClaims(): Promise<ApiResult<ResultClaim[]>>;
  listMeetClaims(serverId: string): Promise<ApiResult<ResultClaim[]>>;
  resolveClaim(claimId: string, approve: boolean): Promise<ApiResult<ResultClaim>>;
  // accept: validates the division still exists, refuses when the roster is at listing.athleteCap (raise the cap first;
  // there is no silent override), creates the state.athletes row, stores athleteId on the request.
  // decline/withdraw of an accepted request removes exactly that athleteId's row, and only if it has no results.
  setRegistrationStatus(id: string, status: RegistrationRequest['status']): Promise<ApiResult<RegistrationRequest>>;

  // public side (no session). Both are safe to call from a server component and from the browser.
  getPublicMeetBySlug(slug: string): Promise<ApiResult<PublicRegistrationMeet | null>>;   // null = unknown slug -> 404
  // 'waitlist' is returned when registrationStatus is 'waitlist' (the request is stored pending with waitlisted=true);
  // closed/not_provided/day_of_only/not_applicable, a passed deadline under 'open', or a full roster under 'open' are errors.
  submitRegistration(input: RegistrationSubmission): Promise<ApiResult<{ id: string; status: 'pending' | 'waitlist' | 'accepted' }>>;

  // 055 teams (signed in). Every call is the athlete acting on their own entry, except teamRename which the promoter may call too.
  getMyRegistration(slug: string): Promise<ApiResult<MyRegistration | null>>;
  teamCreate(registrationId: string, name: string): Promise<ApiResult<Team>>;
  teamJoin(registrationId: string, code: string): Promise<ApiResult<Team>>;
  teamLeave(registrationId: string): Promise<ApiResult<{ left: boolean }>>;
  teamRename(teamId: string, name: string): Promise<ApiResult<Team>>;
  setPartnerFlag(registrationId: string, flag: boolean): Promise<ApiResult<{ lookingForPartner: boolean }>>;
  teamUp(registrationId: string, otherRegistrationId: string): Promise<ApiResult<Team>>;
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
    hostGymId: null,
    theme: null,
    autoAccept: true,
    resultsSubmittedAt: null,
    schedule: null,
    sponsors: null,
    livestreamUrl: null,
    staff: null,
    importedFrom: null,
  };
}

export type { Meet };
