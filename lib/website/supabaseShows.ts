// Pure mapping helpers converting Supabase `meets` + child rows into `PublicShowSummary` and `PublicShowRecord`.
// Used by `lib/website/data.ts` so `/shows` and `/shows/[slug]` run against Supabase while keeping
// `lib/website/filters.ts` and `lib/website/standingsAdapter.ts` completely unchanged.

import type { MeetListingRow } from '../promoter/db';
import { rowToMeetListing } from '../promoter/supabaseApi';
import {
  rowsToState,
  type AthleteRow,
  type DivisionRow,
  type EventRow,
  type ResultRow,
} from '../sync/mapping';
import type {
  DivisionGroupingStyle,
  PublicShowRecord,
  PublicShowSummary,
  ShowVenue,
} from './types';

export const PUBLIC_SHOW_MEET_COLS =
  'id,slug,name,date,run_order_method,tiebreaker_rule,available_plates,collar_weight_per_pair,stations,is_demo,updated_at,' +
  'competition_status,registration_status,results_status,is_public_listed,venue,federation,entry_fee_display,registration_deadline,athlete_cap,promoter_contact,host_gym_id';

const FALLBACK_VENUE: ShowVenue = {
  city: 'Not provided',
  state: 'Not provided',
  country: 'US',
};

export function normalizeVenue(venue: ShowVenue | null | undefined): ShowVenue {
  if (!venue || typeof venue !== 'object') {
    return { ...FALLBACK_VENUE };
  }
  return {
    ...(venue.facilityName ? { facilityName: venue.facilityName } : {}),
    ...(venue.streetAddress ? { streetAddress: venue.streetAddress } : {}),
    city: venue.city?.trim() ? venue.city.trim() : 'Not provided',
    state: venue.state?.trim() ? venue.state.trim().toUpperCase() : 'Not provided',
    ...(venue.postalCode ? { postalCode: venue.postalCode } : {}),
    country: venue.country?.trim() ? venue.country.trim().toUpperCase() : 'US',
  };
}

export function inferDivisionGroupingStyle(divisionLabels: string[]): DivisionGroupingStyle {
  if (divisionLabels.length === 0) return 'mixed';
  const hasInclusive = divisionLabels.some((n) => /\b(group|tier)\s*\d+/i.test(n));
  const hasWeightClass = divisionLabels.some((n) => /\b(\d+\s*(kg|lb|lbs)|heavyweight|middleweight|lightweight|novice|open|masters)\b/i.test(n));
  if (hasInclusive && !hasWeightClass) return 'inclusive_strength_groups';
  if (hasWeightClass && !hasInclusive) return 'traditional_weight_classes';
  return 'mixed';
}

// Strips parenthetical scoring suffixes (e.g. "12\" Log Clean & Press (For Reps)" -> "12\" Log Clean & Press")
// so the implement filter dropdown in `ShowsBrowser` gets clean, distinct implement tags.
export function deriveImplementTags(events: EventRow[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  const sorted = [...events].sort((a, b) => a.event_number - b.event_number);
  for (const ev of sorted) {
    const raw = (ev.name ?? '').trim();
    if (!raw) continue;
    const cleaned = raw.replace(/\s*\([^)]*\)\s*$/g, '').trim() || raw;
    if (!seen.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase());
      tags.push(cleaned);
    }
  }
  return tags;
}

// 026: the host gym (slug + name) comes from a second `gyms` read keyed by meets.host_gym_id; undefined when unset or
// when the gym is no longer in the directory.
export interface HostGymRef {
  slug: string;
  name: string;
}

export function mapMeetRowToPublicShowSummary(
  meetRow: MeetListingRow,
  divisions: DivisionRow[],
  events: EventRow[],
  hostGym?: HostGymRef | null
): PublicShowSummary {
  const listing = rowToMeetListing(meetRow);
  const sortedDivs = [...divisions].sort((a, b) => a.sort_order - b.sort_order);
  const divisionLabels = sortedDivs.map((d) => d.name);

  return {
    id: meetRow.id,
    slug: meetRow.slug,
    name: meetRow.name,
    date: meetRow.date || 'Not provided',
    venue: normalizeVenue(listing.venue),
    federation: listing.federation ?? undefined,
    divisionGroupingStyle: inferDivisionGroupingStyle(divisionLabels),
    divisionLabels,
    implementTags: deriveImplementTags(events),
    competitionStatus: listing.competitionStatus,
    registrationStatus: listing.registrationStatus,
    resultsStatus: listing.resultsStatus,
    isDemoFixture: Boolean(meetRow.is_demo),
    liveScoreboardPath: `/m/${meetRow.slug}`,
    lastUpdatedIso: meetRow.updated_at ?? undefined,
    ...(hostGym ? { hostGymSlug: hostGym.slug, hostGymName: hostGym.name } : {}),
  };
}

export function mapMeetBundleToPublicShowRecord(params: {
  meet: MeetListingRow;
  divisions: DivisionRow[];
  events: EventRow[];
  athletes: AthleteRow[];
  results: ResultRow[];
  latestServerAt?: string | null;
  hostGym?: HostGymRef | null;
}): PublicShowRecord {
  const { meet, divisions, events, athletes, results, latestServerAt, hostGym } = params;
  const listing = rowToMeetListing(meet);
  const summary = mapMeetRowToPublicShowSummary(meet, divisions, events, hostGym);
  const fullState = rowsToState({ meet, divisions, events, athletes, results });

  return {
    ...summary,
    lastUpdatedIso: latestServerAt ?? meet.updated_at ?? undefined,
    registration: {
      status: listing.registrationStatus,
      entryFeeDisplay: listing.entryFeeDisplay ?? undefined,
      registrationDeadline: listing.registrationDeadline ?? undefined,
      promoterContact: listing.promoterContact ?? undefined,
      athleteCap: listing.athleteCap ?? undefined,
    },
    // Strip athlete bodyweights and personal rack heights from the public show view
    state: {
      ...fullState,
      athletes: fullState.athletes.map((a) => ({
        id: a.id,
        divisionId: a.divisionId,
        name: a.name,
        lotNumber: a.lotNumber,
        status: a.status,
      })),
    },
  };
}
