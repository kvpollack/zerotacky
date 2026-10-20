import type { Athlete, Division, EventDef, Result, RunOrderItem, RunOrderMethod, Station } from '../types';
import { calculateDivisionStandings, scoreSingleEvent } from './scoring';
import { priorEventsOnStation } from './eventOrder';

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
  method: RunOrderMethod,
  stations?: Station[]
): RunOrderItem[] {
  const activeAthletes = divisionAthletes.filter((a) => a.status === 'active');
  // "Prior" means earlier on this division's station (10/21), so Reverse Previous Event follows the floor, not the
  // event number. Without stations (older callers, tests) it is the meet order.
  const station = stations?.find((s) => s.id === division.flight);
  const completedPriorEvents = priorEventsOnStation(station, allEvents, targetEvent).filter((e) =>
    allResults.some((r) => r.eventId === e.id)
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

  if (method === 'lot_order' || completedPriorEvents.length === 0) {
    // Roster order: lot numbers for every event, never reshuffled (10/21). Also the fallback before anything is scored.
    orderedAthletes = [...activeAthletes].sort((a, b) => a.lotNumber - b.lotNumber);
  } else if (method === 'reverse_previous_event') {
    const prevEvent = completedPriorEvents[completedPriorEvents.length - 1];
    const prevScored = scoreSingleEvent(prevEvent, divisionAthletes, allResults);
    prevScored.forEach((s) => prevScoreLookup.set(s.athleteId, s.displayScore));
    // Astra R-M5 (10/19): athletes tied in the previous event share a place, so compare places (not array index) and
    // let the documented fallbacks decide: lower overall points first, then lot number. Worst place in the previous
    // event goes first, its winner goes last.
    const placeMap = new Map(prevScored.map((s) => [s.athleteId, s.place]));

    orderedAthletes = [...activeAthletes].sort((a, b) => {
      const placeA = placeMap.get(a.id) ?? 999;
      const placeB = placeMap.get(b.id) ?? 999;
      if (placeB !== placeA) return placeB - placeA;
      const ptsA = pointsLookup.get(a.id) ?? 0;
      const ptsB = pointsLookup.get(b.id) ?? 0;
      if (ptsA !== ptsB) return ptsA - ptsB;
      return a.lotNumber - b.lotNumber;
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
