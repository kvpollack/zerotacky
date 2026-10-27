// Pure promoter rules shared by the fixture API, the Supabase API and the UI. No fixture state, no imports from
// fixtures.ts, so a page that only needs validation does not pull the demo meets into its bundle (Astra H1, 10/17).
// Tested through test/promoter.test.mjs and test/register.test.mjs (via fixtureApi re-exports) and test/supabaseApi.test.mjs.

import type {
  MeetListing,
  MyAthleteMeet,
  PromoterMeetDetail,
  PublicRegistrationMeet,
  RegistrationGuardian,
  RegistrationSubmission,
} from './contract';
import type { AppState } from '../types';
import { cleanTheme } from '../website/theme';

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  if (merged.hostGymId !== null && merged.hostGymId !== undefined && merged.hostGymId.trim()) {
    if (!UUID.test(merged.hostGymId.trim())) {
      return 'Host gym must be chosen from the directory.';
    }
  }

  if (merged.theme) {
    const t = cleanTheme(merged.theme);
    if (t.problem) return t.problem;
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

// "currently closed (closed)" read as a stutter on the live registration page (prod sweep 10/21); only statuses
// that add information (day of only, not applicable, not provided) keep the parenthetical.
function closedMessage(name: string, status: MeetListing['registrationStatus']): string {
  const words = status.replace(/_/g, ' ');
  return status === 'closed' ? `Registration for ${name} is currently closed.` : `Registration for ${name} is currently closed (${words}).`;
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

// 009: date of birth and age on competition day (Kurt 10/19). Industry norm from Strongman Corporation's athlete
// rules: minimum age 12; under 18 registered by a parent or legal guardian who signs the waiver (legal/WAIVER.md
// section 7). Age is measured on the meet date, not the day the form is filled in; a meet without a date uses today.
// Pure string arithmetic so the browser's time zone cannot shift a birthday by a day. Mirrors zt_submit_registration;
// messages match the server's.
export const MIN_ATHLETE_AGE = 12;
export const ADULT_AGE = 18;

export function parseIsoDate(value: string | null | undefined): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((value ?? '').trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1) return null;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of the next month = last day of this one
  if (d > daysInMonth) return null;
  return { y, m, d };
}

// Whole years from dob to onDate, or null when either date is malformed. Negative when dob is after onDate.
export function ageOnDate(dob: string | null | undefined, onDate: string | null | undefined): number | null {
  const b = parseIsoDate(dob);
  const o = parseIsoDate(onDate);
  if (!b || !o) return null;
  let years = o.y - b.y;
  if (o.m < b.m || (o.m === b.m && o.d < b.d)) years -= 1;
  return years;
}

// The date an athlete's age is judged on: the competition date, or today when the meet has no date yet.
export function ageReferenceDate(meetDate: string | null | undefined, today: string = todayIsoDate()): string {
  return parseIsoDate(meetDate) ? (meetDate as string).trim() : today;
}

export function isMinorOnMeetDay(dob: string | null | undefined, meetDate: string | null | undefined, today: string = todayIsoDate()): boolean {
  const age = ageOnDate(dob, ageReferenceDate(meetDate, today));
  return age !== null && age < ADULT_AGE;
}

// Guardian fields for an athlete under 18: name 2..80, contact a phone with 7+ digits or an email (160 max).
export function validateGuardian(guardian: RegistrationGuardian | null | undefined): string | null {
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

// Date of birth + guardian, judged against the meet date. Returns the first problem or null.
export function validateAthleteAge(
  dateOfBirth: string | null | undefined,
  meetDate: string | null | undefined,
  guardian: RegistrationGuardian | null | undefined,
  today: string = todayIsoDate()
): string | null {
  if (!parseIsoDate(dateOfBirth)) return 'Enter the athlete date of birth.';
  const dob = (dateOfBirth as string).trim();
  if (dob > today) return 'Date of birth cannot be in the future.';
  const age = ageOnDate(dob, ageReferenceDate(meetDate, today)) ?? 0;
  if (age > 100) return 'Check the date of birth.';
  if (age < MIN_ATHLETE_AGE) {
    return `Athletes must be at least ${MIN_ATHLETE_AGE} on competition day. Contact the promoter about younger athletes.`;
  }
  if (age < ADULT_AGE) return validateGuardian(guardian);
  return null;
}

// Field-level validation of a public submission against the public meet shape.
export function validateRegistrationInput(
  input: Omit<RegistrationSubmission, 'waiverAccepted'> & { waiverAccepted: boolean },
  meet: PublicRegistrationMeet
): string | null {
  if (!isRegistrationOpen(meet.listing.registrationStatus)) {
    return closedMessage(meet.name, meet.listing.registrationStatus);
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

  const ageErr = validateAthleteAge(input.dateOfBirth, meet.date, input.guardian);
  if (ageErr) return ageErr;

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
      error: closedMessage(meet.name, registrationStatus),
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

// ---------- My Meets, athlete side (010) ----------

export interface AthleteMeetBuckets {
  following: MyAthleteMeet[];   // bookmarked shows, any status
  registered: MyAthleteMeet[];  // registration on a meet that has not completed (pending, accepted, waitlisted, declined, withdrawn all shown with their badge)
  completed: MyAthleteMeet[];   // registration on a completed meet (results live on the show page)
}

// Order inside each bucket: soonest upcoming first for following/registered, most recent first for completed.
export function bucketAthleteMeets(rows: MyAthleteMeet[]): AthleteMeetBuckets {
  const byDateAsc = (a: MyAthleteMeet, b: MyAthleteMeet) => (a.date || '9999').localeCompare(b.date || '9999');
  const byDateDesc = (a: MyAthleteMeet, b: MyAthleteMeet) => (b.date || '').localeCompare(a.date || '');
  const following = rows.filter((r) => r.kind === 'follow').sort(byDateAsc);
  const regs = rows.filter((r) => r.kind === 'registration');
  const completed = regs.filter((r) => r.competitionStatus === 'completed').sort(byDateDesc);
  const registered = regs.filter((r) => r.competitionStatus !== 'completed').sort(byDateAsc);
  return { following, registered, completed };
}

export function athleteMeetBadge(row: MyAthleteMeet): string {
  if (row.kind === 'follow') return 'Following';
  switch (row.registrationStatus) {
    case 'accepted': return row.competitionStatus === 'completed' ? 'Competed' : 'Registered';
    case 'pending': return row.waitlisted ? 'Waitlisted' : 'Pending approval';
    case 'declined': return 'Declined';
    case 'withdrawn': return 'Withdrawn';
    default: return 'Registered';
  }
}

