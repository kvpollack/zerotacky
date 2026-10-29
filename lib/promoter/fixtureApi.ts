// In-memory implementation of PromoterApi + pure validation and registration helpers.
// Tested in test/promoter.test.mjs and test/register.test.mjs.
//
// Fixture data lives in the JavaScript heap of the process that imported this module: in the browser it is one
// tab's memory (reset on reload), on the Next.js server it is the dev server process. Nothing is written to
// localStorage or to Supabase. The Supabase implementation (Slate, M3) replaces getFixturePromoterApi().

import { addAthlete, createBlankMeet, normalizeState, slugify } from '../meetBuilder';
import { DEMO_SHOW_RECORDS } from '../website/fixtures';
import {
  emptyListing,
  type ApiResult,
  type AthleteAccountLink,
  type DeletedMeet,
  type MyAthleteMeet,
  type MeetListing,
  type PromoterApi,
  type PromoterMeetDetail,
  type PromoterMeetSummary,
  type PromoterUser,
  type PublicRegistrationMeet,
  type RegistrationRequest,
  type RegistrationSubmission,
} from './contract';
import {
  createSeedMeets,
  createSeedRegistrations,
  DEMO_PROMOTER_USER,
} from './fixtures';
import type { AppState } from '../types';

import {
  clone,
  decideRegistrationOutcome,
  isMinorOnMeetDay,
  findOrphanedResult,
  ISO_DATE,
  todayIsoDate,
  toPublicRegistrationMeet,
  validateListingPatch,
  validateRegistrationInput,
} from './rules';

// The pure rules moved to ./rules (Astra H1, 10/17); re-exported so existing imports and tests keep working.
export {
  ageOnDate,
  ageReferenceDate,
  decideRegistrationOutcome,
  findOrphanedResult,
  isMeetStateDirty,
  isMinorOnMeetDay,
  isRegistrationOpen,
  parseIsoDate,
  toPublicRegistrationMeet,
  validateAthleteAge,
  validateEmergencyContact,
  validateGuardian,
  validateListingPatch,
  validateRegistrationInput,
} from './rules';

const JOIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateJoinCode(existingCode?: string | null): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      const idx = Math.floor(Math.random() * JOIN_CODE_CHARS.length);
      code += JOIN_CODE_CHARS[idx];
    }
    if (code !== existingCode) return code;
  }
  return existingCode === 'ZT9999' ? 'ZT8888' : 'ZT9999';
}

// ---------------------------------------------------------------------------------------------------------------
// Fixture implementation
// ---------------------------------------------------------------------------------------------------------------

export interface FixturePromoterApiOptions {
  signedOut?: boolean;
  // Injected for tests so deadline rules are deterministic. Defaults to the real date.
  today?: () => string;
}

export interface ExtendedFixturePromoterApi extends PromoterApi {
  setSignedOutForDev(signedOut: boolean): void;
  // Owner view by slug (includes joinCode); sign-in required like getMeet.
  getMeetBySlug(slug: string): Promise<ApiResult<PromoterMeetDetail>>;
}

export function createFixturePromoterApi(
  opts: FixturePromoterApiOptions = {}
): ExtendedFixturePromoterApi {
  let signedOut = Boolean(opts.signedOut);
  const today = opts.today ?? todayIsoDate;
  let user: PromoterUser = clone(DEMO_PROMOTER_USER);
  const meets: PromoterMeetDetail[] = createSeedMeets();
  const registrations: RegistrationRequest[] = createSeedRegistrations();
  // 023: in-memory account links keyed `${serverId}/${athleteId}`; any non-empty username resolves in the fixture.
  const athleteAccounts = new Map<string, AthleteAccountLink>();
  const follows = new Map<string, string>();   // slug -> ISO followed at (010 fixture; this tab only)
  // Display name of the organizer per meet; fixture meets belong to the demo user, bridged /shows records carry
  // their own promoterName.
  const ownerNames = new Map<string, string | null>();

  let seq = 100;
  const nextSeq = () => ++seq;

  function recomputeSummary(detail: PromoterMeetDetail): PromoterMeetSummary {
    const mine = registrations.filter((r) => r.meetServerId === detail.summary.serverId);
    detail.summary = {
      ...detail.summary,
      slug: detail.state.meet.slug || slugify(detail.state.meet.name),
      name: detail.state.meet.name,
      date: detail.state.meet.date || '',
      divisionCount: detail.state.divisions.length,
      athleteCount: detail.state.athletes.length,
      pendingCount: mine.filter((r) => r.status === 'pending').length,
      registrationCount: mine.filter((r) => r.status === 'accepted').length,
    };
    return detail.summary;
  }

  function promoterNameFor(detail: PromoterMeetDetail): string {
    const own = ownerNames.get(detail.summary.serverId);
    if (own === undefined) return user.displayName;
    return own ?? 'Promoter';
  }

  function findMeetBySlugInternal(slug: string): PromoterMeetDetail | null {
    const clean = decodeURIComponent(slug ?? '').trim().toLowerCase();
    const existing = meets.find((m) => m.summary.slug.toLowerCase() === clean);
    if (existing) return existing;

    // Bridge public show fixtures from lib/website/fixtures.ts so /register/<show-slug> works for demo shows too.
    const pubShow = DEMO_SHOW_RECORDS.find((s) => s.slug.toLowerCase() === clean);
    if (!pubShow) return null;

    const bridged: PromoterMeetDetail = {
      summary: {
        serverId: pubShow.id,
        slug: pubShow.slug,
        name: pubShow.name,
        date: pubShow.date,
        listing: {
          competitionStatus: pubShow.competitionStatus,
          registrationStatus: pubShow.registrationStatus,
          resultsStatus: pubShow.resultsStatus,
          isPublicListed: true,
          venue: clone(pubShow.venue),
          federation: pubShow.federation ?? null,
          entryFeeDisplay: pubShow.registration.entryFeeDisplay ?? null,
          registrationDeadline: pubShow.registration.registrationDeadline ?? null,
          athleteCap: pubShow.registration.athleteCap ?? null,
          promoterContact: pubShow.registration.promoterContact ?? null,
          hostGymId: null,
          theme: null,
          autoAccept: false,   // fixtures keep the review queue so the demo dashboard has pending rows
        },
        divisionCount: pubShow.state.divisions.length,
        athleteCount: pubShow.state.athletes.length,
        pendingCount: 0,
        registrationCount: 0,
        updatedAt: pubShow.lastUpdatedIso ?? new Date().toISOString(),
        joinCode: 'DEMO01',
      },
      state: clone(pubShow.state),
    };
    ownerNames.set(bridged.summary.serverId, pubShow.promoterName ?? null);
    meets.push(bridged);
    return bridged;
  }

  function removeRosterRow(
    detail: PromoterMeetDetail,
    reg: RegistrationRequest,
    verb: string
  ): string | null {
    if (!reg.athleteId) return null;
    const row = detail.state.athletes.find((a) => a.id === reg.athleteId);
    if (!row) {
      reg.athleteId = null;
      return null;
    }
    const scored = detail.state.results.filter((r) => r.athleteId === row.id);
    if (scored.length > 0) {
      const eventNames = scored
        .map((r) => detail.state.events.find((e) => e.id === r.eventId)?.name ?? r.eventId)
        .join(', ');
      return `${row.name} has recorded results (${eventNames}), so the request cannot be ${verb}. Results are read-only here; mark the athlete withdrawn on meet day instead.`;
    }
    detail.state = {
      ...detail.state,
      athletes: detail.state.athletes.filter((a) => a.id !== row.id),
    };
    reg.athleteId = null;
    return null;
  }

  return {
    setSignedOutForDev(next: boolean) {
      signedOut = Boolean(next);
    },

    async getCurrentUser(): Promise<ApiResult<PromoterUser | null>> {
      if (signedOut) {
        return { data: null, error: null };
      }
      return { data: clone(user), error: null };
    },

    async updateProfile(
      patch: Partial<Pick<PromoterUser, 'displayName' | 'roles'>>
    ): Promise<ApiResult<PromoterUser>> {
      if (signedOut) {
        return { data: null, error: 'You must be signed in to update your profile.' };
      }
      if (patch.displayName !== undefined) {
        const trimmed = patch.displayName.trim();
        if (!trimmed) {
          return { data: null, error: 'Display name cannot be empty.' };
        }
        user = { ...user, displayName: trimmed };
      }
      if (patch.roles !== undefined) {
        user = { ...user, roles: { ...user.roles, ...patch.roles } };
      }
      return { data: clone(user), error: null };
    },

    async listMyMeets(): Promise<ApiResult<PromoterMeetSummary[]>> {
      if (signedOut) {
        return { data: null, error: 'Sign in required to list your meets.' };
      }
      const list = meets.map((m) => clone(recomputeSummary(m)));
      return { data: list, error: null };
    },

    async getMeet(serverId: string): Promise<ApiResult<PromoterMeetDetail>> {
      if (signedOut) {
        return { data: null, error: 'Sign in required to view meet configuration.' };
      }
      const found = meets.find((m) => m.summary.serverId === serverId);
      if (!found) {
        return { data: null, error: `No meet found with serverId "${serverId}".` };
      }
      recomputeSummary(found);
      return { data: clone(found), error: null };
    },

    async getMeetBySlug(slug: string): Promise<ApiResult<PromoterMeetDetail>> {
      if (signedOut) {
        return { data: null, error: 'Sign in required to view meet configuration.' };
      }
      const found = findMeetBySlugInternal(slug);
      if (!found) {
        return { data: null, error: `No meet found at slug "${slug}".` };
      }
      recomputeSummary(found);
      return { data: clone(found), error: null };
    },

    async createMeet(input: {
      name: string;
      date: string;
      slug?: string;
    }): Promise<ApiResult<PromoterMeetDetail>> {
      if (signedOut) {
        return { data: null, error: 'Sign in required to create a meet.' };
      }
      const trimmedName = (input.name ?? '').trim();
      if (!trimmedName) {
        return { data: null, error: 'Meet name is required.' };
      }
      const meetDate = (input.date ?? '').trim();
      if (!meetDate || !ISO_DATE.test(meetDate)) {
        return { data: null, error: 'Meet date is required (YYYY-MM-DD).' };
      }

      const desiredSlug = slugify(input.slug?.trim() ? input.slug : trimmedName);
      if (meets.some((m) => m.summary.slug === desiredSlug)) {
        return {
          data: null,
          error: `A meet with the URL slug "${desiredSlug}" already exists. Choose a different slug.`,
        };
      }

      const serverId = `srv-meet-${nextSeq()}`;
      const blank = createBlankMeet(trimmedName, meetDate);
      const state: AppState = {
        ...blank,
        meet: {
          ...blank.meet,
          id: serverId,
          name: trimmedName,
          date: meetDate,
          slug: desiredSlug,
          isDemo: false,
        },
      };

      const nowIso = new Date().toISOString();
      const detail: PromoterMeetDetail = {
        summary: {
          serverId,
          slug: desiredSlug,
          name: trimmedName,
          date: meetDate,
          listing: emptyListing(),
          divisionCount: 0,
          athleteCount: 0,
          pendingCount: 0,
          registrationCount: 0,
          updatedAt: nowIso,
          joinCode: generateJoinCode(),
        },
        state,
      };

      meets.unshift(detail);
      return { data: clone(detail), error: null };
    },

    async saveMeetState(
      serverId: string,
      state: AppState,
      opts?: { expectedUpdatedAt?: string }
    ): Promise<ApiResult<PromoterMeetDetail>> {
      if (signedOut) {
        return { data: null, error: 'Sign in required to save meet changes.' };
      }
      const found = meets.find((m) => m.summary.serverId === serverId);
      if (!found) {
        return { data: null, error: `No meet found with serverId "${serverId}".` };
      }

      const trimmedName = (state.meet?.name ?? '').trim();
      if (!trimmedName) {
        return { data: null, error: 'Meet name cannot be empty.' };
      }

      const nextSlug = slugify(state.meet?.slug || trimmedName);
      const slugCollision = meets.some(
        (m) => m.summary.serverId !== serverId && m.summary.slug === nextSlug
      );
      if (slugCollision) {
        return {
          data: null,
          error: `Another meet already uses the slug "${nextSlug}". Pick a unique slug.`,
        };
      }

      if (opts?.expectedUpdatedAt && opts.expectedUpdatedAt !== found.summary.updatedAt) {
        return {
          data: null,
          error: `This meet changed since you opened it (saved ${found.summary.updatedAt}). Reload to see the latest version, then redo your edits.`,
        };
      }

      const normalized = normalizeState(state);

      const nextDate = normalized.meet.date || '';
      const deadline = found.summary.listing.registrationDeadline;
      if (deadline && nextDate && ISO_DATE.test(nextDate) && nextDate < deadline) {
        return {
          data: null,
          error: `Meet date (${nextDate}) is earlier than the registration deadline (${deadline}). Move the deadline first.`,
        };
      }

      // Contract rule: results are read-only in the promoter dashboard. Keep the stored results and refuse any
      // roster or event change that would leave one of them pointing at nothing.
      const preservedResults = clone(found.state.results);
      const orphan = findOrphanedResult(preservedResults, found.state, normalized);
      if (orphan) {
        return { data: null, error: orphan };
      }

      // Astra M9/C3 (10/17, checked after the result guard): an accepted registration's roster row leaves only through its request
      const workingAthleteIds = new Set(normalized.athletes.map((a) => a.id));
      const linked = registrations.find(
        (r) => r.meetServerId === serverId && r.status === 'accepted' && r.athleteId && !workingAthleteIds.has(r.athleteId)
      );
      if (linked) {
        return {
          data: null,
          error: `${linked.athleteName} is on the roster through an accepted registration. Decline or withdraw that registration instead of deleting the athlete.`,
        };
      }

      // Division (Astra gate 2, G2-M1): the registration keeps the SUBMITTED division as evidence; the roster row is
      // the division the athlete competes in, and may be changed here or on the floor. No refusal.

      // Cap (Astra gate C4, revised gate 2 G2-M1): an intake limit. A roster already over the cap (floor walk-ons)
      // saves; what is refused is this save ADDING athletes beyond the cap.
      const cap = found.summary.listing.athleteCap;
      if (cap !== null && cap !== undefined && normalized.athletes.length > cap && normalized.athletes.length > found.state.athletes.length) {
        return {
          data: null,
          error: `The roster has ${normalized.athletes.length} athletes but the listing cap is ${cap}. Raise the cap in Listing or remove athletes before saving.`,
        };
      }

      found.state = {
        ...normalized,
        meet: {
          ...normalized.meet,
          id: serverId,
          name: trimmedName,
          slug: nextSlug,
          isDemo: false,
        },
        results: preservedResults,
      };
      found.summary.updatedAt = new Date().toISOString();
      recomputeSummary(found);

      return { data: clone(found), error: null };
    },

    async updateListing(
      serverId: string,
      patch: Partial<MeetListing>,
      opts?: { expectedUpdatedAt?: string | null }
    ): Promise<ApiResult<PromoterMeetSummary>> {
      if (signedOut) {
        return { data: null, error: 'Sign in required to update listing.' };
      }
      const found = meets.find((m) => m.summary.serverId === serverId);
      if (!found) {
        return { data: null, error: `No meet found with serverId "${serverId}".` };
      }

      // Astra gate C3 (listing): same revision rule as saveMeetState; a stale tab cannot flip registration back open.
      if (opts?.expectedUpdatedAt && opts.expectedUpdatedAt !== found.summary.updatedAt) {
        return {
          data: null,
          error: `This meet changed since you opened it (saved ${found.summary.updatedAt}). Reload to see the latest version, then redo your edits.`,
        };
      }

      const validationError = validateListingPatch(
        found.summary.date,
        found.summary.listing,
        patch
      );
      if (validationError) {
        return { data: null, error: validationError };
      }
      // (Gate 2 G2-M1: a cap below the current roster is allowed; it limits intake, not the existing roster.)

      found.summary.listing = {
        ...found.summary.listing,
        ...clone(patch),
      };
      if (typeof found.summary.listing.promoterContact === 'string') {
        found.summary.listing.promoterContact = found.summary.listing.promoterContact.trim() || null;
      }
      found.summary.updatedAt = new Date().toISOString();
      recomputeSummary(found);

      return { data: clone(found.summary), error: null };
    },

    async rotateJoinCode(
      serverId: string
    ): Promise<ApiResult<{ joinCode: string }>> {
      if (signedOut) {
        return { data: null, error: 'Sign in required to rotate join code.' };
      }
      const found = meets.find((m) => m.summary.serverId === serverId);
      if (!found) {
        return { data: null, error: `No meet found with serverId "${serverId}".` };
      }

      const nextCode = generateJoinCode(found.summary.joinCode);
      found.summary.joinCode = nextCode;
      found.summary.updatedAt = new Date().toISOString();

      return { data: { joinCode: nextCode }, error: null };
    },

    async archiveMeet(serverId: string): Promise<ApiResult<{ ok: true }>> {
      if (signedOut) {
        return { data: null, error: 'Sign in required to archive a meet.' };
      }
      const found = meets.find((m) => m.summary.serverId === serverId);
      if (!found) {
        return { data: null, error: `No meet found with serverId "${serverId}".` };
      }
      found.summary.listing = {
        ...found.summary.listing,
        competitionStatus: 'completed',
      };
      found.summary.updatedAt = new Date().toISOString();
      return { data: { ok: true }, error: null };
    },

    async listMyAthleteMeets(): Promise<ApiResult<MyAthleteMeet[]>> {
      if (signedOut) {
        return { data: null, error: 'Sign in to see your meets.' };
      }
      const rows: MyAthleteMeet[] = [];
      for (const [slug, at] of follows) {
        const m = meets.find((x) => x.summary.slug === slug);
        if (!m) continue;
        rows.push({
          meetServerId: m.summary.serverId, slug, name: m.summary.name, date: m.summary.date,
          competitionStatus: m.summary.listing.competitionStatus, resultsStatus: m.summary.listing.resultsStatus,
          isPublicListed: m.summary.listing.isPublicListed, kind: 'follow', following: true, registrationStatus: null, waitlisted: false,
          divisionName: null, createdAt: at,
        });
      }
      return { data: rows, error: null };
    },

    async followShow(slug: string, follow: boolean): Promise<ApiResult<{ slug: string; following: boolean }>> {
      if (signedOut) {
        return { data: null, error: 'Sign in to follow a show.' };
      }
      const m = meets.find((x) => x.summary.slug === slug && x.summary.listing.isPublicListed);
      if (!m) {
        return { data: null, error: 'This show cannot be followed (not listed).' };
      }
      if (follow) follows.set(slug, new Date().toISOString());
      else follows.delete(slug);
      return { data: { slug, following: follow }, error: null };
    },

    async deleteMeet(serverId: string, opts?: { confirmName?: string }): Promise<ApiResult<DeletedMeet>> {
      if (signedOut) {
        return { data: null, error: 'Sign in required to delete a meet.' };
      }
      const idx = meets.findIndex((m) => m.summary.serverId === serverId);
      if (idx < 0) {
        return { data: null, error: `No meet found with serverId "${serverId}".` };
      }
      const found = meets[idx];
      const status = found.summary.listing.competitionStatus;
      if (status === 'live' || status === 'completed') {
        return { data: null, error: `a ${status} meet cannot be deleted. Set it to cancelled on the Listing tab first, or leave it as a record.` };
      }
      const mine = registrations.filter((r) => r.meetServerId === serverId);
      const deleted = {
        divisions: found.state.divisions.length,
        events: found.state.events.length,
        athletes: found.state.athletes.length,
        results: found.state.results.length,
        registrations: mine.length,
      };
      const total = Object.values(deleted).reduce((a, b) => a + b, 0);
      const typed = (opts?.confirmName ?? '').trim().toLowerCase();
      if (total > 0 && typed !== found.summary.name.trim().toLowerCase()) {
        return { data: null, error: 'this meet has data associated with it. Type the meet name exactly to confirm deletion.' };
      }
      meets.splice(idx, 1);
      for (let i = registrations.length - 1; i >= 0; i--) {
        if (registrations[i].meetServerId === serverId) registrations.splice(i, 1);
      }
      return { data: { id: serverId, name: found.summary.name, deleted }, error: null };
    },

    async listRegistrations(
      serverId: string
    ): Promise<ApiResult<RegistrationRequest[]>> {
      if (signedOut) {
        return { data: null, error: 'Sign in required to view registrations.' };
      }
      const found = meets.find((m) => m.summary.serverId === serverId);
      if (!found) {
        return { data: null, error: `No meet found with serverId "${serverId}".` };
      }
      const rows = registrations
        .filter((r) => r.meetServerId === serverId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { data: clone(rows), error: null };
    },

    async setRegistrationStatus(
      id: string,
      status: RegistrationRequest['status']
    ): Promise<ApiResult<RegistrationRequest>> {
      if (signedOut) {
        return { data: null, error: 'Sign in required to update registration status.' };
      }
      const reg = registrations.find((r) => r.id === id);
      if (!reg) {
        return { data: null, error: `No registration found with id "${id}".` };
      }
      const meetDetail = meets.find((m) => m.summary.serverId === reg.meetServerId);
      if (!meetDetail) {
        return { data: null, error: 'Associated meet no longer exists.' };
      }
      if (reg.status === status) {
        return { data: clone(reg), error: null };
      }

      if (status === 'accepted') {
        const division = meetDetail.state.divisions.find((d) => d.id === reg.divisionId);
        if (!division) {
          return {
            data: null,
            error: `${reg.athleteName} registered for a division that no longer exists on ${meetDetail.summary.name}. Decline the request or restore the division before accepting.`,
          };
        }
        const existing = reg.athleteId
          ? meetDetail.state.athletes.find((a) => a.id === reg.athleteId)
          : undefined;
        const cap = meetDetail.summary.listing.athleteCap;
        if (!existing && cap !== null && meetDetail.state.athletes.length >= cap) {
          return {
            data: null,
            error: `${meetDetail.summary.name} is at its athlete cap (${cap}). Raise the cap in Listing before accepting ${reg.athleteName}.`,
          };
        }
        if (!existing) {
          const athleteId = `reg-ath-${reg.id}`;
          meetDetail.state = addAthlete(meetDetail.state, {
            id: athleteId,
            divisionId: reg.divisionId,
            name: reg.athleteName,
            status: 'active',
          });
          reg.athleteId = athleteId;
        }
      } else {
        // pending / declined / withdrawn: the roster row (if any) leaves, unless it has results.
        const verb = status === 'declined' ? 'declined' : status === 'withdrawn' ? 'withdrawn' : 'reopened';
        const blocked = removeRosterRow(meetDetail, reg, verb);
        if (blocked) {
          return { data: null, error: blocked };
        }
      }

      reg.status = status;
      meetDetail.summary.updatedAt = new Date().toISOString();
      recomputeSummary(meetDetail);

      return { data: clone(reg), error: null };
    },

    async listAthleteAccounts(serverId: string): Promise<ApiResult<AthleteAccountLink[]>> {
      if (signedOut) {
        return { data: null, error: 'Sign in required to view linked accounts.' };
      }
      if (!meets.some((m) => m.summary.serverId === serverId)) {
        return { data: null, error: `No meet found with serverId "${serverId}".` };
      }
      const out = [...athleteAccounts.entries()].filter(([k]) => k.startsWith(`${serverId}/`)).map(([, v]) => clone(v));
      return { data: out, error: null };
    },

    async linkAthleteAccount(serverId: string, athleteId: string, username: string | null): Promise<ApiResult<AthleteAccountLink | null>> {
      if (signedOut) {
        return { data: null, error: 'Sign in required to link an account.' };
      }
      const found = meets.find((m) => m.summary.serverId === serverId);
      if (!found) {
        return { data: null, error: `No meet found with serverId "${serverId}".` };
      }
      if (!found.state.athletes.some((a) => a.id === athleteId)) {
        return { data: null, error: 'That athlete is not on this roster. Save the roster first.' };
      }
      const key = `${serverId}/${athleteId}`;
      const clean = (username ?? '').trim().replace(/^@/, '').toLowerCase();
      if (!clean) {
        athleteAccounts.delete(key);
        return { data: null, error: null };
      }
      const other = [...athleteAccounts.entries()].find(([k, v]) => k.startsWith(`${serverId}/`) && k !== key && v.username === clean);
      if (other) {
        const otherName = found.state.athletes.find((a) => a.id === other[1].athleteId)?.name ?? other[1].athleteId;
        return { data: null, error: `@${clean} is already linked to ${otherName} on this meet. Unlink that row first.` };
      }
      const link: AthleteAccountLink = { athleteId, username: clean, displayName: clean, fromRegistration: false };
      athleteAccounts.set(key, link);
      return { data: clone(link), error: null };
    },

    async getPublicMeetBySlug(slug: string): Promise<ApiResult<PublicRegistrationMeet | null>> {
      const found = findMeetBySlugInternal(slug);
      if (!found) {
        return { data: null, error: null };
      }
      recomputeSummary(found);
      return { data: toPublicRegistrationMeet(found, promoterNameFor(found)), error: null };
    },

    async submitRegistration(
      input: RegistrationSubmission
    ): Promise<ApiResult<{ id: string; status: 'pending' | 'waitlist' | 'accepted' }>> {
      const detail = findMeetBySlugInternal(input.slug);
      if (!detail) {
        return { data: null, error: `No competition found at "${input.slug}".` };
      }
      recomputeSummary(detail);
      const pub = toPublicRegistrationMeet(detail, promoterNameFor(detail));

      const validationErr = validateRegistrationInput(input, pub);
      if (validationErr) {
        return { data: null, error: validationErr };
      }

      const outcome = decideRegistrationOutcome(pub, today());
      if (outcome.status === null) {
        return { data: null, error: outcome.error };
      }

      const duplicate = registrations.find(
        (r) =>
          r.meetServerId === detail.summary.serverId &&
          r.email.trim().toLowerCase() === input.email.trim().toLowerCase() &&
          r.divisionId === input.divisionId &&
          r.status !== 'withdrawn' &&
          r.status !== 'declined'
      );
      if (duplicate) {
        return {
          data: null,
          error: 'An active or pending registration already exists for this email in the selected division.',
        };
      }

      const nowIso = new Date().toISOString();
      const newReg: RegistrationRequest = {
        id: `reg-${nextSeq()}`,
        meetServerId: detail.summary.serverId,
        divisionId: input.divisionId,
        athleteName: input.athleteName.trim(),
        email: input.email.trim().toLowerCase(),
        emergencyContact: input.emergencyContact.trim(),
        athleteId: null,
        status: 'pending',
        waitlisted: outcome.status === 'waitlist',
        waiverAcceptedAt: nowIso,
        waiverVersion: input.waiverVersion,
        dateOfBirth: input.dateOfBirth.trim(),
        guardian: isMinorOnMeetDay(input.dateOfBirth, pub.date, today()) && input.guardian
          ? { name: input.guardian.name.trim(), contact: input.guardian.contact.trim() }
          : null,
        paid: false,
        createdAt: nowIso,
      };

      registrations.unshift(newReg);
      detail.summary.updatedAt = nowIso;
      recomputeSummary(detail);

      return { data: { id: newReg.id, status: outcome.status }, error: null };
    },
  };
}

// Module-level singleton so state persists across client navigations within one tab
// (/register/<slug> -> /promoter/<id>). It is per JavaScript realm: the browser tab and the Next.js server each
// hold their own copy, and a reload starts over from the seeds.
let singletonApi: ExtendedFixturePromoterApi | null = null;

export function getFixturePromoterApi(): ExtendedFixturePromoterApi {
  if (!singletonApi) {
    singletonApi = createFixturePromoterApi();
  }
  return singletonApi;
}
