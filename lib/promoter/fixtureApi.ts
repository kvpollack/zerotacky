// In-memory implementation of PromoterApi + pure validation and registration helpers.
// Tested in test/promoter.test.mjs and test/register.test.mjs.

import { addAthlete, createBlankMeet, normalizeState, slugify } from '../meetBuilder';
import { DEMO_SHOW_RECORDS } from '../website/fixtures';
import {
  emptyListing,
  type ApiResult,
  type MeetListing,
  type PromoterApi,
  type PromoterMeetDetail,
  type PromoterMeetSummary,
  type PromoterUser,
  type RegistrationRequest,
} from './contract';
import {
  createSeedMeets,
  createSeedRegistrations,
  DEMO_PROMOTER_USER,
} from './fixtures';
import type { AppState } from '../types';

const JOIN_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function clone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

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

// Pure helper: compares editable meet state (meet, divisions, events, athletes) while ignoring results.
export function isMeetStateDirty(saved: AppState, working: AppState): boolean {
  const pickEditable = (s: AppState) => ({
    meet: s.meet,
    divisions: s.divisions,
    events: s.events,
    athletes: s.athletes,
  });
  return JSON.stringify(pickEditable(saved)) !== JSON.stringify(pickEditable(working));
}

// Pure helper: validates listing patches before saving.
export function validateListingPatch(
  meetDate: string,
  current: MeetListing,
  patch: Partial<MeetListing>
): string | null {
  const merged: MeetListing = { ...current, ...patch };

  if (merged.athleteCap !== null && merged.athleteCap !== undefined) {
    if (!Number.isFinite(merged.athleteCap) || merged.athleteCap < 1) {
      return 'Athlete cap must be a positive whole number (at least 1), or left blank.';
    }
  }

  if (merged.registrationDeadline) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(merged.registrationDeadline)) {
      return 'Registration deadline must be a valid YYYY-MM-DD date.';
    }
    if (meetDate && /^\d{4}-\d{2}-\d{2}$/.test(meetDate)) {
      if (merged.registrationDeadline > meetDate) {
        return `Registration deadline (${merged.registrationDeadline}) must be on or before the meet date (${meetDate}).`;
      }
    }
  }

  if (merged.isPublicListed && merged.venue) {
    if (!merged.venue.city?.trim() || !merged.venue.state?.trim()) {
      return 'Publicly listed meets with a venue must include both City and State.';
    }
  }

  return null;
}

export interface FixturePromoterApiOptions {
  signedOut?: boolean;
}

export interface ExtendedFixturePromoterApi extends PromoterApi {
  setSignedOutForDev(signedOut: boolean): void;
  getMeetBySlug(slug: string): Promise<ApiResult<PromoterMeetDetail>>;
  submitPublicRegistration(input: RegistrationSubmissionInput): Promise<ApiResult<RegistrationRequest>>;
}

export interface RegistrationSubmissionInput {
  slug: string;
  divisionId: string;
  athleteName: string;
  email: string;
  emergencyContact: string;
  waiverAccepted: boolean;
}

export function isRegistrationOpen(status: MeetListing['registrationStatus']): boolean {
  return status === 'open' || status === 'waitlist';
}

export function validateRegistrationInput(
  input: RegistrationSubmissionInput,
  detail: PromoterMeetDetail
): string | null {
  if (!isRegistrationOpen(detail.summary.listing.registrationStatus)) {
    return `Registration for ${detail.summary.name} is currently closed (${detail.summary.listing.registrationStatus.replace(/_/g, ' ')}).`;
  }

  const trimmedName = (input.athleteName ?? '').trim();
  if (!trimmedName || trimmedName.length < 2) {
    return 'Please enter the athlete full name.';
  }

  const trimmedEmail = (input.email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return 'Please enter a valid email address.';
  }

  const trimmedEmergency = (input.emergencyContact ?? '').trim();
  if (!trimmedEmergency || trimmedEmergency.length < 5) {
    return 'Please provide an emergency contact name and phone number.';
  }

  if (!detail.state.divisions.some((d) => d.id === input.divisionId)) {
    return 'Please select a valid division for this meet.';
  }

  if (!input.waiverAccepted) {
    return 'You must read and accept the competition waiver before submitting.';
  }

  return null;
}

export function createFixturePromoterApi(
  opts: FixturePromoterApiOptions = {}
): ExtendedFixturePromoterApi {
  let signedOut = Boolean(opts.signedOut);
  let user: PromoterUser = clone(DEMO_PROMOTER_USER);
  const meets: PromoterMeetDetail[] = createSeedMeets();
  const registrations: RegistrationRequest[] = createSeedRegistrations();
  // Map registrationRequest.id -> created athlete.id in meet.state.athletes
  const regToAthleteId = new Map<string, string>([
    ['reg-ifc-1', 'ifc-ath-1'],
    ['reg-ifc-2', 'ifc-ath-2'],
  ]);
  // Store emergency contact notes in memory alongside registrations
  const regEmergencyContacts = new Map<string, string>();

  let seq = 100;
  const nextSeq = () => ++seq;

  function recomputeSummary(detail: PromoterMeetDetail): PromoterMeetSummary {
    const regCount = registrations.filter(
      (r) => r.meetServerId === detail.summary.serverId && r.status !== 'declined' && r.status !== 'withdrawn'
    ).length;
    detail.summary = {
      ...detail.summary,
      slug: detail.state.meet.slug || slugify(detail.state.meet.name),
      name: detail.state.meet.name,
      date: detail.state.meet.date || '',
      divisionCount: detail.state.divisions.length,
      athleteCount: detail.state.athletes.length,
      registrationCount: regCount,
    };
    return detail.summary;
  }

  function findMeetBySlugInternal(slug: string): PromoterMeetDetail | null {
    const clean = decodeURIComponent(slug ?? '').trim().toLowerCase();
    const existing = meets.find((m) => m.summary.slug.toLowerCase() === clean);
    if (existing) return existing;

    // Also bridge public show fixtures from lib/website/fixtures.ts so /register/<show-slug> works seamlessly
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
        },
        divisionCount: pubShow.state.divisions.length,
        athleteCount: pubShow.state.athletes.length,
        registrationCount: 0,
        updatedAt: pubShow.lastUpdatedIso ?? new Date().toISOString(),
        joinCode: 'DEMO01',
      },
      state: clone(pubShow.state),
    };
    meets.push(bridged);
    return bridged;
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
      if (!meetDate || !/^\d{4}-\d{2}-\d{2}$/.test(meetDate)) {
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
      state: AppState
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

      const normalized = normalizeState(state);
      // Contract rule: results are read-only in the promoter dashboard; never overwrite existing server results.
      const preservedResults = clone(found.state.results);

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
      patch: Partial<MeetListing>
    ): Promise<ApiResult<PromoterMeetSummary>> {
      if (signedOut) {
        return { data: null, error: 'Sign in required to update listing.' };
      }
      const found = meets.find((m) => m.summary.serverId === serverId);
      if (!found) {
        return { data: null, error: `No meet found with serverId "${serverId}".` };
      }

      const validationError = validateListingPatch(
        found.summary.date,
        found.summary.listing,
        patch
      );
      if (validationError) {
        return { data: null, error: validationError };
      }

      found.summary.listing = {
        ...found.summary.listing,
        ...clone(patch),
      };
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

      reg.status = status;

      // Synchronise accepted registrations with the meet's athlete roster
      const mappedAthleteId = regToAthleteId.get(reg.id) ?? `reg-ath-${reg.id}`;
      const existingAthlete = meetDetail.state.athletes.find(
        (a) =>
          a.id === mappedAthleteId ||
          (a.divisionId === reg.divisionId &&
            a.name.trim().toLowerCase() === reg.athleteName.trim().toLowerCase())
      );

      if (status === 'accepted') {
        if (!existingAthlete) {
          meetDetail.state = addAthlete(meetDetail.state, {
            id: mappedAthleteId,
            divisionId: reg.divisionId,
            name: reg.athleteName,
            status: 'active',
          });
          regToAthleteId.set(reg.id, mappedAthleteId);
        } else {
          regToAthleteId.set(reg.id, existingAthlete.id);
        }
      } else if (status === 'declined' || status === 'withdrawn') {
        if (existingAthlete) {
          const hasResults = meetDetail.state.results.some(
            (r) => r.athleteId === existingAthlete.id
          );
          if (!hasResults) {
            meetDetail.state = {
              ...meetDetail.state,
              athletes: meetDetail.state.athletes.filter((a) => a.id !== existingAthlete.id),
            };
          }
        }
      }

      meetDetail.summary.updatedAt = new Date().toISOString();
      recomputeSummary(meetDetail);

      return { data: clone(reg), error: null };
    },

    async submitPublicRegistration(
      input: RegistrationSubmissionInput
    ): Promise<ApiResult<RegistrationRequest>> {
      const detail = findMeetBySlugInternal(input.slug);
      if (!detail) {
        return { data: null, error: `No competition found at "${input.slug}".` };
      }

      const validationErr = validateRegistrationInput(input, detail);
      if (validationErr) {
        return { data: null, error: validationErr };
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
        status: 'pending',
        waiverAcceptedAt: nowIso,
        paid: false,
        createdAt: nowIso,
      };

      registrations.unshift(newReg);
      regEmergencyContacts.set(newReg.id, input.emergencyContact.trim());
      detail.summary.updatedAt = nowIso;
      recomputeSummary(detail);

      return { data: clone(newReg), error: null };
    },
  };
}

// Module-level singleton so state persists across client navigations (/register/<slug> -> /promoter/<id>).
let singletonApi: ExtendedFixturePromoterApi | null = null;

export function getFixturePromoterApi(): ExtendedFixturePromoterApi {
  if (!singletonApi) {
    singletonApi = createFixturePromoterApi();
  }
  return singletonApi;
}

export async function getFixtureMeetForRegistration(
  slug: string
): Promise<ApiResult<PromoterMeetDetail>> {
  return getFixturePromoterApi().getMeetBySlug(slug);
}

export async function submitFixtureRegistration(
  input: RegistrationSubmissionInput,
  api: ExtendedFixturePromoterApi = getFixturePromoterApi()
): Promise<ApiResult<RegistrationRequest>> {
  return api.submitPublicRegistration(input);
}
