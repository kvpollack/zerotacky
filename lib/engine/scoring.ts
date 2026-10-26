import type {
  Athlete,
  Division,
  EventDef,
  Result,
  ScoredRow,
  StandingRow,
  TiebreakerRule,
} from '../types';

// A result that scored something in some event. Used to decide whether a withdrawn athlete stays in the points field.
export function resultHasScore(r: Result): boolean {
  if (r.didNotStart) return false;
  if ((r.reps ?? 0) > 0 || (r.timeSeconds ?? 0) > 0 || (r.distanceFeet ?? 0) > 0) return true;
  if ((r.implementsCompleted ?? 0) > 0 || (r.maxWeightLbs ?? 0) > 0) return true;
  return Object.values(r.risingBarAttempts ?? {}).some((st) => st === 'good');
}

// Points field for a division (Strongfest 10/26): an athlete scratched before scoring anything does not count toward
// N, so the rest of the group is not handed an extra point per event. An athlete who withdraws mid-meet keeps the
// field size they competed in (their earlier placings stand, later events score zero).
export function scoringField(divisionAthletes: Athlete[], results: Result[]): Athlete[] {
  return divisionAthletes.filter(
    (a) => a.status !== 'withdrawn' || results.some((r) => r.athleteId === a.id && resultHasScore(r))
  );
}

export function scoreSingleEvent(
  event: EventDef,
  divisionAthletes: Athlete[],
  results: Result[]
): ScoredRow[] {
  const field = new Set(scoringField(divisionAthletes, results).map((a) => a.id));
  const N = field.size;
  const resultMap = new Map<string, Result>();
  results.forEach((r) => {
    if (r.eventId === event.id) resultMap.set(r.athleteId, r);
  });

  const getEffectiveMaxWeight = (r: Result | undefined) => {
    if (!r || r.didNotStart) return 0;
    if (r.maxWeightLbs && r.maxWeightLbs > 0) return r.maxWeightLbs;
    if (r.risingBarAttempts) {
      const goodWeights = Object.entries(r.risingBarAttempts)
        .filter(([, status]) => status === 'good')
        .map(([w]) => Number(w));
      return goodWeights.length > 0 ? Math.max(...goodWeights) : 0;
    }
    return 0;
  };

  const evaluated = divisionAthletes.map((athlete) => {
    const r = resultMap.get(athlete.id);
    let isZero = true;
    let displayScore = '0 (No Lift)';

    if (!r || r.didNotStart) {
      return {
        athlete,
        r,
        isZero: true,
        displayScore: r?.didNotStart ? 'DNS' : '—',
        sortTuple: [0, 0, 0],
      };
    }

    switch (event.scoringType) {
      case 'reps': {
        const reps = r.reps ?? 0;
        const tierRank = event.hasTrumpWeight ? (r.tier === 'light' ? 1 : 2) : 2;
        isZero = reps <= 0;
        displayScore = isZero
          ? '0 reps'
          : `${reps} ${reps === 1 ? 'rep' : 'reps'}${
              event.hasTrumpWeight ? (r.tier === 'light' ? ' (Light)' : ' (Heavy)') : ''
            }`;
        return {
          athlete,
          r,
          isZero,
          displayScore,
          sortTuple: isZero ? [0, 0, 0] : [tierRank, reps, 0],
        };
      }

      case 'time_or_distance': {
        const time = r.timeSeconds ?? 0;
        const dist = r.distanceFeet ?? 0;
        const finished = time > 0 && time <= event.timeCapSeconds;
        isZero = !finished && dist <= 0;
        if (finished) {
          displayScore = `${Number(time).toFixed(2)}s`;
          return { athlete, r, isZero: false, displayScore, sortTuple: [2, 10000 - time, 0] };
        } else {
          displayScore = isZero ? '0 ft' : `${dist} ft (DNF)`;
          return { athlete, r, isZero, displayScore, sortTuple: isZero ? [0, 0, 0] : [1, dist, 0] };
        }
      }

      case 'time_or_implements': {
        const time = r.timeSeconds ?? 0;
        const impl = r.implementsCompleted ?? 0;
        const split = r.splitTimeSeconds ?? 9999;
        const finished = time > 0 && time <= event.timeCapSeconds;
        isZero = !finished && impl <= 0;
        if (finished) {
          displayScore = `All in ${Number(time).toFixed(2)}s`;
          return { athlete, r, isZero: false, displayScore, sortTuple: [2, 10000 - time, 0] };
        } else {
          displayScore = isZero
            ? '0 impl'
            : `${impl} impl${split < 9999 ? ` @ ${Number(split).toFixed(2)}s` : ''}`;
          return {
            athlete,
            r,
            isZero,
            displayScore,
            sortTuple: isZero ? [0, 0, 0] : [1, impl, 10000 - split],
          };
        }
      }

      case 'max_weight': {
        const maxW = getEffectiveMaxWeight(r);
        isZero = maxW <= 0;
        displayScore = isZero ? 'No Lift' : `${maxW} lbs`;
        return { athlete, r, isZero, displayScore, sortTuple: isZero ? [0, 0, 0] : [2, maxW, 0] };
      }

      default: {
        const dist = r.distanceFeet ?? 0;
        isZero = dist <= 0;
        displayScore = isZero ? '0 ft' : `${dist} ft`;
        return { athlete, r, isZero, displayScore, sortTuple: isZero ? [0, 0, 0] : [2, dist, 0] };
      }
    }
  });

  evaluated.sort((a, b) => {
    for (let i = 0; i < 3; i++) {
      if (b.sortTuple[i] !== a.sortTuple[i]) return b.sortTuple[i] - a.sortTuple[i];
    }
    return a.athlete.lotNumber - b.athlete.lotNumber;
  });

  const scoredRows: ScoredRow[] = [];
  let i = 0;
  while (i < evaluated.length) {
    const current = evaluated[i];
    if (current.isZero) {
      scoredRows.push({
        athleteId: current.athlete.id,
        athleteName: current.athlete.name,
        // last in the field; a scratched athlete outside the field sits one place below it
        place: field.has(current.athlete.id) ? N : N + 1,
        points: 0,
        displayScore: current.displayScore,
        isZero: true,
        isTied: false,
      });
      i++;
      continue;
    }

    let tieEnd = i;
    while (
      tieEnd + 1 < evaluated.length &&
      !evaluated[tieEnd + 1].isZero &&
      evaluated[tieEnd + 1].sortTuple[0] === current.sortTuple[0] &&
      evaluated[tieEnd + 1].sortTuple[1] === current.sortTuple[1] &&
      evaluated[tieEnd + 1].sortTuple[2] === current.sortTuple[2]
    ) {
      tieEnd++;
    }

    const tieCount = tieEnd - i + 1;
    const place = i + 1;
    let totalPointsPool = 0;
    for (let pos = i; pos <= tieEnd; pos++) totalPointsPool += N - pos;
    const splitPoints = Math.round((totalPointsPool / tieCount) * 100) / 100;

    for (let pos = i; pos <= tieEnd; pos++) {
      scoredRows.push({
        athleteId: evaluated[pos].athlete.id,
        athleteName: evaluated[pos].athlete.name,
        place,
        points: splitPoints,
        displayScore: evaluated[pos].displayScore,
        isZero: false,
        isTied: tieCount > 1,
      });
    }
    i = tieEnd + 1;
  }

  return scoredRows;
}

export function calculateDivisionStandings(
  division: Division,
  divisionAthletes: Athlete[],
  events: EventDef[],
  allResults: Result[],
  tiebreakerRule: TiebreakerRule = 'event_wins'
): StandingRow[] {
  const sortedEvents = [...events].sort((a, b) => a.eventNumber - b.eventNumber);
  const finalEventId = sortedEvents[sortedEvents.length - 1]?.id;

  const standingMap = new Map<string, StandingRow>();
  divisionAthletes.forEach((a) => {
    standingMap.set(a.id, {
      athleteId: a.id,
      athleteName: a.name,
      divisionId: division.id,
      status: a.status,
      totalPoints: 0,
      eventWins: 0,
      finalEventPoints: 0,
      eventBreakdown: {},
      overallPlace: 1,
    });
  });

  for (const ev of sortedEvents) {
    const evHasAnyResult = allResults.some((r) => r.eventId === ev.id);
    if (!evHasAnyResult) continue;

    const scored = scoreSingleEvent(ev, divisionAthletes, allResults);
    for (const row of scored) {
      const entry = standingMap.get(row.athleteId);
      if (!entry) continue;
      entry.totalPoints = Math.round((entry.totalPoints + row.points) * 100) / 100;
      if (row.place === 1 && !row.isZero) entry.eventWins += 1;
      if (ev.id === finalEventId) entry.finalEventPoints = row.points;
      entry.eventBreakdown[ev.id] = {
        points: row.points,
        place: row.place,
        display: row.displayScore,
      };
    }
  }

  const rows = Array.from(standingMap.values());
  rows.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (tiebreakerRule === 'event_wins') {
      if (b.eventWins !== a.eventWins) return b.eventWins - a.eventWins;
      return b.finalEventPoints - a.finalEventPoints;
    } else {
      if (b.finalEventPoints !== a.finalEventPoints) return b.finalEventPoints - a.finalEventPoints;
      return b.eventWins - a.eventWins;
    }
  });

  // Astra R-M5 (10/19): athletes still level after both tiebreak criteria share the place (1, 1, 3), the way the public
  // results page already shows ties, instead of being split by sort order.
  const level = (a: StandingRow, b: StandingRow) =>
    a.totalPoints === b.totalPoints && a.eventWins === b.eventWins && a.finalEventPoints === b.finalEventPoints;
  rows.forEach((row, idx) => {
    const prev = idx > 0 ? rows[idx - 1] : null;
    if (prev && level(prev, row)) {
      row.overallPlace = prev.overallPlace;
      row.isTiedOverall = true;
      prev.isTiedOverall = true;
    } else {
      row.overallPlace = idx + 1;
      row.isTiedOverall = false;
    }
  });

  return rows;
}
