// Read-only adapter around lib/engine/scoring.ts for website show views.
// Never re-implements event scoring or tiebreaker formulas.
// Supports supplied placements for finalized demo shows so tied overall places
// (e.g. tied 1st -> next athlete 3rd) and <3 finisher divisions render accurately.

import { calculateDivisionStandings, scoreSingleEvent } from '../engine/scoring';
import type { Division, EventDef, Result, Athlete } from '../types';
import type {
  DivisionResultsView,
  PublicShowRecord,
  SuppliedStandingRow,
} from './types';

export function buildDivisionResultsView(
  show: PublicShowRecord,
  division: Division
): DivisionResultsView {
  const { state } = show;
  const sortedEvents: EventDef[] = [...state.events].sort(
    (a, b) => a.eventNumber - b.eventNumber
  );
  const divisionAthletes: Athlete[] = state.athletes.filter(
    (a) => a.divisionId === division.id
  );
  const results: Result[] = state.results;

  const eventScoreboards: DivisionResultsView['eventScoreboards'] = {};
  for (const ev of sortedEvents) {
    const hasAnyResult = results.some(
      (r) => r.eventId === ev.id && divisionAthletes.some((a) => a.id === r.athleteId)
    );
    if (hasAnyResult) {
      eventScoreboards[ev.id] = scoreSingleEvent(ev, divisionAthletes, results, sortedEvents);
    } else {
      eventScoreboards[ev.id] = [];
    }
  }

  const rawStandings = calculateDivisionStandings(
    division,
    divisionAthletes,
    sortedEvents,
    results,
    state.meet.tiebreakerRule
  );

  const suppliedList = show.suppliedDivisionPlacements?.[division.id];
  const suppliedByAthlete = new Map(
    (suppliedList ?? []).map((item) => [item.athleteId, item])
  );

  // Detect whether two rows have identical totalPoints, eventWins, and finalEventPoints
  const signatureCounts = new Map<string, number>();
  for (const row of rawStandings) {
    const sig = `${row.totalPoints}|${row.eventWins}|${row.finalEventPoints}`;
    signatureCounts.set(sig, (signatureCounts.get(sig) ?? 0) + 1);
  }

  const standings: SuppliedStandingRow[] = rawStandings.map((row) => {
    const supplied = suppliedByAthlete.get(row.athleteId);
    const sig = `${row.totalPoints}|${row.eventWins}|${row.finalEventPoints}`;
    const hasEngineUnbrokenTie = (signatureCounts.get(sig) ?? 0) > 1 && row.totalPoints > 0;

    const breakdownWithTieFlag: SuppliedStandingRow['eventBreakdown'] = {};
    for (const [evId, entry] of Object.entries(row.eventBreakdown)) {
      const scoredRow = eventScoreboards[evId]?.find((s) => s.athleteId === row.athleteId);
      breakdownWithTieFlag[evId] = {
        ...entry,
        isTied: scoredRow?.isTied ?? false,
      };
    }

    return {
      athleteId: row.athleteId,
      athleteName: row.athleteName,
      divisionId: row.divisionId,
      status: row.status,
      overallPlace: supplied ? supplied.overallPlace : row.overallPlace,
      isTiedOverall: supplied ? Boolean(supplied.isTiedOverall) : hasEngineUnbrokenTie,
      totalPoints: row.totalPoints,
      eventWins: row.eventWins,
      finalEventPoints: row.finalEventPoints,
      eventBreakdown: breakdownWithTieFlag,
    };
  });

  standings.sort((a, b) => {
    if (a.overallPlace !== b.overallPlace) return a.overallPlace - b.overallPlace;
    return b.totalPoints - a.totalPoints;
  });

  const hasUnresolvedOverallTie = standings.some((s) => s.isTiedOverall);
  const isOfficialFinal =
    show.competitionStatus === 'completed' && show.resultsStatus === 'final';

  return {
    division,
    athletes: divisionAthletes,
    standings,
    eventScoreboards,
    isOfficialFinal,
    hasUnresolvedOverallTie,
  };
}

export function buildAllDivisionResultsViews(show: PublicShowRecord): DivisionResultsView[] {
  const sortedDivisions = [...show.state.divisions].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
  return sortedDivisions.map((div) => buildDivisionResultsView(show, div));
}