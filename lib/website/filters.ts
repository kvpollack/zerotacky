// Pure filtering, sorting, and lifecycle badge helpers for shows and gyms.
// Unit-tested in test/website.test.mjs.

import type {
  GymFilterQuery,
  PublicShowSummary,
  ResultsFinalizationStatus,
  ShowCompetitionStatus,
  ShowFilterQuery,
  ShowRegistrationStatus,
  StrongmanGymListing,
} from './types';

// 'ALL' (any case) or empty means "no filter"; anything else is a lowercased value to match.
function normalizeChoice(v: string | undefined): string {
  const t = (v ?? '').trim();
  return !t || t.toUpperCase() === 'ALL' ? 'ALL' : t.toLowerCase();
}

export function filterPublicShows(
  shows: PublicShowSummary[],
  query: ShowFilterQuery
): PublicShowSummary[] {
  const search = (query.search ?? '').trim().toLowerCase();
  const status = query.competitionStatus ?? 'ALL';
  const state = (query.state ?? 'ALL').trim().toUpperCase();
  const implementTag = normalizeChoice(query.implementTag);
  const federation = normalizeChoice(query.federation);
  const divQuery = (query.divisionQuery ?? '').trim().toLowerCase();

  return shows.filter((show) => {
    if (status !== 'ALL' && show.competitionStatus !== status) {
      return false;
    }

    if (state !== 'ALL' && show.venue.state.toUpperCase() !== state) {
      return false;
    }

    if (
      implementTag !== 'ALL' &&
      !show.implementTags.some((t) => t.toLowerCase() === implementTag)
    ) {
      return false;
    }

    if (federation !== 'ALL') {
      const showFed = (show.federation ?? 'unsanctioned').toLowerCase();
      if (showFed !== federation) return false;
    }

    if (divQuery) {
      const matchesDivision = show.divisionLabels.some((d) =>
        d.toLowerCase().includes(divQuery)
      );
      if (!matchesDivision) return false;
    }

    if (search) {
      const haystack = [
        show.name,
        show.venue.facilityName ?? '',
        show.venue.city,
        show.venue.state,
        show.federation ?? '',
        ...show.divisionLabels,
        ...show.implementTags,
      ]
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

export function filterPublicGyms(
  gyms: StrongmanGymListing[],
  query: GymFilterQuery
): StrongmanGymListing[] {
  const search = (query.search ?? '').trim().toLowerCase();
  const state = (query.state ?? 'ALL').trim().toUpperCase();
  const implementTag = normalizeChoice(query.implementTag);
  const dayPassOnly = Boolean(query.dayPassOnly);

  return gyms.filter((gym) => {
    if (state !== 'ALL' && gym.state.toUpperCase() !== state) {
      return false;
    }

    if (
      implementTag !== 'ALL' &&
      !gym.implementTags.some((t) => t.toLowerCase() === implementTag)
    ) {
      return false;
    }

    if (dayPassOnly) {
      if (
        gym.dayPassAvailability !== 'available' &&
        gym.dayPassAvailability !== 'by_appointment'
      ) {
        return false;
      }
    }

    if (search) {
      const haystack = [
        gym.name,
        gym.city,
        gym.state,
        ...gym.implementTags,
        ...gym.equipment.map((e) => `${e.name} ${e.details ?? ''}`),
      ]
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(search)) return false;
    }

    return true;
  });
}

export function collectDistinctImplementTags(
  items: Array<{ implementTags: string[] }>
): string[] {
  const set = new Set<string>();
  for (const item of items) {
    for (const tag of item.implementTags) {
      if (tag.trim()) set.add(tag.trim());
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function collectDistinctStates(
  items: Array<{ state?: string; venue?: { state: string } }>
): string[] {
  const set = new Set<string>();
  for (const item of items) {
    const st = item.state ?? item.venue?.state;
    if (st?.trim()) set.add(st.trim().toUpperCase());
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function describeShowLifecycle(
  competitionStatus: ShowCompetitionStatus,
  registrationStatus: ShowRegistrationStatus,
  resultsStatus: ResultsFinalizationStatus
): {
  competitionLabel: string;
  registrationLabel: string;
  resultsLabel: string;
  canRenderOfficialPodium: boolean;
} {
  const compMap: Record<ShowCompetitionStatus, string> = {
    upcoming: 'Upcoming',
    live: 'Live Now',
    completed: 'Completed',
    postponed: 'Postponed',
    cancelled: 'Cancelled',
  };

  const regMap: Record<ShowRegistrationStatus, string> = {
    open: 'Registration Open',
    closed: 'Registration Closed',
    waitlist: 'Waitlist Only',
    day_of_only: 'Day-Of Entry Only',
    not_applicable: 'Registration N/A',
    not_provided: 'Registration Not Provided',
  };

  const resMap: Record<ResultsFinalizationStatus, string> = {
    not_started: 'No Results Yet',
    in_progress: 'Live Provisional Standings',
    provisional: 'Provisional Results (Pending Audit)',
    final: 'Official Finalized Results',
  };

  // Official podiums require BOTH completed competition status AND final results status.
  const canRenderOfficialPodium =
    competitionStatus === 'completed' && resultsStatus === 'final';

  return {
    competitionLabel: compMap[competitionStatus],
    registrationLabel: regMap[registrationStatus],
    resultsLabel: resMap[resultsStatus],
    canRenderOfficialPodium,
  };
}