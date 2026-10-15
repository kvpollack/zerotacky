'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Timer,
  Dumbbell,
  Trophy,
  Settings,
  ClipboardCheck,
  AlertTriangle,
  RotateCcw,
  Plus,
  UserMinus,
  Ban,
  CheckCircle2,
  Sun,
  Moon,
  Lock,
  Unlock,
  ChevronDown,
  ArrowRight,
  Palette,
  Shuffle,
} from 'lucide-react';

// ============================================================================
// 1. COMPLETE STRONGMAN SCORING, RUN ORDER, PIN HEIGHT & PLATE ENGINE
// ============================================================================

function resolveAthleteHeightCallout(event, divisionId, athlete) {
  if (!event.hasHeightCallout) return undefined;
  const personalPin = athlete?.rackHeights?.[event.id]?.trim();
  if (personalPin) return personalPin;
  const divDefault = event.divisionDefaultHeights?.[divisionId]?.trim();
  if (divDefault) return divDefault;
  return 'Not Set';
}

function calculatePlateLoading(
  event,
  divisionId,
  availablePlates,
  collarWeightPerPair = 0,
  overrideTargetWeight,
  useLightTier = false
) {
  const rawTarget =
    overrideTargetWeight !== undefined &&
    overrideTargetWeight !== '' &&
    !isNaN(Number(overrideTargetWeight))
      ? Number(overrideTargetWeight)
      : useLightTier && event.hasTrumpWeight
      ? event.divisionLightWeights?.[divisionId] ?? 0
      : event.divisionWeights?.[divisionId] ?? 0;

  if (event.loadingPoints === 0) {
    return {
      targetInputWeight: rawTarget,
      totalSystemWeight: rawTarget,
      implementTareWeight: event.implementEmptyWeight,
      collarWeightApplied: 0,
      loadingPoints: 0,
      callOutLabel: 'Fixed Implement (No Plate Loading)',
      weightPerLoadingPoint: 0,
      platesPerPoint: [],
      remainderUnloadedTotal: 0,
    };
  }

  let weightToLoadAcrossPoints = 0;
  let pointsDivisor = event.loadingPoints;
  let callOutLabel = 'Per Side';
  let totalSystemWeight = rawTarget;
  let collarApplied = 0;

  if (event.loadingPoints === 1) {
    callOutLabel = 'On the Pin (1 Point)';
    pointsDivisor = 1;
    weightToLoadAcrossPoints = Math.max(0, rawTarget - event.implementEmptyWeight);
  } else if (event.loadingPoints === 2) {
    callOutLabel = 'Per Sleeve (2 Sides)';
    pointsDivisor = 2;
    collarApplied = collarWeightPerPair;
    weightToLoadAcrossPoints = Math.max(
      0,
      rawTarget - event.implementEmptyWeight - collarApplied
    );
  } else if (event.loadingPoints === 4) {
    if (event.weightEntryMode === 'per_hand') {
      callOutLabel = 'Per Sleeve (4 Sleeves / 2 Handles)';
      pointsDivisor = 2;
      collarApplied = collarWeightPerPair;
      weightToLoadAcrossPoints = Math.max(
        0,
        rawTarget - event.implementEmptyWeight - collarApplied
      );
      totalSystemWeight = rawTarget * 2;
    } else {
      callOutLabel = 'Per Upright Post (4 Posts)';
      pointsDivisor = 4;
      weightToLoadAcrossPoints = Math.max(0, rawTarget - event.implementEmptyWeight);
    }
  }

  const exactWeightPerPoint = weightToLoadAcrossPoints / pointsDivisor;
  let remainingPerPoint = exactWeightPerPoint;

  const sortedPlates = [...availablePlates].sort((a, b) => b - a);
  const platesPerPoint = [];

  for (const plate of sortedPlates) {
    if (plate <= 0) continue;
    const count = Math.floor((remainingPerPoint + 0.001) / plate);
    if (count > 0) {
      platesPerPoint.push({ weight: plate, count });
      remainingPerPoint = Math.round((remainingPerPoint - count * plate) * 100) / 100;
    }
  }

  const remainderUnloadedTotal = Math.round(remainingPerPoint * pointsDivisor * 100) / 100;
  let warningMessage;

  if (rawTarget < event.implementEmptyWeight) {
    warningMessage = `Target weight (${rawTarget} lbs) is lighter than empty implement (${event.implementEmptyWeight} lbs).`;
  } else if (remainderUnloadedTotal > 0) {
    warningMessage =
      event.loadingPoints === 4 && event.weightEntryMode === 'total'
        ? `Uneven 4-Post Load: ${remainderUnloadedTotal} lbs left over. Put a ${remainderUnloadedTotal} lb plate in the center crossbar or adjust target weight.`
        : `Unloaded remainder: ${remainderUnloadedTotal} lbs total (${remainingPerPoint} lbs per point) cannot be made with selected plate inventory.`;
  }

  return {
    targetInputWeight: rawTarget,
    totalSystemWeight,
    implementTareWeight: event.implementEmptyWeight,
    collarWeightApplied: collarApplied,
    loadingPoints: event.loadingPoints,
    callOutLabel,
    weightPerLoadingPoint: Math.round(exactWeightPerPoint * 100) / 100,
    platesPerPoint,
    remainderUnloadedTotal,
    warningMessage,
  };
}

function scoreSingleEvent(event, divisionAthletes, results) {
  const N = divisionAthletes.length;
  const resultMap = new Map();
  results.forEach((r) => {
    if (r.eventId === event.id) resultMap.set(r.athleteId, r);
  });

  const getEffectiveMaxWeight = (r) => {
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

  const scoredRows = [];
  let i = 0;
  while (i < evaluated.length) {
    const current = evaluated[i];
    if (current.isZero) {
      scoredRows.push({
        athleteId: current.athlete.id,
        athleteName: current.athlete.name,
        place: N,
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

function calculateDivisionStandings(
  division,
  divisionAthletes,
  events,
  allResults,
  tiebreakerRule = 'event_wins'
) {
  const sortedEvents = [...events].sort((a, b) => a.eventNumber - b.eventNumber);
  const finalEventId = sortedEvents[sortedEvents.length - 1]?.id;

  const standingMap = new Map();
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

  rows.forEach((row, idx) => {
    row.overallPlace = idx + 1;
  });

  return rows;
}

function generateEventRunOrder(
  targetEvent,
  division,
  divisionAthletes,
  allEvents,
  allResults,
  method
) {
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

  let orderedAthletes = [];
  const prevScoreLookup = new Map();

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

// ============================================================================
// 2. MEET PRESETS, 8 PROMOTER THEMES & TRANSITION DELTA ENGINE
// ============================================================================

const STORAGE_KEY = 'ZEROTACKY_OFFLINE_STATE_V2';
const ALL_POSSIBLE_PLATES = [100, 55, 45, 35, 25, 15, 10, 5, 2.5];
const DEFAULT_PRESET_ID = 'strongfest-2026';

const MEET_PRESETS = [
  { id: 'strongfest-2026', label: 'All Out Strongfest 2026', sublabel: 'The Power Plant Gym' },
  { id: 'york-iron-2026', label: 'York Iron Classic 2026', sublabel: 'York, PA' },
];

const THEME_STORAGE_KEY = 'ZEROTACKY_THEME_V1';
const DEFAULT_THEME_ID = 'steel';
const DAYLIGHT_THEME_ID = 'daylight';

const THEMES = [
  { id: 'steel', name: 'Calibrated Steel', tagline: 'Graphite • Comp Red • Calibrated Blue', surface: '#111317', primary: '#E11D48', secondary: '#2563EB' },
  { id: 'volt', name: 'Power Plant Volt', tagline: 'Midnight • Cyan • Neon Volt', surface: '#0B1120', primary: '#06B6D4', secondary: '#84CC16' },
  { id: 'brass', name: 'Iron & Brass', tagline: 'Charcoal • Brass • Rust Crimson', surface: '#171614', primary: '#D4AF37', secondary: '#B91C1C' },
  { id: 'navy', name: 'Federation Navy', tagline: 'Oxford Navy • Sky • Gold Medal', surface: '#0A1128', primary: '#38BDF8', secondary: '#FACC15' },
  { id: 'timber', name: 'Highland Timber', tagline: 'Pine Slate • Copper • Sage', surface: '#0D1713', primary: '#D97706', secondary: '#10B981' },
  { id: 'cobalt', name: 'Titanium & Cobalt', tagline: 'Titanium • Cobalt • Teal', surface: '#18181B', primary: '#3B82F6', secondary: '#14B8A6' },
  { id: 'venom', name: 'Spotlight Venom', tagline: 'Obsidian • Violet • Laser Rose', surface: '#0D0B14', primary: '#8B5CF6', secondary: '#F43F5E' },
  { id: 'daylight', name: 'Outdoor Daylight', tagline: 'Chalk • White • Royal Cobalt', surface: '#F8FAFC', primary: '#1D4ED8', secondary: '#09090B' },
];

function describeSetup(event, divisionId) {
  const callout = event.pitCrewCallout?.byDivision?.[divisionId];
  if (callout?.headline) return callout.headline;
  if (event.fixedImplementDescription) return event.fixedImplementDescription;
  const w = event.divisionWeights?.[divisionId];
  if (w === undefined) return '—';
  return `${w} lb${event.weightIsAddedPlatesOnly ? ' added plates' : ''}`;
}

function parseMeasure(value) {
  const m = String(value).trim().match(/^(-?\d+(?:\.\d+)?)\s*(.*)$/);
  return m ? { num: Number(m[1]), unit: m[2] } : null;
}

function formatSigned(n, unit) {
  const rounded = Math.round(n * 100) / 100;
  return `${rounded > 0 ? '+' : ''}${rounded}${unit === '"' ? '"' : ` ${unit}`}`.trim();
}

function buildTransitionDeltas(curEvent, curDivId, nextEvent, nextDivId) {
  if (curEvent.id !== nextEvent.id) {
    return [
      {
        label: 'Event Changeover',
        from: describeSetup(curEvent, curDivId),
        to: describeSetup(nextEvent, nextDivId),
        delta: `Strike Ev ${curEvent.eventNumber} → Build Ev ${nextEvent.eventNumber}`,
        changed: true,
      },
    ];
  }

  const rows = [];
  const curW = curEvent.divisionWeights?.[curDivId];
  const nextW = curEvent.divisionWeights?.[nextDivId];
  if (curEvent.loadingPoints > 0 && curW !== undefined && nextW !== undefined) {
    const diff = nextW - curW;
    const perPoint = Math.round((Math.abs(diff) / curEvent.loadingPoints) * 100) / 100;
    const pointLabel = curEvent.loadingPoints === 2 ? 'side' : 'point';
    rows.push({
      label: curEvent.weightIsAddedPlatesOnly ? 'Added Plates' : 'Implement Weight',
      from: `${curW} lb`,
      to: `${nextW} lb`,
      delta:
        diff === 0
          ? 'No plate change'
          : `${diff > 0 ? 'ADD' : 'REMOVE'} ${perPoint} lb per ${pointLabel} (${Math.abs(diff)} lb total)`,
      changed: diff !== 0,
    });
  }

  const curCallout = curEvent.pitCrewCallout?.byDivision?.[curDivId];
  const nextCallout = curEvent.pitCrewCallout?.byDivision?.[nextDivId];
  const nextStats = nextCallout?.stats ?? [];
  const isNumericStat = (s) => parseMeasure(s.value) !== null;

  if (nextStats.some(isNumericStat)) {
    nextStats.forEach((stat) => {
      const prev = curCallout?.stats?.find((s) => s.label === stat.label);
      const a = prev ? parseMeasure(prev.value) : null;
      const b = parseMeasure(stat.value);
      if (a && b && a.unit === b.unit) {
        const diff = b.num - a.num;
        rows.push({
          label: stat.label,
          from: prev.value,
          to: stat.value,
          delta: diff === 0 ? 'No change' : formatSigned(diff, b.unit),
          changed: diff !== 0,
        });
      } else if (prev?.value !== stat.value) {
        rows.push({ label: stat.label, from: prev?.value ?? '—', to: stat.value, delta: 'Change', changed: true });
      }
    });
  } else if (curCallout?.headline && nextCallout?.headline) {
    const changed = curCallout.headline !== nextCallout.headline;
    rows.push({
      label: curEvent.pitCrewCallout.title,
      from: curCallout.headline,
      to: nextCallout.headline,
      delta: changed ? 'Swap setup' : 'No change',
      changed,
    });
  }

  if (rows.length === 0 && curW !== undefined && nextW !== undefined) {
    const diff = nextW - curW;
    rows.push({
      label: 'Implement',
      from: `${curW} lb`,
      to: `${nextW} lb`,
      delta: diff === 0 ? 'No change' : formatSigned(diff, 'lb'),
      changed: diff !== 0,
    });
  }

  return rows;
}

function getStrongfestSeedState() {
  const meetId = 'strongfest-2026';

  const meet = {
    id: meetId,
    presetId: 'strongfest-2026',
    name: 'All Out Strongfest 2026 (The Power Plant Gym)',
    date: '2026-10-24',
    runOrderMethod: 'reverse_overall',
    tiebreakerRule: 'event_wins',
    availablePlates: [100, 55, 45, 35, 25, 15, 10, 5, 2.5],
    collarWeightPerPair: 0,
    adminPin: '1050',
  };

  const divisions = [
    { id: 'sf-g1', meetId, name: 'Group 1', flight: 'A', sortOrder: 1 },
    { id: 'sf-g2', meetId, name: 'Group 2', flight: 'A', sortOrder: 2 },
    { id: 'sf-g3', meetId, name: 'Group 3', flight: 'A', sortOrder: 3 },
    { id: 'sf-g4', meetId, name: 'Group 4', flight: 'B', sortOrder: 4 },
    { id: 'sf-g5', meetId, name: 'Group 5', flight: 'B', sortOrder: 5 },
  ];

  const athletes = [
    { id: 'sf-ath-1', divisionId: 'sf-g1', name: 'Maya Ortiz', bodyweight: 61.2, lotNumber: 1, status: 'active', rackHeights: {} },
    { id: 'sf-ath-2', divisionId: 'sf-g1', name: 'Jenna Holt', bodyweight: 58.7, lotNumber: 2, status: 'active', rackHeights: {} },
    { id: 'sf-ath-3', divisionId: 'sf-g2', name: 'Rachel Kim', bodyweight: 72.4, lotNumber: 1, status: 'active', rackHeights: {} },
    { id: 'sf-ath-4', divisionId: 'sf-g2', name: 'Owen Price', bodyweight: 70.1, lotNumber: 2, status: 'active', rackHeights: {} },
    { id: 'sf-ath-5', divisionId: 'sf-g2', name: 'Tessa Grant', bodyweight: 74.8, lotNumber: 3, status: 'active', rackHeights: {} },
    { id: 'sf-ath-6', divisionId: 'sf-g3', name: 'Ben Alvarez', bodyweight: 88.3, lotNumber: 1, status: 'active', rackHeights: {} },
    { id: 'sf-ath-7', divisionId: 'sf-g3', name: 'Dana Whitfield', bodyweight: 86.0, lotNumber: 2, status: 'active', rackHeights: {} },
    { id: 'sf-ath-8', divisionId: 'sf-g4', name: 'Kurt Pollack', bodyweight: 104.2, lotNumber: 1, status: 'active', rackHeights: { 'sf-ev-2': '48" Bar (Std)' } },
    { id: 'sf-ath-9', divisionId: 'sf-g4', name: 'Dan Vance', bodyweight: 103.8, lotNumber: 2, status: 'active', rackHeights: {} },
    { id: 'sf-ath-10', divisionId: 'sf-g4', name: 'Marcus Trent', bodyweight: 105.0, lotNumber: 3, status: 'active', rackHeights: {} },
    { id: 'sf-ath-11', divisionId: 'sf-g5', name: 'Big Nate Kowalski', bodyweight: 142.0, lotNumber: 1, status: 'active', rackHeights: {} },
    { id: 'sf-ath-12', divisionId: 'sf-g5', name: 'Shane O-Connor', bodyweight: 131.5, lotNumber: 2, status: 'active', rackHeights: {} },
  ];

  const truckCallout = (vehicle) => ({
    headline: vehicle,
    stats: [
      { label: 'Course', value: '50 ft' },
      { label: 'Scoring', value: 'Fastest Time / Ft if Capped' },
    ],
  });

  const events = [
    {
      id: 'sf-ev-1',
      meetId,
      eventNumber: 1,
      name: 'Basket Deadlift (For Reps)',
      scoringType: 'reps',
      timeCapSeconds: 60,
      lanes: 1,
      loadingPoints: 2,
      weightEntryMode: 'total',
      weightIsAddedPlatesOnly: true,
      implementEmptyWeight: 0,
      divisionWeights: { 'sf-g1': 0, 'sf-g2': 0, 'sf-g3': 50, 'sf-g4': 200, 'sf-g5': 300 },
      hasTrumpWeight: false,
      groundTouchWarning: true,
      hasHeightCallout: true,
      heightLabel: 'Basket Keg Count & Load',
      divisionDefaultHeights: {
        'sf-g1': '8 Empty Kegs (0 Plates)',
        'sf-g2': '10 Empty Kegs (~265 lbs)',
        'sf-g3': '11 Kegs + 50 lb Plates (~355 lbs)',
        'sf-g4': '11 Kegs + 200 lb Plates (~420 lbs)',
        'sf-g5': '11 Kegs + 300 lb Plates',
      },
      pitCrewCallout: {
        title: 'Keg / Load Callout',
        byDivision: {
          'sf-g1': { headline: '8 Empty Kegs (No Added Plates)' },
          'sf-g2': { headline: '10 Empty Kegs (~265 lbs Total)' },
          'sf-g3': { headline: '11 Kegs + 50 lbs Plates (~355 lbs Total)' },
          'sf-g4': { headline: '11 Kegs + 200 lbs Plates (~420 lbs Total)' },
          'sf-g5': { headline: '11 Kegs + 300 lbs Plates' },
        },
      },
    },
    {
      id: 'sf-ev-2',
      meetId,
      eventNumber: 2,
      name: 'Keg Over Bar (For Reps)',
      scoringType: 'reps',
      timeCapSeconds: 60,
      lanes: 1,
      loadingPoints: 0,
      weightEntryMode: 'total',
      implementEmptyWeight: 0,
      divisionWeights: { 'sf-g1': 100, 'sf-g2': 125, 'sf-g3': 175, 'sf-g4': 200, 'sf-g5': 250 },
      hasTrumpWeight: false,
      hasHeightCallout: true,
      heightLabel: 'Yoke Crossbar Height',
      divisionDefaultHeights: {
        'sf-g1': '44" Yoke Bar (100 lb Keg)',
        'sf-g2': '44" Yoke Bar (125 lb Keg)',
        'sf-g3': '46" Yoke Bar (175 lb Keg)',
        'sf-g4': '48" Yoke Bar (200 lb Keg)',
        'sf-g5': '48" Yoke Bar (250 lb Keg)',
      },
      pitCrewCallout: {
        title: 'Yoke Crossbar Height + Keg Weight',
        byDivision: {
          'sf-g1': { headline: '44" Yoke Bar • 100 lb Keg', stats: [{ label: 'Yoke Crossbar', value: '44"' }, { label: 'Keg Weight', value: '100 lb' }] },
          'sf-g2': { headline: '44" Yoke Bar • 125 lb Keg', stats: [{ label: 'Yoke Crossbar', value: '44"' }, { label: 'Keg Weight', value: '125 lb' }] },
          'sf-g3': { headline: '46" Yoke Bar • 175 lb Keg', stats: [{ label: 'Yoke Crossbar', value: '46"' }, { label: 'Keg Weight', value: '175 lb' }] },
          'sf-g4': { headline: '48" Yoke Bar • 200 lb Keg', stats: [{ label: 'Yoke Crossbar', value: '48"' }, { label: 'Keg Weight', value: '200 lb' }] },
          'sf-g5': { headline: '48" Yoke Bar • 250 lb Keg', stats: [{ label: 'Yoke Crossbar', value: '48"' }, { label: 'Keg Weight', value: '250 lb' }] },
        },
      },
    },
    {
      id: 'sf-ev-3',
      meetId,
      eventNumber: 3,
      name: '50ft Harness Truck Pull',
      scoringType: 'time_or_distance',
      timeCapSeconds: 60,
      lanes: 1,
      loadingPoints: 0,
      weightEntryMode: 'total',
      implementEmptyWeight: 0,
      divisionWeights: {},
      hasTrumpWeight: false,
      pitCrewCallout: {
        title: 'Vehicle Setup',
        byDivision: {
          'sf-g1': truckCallout('Group 1 Vehicle • Compact Car'),
          'sf-g2': truckCallout('Group 2 Vehicle • Mid-Size Sedan'),
          'sf-g3': truckCallout('Group 3 Vehicle • Mid-Size SUV'),
          'sf-g4': truckCallout('Group 4 Vehicle • Full-Size Pickup'),
          'sf-g5': truckCallout('Group 5 Vehicle • Heavy-Duty Pickup'),
        },
      },
    },
  ];

  return { meet, divisions, athletes, events, results: [] };
}

function getYorkSeedState() {
  const meetId = 'york-iron-2026';

  const meet = {
    id: meetId,
    presetId: 'york-iron-2026',
    name: 'York Iron Classic 2026',
    date: '2026-10-24',
    runOrderMethod: 'reverse_overall',
    tiebreakerRule: 'event_wins',
    availablePlates: [100, 55, 45, 35, 25, 15, 10, 5, 2.5],
    collarWeightPerPair: 5,
    adminPin: '1050',
  };

  const divisions = [
    { id: 'div-m105', meetId, name: "Men's Open 105kg", flight: 'A', sortOrder: 1 },
    { id: 'div-mnov', meetId, name: "Men's Novice", flight: 'A', sortOrder: 2 },
    { id: 'div-w82', meetId, name: "Women's Open 82kg", flight: 'B', sortOrder: 3 },
    { id: 'div-mopen', meetId, name: "Men's Open HW", flight: 'B', sortOrder: 4 },
  ];

  const athletes = [
    { id: 'ath-1', divisionId: 'div-m105', name: 'Kurt Pollack', bodyweight: 104.2, lotNumber: 1, status: 'active', rackHeights: { 'ev-1': 'Pin 14 (6\'4")', 'ev-4': 'Pin 16 (High)' } },
    { id: 'ath-2', divisionId: 'div-m105', name: 'Dan Vance', bodyweight: 103.8, lotNumber: 2, status: 'active', rackHeights: { 'ev-1': 'Pin 11', 'ev-4': 'Pin 13' } },
    { id: 'ath-3', divisionId: 'div-m105', name: 'Marcus Trent', bodyweight: 104.9, lotNumber: 3, status: 'active', rackHeights: { 'ev-1': 'Pin 10', 'ev-4': 'Pin 12' } },
    { id: 'ath-4', divisionId: 'div-m105', name: 'Luke Mercer', bodyweight: 101.5, lotNumber: 4, status: 'active', rackHeights: { 'ev-1': 'Pin 12', 'ev-4': 'Pin 14' } },
    { id: 'ath-5', divisionId: 'div-mnov', name: 'Chris Miller', bodyweight: 98.0, lotNumber: 1, status: 'active', rackHeights: { 'ev-1': 'Pin 11', 'ev-4': 'Pin 13' } },
    { id: 'ath-6', divisionId: 'div-mnov', name: 'Tyler Reed', bodyweight: 108.4, lotNumber: 2, status: 'active', rackHeights: { 'ev-1': 'Pin 12', 'ev-4': 'Pin 15' } },
    { id: 'ath-7', divisionId: 'div-w82', name: 'Sarah Jenkins', bodyweight: 81.1, lotNumber: 1, status: 'active', rackHeights: { 'ev-1': 'Pin 8', 'ev-4': 'Pin 10' } },
    { id: 'ath-8', divisionId: 'div-w82', name: 'Elena Rostova', bodyweight: 79.5, lotNumber: 2, status: 'active', rackHeights: { 'ev-1': 'Pin 9', 'ev-4': 'Pin 11' } },
    { id: 'ath-9', divisionId: 'div-mopen', name: 'Big Nate Kowalski', bodyweight: 142.0, lotNumber: 1, status: 'active', rackHeights: { 'ev-1': 'Pin 15', 'ev-4': 'Pin 17' } },
    { id: 'ath-10', divisionId: 'div-mopen', name: 'Shane O-Connor', bodyweight: 131.5, lotNumber: 2, status: 'active', rackHeights: { 'ev-1': 'Pin 13', 'ev-4': 'Pin 15' } },
  ];

  const events = [
    {
      id: 'ev-1',
      meetId,
      eventNumber: 1,
      name: '12" Log Clean & Press (Rising Bar Max)',
      scoringType: 'max_weight',
      maxFormat: 'rising_bar',
      risingBarWeights: [225, 245, 265, 285, 305, 325],
      timeCapSeconds: 60,
      lanes: 1,
      loadingPoints: 2,
      weightEntryMode: 'total',
      implementEmptyWeight: 135,
      divisionWeights: { 'div-m105': 265, 'div-mnov': 205, 'div-w82': 165, 'div-mopen': 305 },
      hasTrumpWeight: false,
      hasHeightCallout: true,
      heightLabel: 'Log Rack / Clean Pin',
    },
    {
      id: 'ev-2',
      meetId,
      eventNumber: 2,
      name: 'Axle Wagon Wheel Deadlift (Trump Weight Reps)',
      scoringType: 'reps',
      timeCapSeconds: 60,
      lanes: 1,
      loadingPoints: 2,
      weightEntryMode: 'total',
      implementEmptyWeight: 75,
      divisionWeights: { 'div-m105': 585, 'div-mnov': 455, 'div-w82': 385, 'div-mopen': 675 },
      hasTrumpWeight: true,
      divisionLightWeights: { 'div-m105': 505, 'div-mnov': 405, 'div-w82': 335, 'div-mopen': 585 },
    },
    {
      id: 'ev-3',
      meetId,
      eventNumber: 3,
      name: 'Head-to-Head Farmers Walk (60ft Course)',
      scoringType: 'time_or_distance',
      timeCapSeconds: 60,
      lanes: 2,
      loadingPoints: 4,
      weightEntryMode: 'per_hand',
      implementEmptyWeight: 25,
      divisionWeights: { 'div-m105': 260, 'div-mnov': 210, 'div-w82': 175, 'div-mopen': 310 },
      hasTrumpWeight: false,
    },
    {
      id: 'ev-4',
      meetId,
      eventNumber: 4,
      name: 'Heavy 4-Post Yoke Walk (60ft Course)',
      scoringType: 'time_or_distance',
      timeCapSeconds: 60,
      lanes: 2,
      loadingPoints: 4,
      weightEntryMode: 'total',
      implementEmptyWeight: 185,
      divisionWeights: { 'div-m105': 665, 'div-mnov': 545, 'div-w82': 445, 'div-mopen': 785 },
      hasTrumpWeight: false,
      hasHeightCallout: true,
      heightLabel: 'Yoke Crossbar Pin',
    },
    {
      id: 'ev-5',
      meetId,
      eventNumber: 5,
      name: '5-Stone Atlas Series (With Split Tiebreaker)',
      scoringType: 'time_or_implements',
      timeCapSeconds: 60,
      lanes: 1,
      loadingPoints: 0,
      weightEntryMode: 'total',
      implementEmptyWeight: 0,
      divisionWeights: { 'div-m105': 330, 'div-mnov': 275, 'div-w82': 220, 'div-mopen': 385 },
      fixedImplementDescription: '105kg Series: 240, 260, 285, 310, 330 lbs to 52" Yoke Crossbar',
      hasTrumpWeight: false,
      hasHeightCallout: true,
      heightLabel: 'Stone Yoke Crossbar Height',
      divisionDefaultHeights: {
        'div-m105': '52" Crossbar',
        'div-mnov': '52" Crossbar',
        'div-w82': '48" Crossbar',
        'div-mopen': '52" Crossbar',
      },
    },
  ];

  return { meet, divisions, athletes, events, results: [] };
}

function getInitialSeedState(presetId = DEFAULT_PRESET_ID) {
  return presetId === 'york-iron-2026' ? getYorkSeedState() : getStrongfestSeedState();
}

// ============================================================================
// 3. MAIN MOBILE PWA COMPONENT
// ============================================================================

export default function App() {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // Fallback to seed state if storage is unavailable
    }
    return getInitialSeedState();
  });

  const [activeTab, setActiveTab] = useState('judge');
  const [stationFlight, setStationFlight] = useState('A');
  const [selectedDivisionId, setSelectedDivisionId] = useState(() => state.divisions[0]?.id ?? '');
  const [selectedEventId, setSelectedEventId] = useState(() => state.events[0]?.id ?? '');
  const [selectedAthleteId, setSelectedAthleteId] = useState(
    () => state.athletes.find((a) => a.divisionId === state.divisions[0]?.id)?.id ?? ''
  );
  const [lane2AthleteId, setLane2AthleteId] = useState('');
  const [pendingPresetId, setPendingPresetId] = useState(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [pendingStatusAction, setPendingStatusAction] = useState(null);

  // Volunteer Phone Role Lock ('admin' | 'judge' | 'pitcrew' | 'spectator')
  const [roleLock, setRoleLock] = useState('admin');
  const [pinPromptOpen, setPinPromptOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState(false);

  const [themePrefs, setThemePrefs] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      // Fall back to default theme
    }
    return { themeId: DEFAULT_THEME_ID, lastDarkThemeId: DEFAULT_THEME_ID };
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(themePrefs));
    } catch (e) {
      // Ignore storage errors
    }
  }, [themePrefs]);

  const themeId = THEMES.some((t) => t.id === themePrefs.themeId)
    ? themePrefs.themeId
    : DEFAULT_THEME_ID;
  const isDaylight = themeId === DAYLIGHT_THEME_ID;

  const selectTheme = (id) =>
    setThemePrefs((p) => ({
      themeId: id,
      lastDarkThemeId: id === DAYLIGHT_THEME_ID ? p.lastDarkThemeId : id,
    }));

  const toggleDaylight = () =>
    setThemePrefs((p) =>
      p.themeId === DAYLIGHT_THEME_ID
        ? { ...p, themeId: p.lastDarkThemeId || DEFAULT_THEME_ID }
        : { ...p, themeId: DAYLIGHT_THEME_ID }
    );

  // Pit Crew Overrides
  const [pitCrewUseLightTier, setPitCrewUseLightTier] = useState(false);
  const [pitCrewCustomWeight, setPitCrewCustomWeight] = useState('');

  // Setup Tab New Athlete Form
  const [newAthleteName, setNewAthleteName] = useState('');
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // Master Clock Stopwatch State
  const [timerRunning, setTimerRunning] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerStartRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      // Ignore storage errors
    }
  }, [state]);

  useEffect(() => {
    if (timerRunning) {
      timerStartRef.current = performance.now() - elapsedMs;
      const tick = (now) => {
        if (timerStartRef.current !== null) {
          setElapsedMs(now - timerStartRef.current);
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [timerRunning]);

  const { meet, divisions, athletes, events, results } = state;

  const lockDeviceToRole = (mode) => {
    setRoleLock(mode);
    if (mode === 'judge') setActiveTab('judge');
    if (mode === 'pitcrew') setActiveTab('pitcrew');
    if (mode === 'spectator') setActiveTab('standings');
  };

  const handleUnlockWithPin = () => {
    if (pinInput === (meet.adminPin || '1050')) {
      setRoleLock('admin');
      setPinPromptOpen(false);
      setPinInput('');
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  const filteredDivisions =
    stationFlight === 'ALL' ? divisions : divisions.filter((d) => d.flight === stationFlight);

  const currentDivision =
    filteredDivisions.find((d) => d.id === selectedDivisionId) ||
    filteredDivisions[0] ||
    divisions[0];

  const currentEvent = events.find((e) => e.id === selectedEventId) || events[0];
  const divisionAthletes = athletes.filter((a) => a.divisionId === currentDivision.id);

  const runOrder = generateEventRunOrder(
    currentEvent,
    currentDivision,
    divisionAthletes,
    events,
    results,
    meet.runOrderMethod
  );

  const currentAthlete =
    divisionAthletes.find((a) => a.id === selectedAthleteId) ||
    runOrder[0]?.athlete ||
    divisionAthletes[0];

  useEffect(() => {
    if (currentEvent.lanes === 2 && currentAthlete) {
      const currentOrderItem = runOrder.find((r) => r.athlete.id === currentAthlete.id);
      if (currentOrderItem) {
        const heatMate = runOrder.find(
          (r) => r.heatNumber === currentOrderItem.heatNumber && r.athlete.id !== currentAthlete.id
        );
        setLane2AthleteId(heatMate?.athlete.id || '');
      }
    }
  }, [currentEvent.id, currentAthlete?.id, currentDivision.id]);

  const currentResult = results.find(
    (r) => r.eventId === currentEvent.id && r.athleteId === currentAthlete?.id
  ) || {
    id: `${currentEvent.id}_${currentAthlete?.id}`,
    eventId: currentEvent.id,
    athleteId: currentAthlete?.id || '',
    tier: 'heavy',
    reps: 0,
    updatedAt: Date.now(),
  };

  const lane2Athlete = divisionAthletes.find((a) => a.id === lane2AthleteId);
  const lane2Result = lane2Athlete
    ? results.find((r) => r.eventId === currentEvent.id && r.athleteId === lane2Athlete.id) || {
        id: `${currentEvent.id}_${lane2Athlete.id}`,
        eventId: currentEvent.id,
        athleteId: lane2Athlete.id,
        updatedAt: Date.now(),
      }
    : null;

  const saveResultPatch = (targetAthleteId, patch) => {
    setState((prev) => {
      const existing = prev.results.find(
        (r) => r.eventId === currentEvent.id && r.athleteId === targetAthleteId
      );
      const updated = {
        id: `${currentEvent.id}_${targetAthleteId}`,
        eventId: currentEvent.id,
        athleteId: targetAthleteId,
        tier: 'heavy',
        ...existing,
        ...patch,
        updatedAt: Date.now(),
      };
      const otherResults = prev.results.filter((r) => r.id !== updated.id);
      return { ...prev, results: [...otherResults, updated] };
    });
  };

  const updateAthleteRackPin = (athleteId, eventId, pinValue) => {
    setState((prev) => ({
      ...prev,
      athletes: prev.athletes.map((a) =>
        a.id === athleteId
          ? { ...a, rackHeights: { ...(a.rackHeights || {}), [eventId]: pinValue } }
          : a
      ),
    }));
  };

  const toggleAthleteWithdrawn = (athlete) => {
    const nextStatus = athlete.status === 'active' ? 'withdrawn' : 'active';
    setState((prev) => ({
      ...prev,
      athletes: prev.athletes.map((a) => (a.id === athlete.id ? { ...a, status: nextStatus } : a)),
    }));
  };

  const updateMeetConfig = (patch) => {
    setState((prev) => ({ ...prev, meet: { ...prev.meet, ...patch } }));
  };

  const toggleGymPlate = (plateWeight) => {
    const exists = meet.availablePlates.includes(plateWeight);
    const nextPlates = exists
      ? meet.availablePlates.filter((p) => p !== plateWeight)
      : [...meet.availablePlates, plateWeight].sort((a, b) => b - a);
    updateMeetConfig({ availablePlates: nextPlates });
  };

  const updateEventDivisionWeight = (eventId, divisionId, newWeight) => {
    setState((prev) => ({
      ...prev,
      events: prev.events.map((ev) =>
        ev.id === eventId
          ? {
              ...ev,
              divisionWeights: { ...ev.divisionWeights, [divisionId]: Number(newWeight) || 0 },
            }
          : ev
      ),
    }));
  };

  const loadMeetPreset = (presetId) => {
    const fresh = getInitialSeedState(presetId);
    const firstDiv = fresh.divisions[0];
    setState(fresh);
    setStationFlight(firstDiv?.flight ?? 'A');
    setSelectedDivisionId(firstDiv?.id ?? '');
    setSelectedEventId(fresh.events[0]?.id ?? '');
    setSelectedAthleteId(fresh.athletes.find((a) => a.divisionId === firstDiv?.id)?.id ?? '');
    setLane2AthleteId('');
    setPitCrewCustomWeight('');
    setPitCrewUseLightTier(false);
    setTimerRunning(false);
    setElapsedMs(0);
    setPendingPresetId(null);
    setResetConfirmOpen(false);
  };

  const requestMeetPreset = (presetId) => {
    if (presetId === (meet.presetId ?? DEFAULT_PRESET_ID)) return;
    if (results.length > 0) {
      setPendingPresetId(presetId);
    } else {
      loadMeetPreset(presetId);
    }
  };

  const pitCrewCallout = currentEvent.pitCrewCallout?.byDivision?.[currentDivision.id];
  const isLocked = !!currentResult.locked;

  const selectRunOrderItem = (item) => {
    setSelectedAthleteId(item.athlete.id);
    setStatusMenuOpen(false);
    setPendingStatusAction(null);
    if (currentEvent.lanes === 2) {
      const mate = runOrder.find(
        (r) => r.heatNumber === item.heatNumber && r.athlete.id !== item.athlete.id
      );
      setLane2AthleteId(mate?.athlete.id || '');
    }
  };

  const currentRunIndex = runOrder.findIndex((r) => r.athlete.id === currentAthlete?.id);
  const nextRunItem =
    currentRunIndex < 0
      ? undefined
      : runOrder
          .slice(currentRunIndex + 1)
          .find(
            (r) =>
              r.athlete.id !== lane2AthleteId &&
              (currentEvent.lanes !== 2 || r.heatNumber !== runOrder[currentRunIndex].heatNumber)
          );

  const upNowPinHeight = resolveAthleteHeightCallout(
    currentEvent,
    currentDivision.id,
    currentAthlete
  );
  const onDeckPinHeight = nextRunItem
    ? resolveAthleteHeightCallout(currentEvent, currentDivision.id, nextRunItem.athlete)
    : null;

  const resetStopwatch = () => {
    setTimerRunning(false);
    setElapsedMs(0);
    timerStartRef.current = null;
  };

  const lockAndAdvance = () => {
    saveResultPatch(currentAthlete.id, { locked: true });
    if (currentEvent.lanes === 2 && lane2Athlete) {
      saveResultPatch(lane2Athlete.id, { locked: true });
    }
    resetStopwatch();
    if (nextRunItem) selectRunOrderItem(nextRunItem);
  };

  const unlockScore = () => {
    saveResultPatch(currentAthlete.id, { locked: false });
    if (currentEvent.lanes === 2 && lane2Athlete) {
      saveResultPatch(lane2Athlete.id, { locked: false });
    }
  };

  const stopAndStampFinish = () => {
    const ms =
      timerStartRef.current !== null ? performance.now() - timerStartRef.current : elapsedMs;
    const secs = Math.round(ms / 10) / 100;
    setTimerRunning(false);
    setElapsedMs(ms);
    saveResultPatch(currentAthlete.id, {
      timeSeconds: secs,
      didNotStart: false,
      ...(currentEvent.scoringType === 'time_or_implements'
        ? { implementsCompleted: currentEvent.implementCount || 5 }
        : {}),
    });
  };

  const showStopStamp =
    timerRunning &&
    !isLocked &&
    (currentEvent.scoringType === 'time_or_distance' ||
      currentEvent.scoringType === 'time_or_implements');

  const stopStampButton = (
    <button
      type="button"
      onClick={stopAndStampFinish}
      className="w-full py-6 rounded-2xl bg-red-600 text-white shadow-lg active:scale-[0.98] transition flex flex-col items-center gap-1 ring-4 ring-red-600/30"
    >
      <span className="text-xl font-black tracking-wide">STOP &amp; STAMP FINISH TIME</span>
      <span className="font-mono text-3xl font-black tabular-nums">
        {(elapsedMs / 1000).toFixed(2)}s
      </span>
    </button>
  );

  const statusActions = [
    {
      id: 'dns',
      icon: Ban,
      label: currentResult.didNotStart ? 'Clear DNS' : 'Mark DNS',
      run: () => saveResultPatch(currentAthlete.id, { didNotStart: !currentResult.didNotStart }),
    },
    {
      id: 'scratch',
      icon: UserMinus,
      label: currentAthlete?.status === 'withdrawn' ? 'Reinstate Athlete' : 'Scratch from Meet',
      run: () => toggleAthleteWithdrawn(currentAthlete),
    },
  ];

  const handleStatusAction = (action) => {
    if (pendingStatusAction === action.id) {
      action.run();
      setPendingStatusAction(null);
    } else {
      setPendingStatusAction(action.id);
    }
  };

  const divisionIndex = filteredDivisions.findIndex((d) => d.id === currentDivision.id);
  const nextEventInMeet = events.find((e) => e.eventNumber === currentEvent.eventNumber + 1);
  const nextSetup =
    divisionIndex >= 0 && divisionIndex < filteredDivisions.length - 1
      ? { event: currentEvent, division: filteredDivisions[divisionIndex + 1] }
      : nextEventInMeet && filteredDivisions[0]
      ? { event: nextEventInMeet, division: filteredDivisions[0] }
      : null;
  const transitionRows = nextSetup
    ? buildTransitionDeltas(
        currentEvent,
        currentDivision.id,
        nextSetup.event,
        nextSetup.division.id
      )
    : [];

  const addNewAthleteToDivision = (e) => {
    e.preventDefault();
    if (!newAthleteName.trim()) return;
    const newAth = {
      id: `ath-${Date.now()}`,
      divisionId: currentDivision.id,
      name: newAthleteName.trim(),
      lotNumber: divisionAthletes.length + 1,
      status: 'active',
      rackHeights: {},
    };
    setState((prev) => ({ ...prev, athletes: [...prev.athletes, newAth] }));
    setNewAthleteName('');
    setSelectedAthleteId(newAth.id);
  };

  const elapsedSeconds = Math.round((elapsedMs / 1000) * 100) / 100;

  const plateLoad = calculatePlateLoading(
    currentEvent,
    currentDivision.id,
    meet.availablePlates,
    meet.collarWeightPerPair,
    pitCrewCustomWeight,
    pitCrewUseLightTier
  );

  const eventScores = scoreSingleEvent(currentEvent, divisionAthletes, results);
  const overallStandings = calculateDivisionStandings(
    currentDivision,
    divisionAthletes,
    events,
    results,
    meet.tiebreakerRule
  );

  return (
    <div
      data-zt-theme={themeId}
      className="min-h-screen bg-zt-bg text-zt-text pb-24 font-sans select-none transition-colors"
    >
      {/* Sticky Top Header: Concurrent Station Filter + Division & Event Selectors */}
      <header className="bg-zt-surface/95 backdrop-blur border-b border-zt-border px-3.5 py-3 sticky top-0 z-20 shadow-lg">
        <div className="max-w-xl mx-auto">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-zt-primary">
                  ZERO TACKY • PIXEL PWA
                </span>
                {roleLock !== 'admin' && (
                  <button
                    type="button"
                    onClick={() => setPinPromptOpen((o) => !o)}
                    className="text-[10px] font-black uppercase bg-red-600 text-white px-2 py-0.5 rounded flex items-center gap-1"
                  >
                    <Lock className="w-2.5 h-2.5" />
                    {roleLock.toUpperCase()} LOCKED • UNLOCK
                  </button>
                )}
              </div>
              <h1 className="text-base sm:text-lg font-black truncate text-zt-text">{meet.name}</h1>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={toggleDaylight}
                aria-pressed={isDaylight}
                aria-label={isDaylight ? 'Switch back to dark theme' : 'Switch to Outdoor Daylight theme'}
                title={isDaylight ? 'Dark mode' : 'Sun / Daylight mode'}
                className={`p-2.5 rounded-xl border transition active:scale-95 ${
                  isDaylight
                    ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                    : 'bg-zt-inset text-zt-primary border-zt-border'
                }`}
              >
                {isDaylight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>

              {/* Concurrent Station / Flight Selector */}
              <div className="flex bg-zt-inset p-1 rounded-xl border border-zt-border text-xs font-extrabold flex-shrink-0">
                {['A', 'B', 'ALL'].map((fl) => (
                  <button
                    key={fl}
                    onClick={() => {
                      setStationFlight(fl);
                      const firstDiv = divisions.find((d) => (fl === 'ALL' ? true : d.flight === fl));
                      if (firstDiv) {
                        setSelectedDivisionId(firstDiv.id);
                        const firstAth = athletes.find(
                          (a) => a.divisionId === firstDiv.id && a.status === 'active'
                        );
                        if (firstAth) setSelectedAthleteId(firstAth.id);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-lg transition ${
                      stationFlight === fl
                        ? 'bg-zt-primary text-zt-on-primary shadow'
                        : 'text-zt-muted hover:text-zt-text-2'
                    }`}
                  >
                    {fl === 'ALL' ? 'All' : `Stn ${fl === 'A' ? '1 (A)' : '2 (B)'}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Inline Admin PIN Unlock Prompt */}
          {pinPromptOpen && (
            <div className="mt-2.5 p-2.5 bg-zt-inset border border-zt-primary rounded-xl flex items-center gap-2">
              <input
                type="password"
                inputMode="numeric"
                placeholder={`Enter Promoter PIN (${meet.adminPin || '1050'})`}
                value={pinInput}
                onChange={(e) => {
                  setPinInput(e.target.value);
                  setPinError(false);
                }}
                className="flex-1 bg-zt-surface border border-zt-border-strong rounded-lg px-3 py-1.5 text-sm font-bold text-zt-text"
              />
              <button
                type="button"
                onClick={handleUnlockWithPin}
                className="bg-zt-primary text-zt-on-primary font-black text-xs uppercase px-3 py-2 rounded-lg"
              >
                Unlock
              </button>
              <button
                type="button"
                onClick={() => {
                  setPinPromptOpen(false);
                  setPinError(false);
                }}
                className="bg-zt-surface-2 text-zt-text-2 font-bold text-xs px-2.5 py-2 rounded-lg"
              >
                Cancel
              </button>
              {pinError && <span className="text-xs font-bold text-red-400">Wrong PIN</span>}
            </div>
          )}

          {/* Division & Event Selectors */}
          <div className="grid grid-cols-2 gap-2 mt-2.5">
            <select
              value={currentDivision.id}
              onChange={(e) => {
                const nextDivId = e.target.value;
                setSelectedDivisionId(nextDivId);
                const firstAth = athletes.find(
                  (a) => a.divisionId === nextDivId && a.status === 'active'
                );
                if (firstAth) setSelectedAthleteId(firstAth.id);
              }}
              className="bg-zt-inset border border-zt-border-strong rounded-xl px-2.5 py-2 text-xs sm:text-sm font-bold text-zt-text focus:outline-none focus:border-zt-primary"
            >
              {filteredDivisions.map((d) => (
                <option key={d.id} value={d.id}>
                  [Flight {d.flight}] {d.name}
                </option>
              ))}
            </select>

            <select
              value={currentEvent.id}
              onChange={(e) => {
                setSelectedEventId(e.target.value);
                setPitCrewCustomWeight('');
              }}
              className="bg-zt-inset border border-zt-border-strong rounded-xl px-2.5 py-2 text-xs sm:text-sm font-bold text-zt-primary focus:outline-none focus:border-zt-primary"
            >
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  Ev {ev.eventNumber}: {ev.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="p-3.5 max-w-xl mx-auto space-y-4">
        {/* ================================================================ */}
        {/* TAB 1: JUDGE PAD                                                 */}
        {/* ================================================================ */}
        {activeTab === 'judge' && currentAthlete && (
          <div className="space-y-3.5">
            {/* Run Order Strip */}
            <div className="bg-zt-surface border border-zt-border rounded-2xl p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-zt-muted">
                  Run Order ({meet.runOrderMethod === 'reverse_overall' ? 'Rev Overall' : 'Rev Prev Ev'})
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-zt-surface-2 text-zt-primary">
                  {currentEvent.lanes === 2 ? '2-Lane Head-to-Head' : 'Single Platform'}
                </span>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1.5">
                {runOrder.map((item) => {
                  const hasScored = results.some(
                    (r) => r.eventId === currentEvent.id && r.athleteId === item.athlete.id
                  );
                  const isItemLocked = results.some(
                    (r) => r.eventId === currentEvent.id && r.athleteId === item.athlete.id && r.locked
                  );
                  const isSelected = item.athlete.id === currentAthlete.id;
                  const isLane2 = currentEvent.lanes === 2 && item.athlete.id === lane2AthleteId;

                  return (
                    <button
                      key={item.athlete.id}
                      onClick={() => selectRunOrderItem(item)}
                      className={`flex-shrink-0 px-3 py-2 rounded-xl border text-left transition active:scale-95 ${
                        isSelected
                          ? 'bg-zt-primary/20 border-zt-primary text-zt-primary-2 ring-1 ring-zt-primary'
                          : isLane2
                          ? 'bg-zt-secondary/20 border-zt-secondary text-zt-secondary'
                          : hasScored
                          ? 'bg-zt-success/15 border-zt-success/60 text-zt-success-text'
                          : 'bg-zt-inset border-zt-border text-zt-text-2'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-[10px] font-extrabold uppercase opacity-80">
                        <span>
                          {currentEvent.lanes === 2
                            ? `Heat ${item.heatNumber} • L${item.lane}`
                            : `Order #${item.orderIndex}`}
                        </span>
                        {isItemLocked ? (
                          <Lock className="w-3 h-3 text-zt-success-text" aria-label="Score locked" />
                        ) : (
                          hasScored && <CheckCircle2 className="w-3 h-3 text-zt-success-text" />
                        )}
                      </div>
                      <div className="text-sm font-black truncate max-w-[125px]">{item.athlete.name}</div>
                      <div className="text-[11px] font-semibold opacity-75">
                        {item.currentOverallPoints} pts
                        {item.heightCallout ? ` • ${item.heightCallout}` : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Universal Master Clock */}
            <div className="bg-zt-surface border border-zt-border rounded-2xl p-3.5 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-[11px] uppercase font-extrabold text-zt-muted">
                  <Timer className="w-3.5 h-3.5 text-zt-primary" />
                  <span>Master Clock ({currentEvent.timeCapSeconds}s Cap)</span>
                </div>
                <div
                  className={`text-4xl font-mono font-black tracking-tight ${
                    elapsedSeconds >= currentEvent.timeCapSeconds
                      ? 'text-red-500'
                      : timerRunning
                      ? 'text-zt-success-text'
                      : 'text-zt-text'
                  }`}
                >
                  {elapsedSeconds.toFixed(2)}s
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setTimerRunning(!timerRunning)}
                  className={`px-5 py-3.5 rounded-xl font-black text-sm tracking-wide shadow active:scale-95 transition ${
                    timerRunning ? 'bg-red-600 text-white' : 'bg-emerald-500 text-emerald-950'
                  }`}
                >
                  {timerRunning ? 'STOP' : 'START'}
                </button>
                <button
                  onClick={resetStopwatch}
                  className="px-3.5 py-3.5 rounded-xl font-extrabold text-xs bg-zt-surface-2 text-zt-text-2 active:scale-95"
                >
                  RESET
                </button>
              </div>
            </div>

            {/* Active Athlete Card (Platform / Lane 1) */}
            <div className="bg-zt-surface border-2 border-zt-primary/70 rounded-2xl p-4 space-y-4 shadow-lg">
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider bg-zt-primary text-zt-on-primary px-2 py-0.5 rounded">
                      {currentEvent.lanes === 2 ? 'LANE 1 ATHLETE' : 'ON PLATFORM'}
                    </span>
                    {isLocked && (
                      <span className="text-[10px] font-black uppercase tracking-wider bg-zt-success/15 text-zt-success-text border border-zt-success/40 px-2 py-0.5 rounded flex items-center gap-1">
                        <Lock className="w-3 h-3" aria-hidden="true" />
                        Score Locked
                      </span>
                    )}
                    {currentResult.didNotStart && (
                      <span className="text-[10px] font-black uppercase tracking-wider bg-red-600 text-white px-2 py-0.5 rounded">
                        DNS
                      </span>
                    )}
                    {currentAthlete.status === 'withdrawn' && (
                      <span className="text-[10px] font-black uppercase tracking-wider bg-red-900 text-red-100 px-2 py-0.5 rounded">
                        Scratched
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-black mt-1 text-zt-text text-balance">
                    {currentAthlete.name}
                  </h2>
                  {upNowPinHeight && (
                    <div className="text-xs font-extrabold text-zt-primary mt-0.5">
                      {currentEvent.heightLabel || 'Rack / Pin'}: {upNowPinHeight}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setStatusMenuOpen((o) => !o);
                    setPendingStatusAction(null);
                  }}
                  aria-expanded={statusMenuOpen}
                  aria-controls="athlete-status-menu"
                  className="px-2.5 py-1.5 rounded-xl text-xs font-extrabold border bg-zt-inset border-zt-border-strong text-zt-muted flex items-center gap-1 flex-shrink-0"
                >
                  Status
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${statusMenuOpen ? 'rotate-180' : ''}`}
                    aria-hidden="true"
                  />
                </button>
              </div>

              {statusMenuOpen && (
                <div
                  id="athlete-status-menu"
                  className="rounded-xl border border-zt-border bg-zt-inset p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] uppercase tracking-wider font-extrabold text-zt-muted">
                      Athlete Status / Scratch
                    </span>
                    <span className="text-[10px] font-bold text-zt-subtle">Tap twice to confirm</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {statusActions.map((action) => {
                      const armed = pendingStatusAction === action.id;
                      const Icon = action.icon;
                      return (
                        <button
                          key={action.id}
                          type="button"
                          onClick={() => handleStatusAction(action)}
                          className={`py-3 px-2 rounded-xl text-xs font-black border flex items-center justify-center gap-1.5 transition active:scale-95 ${
                            armed
                              ? 'bg-red-600 border-red-500 text-white'
                              : 'bg-zt-surface border-zt-border-strong text-zt-text'
                          }`}
                        >
                          <Icon className="w-4 h-4" aria-hidden="true" />
                          {armed ? 'Tap Again to Confirm' : action.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <fieldset
                disabled={isLocked}
                className={`space-y-4 min-w-0 transition-opacity ${isLocked ? 'opacity-50' : ''}`}
              >
                <legend className="sr-only">Score entry</legend>

                {/* EVENT TYPE 1: REPS (With Heavy vs Light Trump Tier) */}
                {currentEvent.scoringType === 'reps' && (
                  <div className="space-y-4">
                    {currentEvent.hasTrumpWeight && (
                      <div className="grid grid-cols-2 gap-2 bg-zt-inset p-1.5 rounded-xl border border-zt-border">
                        {['heavy', 'light'].map((t) => (
                          <button
                            key={t}
                            onClick={() => saveResultPatch(currentAthlete.id, { tier: t })}
                            className={`py-2.5 rounded-lg font-black text-xs uppercase transition ${
                              (currentResult.tier || 'heavy') === t
                                ? 'bg-zt-primary text-zt-on-primary shadow'
                                : 'text-zt-muted'
                            }`}
                          >
                            {t === 'heavy'
                              ? `Heavy Bar (${currentEvent.divisionWeights[currentDivision.id]} lb)`
                              : `Light Bar (${currentEvent.divisionLightWeights?.[currentDivision.id]} lb)`}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <button
                        onClick={() =>
                          saveResultPatch(currentAthlete.id, {
                            reps: Math.max(0, (currentResult.reps || 0) - 1),
                            didNotStart: false,
                          })
                        }
                        className="w-24 h-20 rounded-2xl bg-zt-surface-2 border border-zt-border-strong text-3xl font-black active:scale-95"
                      >
                        -1
                      </button>

                      <div className="text-center">
                        <div className="text-6xl font-black text-zt-primary leading-none">
                          {currentResult.reps || 0}
                        </div>
                        <div className="text-[11px] uppercase font-extrabold text-zt-muted mt-1">
                          Locked Reps
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          saveResultPatch(currentAthlete.id, {
                            reps: (currentResult.reps || 0) + 1,
                            didNotStart: false,
                          })
                        }
                        className="w-32 h-20 rounded-2xl bg-emerald-500 text-emerald-950 text-2xl font-black shadow-lg active:scale-95"
                      >
                        +1 REP
                      </button>
                    </div>

                    {currentEvent.groundTouchWarning && (
                      <button
                        type="button"
                        aria-pressed={!!currentResult.groundTouchWarned}
                        onClick={() =>
                          saveResultPatch(currentAthlete.id, {
                            groundTouchWarned: !currentResult.groundTouchWarned,
                          })
                        }
                        className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-wide flex items-center justify-center gap-2 border transition active:scale-[0.98] ${
                          currentResult.groundTouchWarned
                            ? 'bg-red-600 text-white border-red-500 shadow-lg'
                            : 'bg-zt-inset text-zt-primary border-zt-primary/60'
                        }`}
                      >
                        <AlertTriangle className="w-4 h-4" />
                        {currentResult.groundTouchWarned
                          ? 'Ground-Touch Warning Issued (Tap to Clear)'
                          : 'Ground-Touch Warning'}
                      </button>
                    )}
                  </div>
                )}

                {/* EVENT TYPE 2: MAX WEIGHT (Rising Bar Grid + Custom Override) */}
                {currentEvent.scoringType === 'max_weight' && (
                  <div className="space-y-3">
                    {currentEvent.maxFormat === 'rising_bar' && currentEvent.risingBarWeights && (
                      <div>
                        <div className="text-[11px] font-extrabold uppercase text-zt-muted mb-2">
                          Rising Bar Weights (Tap to cycle: Pending → Good → Pass → Fail)
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {currentEvent.risingBarWeights.map((w) => {
                            const st = currentResult.risingBarAttempts?.[w] || 'pending';
                            const nextOrder = {
                              pending: 'good',
                              good: 'pass',
                              pass: 'fail',
                              fail: 'pending',
                            };
                            return (
                              <button
                                key={w}
                                onClick={() => {
                                  const nextMap = {
                                    ...(currentResult.risingBarAttempts || {}),
                                    [w]: nextOrder[st],
                                  };
                                  saveResultPatch(currentAthlete.id, {
                                    risingBarAttempts: nextMap,
                                    didNotStart: false,
                                  });
                                  setPitCrewCustomWeight(String(w));
                                }}
                                className={`p-3 rounded-xl border text-center transition active:scale-95 ${
                                  st === 'good'
                                    ? 'bg-emerald-600 border-emerald-400 text-white shadow'
                                    : st === 'fail'
                                    ? 'bg-red-700 border-red-400 text-white'
                                    : st === 'pass'
                                    ? 'bg-zt-surface-2 border-zt-primary text-zt-primary-2'
                                    : 'bg-zt-inset border-zt-border text-zt-text-2'
                                }`}
                              >
                                <div className="text-lg font-black">{w} lbs</div>
                                <div className="text-[10px] font-extrabold uppercase tracking-wider mt-0.5">
                                  {st}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="pt-1">
                      <label className="text-[11px] font-bold uppercase text-zt-muted">
                        Exact Max Weight Override (lbs)
                      </label>
                      <input
                        type="number"
                        placeholder="Or enter exact max lift in lbs..."
                        value={currentResult.maxWeightLbs || ''}
                        onChange={(e) =>
                          saveResultPatch(currentAthlete.id, {
                            maxWeightLbs: e.target.value ? Number(e.target.value) : 0,
                            didNotStart: false,
                          })
                        }
                        className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3.5 py-2.5 text-base font-bold text-zt-text"
                      />
                    </div>
                  </div>
                )}

                {/* EVENT TYPE 3: TIME OR DISTANCE (Yoke / Farmers / Truck Pull) */}
                {currentEvent.scoringType === 'time_or_distance' && (
                  <div className="space-y-3">
                    {showStopStamp && stopStampButton}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] font-extrabold uppercase text-zt-muted">
                          Finish Time (sec)
                        </label>
                        <div className="flex gap-1.5 mt-1">
                          <input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={currentResult.timeSeconds ?? ''}
                            onChange={(e) =>
                              saveResultPatch(currentAthlete.id, {
                                timeSeconds: e.target.value ? Number(e.target.value) : 0,
                                didNotStart: false,
                              })
                            }
                            className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2.5 text-base font-bold"
                          />
                          {!timerRunning && (
                            <button
                              onClick={() =>
                                saveResultPatch(currentAthlete.id, {
                                  timeSeconds: elapsedSeconds,
                                  didNotStart: false,
                                })
                              }
                              className="bg-zt-primary text-zt-on-primary px-3 rounded-xl font-black text-xs active:scale-95"
                            >
                              STAMP
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="text-[11px] font-extrabold uppercase text-zt-muted">
                          If DNF: Distance (ft)
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          placeholder="e.g. 42.5"
                          value={currentResult.distanceFeet ?? ''}
                          onChange={(e) =>
                            saveResultPatch(currentAthlete.id, {
                              distanceFeet: e.target.value ? Number(e.target.value) : 0,
                              didNotStart: false,
                            })
                          }
                          className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2.5 text-base font-bold"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* EVENT TYPE 4: STONES / MEDLEY (Implements + Split Tiebreaker) */}
                {currentEvent.scoringType === 'time_or_implements' && (
                  <div className="space-y-3">
                    {showStopStamp && stopStampButton}
                    <div className="flex items-center justify-between bg-zt-inset p-3 rounded-xl border border-zt-border">
                      <div>
                        <div className="text-[10px] text-zt-muted font-extrabold uppercase">
                          Stones / Implements
                        </div>
                        <div className="text-4xl font-black text-zt-primary">
                          {currentResult.implementsCompleted || 0}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            saveResultPatch(currentAthlete.id, {
                              implementsCompleted: Math.max(
                                0,
                                (currentResult.implementsCompleted || 0) - 1
                              ),
                            })
                          }
                          className="bg-zt-surface-2 text-zt-text-2 px-3 py-3 rounded-xl font-black text-sm"
                        >
                          -1
                        </button>
                        <button
                          onClick={() =>
                            saveResultPatch(currentAthlete.id, {
                              implementsCompleted: (currentResult.implementsCompleted || 0) + 1,
                              splitTimeSeconds: elapsedSeconds,
                              didNotStart: false,
                            })
                          }
                          className="bg-emerald-500 text-emerald-950 px-3.5 py-3 rounded-xl font-black text-xs active:scale-95"
                        >
                          +1 STONE &amp; STAMP SPLIT
                        </button>
                        {!timerRunning && (
                          <button
                            onClick={() =>
                              saveResultPatch(currentAthlete.id, {
                                implementsCompleted: 5,
                                timeSeconds: elapsedSeconds,
                                didNotStart: false,
                              })
                            }
                            className="bg-zt-primary text-zt-on-primary px-3 py-3 rounded-xl font-black text-xs active:scale-95"
                          >
                            FINISHED ALL
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[11px] text-zt-muted font-bold uppercase">
                          Last Split Tiebreaker (s)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={currentResult.splitTimeSeconds ?? ''}
                          onChange={(e) =>
                            saveResultPatch(currentAthlete.id, {
                              splitTimeSeconds: e.target.value ? Number(e.target.value) : undefined,
                            })
                          }
                          className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-zt-muted font-bold uppercase">
                          Full Course Finish (s)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={currentResult.timeSeconds ?? ''}
                          onChange={(e) =>
                            saveResultPatch(currentAthlete.id, {
                              timeSeconds: e.target.value ? Number(e.target.value) : undefined,
                            })
                          }
                          className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 font-bold"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </fieldset>

              {isLocked ? (
                <div className="flex flex-col gap-2 pt-1">
                  <button
                    type="button"
                    onClick={unlockScore}
                    className="w-full py-3.5 rounded-xl border-2 border-zt-border-strong bg-zt-inset text-zt-text font-black text-sm flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    <Unlock className="w-4 h-4" aria-hidden="true" />
                    Unlock to Edit
                  </button>
                  {nextRunItem && (
                    <button
                      type="button"
                      onClick={() => selectRunOrderItem(nextRunItem)}
                      className="w-full py-3 rounded-xl bg-zt-primary/15 border border-zt-primary/50 text-zt-primary font-extrabold text-sm flex items-center justify-center gap-2"
                    >
                      Go to {nextRunItem.athlete.name}
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={lockAndAdvance}
                  className="w-full py-4 rounded-xl bg-zt-primary text-zt-on-primary font-black text-base flex flex-col items-center justify-center gap-0.5 shadow-lg active:scale-[0.98] transition"
                >
                  <span className="flex items-center gap-2">
                    <Lock className="w-4 h-4" aria-hidden="true" />
                    Lock Score &amp; Advance to Next Athlete
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </span>
                  <span className="text-[11px] font-bold opacity-80">
                    {nextRunItem
                      ? `Up next: ${nextRunItem.athlete.name}`
                      : 'Last athlete in run order — locks score only'}
                  </span>
                </button>
              )}
            </div>

            {/* Second Head-to-Head Card for Lane 2 */}
            {currentEvent.lanes === 2 && lane2Athlete && lane2Result && (
              <div className="bg-zt-surface border-2 border-zt-secondary/70 rounded-2xl p-4 space-y-3 shadow-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider bg-zt-secondary text-zt-on-secondary px-2 py-0.5 rounded">
                      LANE 2 (HEAD-TO-HEAD)
                    </span>
                    <h2 className="text-xl font-black mt-1 text-zt-text">{lane2Athlete.name}</h2>
                  </div>

                  <select
                    value={lane2Athlete.id}
                    onChange={(e) => setLane2AthleteId(e.target.value)}
                    className="bg-zt-inset border border-zt-border-strong rounded-lg px-2 py-1 text-xs font-bold text-zt-secondary"
                  >
                    {divisionAthletes
                      .filter((a) => a.id !== currentAthlete.id)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          Pair: {a.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[11px] font-extrabold uppercase text-zt-muted">
                      Lane 2 Finish (sec)
                    </label>
                    <div className="flex gap-1.5 mt-1">
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={lane2Result.timeSeconds ?? ''}
                        onChange={(e) =>
                          saveResultPatch(lane2Athlete.id, {
                            timeSeconds: e.target.value ? Number(e.target.value) : 0,
                          })
                        }
                        className="w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2.5 text-base font-bold"
                      />
                      <button
                        onClick={() =>
                          saveResultPatch(lane2Athlete.id, {
                            timeSeconds: elapsedSeconds,
                          })
                        }
                        className="bg-zt-secondary text-zt-on-secondary px-3 rounded-xl font-black text-xs active:scale-95"
                      >
                        STAMP
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-extrabold uppercase text-zt-muted">
                      If DNF: Distance (ft)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="e.g. 51.0"
                      value={lane2Result.distanceFeet ?? ''}
                      onChange={(e) =>
                        saveResultPatch(lane2Athlete.id, {
                          distanceFeet: e.target.value ? Number(e.target.value) : 0,
                        })
                      }
                      className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2.5 text-base font-bold"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 2: PIT CREW LOADER VIEW                                      */}
        {/* ================================================================ */}
        {activeTab === 'pitcrew' && (
          <div className="space-y-4">
            {/* Up Now & On Deck Athlete Rack / Pin Height Callout Banner */}
            {currentEvent.hasHeightCallout && currentAthlete && (
              <div className="bg-zt-surface border-2 border-zt-primary rounded-2xl p-4 space-y-3 shadow-lg">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black uppercase tracking-wider text-zt-primary">
                    {currentEvent.heightLabel || 'Implement Rack / Pin Height'}
                  </span>
                  <span className="text-[11px] font-bold text-zt-muted">
                    {currentDivision.name}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="bg-zt-inset border border-zt-primary/60 rounded-xl p-3">
                    <div className="text-[10px] font-extrabold uppercase text-zt-primary">
                      UP NOW • {currentAthlete.name}
                    </div>
                    <div className="text-xl font-black text-zt-text mt-0.5">{upNowPinHeight}</div>
                  </div>

                  <div className="bg-zt-inset border border-zt-border rounded-xl p-3">
                    <div className="text-[10px] font-extrabold uppercase text-zt-muted">
                      ON DECK • {nextRunItem ? nextRunItem.athlete.name : 'End of Division'}
                    </div>
                    <div className="text-xl font-black text-zt-text-2 mt-0.5">
                      {onDeckPinHeight || '—'}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-extrabold uppercase text-zt-muted">
                    Update {currentAthlete.name}&apos;s Personal Pin / Height Override
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Pin 14 (6'4&quot;) or 48&quot; Bar..."
                    value={currentAthlete.rackHeights?.[currentEvent.id] || ''}
                    onChange={(e) =>
                      updateAthleteRackPin(currentAthlete.id, currentEvent.id, e.target.value)
                    }
                    className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-sm font-bold text-zt-text"
                  />
                </div>
              </div>
            )}

            <div className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-4">
              <div className="flex justify-between items-start gap-2">
                <div>
                  <span className="text-xs font-extrabold uppercase text-zt-primary">
                    {plateLoad.callOutLabel}
                  </span>
                  <h2 className="text-xl font-black text-zt-text mt-0.5">{currentEvent.name}</h2>
                </div>
                <div className="text-right bg-zt-inset px-3 py-1.5 rounded-xl border border-zt-border">
                  <div className="text-[10px] uppercase font-bold text-zt-muted">Empty Tare</div>
                  <div className="text-base font-black text-zt-text">
                    {currentEvent.implementEmptyWeight} lbs
                  </div>
                </div>
              </div>

              {currentEvent.hasTrumpWeight && (
                <div className="grid grid-cols-2 gap-2 bg-zt-inset p-1.5 rounded-xl border border-zt-border">
                  <button
                    onClick={() => {
                      setPitCrewUseLightTier(false);
                      setPitCrewCustomWeight('');
                    }}
                    className={`py-2.5 rounded-lg font-black text-xs uppercase ${
                      !pitCrewUseLightTier ? 'bg-zt-primary text-zt-on-primary' : 'text-zt-muted'
                    }`}
                  >
                    Heavy Bar ({currentEvent.divisionWeights[currentDivision.id]} lbs)
                  </button>
                  <button
                    onClick={() => {
                      setPitCrewUseLightTier(true);
                      setPitCrewCustomWeight('');
                    }}
                    className={`py-2.5 rounded-lg font-black text-xs uppercase ${
                      pitCrewUseLightTier ? 'bg-zt-primary text-zt-on-primary' : 'text-zt-muted'
                    }`}
                  >
                    Light Bar ({currentEvent.divisionLightWeights?.[currentDivision.id]} lbs)
                  </button>
                </div>
              )}

              {pitCrewCallout && (
                <div className="rounded-2xl border-2 border-zt-primary bg-zt-primary/10 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-zt-primary">
                      {currentEvent.pitCrewCallout.title}
                    </span>
                    <span className="text-[11px] font-black uppercase bg-zt-primary text-zt-on-primary px-2 py-0.5 rounded-md">
                      {currentDivision.name} • Flight {currentDivision.flight}
                    </span>
                  </div>
                  <div className="text-2xl font-black text-zt-text leading-tight text-balance">
                    {pitCrewCallout.headline}
                  </div>
                  {pitCrewCallout.stats?.length > 0 && (
                    <div className="grid grid-cols-2 gap-2.5">
                      {pitCrewCallout.stats.map((s) => (
                        <div
                          key={s.label}
                          className="bg-zt-inset border border-zt-border rounded-xl p-3"
                        >
                          <div className="text-[11px] uppercase font-extrabold text-zt-muted">
                            {s.label}
                          </div>
                          <div className="text-xl font-black text-zt-primary mt-0.5 leading-tight">
                            {s.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {currentEvent.loadingPoints === 0 ? (
                pitCrewCallout ? null : (
                  <div className="bg-zt-inset border border-zt-border rounded-xl p-4">
                    <div className="text-xs uppercase font-extrabold text-zt-primary">
                      Fixed Implement Layout (No Plate Math)
                    </div>
                    <div className="text-lg font-black mt-1 text-zt-text">
                      {currentEvent.fixedImplementDescription ||
                        `Load ${plateLoad.targetInputWeight} lb Implement`}
                    </div>
                  </div>
                )
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 bg-zt-inset p-4 rounded-xl border border-zt-border">
                    <div>
                      <div className="text-[11px] text-zt-muted uppercase font-extrabold">
                        {currentEvent.weightIsAddedPlatesOnly
                          ? 'Added Plate Weight'
                          : currentEvent.weightEntryMode === 'per_hand'
                          ? 'Target Per Hand'
                          : 'Target Total Weight'}
                      </div>
                      <div className="text-3xl font-black text-zt-text mt-0.5">
                        {plateLoad.targetInputWeight} lbs
                      </div>
                      {plateLoad.collarWeightApplied > 0 && (
                        <div className="text-[11px] text-zt-muted mt-0.5">
                          Includes {plateLoad.collarWeightApplied} lb collars
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] text-zt-primary uppercase font-extrabold">
                        Load {plateLoad.callOutLabel}
                      </div>
                      <div className="text-3xl font-black text-zt-primary mt-0.5">
                        {plateLoad.weightPerLoadingPoint} lbs
                      </div>
                      <div className="text-[11px] text-zt-muted mt-0.5">
                        Total System: {plateLoad.totalSystemWeight} lbs
                      </div>
                    </div>
                  </div>

                  {/* Visual Plate Stack */}
                  <div className="space-y-2">
                    <div className="text-xs font-extrabold uppercase text-zt-muted">
                      Plates on EACH Loading Point ({plateLoad.loadingPoints} Points Total):
                    </div>
                    {plateLoad.platesPerPoint.length === 0 ? (
                      <div className="p-4 bg-zt-inset rounded-xl border border-zt-border text-zt-muted font-bold text-sm">
                        Empty Implement Only (No Plates Needed)
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2.5">
                        {plateLoad.platesPerPoint.map((p) => (
                          <div
                            key={p.weight}
                            className="bg-zt-primary text-zt-on-primary px-4 py-3 rounded-2xl font-black flex items-center gap-2 shadow-md"
                          >
                            <span className="text-2xl">{p.count}×</span>
                            <span className="text-xl">{p.weight} lb</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Custom Weight Tester Input */}
                  <div className="pt-2 border-t border-zt-border">
                    <label className="text-[11px] font-extrabold uppercase text-zt-muted">
                      Custom Target Weight Override (Test Rising Bar / Odd Yoke Jumps)
                    </label>
                    <div className="flex gap-2 mt-1">
                      <input
                        type="number"
                        placeholder="Enter any target weight in lbs..."
                        value={pitCrewCustomWeight}
                        onChange={(e) => setPitCrewCustomWeight(e.target.value)}
                        className="flex-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-sm font-bold"
                      />
                      {pitCrewCustomWeight && (
                        <button
                          onClick={() => setPitCrewCustomWeight('')}
                          className="px-3 py-2 rounded-xl bg-zt-surface-2 text-xs font-bold"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {plateLoad.warningMessage && (
                    <div className="p-3.5 rounded-xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold flex items-start gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-zt-danger flex-shrink-0 mt-0.5" />
                      <span>{plateLoad.warningMessage}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Next Group / Lifter Transition */}
            <section
              aria-label="Next group transition"
              className="bg-zt-surface border-2 border-zt-secondary/60 rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Shuffle className="w-4 h-4 text-zt-secondary" aria-hidden="true" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-zt-text">
                    Next Group / Lifter Transition
                  </h3>
                </div>
                {nextSetup && (
                  <span className="text-[10px] font-black uppercase tracking-wider bg-zt-secondary text-zt-on-secondary px-2 py-0.5 rounded">
                    {nextSetup.event.id === currentEvent.id
                      ? nextSetup.division.name
                      : `Ev ${nextSetup.event.eventNumber} • ${nextSetup.division.name}`}
                  </span>
                )}
              </div>

              {nextRunItem && nextRunItem.athlete.divisionId === currentDivision.id && (
                <div className="text-xs font-bold text-zt-muted bg-zt-inset border border-zt-border rounded-xl px-3 py-2">
                  Next lifter:{' '}
                  <span className="text-zt-text font-black">{nextRunItem.athlete.name}</span> —
                  same {currentDivision.name} weight setup
                  {onDeckPinHeight && onDeckPinHeight !== upNowPinHeight
                    ? ` (Pin changes: ${upNowPinHeight} → ${onDeckPinHeight})`
                    : ', no change.'}
                </div>
              )}

              {nextSetup ? (
                <ul className="space-y-2">
                  {transitionRows.map((row) => (
                    <li
                      key={row.label}
                      className={`rounded-xl border px-3 py-2.5 flex flex-col gap-1 ${
                        row.changed
                          ? 'bg-zt-secondary/10 border-zt-secondary/50'
                          : 'bg-zt-inset border-zt-border'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-zt-muted">
                          {row.label}
                        </span>
                        <span
                          className={`text-xs font-black ${
                            row.changed ? 'text-zt-secondary' : 'text-zt-subtle'
                          }`}
                        >
                          {row.delta}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-bold text-zt-text min-w-0">
                        <span className="truncate text-zt-muted">{row.from}</span>
                        <ArrowRight
                          className="w-3.5 h-3.5 flex-shrink-0 text-zt-subtle"
                          aria-hidden="true"
                        />
                        <span className="truncate font-black">{row.to}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs font-bold text-zt-muted">
                  Final group of the final event on this station — no further changeover.
                </p>
              )}
            </section>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 3: LIVE LEADERBOARD & EVENT STANDINGS                        */}
        {/* ================================================================ */}
        {activeTab === 'standings' && (
          <div className="space-y-4">
            <div className="bg-zt-surface border border-zt-border rounded-2xl p-4">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-base font-black text-zt-primary uppercase tracking-wide">
                  Overall Standings • {currentDivision.name}
                </h2>
                <span className="text-[11px] font-bold text-zt-muted">
                  Tiebreaker: {meet.tiebreakerRule === 'event_wins' ? 'Event Wins' : 'Final Event'}
                </span>
              </div>

              <div className="space-y-2">
                {overallStandings.map((row) => (
                  <div
                    key={row.athleteId}
                    className="bg-zt-inset border border-zt-border rounded-xl p-3 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-black px-2 py-0.5 rounded ${
                            row.overallPlace === 1
                              ? 'bg-zt-primary text-zt-on-primary'
                              : 'bg-zt-surface-2 text-zt-text-2'
                          }`}
                        >
                          #{row.overallPlace}
                        </span>
                        <span className="font-black text-base text-zt-text">{row.athleteName}</span>
                        {row.status === 'withdrawn' && (
                          <span className="text-[10px] bg-zt-danger text-white px-1.5 py-0.5 rounded font-extrabold">
                            SCRATCHED
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zt-muted mt-1">
                        Event Wins: <strong className="text-zt-text-2">{row.eventWins}</strong>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-2xl font-black text-zt-primary">{row.totalPoints}</div>
                      <div className="text-[10px] uppercase text-zt-muted font-bold">Total Pts</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-zt-surface border border-zt-border rounded-2xl p-4">
              <h3 className="text-xs font-extrabold uppercase text-zt-muted mb-3">
                Event {currentEvent.eventNumber} Breakdown • {currentEvent.name}
              </h3>
              <div className="space-y-2">
                {eventScores.map((s) => (
                  <div
                    key={s.athleteId}
                    className="flex justify-between items-center bg-zt-inset px-3.5 py-2.5 rounded-xl border border-zt-border text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-black text-zt-muted">#{s.place}</span>
                      <span className="font-bold text-zt-text">{s.athleteName}</span>
                      {s.isTied && (
                        <span className="text-[10px] bg-zt-primary/20 text-zt-primary-2 px-1.5 py-0.5 rounded font-bold">
                          TIE SPLIT
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-zt-muted font-mono text-xs">{s.displayScore}</span>
                      <span className="font-black text-zt-primary min-w-[48px] text-right">
                        {s.points} pts
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 4: MEET SETUP, VOLUNTEER LOCK, THEMES & ROSTER               */}
        {/* ================================================================ */}
        {activeTab === 'setup' && roleLock === 'admin' && (
          <div className="space-y-4">
            <div className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-4">
              {/* Volunteer Phone Role Lock */}
              <div className="bg-zt-inset border border-zt-border rounded-xl p-3 space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-extrabold uppercase text-zt-primary flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    Volunteer Phone Role Lock
                  </span>
                  <span className="text-[10px] font-bold text-zt-muted">
                    Unlock PIN: {meet.adminPin || '1050'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => lockDeviceToRole('judge')}
                    className="py-2.5 px-2 rounded-xl font-black text-xs bg-zt-surface border border-zt-primary/60 text-zt-text active:scale-95"
                  >
                    Lock Judge
                  </button>
                  <button
                    type="button"
                    onClick={() => lockDeviceToRole('pitcrew')}
                    className="py-2.5 px-2 rounded-xl font-black text-xs bg-zt-surface border border-zt-secondary/60 text-zt-text active:scale-95"
                  >
                    Lock Pit Crew
                  </button>
                  <button
                    type="button"
                    onClick={() => lockDeviceToRole('spectator')}
                    className="py-2.5 px-2 rounded-xl font-black text-xs bg-zt-surface border border-zt-border-strong text-zt-text active:scale-95"
                  >
                    Lock Spectator
                  </button>
                </div>
              </div>

              {/* Promoter Theme */}
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    id="theme-picker-label"
                    className="text-xs font-extrabold uppercase text-zt-muted flex items-center gap-1.5"
                  >
                    <Palette className="w-3.5 h-3.5" aria-hidden="true" />
                    Promoter Theme
                  </span>
                  <span className="text-[10px] font-bold text-zt-subtle">
                    {THEMES.find((t) => t.id === themeId)?.name}
                  </span>
                </div>
                <div
                  role="radiogroup"
                  aria-labelledby="theme-picker-label"
                  className="grid grid-cols-2 gap-2 mt-1.5"
                >
                  {THEMES.map((t) => {
                    const active = t.id === themeId;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => selectTheme(t.id)}
                        className={`p-2 rounded-xl border-2 text-left flex items-center gap-2.5 bg-zt-inset transition active:scale-[0.98] ${
                          active ? 'border-zt-primary' : 'border-zt-border'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="w-11 h-11 rounded-lg flex-shrink-0 flex flex-col justify-end gap-1 p-1.5 border border-black/20"
                          style={{ backgroundColor: t.surface }}
                        >
                          <span
                            className="h-1.5 rounded-full w-full"
                            style={{ backgroundColor: t.primary }}
                          />
                          <span
                            className="h-1.5 rounded-full w-2/3"
                            style={{ backgroundColor: t.secondary }}
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-black text-zt-text truncate">
                            {t.name}
                          </span>
                          <span className="block text-[10px] font-bold text-zt-muted leading-tight">
                            {t.tagline}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Switch Meet Preset */}
              <div>
                <label className="text-xs font-extrabold uppercase text-zt-muted">
                  Switch Meet Preset
                </label>
                <div
                  role="radiogroup"
                  aria-label="Meet preset"
                  className="grid grid-cols-2 gap-2 mt-1.5"
                >
                  {MEET_PRESETS.map((preset) => {
                    const active = (meet.presetId ?? DEFAULT_PRESET_ID) === preset.id;
                    return (
                      <button
                        key={preset.id}
                        role="radio"
                        aria-checked={active}
                        onClick={() => requestMeetPreset(preset.id)}
                        className={`py-2.5 px-3 rounded-xl text-left border transition ${
                          active
                            ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                            : 'bg-zt-inset text-zt-text-2 border-zt-border'
                        }`}
                      >
                        <span className="block font-black text-xs leading-tight">
                          {preset.label}
                        </span>
                        <span
                          className={`block text-[10px] font-bold mt-0.5 ${
                            active ? 'text-zt-on-primary/70' : 'text-zt-muted'
                          }`}
                        >
                          {preset.sublabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {pendingPresetId && (
                  <div className="mt-2 p-3 rounded-xl bg-zt-danger/10 border border-zt-danger/60 space-y-2">
                    <p className="text-xs font-bold text-zt-danger-text">
                      Switching presets clears all {results.length} recorded score
                      {results.length === 1 ? '' : 's'} for this meet.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => loadMeetPreset(pendingPresetId)}
                        className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-black text-xs uppercase"
                      >
                        Switch &amp; Clear Scores
                      </button>
                      <button
                        onClick={() => setPendingPresetId(null)}
                        className="px-4 py-2.5 rounded-xl bg-zt-surface-2 text-zt-text-2 font-bold text-xs uppercase"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <h2 className="text-base font-black text-zt-primary uppercase tracking-wide pt-2 border-t border-zt-border">
                Meet Rules &amp; Plate Inventory
              </h2>

              {/* Run Order Methodology Toggle */}
              <div>
                <label className="text-xs font-extrabold uppercase text-zt-muted">
                  Run Order Methodology (Events 2–5)
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {[
                    ['reverse_overall', 'Reverse Overall Pts'],
                    ['reverse_previous_event', 'Reverse Prev Event'],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => updateMeetConfig({ runOrderMethod: val })}
                      className={`py-2.5 px-3 rounded-xl font-black text-xs border transition ${
                        meet.runOrderMethod === val
                          ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                          : 'bg-zt-inset text-zt-text-2 border-zt-border'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tiebreaker Rule Toggle */}
              <div>
                <label className="text-xs font-extrabold uppercase text-zt-muted">
                  Overall Podium Tiebreaker
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  {[
                    ['event_wins', 'Most Event Wins'],
                    ['final_event', 'Final Event Score'],
                  ].map(([val, label]) => (
                    <button
                      key={val}
                      onClick={() => updateMeetConfig({ tiebreakerRule: val })}
                      className={`py-2.5 px-3 rounded-xl font-black text-xs border transition ${
                        meet.tiebreakerRule === val
                          ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                          : 'bg-zt-inset text-zt-text-2 border-zt-border'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gym Plate Inventory Toggles */}
              <div>
                <label className="text-xs font-extrabold uppercase text-zt-muted">
                  Available Gym Plates (Tap to Enable/Disable)
                </label>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {ALL_POSSIBLE_PLATES.map((plate) => {
                    const active = meet.availablePlates.includes(plate);
                    return (
                      <button
                        key={plate}
                        onClick={() => toggleGymPlate(plate)}
                        className={`px-3 py-2 rounded-xl text-xs font-black border ${
                          active
                            ? 'bg-emerald-500 text-emerald-950 border-emerald-400'
                            : 'bg-zt-inset text-zt-muted border-zt-border'
                        }`}
                      >
                        {plate} lb
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Collar Weight Input & Current Event Division Target Weight */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-zt-muted">
                    Collar Weight / Pair (lbs)
                  </label>
                  <input
                    type="number"
                    value={meet.collarWeightPerPair}
                    onChange={(e) =>
                      updateMeetConfig({ collarWeightPerPair: Number(e.target.value) || 0 })
                    }
                    className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-extrabold uppercase text-zt-muted">
                    {currentDivision.name} Ev {currentEvent.eventNumber} Wt
                  </label>
                  <input
                    type="number"
                    value={currentEvent.divisionWeights[currentDivision.id] || 0}
                    onChange={(e) =>
                      updateEventDivisionWeight(
                        currentEvent.id,
                        currentDivision.id,
                        e.target.value
                      )
                    }
                    className="w-full mt-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 font-bold text-zt-primary"
                  />
                </div>
              </div>

              {/* Add Athlete to Active Division */}
              <form onSubmit={addNewAthleteToDivision} className="pt-2 border-t border-zt-border">
                <label className="text-xs font-extrabold uppercase text-zt-muted">
                  Add Athlete to {currentDivision.name}
                </label>
                <div className="flex gap-2 mt-1.5">
                  <input
                    type="text"
                    placeholder="Enter athlete full name..."
                    value={newAthleteName}
                    onChange={(e) => setNewAthleteName(e.target.value)}
                    className="flex-1 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-sm font-bold"
                  />
                  <button
                    type="submit"
                    className="bg-zt-primary text-zt-on-primary px-4 py-2 rounded-xl font-black text-xs uppercase flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" /> Add
                  </button>
                </div>
              </form>

              {/* Reset Demo Meet */}
              <div className="pt-2 border-t border-zt-border">
                {!resetConfirmOpen ? (
                  <button
                    onClick={() => setResetConfirmOpen(true)}
                    className="w-full py-3 rounded-xl bg-zt-danger/10 border border-zt-danger/60 text-zt-danger-text font-extrabold text-xs uppercase flex items-center justify-center gap-2"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Reset All Demo Meet Scores &amp; Data
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadMeetPreset(meet.presetId ?? DEFAULT_PRESET_ID)}
                      className="flex-1 py-3 rounded-xl bg-red-600 text-white font-black text-xs uppercase"
                    >
                      Confirm Full Reset
                    </button>
                    <button
                      onClick={() => setResetConfirmOpen(false)}
                      className="px-4 py-3 rounded-xl bg-zt-surface-2 text-zt-text-2 font-bold text-xs uppercase"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Thumb-Zone Navigation Bar (Filtered by Volunteer Role Lock) */}
      <nav className="fixed bottom-0 inset-x-0 bg-zt-surface/95 backdrop-blur border-t border-zt-border z-30">
        <div className="max-w-xl mx-auto flex justify-around">
          {[
            { id: 'judge', label: 'Judge Pad', icon: ClipboardCheck, roles: ['admin', 'judge'] },
            { id: 'pitcrew', label: 'Pit Crew', icon: Dumbbell, roles: ['admin', 'pitcrew', 'judge'] },
            {
              id: 'standings',
              label: 'Standings',
              icon: Trophy,
              roles: ['admin', 'judge', 'pitcrew', 'spectator'],
            },
            { id: 'setup', label: 'Meet Setup', icon: Settings, roles: ['admin'] },
          ]
            .filter((tab) => tab.roles.includes(roleLock))
            .map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex-1 py-2.5 flex flex-col items-center justify-center gap-1 transition ${
                    active
                      ? 'text-zt-primary border-t-2 border-zt-primary bg-zt-inset/60'
                      : 'text-zt-muted hover:text-zt-text-2'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wider">
                    {label}
                  </span>
                </button>
              );
            })}
        </div>
      </nav>
    </div>
  );
}