import type { Athlete, Division, EventDef, Result, RunOrderItem, RunOrderMethod } from '../types';
import { calculateDivisionStandings, scoreSingleEvent } from './scoring';

export function resolveAthleteHeightCallout(
  event: EventDef,
  divisionId: string,
  athlete: Athlete | undefined
): string | undefined {
  if (!event.hasHeightCallout) return undefined;
  const personalPin = athlete?.rackHeights?.[event.id]?.trim();
  if (personalPin) return personalPin;
  const divDefault = event.divisionDefaultHeights?.[divisionId]?.trim();
  if (divDefault) return divDefault;
  return 'Not Set';
}

export function generateEventRunOrder(
  targetEvent: EventDef,
  division: Division,
  divisionAthletes: Athlete[],
  allEvents: EventDef[],
  allResults: Result[],
  method: RunOrderMethod
): RunOrderItem[] {
  const activeAthletes = divisionAthletes.filter((a) => a.status === 'active');
  const sortedEvents = [...allEvents].sort((a, b) => a.eventNumber - b.eventNumber);
  const completedPriorEvents = sortedEvents.filter(
    (e) => e.eventNumber < targetEvent.eventNumber && allResults.some((r) => r.eventId === e.id)
  );

  const standings = calculateDivisionStandings(
    division,
    divisionAthletes,
    completedPriorEvents,
    allResults
  );
  const pointsLookup = new Map(standings.map((s) => [s.athleteId, s.totalPoints]));

  let orderedAthletes: Athlete[] = [];
  const prevScoreLookup = new Map<string, string>();

  if (completedPriorEvents.length === 0) {
    orderedAthletes = [...activeAthletes].sort((a, b) => a.lotNumber - b.lotNumber);
  } else if (method === 'reverse_previous_event') {
    const prevEvent = completedPriorEvents[completedPriorEvents.length - 1];
    const prevScored = scoreSingleEvent(prevEvent, divisionAthletes, allResults);
    prevScored.forEach((s) => prevScoreLookup.set(s.athleteId, s.displayScore));
    const rankMap = new Map(prevScored.map((s, idx) => [s.athleteId, idx]));

    orderedAthletes = [...activeAthletes].sort((a, b) => {
      const rankA = rankMap.get(a.id) ?? 999;
      const rankB = rankMap.get(b.id) ?? 999;
      if (rankB !== rankA) return rankB - rankA;
      return (pointsLookup.get(a.id) ?? 0) - (pointsLookup.get(b.id) ?? 0);
    });
  } else {
    orderedAthletes = [...activeAthletes].sort((a, b) => {
      const ptsA = pointsLookup.get(a.id) ?? 0;
      const ptsB = pointsLookup.get(b.id) ?? 0;
      if (ptsA !== ptsB) return ptsA - ptsB;
      return a.lotNumber - b.lotNumber;
    });
  }

  return orderedAthletes.map((athlete, idx) => {
    const heatNumber = targetEvent.lanes === 2 ? Math.floor(idx / 2) + 1 : idx + 1;
    const lane = targetEvent.lanes === 2 ? (idx % 2 === 0 ? 1 : 2) : 1;
    return {
      orderIndex: idx + 1,
      heatNumber,
      lane,
      athlete,
      currentOverallPoints: pointsLookup.get(athlete.id) ?? 0,
      previousEventDisplay: prevScoreLookup.get(athlete.id),
      heightCallout: resolveAthleteHeightCallout(targetEvent, division.id, athlete),
    };
  });
}
