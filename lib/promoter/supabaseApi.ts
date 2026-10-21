// Supabase implementation of `PromoterApi` over the narrow `PromoterDb` interface.
// Matches `lib/promoter/fixtureApi.ts` behaviour and reuses its pure validation and allowlist helpers.

import { profileLabel, type ProfilePatch } from '../auth/profile';
import { normalizeState, slugify } from '../meetBuilder';
import { rowsToState, stateToRows } from '../sync/mapping';
import type { AppState } from '../types';
import {
  emptyListing,
  type ApiResult,
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
import type {
  MeetListingColumns,
  MeetListingRow,
  PromoterDb,
  PromoterMeetRow,
  RegistrationRow,
} from './db';
import {
  decideRegistrationOutcome,
  isMinorOnMeetDay,
  findOrphanedResult,
  toPublicRegistrationMeet,
  validateListingPatch,
  validateRegistrationInput,
} from './rules';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

export function rowToMeetListing(row: Partial<MeetListingRow>): MeetListing {
  const def = emptyListing();
  return {
    competitionStatus: row.competition_status ?? def.competitionStatus,
    registrationStatus: row.registration_status ?? def.registrationStatus,
    resultsStatus: row.results_status ?? def.resultsStatus,
    isPublicListed: Boolean(row.is_public_listed),
    venue: row.venue ? { ...row.venue } : null,
    federation: row.federation ?? null,
    entryFeeDisplay: row.entry_fee_display ?? null,
    registrationDeadline: row.registration_deadline ?? null,
    athleteCap:
      row.athlete_cap !== null && row.athlete_cap !== undefined ? Number(row.athlete_cap) : null,
    promoterContact: row.promoter_contact ?? null,
  };
}

export function listingPatchToColumns(patch: Partial<MeetListing>): Partial<MeetListingColumns> {
  const out: Partial<MeetListingColumns> = {};
  if (patch.competitionStatus !== undefined) out.competition_status = patch.competitionStatus;
  if (patch.registrationStatus !== undefined) out.registration_status = patch.registrationStatus;
  if (patch.resultsStatus !== undefined) out.results_status = patch.resultsStatus;
  if (patch.isPublicListed !== undefined) out.is_public_listed = Boolean(patch.isPublicListed);
  if (patch.venue !== undefined) out.venue = patch.venue ? { ...patch.venue } : null;
  if (patch.federation !== undefined) {
    out.federation = patch.federation ? patch.federation.trim() || null : null;
  }
  if (patch.entryFeeDisplay !== undefined) {
    out.entry_fee_display = patch.entryFeeDisplay ? patch.entryFeeDisplay.trim() || null : null;
  }
  if (patch.registrationDeadline !== undefined) {
    out.registration_deadline = patch.registrationDeadline
      ? patch.registrationDeadline.trim() || null
      : null;
  }
  if (patch.athleteCap !== undefined) {
    out.athlete_cap = patch.athleteCap;
  }
  if (patch.promoterContact !== undefined) {
    out.promoter_contact = patch.promoterContact ? patch.promoterContact.trim() || null : null;
  }
  return out;
}

export function rowToPromoterMeetSummary(row: PromoterMeetRow): PromoterMeetSummary {
  return {
    serverId: row.id,
    slug: row.slug,
    name: row.name,
    date: row.date ?? '',
    listing: rowToMeetListing(row),
    divisionCount: Number(row.division_count ?? 0),
    athleteCount: Number(row.athlete_count ?? 0),
    pendingCount: Number(row.pending_count ?? 0),
    registrationCount: Number(row.registration_count ?? 0),
    updatedAt: row.updated_at ?? new Date().toISOString(),
    joinCode: row.join_code ?? null,
  };
}

export function rowToRegistrationRequest(row: RegistrationRow): RegistrationRequest {
  const normalizedStatus: RegistrationRequest['status'] =
    row.status === 'waitlist' ? 'pending' : row.status;
  return {
    id: row.id,
    meetServerId: row.meet_id,
    divisionId: row.division_id,
    athleteName: row.name,
    email: row.email,
    emergencyContact: row.emergency_contact ?? '',
    athleteId: row.athlete_id ?? null,
    status: normalizedStatus,
    waitlisted: Boolean(row.waitlisted || row.status === 'waitlist'),
    waiverAcceptedAt: row.waiver_accepted_at ?? null,
    waiverVersion: row.waiver_version ?? null,
    dateOfBirth: row.date_of_birth ?? null,
    guardian: row.guardian_name ? { name: row.guardian_name, contact: row.guardian_contact ?? '' } : null,
    paid: Boolean(row.paid),
    createdAt: row.created_at,
  };
}

export interface SupabasePromoterApiOptions {
  today?: () => string;
}

// zt_my_athlete_meets row (010)
interface AthleteMeetRow {
  meet_id: string; slug: string; name: string; date: string | null;
  competition_status: MyAthleteMeet['competitionStatus']; results_status: MyAthleteMeet['resultsStatus'];
  is_public_listed: boolean; kind: 'registration' | 'follow'; following?: boolean | null;
  registration_id: string | null; registration_status: MyAthleteMeet['registrationStatus']; waitlisted: boolean | null;
  division_name: string | null; created_at: string;
}
function rowToMyAthleteMeet(r: AthleteMeetRow): MyAthleteMeet {
  return {
    meetServerId: r.meet_id, slug: r.slug, name: r.name, date: r.date ?? '',
    competitionStatus: r.competition_status, resultsStatus: r.results_status, isPublicListed: !!r.is_public_listed,
    kind: r.kind, following: r.kind === 'follow' || !!r.following, registrationStatus: r.registration_status ?? null, waitlisted: !!r.waitlisted,
    divisionName: r.division_name ?? null, createdAt: r.created_at,
  };
}

export function createSupabasePromoterApi(
  db: PromoterDb,
  opts: SupabasePromoterApiOptions = {}
): PromoterApi {
  const today = opts.today ?? (() => new Date().toISOString().slice(0, 10));

  async function requireSignedInUser(): Promise<
    { user: { id: string; email: string | null }; error: null } | { user: null; error: string }
  > {
    const u = await db.getUser();
    if (!u) {
      return { user: null, error: 'Sign in required.' };
    }
    return { user: u, error: null };
  }

  async function buildMeetDetail(meetRow: PromoterMeetRow): Promise<PromoterMeetDetail> {
    const children = await db.selectChildren(meetRow.id);
    const state = rowsToState({
      meet: meetRow,
      divisions: children.divisions,
      events: children.events,
      athletes: children.athletes,
      results: children.results,
    });
    const summary: PromoterMeetSummary = {
      ...rowToPromoterMeetSummary(meetRow),
      divisionCount: state.divisions.length,
      athleteCount: state.athletes.length,
    };
    return { summary, state };
  }

  return {
    async getCurrentUser(): Promise<ApiResult<PromoterUser | null>> {
      try {
        const u = await db.getUser();
        if (!u) {
          return { data: null, error: null };
        }
        const profile = await db.selectProfile(u.id);
        const user: PromoterUser = {
          id: u.id,
          email: profile?.email ?? u.email ?? '',
          displayName: profileLabel(profile, u.email),
          roles: {
            athlete: Boolean(profile?.is_athlete),
            promoter: Boolean(profile?.is_promoter),
            gymOwner: Boolean(profile?.is_gym_owner),
          },
        };
        return { data: user, error: null };
      } catch (e) {
        return { data: null, error: errMessage(e) };
      }
    },

    async updateProfile(
      patch: Partial<Pick<PromoterUser, 'displayName' | 'roles'>>
    ): Promise<ApiResult<PromoterUser>> {
      try {
        const u = await db.getUser();
        if (!u) {
          return { data: null, error: 'You must be signed in to update your profile.' };
        }
        const dbPatch: ProfilePatch = {};
        if (patch.displayName !== undefined) {
          const trimmed = patch.displayName.trim();
          if (!trimmed) {
            return { data: null, error: 'Display name cannot be empty.' };
          }
          dbPatch.display_name = trimmed.slice(0, 80);
        }
        if (patch.roles !== undefined) {
          if (patch.roles.athlete !== undefined) dbPatch.is_athlete = Boolean(patch.roles.athlete);
          if (patch.roles.promoter !== undefined) dbPatch.is_promoter = Boolean(patch.roles.promoter);
          if (patch.roles.gymOwner !== undefined) dbPatch.is_gym_owner = Boolean(patch.roles.gymOwner);
        }
        const updated = await db.updateProfile(u.id, dbPatch);
        return {
          data: {
            id: u.id,
            email: updated.email ?? u.email ?? '',
            displayName: profileLabel(updated, u.email),
            roles: {
              athlete: Boolean(updated.is_athlete),
              promoter: Boolean(updated.is_promoter),
              gymOwner: Boolean(updated.is_gym_owner),
            },
          },
          error: null,
        };
      } catch (e) {
        return { data: null, error: errMessage(e) };
      }
    },

    async listMyMeets(): Promise<ApiResult<PromoterMeetSummary[]>> {
      try {
        const authCheck = await requireSignedInUser();
        if (!authCheck.user) {
          return { data: null, error: 'Sign in required to list your meets.' };
        }
        const rows = await db.selectMyMeets();
        return { data: rows.map(rowToPromoterMeetSummary), error: null };
      } catch (e) {
        return { data: null, error: errMessage(e) };
      }
    },

    async getMeet(serverId: string): Promise<ApiResult<PromoterMeetDetail>> {
      try {
        const authCheck = await requireSignedInUser();
        if (!authCheck.user) {
          return { data: null, error: 'Sign in required to view meet configuration.' };
        }
        const meetRow = await db.selectMeet(serverId);
        if (!meetRow) {
          return { data: null, error: `No meet found with serverId "${serverId}".` };
        }
        const detail = await buildMeetDetail(meetRow);
        return { data: detail, error: null };
      } catch (e) {
        return { data: null, error: errMessage(e) };
      }
    },

    async createMeet(input: {
      name: string;
      date: string;
      slug?: string;
    }): Promise<ApiResult<PromoterMeetDetail>> {
      // R3 (Astra rehearsal 10/17): once the RPC has landed, any later failure (re-read, child reads) must still say
      // committed: true, or the dashboard re-enables Create and the promoter makes the meet twice.
      let committed = false;
      try {
        const authCheck = await requireSignedInUser();
        if (!authCheck.user) {
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

        const created = await db.rpc<PromoterMeetRow | { id: string }>('zt_create_meet', {
          p_name: trimmedName,
          p_date: meetDate,
          p_slug: desiredSlug,
        });

        const serverId = created?.id;
        if (!serverId) {
          return { data: null, error: 'Could not create meet.' };
        }
        committed = true;

        const fullMeetRow =
          'division_count' in created ? (created as PromoterMeetRow) : await db.selectMeet(serverId);
        if (!fullMeetRow) {
          return { data: null, committed: true, error: `The meet was created, but it could not be loaded afterwards. Reload the dashboard; do not create it again.` };
        }
        const detail = await buildMeetDetail(fullMeetRow);
        return { data: detail, error: null };
      } catch (e) {
        if (committed) {
          return { data: null, committed: true, error: `The meet was created, but it could not be loaded afterwards (${errMessage(e)}). Reload the dashboard; do not create it again.` };
        }
        return { data: null, error: errMessage(e) };
      }
    },

    async saveMeetState(
      serverId: string,
      state: AppState,
      opts?: { expectedUpdatedAt?: string }
    ): Promise<ApiResult<PromoterMeetDetail>> {
      let committed = false;   // R3: set once zt_save_meet_config returns
      try {
        const authCheck = await requireSignedInUser();
        if (!authCheck.user) {
          return { data: null, error: 'Sign in required to save meet changes.' };
        }
        const existingRow = await db.selectMeet(serverId);
        if (!existingRow) {
          return { data: null, error: `No meet found with serverId "${serverId}".` };
        }

        // C3 pre-check (the RPC repeats it inside the row lock)
        if (opts?.expectedUpdatedAt && existingRow.updated_at && new Date(existingRow.updated_at).getTime() !== new Date(opts.expectedUpdatedAt).getTime()) {
          return {
            data: null,
            error: `This meet changed since you opened it (saved ${existingRow.updated_at}). Reload to see the latest version, then redo your edits.`,
          };
        }

        const trimmedName = (state.meet?.name ?? '').trim();
        if (!trimmedName) {
          return { data: null, error: 'Meet name cannot be empty.' };
        }

        const nextSlug = slugify(state.meet?.slug || trimmedName);
        const normalized = normalizeState(state);

        const nextDate = normalized.meet.date || '';
        const deadline = existingRow.registration_deadline;
        if (deadline && nextDate && ISO_DATE.test(nextDate) && nextDate < deadline) {
          return {
            data: null,
            error: `Meet date (${nextDate}) is earlier than the registration deadline (${deadline}). Move the deadline first.`,
          };
        }

        // Pre-check client-side H3 orphan guard against current server children, and let `zt_save_meet_config`
        // enforce it authoritatively inside the transaction on the database.
        const currentDetail = await buildMeetDetail(existingRow);
        const orphan = findOrphanedResult(
          currentDetail.state.results,
          currentDetail.state,
          normalized
        );
        if (orphan) {
          return { data: null, error: orphan };
        }

        const toSave: AppState = {
          ...normalized,
          meet: {
            ...normalized.meet,
            id: serverId,
            name: trimmedName,
            slug: nextSlug,
            isDemo: false,
          },
        };
        const rows = stateToRows(toSave, {
          meetId: serverId,
          slug: nextSlug,
          stations: toSave.meet.stations,
          isDemo: false,
        });

        await db.rpc('zt_save_meet_config', {
          p_meet_id: serverId,
          p_meet: rows.meet,
          p_divisions: rows.divisions,
          p_events: rows.events,
          p_athletes: rows.athletes,
          p_expected_updated_at: opts?.expectedUpdatedAt ?? null,
        });
        committed = true;

        let rereadRow: PromoterMeetRow | null = null;
        let rereadError: string | null = null;
        try {
          rereadRow = await db.selectMeet(serverId);
        } catch (e) {
          rereadError = errMessage(e);
        }
        if (!rereadRow) {
          return { data: null, committed: true, error: `Your changes were saved, but the page could not refresh${rereadError ? ` (${rereadError})` : ''}. Reload to see the saved version.` };
        }
        const detail = await buildMeetDetail(rereadRow);
        return { data: detail, error: null };
      } catch (e) {
        if (committed) {
          return { data: null, committed: true, error: `Your changes were saved, but the page could not refresh (${errMessage(e)}). Reload to see the saved version.` };
        }
        return { data: null, error: errMessage(e) };
      }
    },

    async updateListing(
      serverId: string,
      patch: Partial<MeetListing>,
      opts?: { expectedUpdatedAt?: string | null }
    ): Promise<ApiResult<PromoterMeetSummary>> {
      let committed = false;   // R3: set once zt_update_listing returns
      try {
        const authCheck = await requireSignedInUser();
        if (!authCheck.user) {
          return { data: null, error: 'Sign in required to update listing.' };
        }
        const existingRow = await db.selectMeet(serverId);
        if (!existingRow) {
          return { data: null, error: `No meet found with serverId "${serverId}".` };
        }

        const currentListing = rowToMeetListing(existingRow);
        const validationError = validateListingPatch(
          existingRow.date ?? '',
          currentListing,
          patch
        );
        if (validationError) {
          return { data: null, error: validationError };
        }

        await db.updateMeetListing(serverId, listingPatchToColumns(patch), opts?.expectedUpdatedAt ?? null);
        committed = true;
        let updatedRow: PromoterMeetRow | null = null;
        let rereadError: string | null = null;
        try {
          updatedRow = await db.selectMeet(serverId);
        } catch (e) {
          rereadError = errMessage(e);
        }
        if (!updatedRow) {
          return { data: null, committed: true, error: `Listing saved, but the page could not refresh${rereadError ? ` (${rereadError})` : ''}. Reload to see the saved version.` };
        }
        return { data: rowToPromoterMeetSummary(updatedRow), error: null };
      } catch (e) {
        if (committed) {
          return { data: null, committed: true, error: `Listing saved, but the page could not refresh (${errMessage(e)}). Reload to see the saved version.` };
        }
        return { data: null, error: errMessage(e) };
      }
    },

    async rotateJoinCode(serverId: string): Promise<ApiResult<{ joinCode: string }>> {
      try {
        const authCheck = await requireSignedInUser();
        if (!authCheck.user) {
          return { data: null, error: 'Sign in required to rotate join code.' };
        }
        const out = await db.rpc<{ joinCode?: string; join_code?: string }>('zt_rotate_join_code', {
          p_meet_id: serverId,
        });
        const joinCode = out?.joinCode ?? out?.join_code;
        if (!joinCode) {
          return { data: null, error: 'Could not rotate join code.' };
        }
        return { data: { joinCode }, error: null };
      } catch (e) {
        return { data: null, error: errMessage(e) };
      }
    },

    async archiveMeet(serverId: string): Promise<ApiResult<{ ok: true }>> {
      try {
        const authCheck = await requireSignedInUser();
        if (!authCheck.user) {
          return { data: null, error: 'Sign in required to archive a meet.' };
        }
        const existingRow = await db.selectMeet(serverId);
        if (!existingRow) {
          return { data: null, error: `No meet found with serverId "${serverId}".` };
        }
        await db.updateMeetListing(serverId, { competition_status: 'completed' });
        return { data: { ok: true }, error: null };
      } catch (e) {
        return { data: null, error: errMessage(e) };
      }
    },

    async deleteMeet(serverId: string, opts?: { confirmName?: string }): Promise<ApiResult<DeletedMeet>> {
      try {
        const authCheck = await requireSignedInUser();
        if (!authCheck.user) {
          return { data: null, error: 'Sign in required to delete a meet.' };
        }
        const out = await db.rpc<DeletedMeet>('zt_delete_meet', {
          p_meet_id: serverId,
          p_confirm_name: opts?.confirmName?.trim() ? opts.confirmName.trim() : null,
        });
        if (!out?.id) {
          return { data: null, error: 'Could not delete the meet.' };
        }
        return { data: out, error: null };
      } catch (e) {
        return { data: null, error: errMessage(e) };
      }
    },

    async listMyAthleteMeets(): Promise<ApiResult<MyAthleteMeet[]>> {
      try {
        const authCheck = await requireSignedInUser();
        if (!authCheck.user) {
          return { data: null, error: 'Sign in to see your meets.' };
        }
        const rows = await db.rpc<AthleteMeetRow[]>('zt_my_athlete_meets', {});
        return { data: (Array.isArray(rows) ? rows : []).map(rowToMyAthleteMeet), error: null };
      } catch (e) {
        return { data: null, error: errMessage(e) };
      }
    },

    async followShow(slug: string, follow: boolean): Promise<ApiResult<{ slug: string; following: boolean }>> {
      try {
        const authCheck = await requireSignedInUser();
        if (!authCheck.user) {
          return { data: null, error: 'Sign in to follow a show.' };
        }
        const out = await db.rpc<{ slug: string; following: boolean }>('zt_follow_meet', { p_slug: slug, p_follow: follow });
        if (!out || typeof out.following !== 'boolean') {
          return { data: null, error: 'Could not update the follow.' };
        }
        return { data: { slug, following: out.following }, error: null };
      } catch (e) {
        return { data: null, error: errMessage(e) };
      }
    },

    async listRegistrations(serverId: string): Promise<ApiResult<RegistrationRequest[]>> {
      try {
        const authCheck = await requireSignedInUser();
        if (!authCheck.user) {
          return { data: null, error: 'Sign in required to view registrations.' };
        }
        const rows = await db.selectRegistrations(serverId);
        const mapped = rows
          .map(rowToRegistrationRequest)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return { data: mapped, error: null };
      } catch (e) {
        return { data: null, error: errMessage(e) };
      }
    },

    async setRegistrationStatus(
      id: string,
      status: RegistrationRequest['status']
    ): Promise<ApiResult<RegistrationRequest>> {
      try {
        const authCheck = await requireSignedInUser();
        if (!authCheck.user) {
          return { data: null, error: 'Sign in required to update registration status.' };
        }
        const row = await db.rpc<RegistrationRow>('zt_set_registration_status', {
          p_id: id,
          p_status: status,
        });
        if (!row || !row.id) {
          return { data: null, error: `No registration found with id "${id}".` };
        }
        return { data: rowToRegistrationRequest(row), error: null };
      } catch (e) {
        return { data: null, error: errMessage(e) };
      }
    },

    async getPublicMeetBySlug(slug: string): Promise<ApiResult<PublicRegistrationMeet | null>> {
      try {
        const cleanSlug = decodeURIComponent(slug ?? '').trim().toLowerCase();
        if (!cleanSlug) {
          return { data: null, error: null };
        }
        const bundle = await db.selectPublicMeetBySlug(cleanSlug);
        if (!bundle) {
          return { data: null, error: null };
        }

        // Reconstruct an in-memory detail with empty athletes/results arrays, then pass through the
        // single allowlist projection `toPublicRegistrationMeet` from `fixtureApi.ts`, overriding
        // `acceptedCount` with the count returned by the database.
        const state = rowsToState({
          meet: bundle.meet,
          divisions: bundle.divisions,
          events: bundle.events,
          athletes: [],
          results: [],
        });
        const detail: PromoterMeetDetail = {
          summary: {
            serverId: bundle.meet.id,
            slug: bundle.meet.slug,
            name: bundle.meet.name,
            date: bundle.meet.date ?? '',
            listing: rowToMeetListing(bundle.meet),
            divisionCount: state.divisions.length,
            athleteCount: Number(bundle.accepted_count ?? 0),
            pendingCount: 0,
            registrationCount: 0,
            updatedAt: bundle.meet.updated_at ?? new Date().toISOString(),
            joinCode: null,
          },
          state,
        };
        const projected = toPublicRegistrationMeet(
          detail,
          bundle.promoter_display_name || 'Promoter'
        );
        return {
          data: {
            ...projected,
            acceptedCount: Number(bundle.accepted_count ?? 0),
          },
          error: null,
        };
      } catch (e) {
        return { data: null, error: errMessage(e) };
      }
    },

    async submitRegistration(
      input: RegistrationSubmission
    ): Promise<ApiResult<{ id: string; status: 'pending' | 'waitlist' }>> {
      try {
        const pubRes = await this.getPublicMeetBySlug(input.slug);
        if (pubRes.error) {
          return { data: null, error: pubRes.error };
        }
        if (!pubRes.data) {
          return { data: null, error: `No competition found at "${input.slug}".` };
        }

        const validationErr = validateRegistrationInput(input, pubRes.data);
        if (validationErr) {
          return { data: null, error: validationErr };
        }

        const outcome = decideRegistrationOutcome(pubRes.data, today());
        if (outcome.status === null) {
          return { data: null, error: outcome.error };
        }

        const out = await db.rpc<{ id: string; status: 'pending' | 'waitlist' }>(
          'zt_submit_registration',
          {
            p_slug: pubRes.data.slug,
            p_input: {
              slug: pubRes.data.slug,
              divisionId: input.divisionId,
              athleteName: input.athleteName.trim(),
              email: input.email.trim().toLowerCase(),
              emergencyContact: input.emergencyContact.trim(),
              dateOfBirth: input.dateOfBirth.trim(),
              guardian: isMinorOnMeetDay(input.dateOfBirth, pubRes.data.date, today()) && input.guardian
                ? { name: input.guardian.name.trim(), contact: input.guardian.contact.trim() }
                : null,
              waiverAccepted: input.waiverAccepted,
              waiverVersion: input.waiverVersion,   // C6: zt_submit_registration refuses a submission without it
            },
          }
        );

        if (!out || !out.id) {
          return { data: null, error: 'Could not submit registration.' };
        }
        return {
          data: {
            id: String(out.id),
            status: out.status === 'waitlist' ? 'waitlist' : 'pending',
          },
          error: null,
        };
      } catch (e) {
        // 021: anon has no execute on zt_submit_registration, so a submission without a session comes back as a grant
        // error; say what to do instead of quoting Postgres.
        const msg = errMessage(e);
        if (/permission denied for function zt_submit_registration/i.test(msg)) {
          return { data: null, error: 'Sign in to your ZeroTacky account to register for this show.' };
        }
        return { data: null, error: msg };
      }
    },
  };
}
