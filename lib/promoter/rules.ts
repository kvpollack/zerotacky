// Pure promoter rules shared by the fixture API, the Supabase API and the UI. No fixture state, no imports from
// fixtures.ts, so a page that only needs validation does not pull the demo meets into its bundle (Astra H1, 10/17).
// Tested through test/promoter.test.mjs and test/register.test.mjs (via fixtureApi re-exports) and test/supabaseApi.test.mjs.

import type {
  MeetListing,
  PromoterMeetDetail,
  PublicRegistrationMeet,
  RegistrationGuardian,
  RegistrationSubmission,
} from './contract';
import type { AppState } from '../types';

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function clone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------------------------
// Pure helpers. Exported for the UI, both API implementations and the tests.
// ---------------------------------------------------------------------------------------------------------------

// Compares editable meet state (meet, divisions, events, athletes) while ignoring results.
export function isMeetStateDirty(saved: AppState, working: AppState): boolean {
  const pickEditable = (s: AppState) => ({
    meet: s.meet,
    divisions: s.divisions,
    events: s.events,
    athletes: s.athletes,
  });
  return JSON.stringify(pickEditable(saved)) !== JSON.stringify(pickEditable(working));
}

// Validates a listing patch against the meet date. athleteCap must be a positive integer or null; the deadline must
// be a YYYY-MM-DD on or before the meet date; publicly listed meets with a venue need city and state.
export function validateListingPatch(
  meetDate: string,
  current: MeetListing,
  patch: Partial<MeetListing>
): string | null {
  const merged: MeetListing = { ...current, ...patch };

  if (merged.athleteCap !== null && merged.athleteCap !== undefined) {
    if (!Number.isInteger(merged.athleteCap) || merged.athleteCap < 1) {
      return 'Athlete cap must be a positive whole number (at least 1), or left blank.';
    }
  }

  if (merged.registrationDeadline) {
    if (!ISO_DATE.test(merged.registrationDeadline)) {
      return 'Registration deadline must be a valid YYYY-MM-DD date.';
    }
    if (meetDate && ISO_DATE.test(meetDate) && merged.registrationDeadline > meetDate) {
      return `Registration deadline (${merged.registrationDeadline}) must be on or before the meet date (${meetDate}).`;
    }
  }

  if (merged.promoterContact !== null && merged.promoterContact !== undefined) {
    const trimmed = merged.promoterContact.trim();
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && (trimmed.match(/\d/g) ?? []).length < 7) {
      return 'Promoter contact must be an email address or a phone number with at least 7 digits.';
    }
  }

  if (merged.venue) {
    const shape = validateVenueShape(merged.venue);
    if (shape) return shape;
    if (merged.isPublicListed && (!merged.venue.city?.trim() || !merged.venue.state?.trim() || !merged.venue.country?.trim())) {
      return 'Publicly listed meets with a venue must include City, State and Country.';
    }
  }

  return null;
}

// Venue shape (Astra gate 2 recommendation, 10/17 night): mirrors zt_check_venue in 007. Only these six string keys,
// each with a length limit; anything else is refused. Empty strings are allowed here (the UI sends them for optional
// fields) and dropped on the server.
export const VENUE_LIMITS: Record<string, number> = {
  facilityName: 160, streetAddress: 240, city: 120, state: 80, postalCode: 32, country: 80,
};
export function validateVenueShape(venue: unknown): string | null {
  if (venue === null || venue === undefined) return null;
  if (typeof venue !== 'object' || Array.isArray(venue)) {
    return 'Venue must be an object with facilityName, streetAddress, city, state, postalCode and country.';
  }
  for (const [k, v] of Object.entries(venue as Record<string, unknown>)) {
    if (!(k in VENUE_LIMITS)) return `Venue has an unexpected field "${k.slice(0, 40)}".`;
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') return `Venue field "${k}" must be text.`;
    if (v.trim().length > VENUE_LIMITS[k]) return `Venue field "${k}" is too long (${VENUE_LIMITS[k]} characters max).`;
  }
  return null;
}

// Results are read-only in the dashboard, so a saved state must keep every athlete and event that a stored result
// points at. Returns a message naming the first orphaned reference, or null when the state is safe to save.
export function findOrphanedResult(
  savedResults: AppState['results'],
  saved: AppState,
  working: AppState
): string | null {
  const athleteIds = new Set(working.athletes.map((a) => a.id));
  const eventIds = new Set(working.events.map((e) => e.id));
  const divisionIds = new Set(working.divisions.map((d) => d.id));
  for (const r of savedResults) {
    if (!athleteIds.has(r.athleteId)) {
      const name = saved.athletes.find((a) => a.id === r.athleteId)?.name ?? r.athleteId;
      const eventName = saved.events.find((e) => e.id === r.eventId)?.name ?? r.eventId;
      return `${name} has a recorded result in "${eventName}" and cannot be removed from the roster. Mark the athlete withdrawn on meet day instead.`;
    }
    // the chain continues: a scored athlete's division must survive too (Astra H3, 10/17)
    const workingAthlete = working.athletes.find((a) => a.id === r.athleteId);
    if (workingAthlete && !divisionIds.has(workingAthlete.divisionId)) {
      const divName = saved.divisions.find((d) => d.id === workingAthlete.divisionId)?.name ?? workingAthlete.divisionId;
      return `Division "${divName}" still holds scored athlete ${workingAthlete.name} and cannot be removed. Move or withdraw the athlete on meet day instead.`;
    }
    if (!eventIds.has(r.eventId)) {
      const eventName = saved.events.find((e) => e.id === r.eventId)?.name ?? r.eventId;
      return `Event "${eventName}" has recorded results and cannot be removed.`;
    }
  }
  return null;
}

export function isRegistrationOpen(status: MeetListing['registrationStatus']): boolean {
  return status === 'open' || status === 'waitlist';
}

// Emergency contact needs a name (letters) and a phone number (at least 7 digits).
export function validateEmergencyContact(value: string): string | null {
  const trimmed = (value ?? '').trim();
  const digits = (trimmed.match(/\d/g) ?? []).length;
  const letters = (trimmed.replace(/[\d\s\-().+]/g, '').match(/[A-Za-z]/g) ?? []).length;
  if (digits < 7 || letters < 2) {
    return 'Emergency contact needs a name and a phone number with at least 7 digits (for example "Sam Lee 717-555-0100").';
  }
  return null;
}

// 009: athletes under 18 are registered by a parent or legal guardian (legal/WAIVER.md section 7). Mirrors
// zt_submit_registration: athleteAge must be chosen; a minor needs a guardian name (2..80) and a contact that is a
// phone with 7+ digits or an email (160 max). Messages match the server's.
export function validateGuardian(
  athleteAge: RegistrationSubmission['athleteAge'] | '' | undefined | null,
  guardian: RegistrationGuardian | null | undefined
): string | null {
  if (athleteAge !== 'adult' && athleteAge !== 'minor') {
    return 'Tell us whether the athlete is 18 or older.';
  }
  if (athleteAge === 'adult') return null;
  const name = (guardian?.name ?? '').trim();
  const contact = (guardian?.contact ?? '').trim();
  if (name.length < 2) {
    return 'An athlete under 18 must be registered by a parent or legal guardian. Enter the guardian full name.';
  }
  if (name.length > 80) return 'Guardian name is too long (80 characters max).';
  if (contact.length > 160) return 'Guardian contact is too long (160 characters max).';
  const digits = contact.replace(/[^0-9]/g, '').length;
  if (digits < 7 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return 'Guardian contact needs a phone number with at least 7 digits or an email address.';
  }
  return null;
}

// Field-level validation of a public submission against the public meet shape.
export function validateRegistrationInput(
  input: Omit<RegistrationSubmission, 'waiverAccepted' | 'athleteAge'> & {
    waiverAccepted: boolean;
    athleteAge: RegistrationSubmission['athleteAge'] | ''; // '' = not chosen yet (the form before step 2)
  },
  meet: PublicRegistrationMeet
): string | null {
  if (!isRegistrationOpen(meet.listing.registrationStatus)) {
    return `Registration for ${meet.name} is currently closed (${meet.listing.registrationStatus.replace(/_/g, ' ')}).`;
  }

  const trimmedName = (input.athleteName ?? '').trim();
  if (!trimmedName || trimmedName.length < 2) {
    return 'Please enter the athlete full name.';
  }

  const trimmedEmail = (input.email ?? '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return 'Please enter a valid email address.';
  }

  const emergencyErr = validateEmergencyContact(input.emergencyContact);
  if (emergencyErr) return emergencyErr;

  const guardianErr = validateGuardian(input.athleteAge, input.guardian);
  if (guardianErr) return guardianErr;

  if (!meet.divisions.some((d) => d.id === input.divisionId)) {
    return 'Please select a valid division for this meet.';
  }

  if (!input.waiverAccepted) {
    return 'You must read and accept the competition waiver before submitting.';
  }

  // C6: the version of the waiver text the athlete saw travels with the request (same rule as zt_submit_registration).
  if (!(input.waiverVersion ?? '').trim()) {
    return 'The waiver text did not load, so this entry cannot be submitted. Reload the page and try again.';
  }

  return null;
}

// Deadline and capacity gate. 'waitlist' status takes every submission onto the waitlist; 'open' refuses
// submissions after the deadline or once the roster is at the cap.
export function decideRegistrationOutcome(
  meet: PublicRegistrationMeet,
  today: string = todayIsoDate()
): { status: 'pending' | 'waitlist'; error: null } | { status: null; error: string } {
  const { registrationStatus, registrationDeadline, athleteCap } = meet.listing;
  if (!isRegistrationOpen(registrationStatus)) {
    return {
      status: null,
      error: `Registration for ${meet.name} is currently closed (${registrationStatus.replace(/_/g, ' ')}).`,
    };
  }
  if (registrationStatus === 'waitlist') {
    return { status: 'waitlist', error: null };
  }
  if (registrationDeadline && ISO_DATE.test(registrationDeadline) && today > registrationDeadline) {
    return {
      status: null,
      error: `Registration for ${meet.name} closed on ${registrationDeadline}. Contact the promoter about late entries.`,
    };
  }
  if (athleteCap !== null && meet.acceptedCount >= athleteCap) {
    return {
      status: null,
      error: `${meet.name} is full (${meet.acceptedCount} of ${athleteCap} spots taken). Contact the promoter to ask about a waitlist.`,
    };
  }
  return { status: 'pending', error: null };
}

// Allowlist projection for the public /register/<slug> page. Nothing outside this function decides what an
// unauthenticated visitor can see.
export function toPublicRegistrationMeet(
  detail: PromoterMeetDetail,
  promoterDisplayName: string
): PublicRegistrationMeet {
  const { summary, state } = detail;
  const l = summary.listing;
  return {
    slug: summary.slug,
    name: summary.name,
    date: summary.date,
    listing: {
      competitionStatus: l.competitionStatus,
      registrationStatus: l.registrationStatus,
      entryFeeDisplay: l.entryFeeDisplay,
      registrationDeadline: l.registrationDeadline,
      athleteCap: l.athleteCap,
      federation: l.federation,
      venue: l.venue ? clone(l.venue) : null,
      promoterContact: l.promoterContact,
    },
    promoterDisplayName,
    divisions: state.divisions.map((d) => ({
      id: d.id,
      name: d.name,
      targetWeights: state.events.map((e) => ({
        eventName: e.name,
        weight: typeof e.divisionWeights?.[d.id] === 'number' ? e.divisionWeights[d.id] : null,
      })),
    })),
    acceptedCount: state.athletes.length,
  };
}

