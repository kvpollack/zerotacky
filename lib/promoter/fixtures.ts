// Seeded fixtures for the Promoter Dashboard and Athlete Registration flows.
// Privacy rule: Uses only obviously fictional athlete names (Alex Sample, Blake Demo, etc.).
// Never copies real athlete names from lib/presets/strongfest.ts or york.ts.

import {
  addAthlete,
  addDivision,
  addEvent,
  createBlankMeet,
  updateDivision,
} from '../meetBuilder';
import type {
  PromoterMeetDetail,
  PromoterUser,
  RegistrationRequest,
} from './contract';
import type { AppState } from '../types';

export const DEMO_PROMOTER_USER: PromoterUser = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'promoter.demo@zerotacky.example',
  displayName: 'Keystone Iron Promotions (Demo)',
  roles: {
    athlete: true,
    promoter: true,
    gymOwner: true,
  },
};

function buildUpcomingMeetState(): AppState {
  let s = createBlankMeet('Iron Furnace Classic 2026', '2026-11-14');
  s = {
    ...s,
    meet: {
      ...s.meet,
      id: 'srv-meet-upcoming-1',
      slug: 'iron-furnace-classic-2026',
      isDemo: false,
      collarWeightPerPair: 5,
      adminPin: '1050',
    },
  };

  s = addDivision(s, { id: 'ifc-g1', name: 'Group 1 (Novice / Open Light)', flight: 'A' });
  s = addDivision(s, { id: 'ifc-g2', name: 'Group 2 (Middleweight 105kg)', flight: 'A' });
  s = addDivision(s, { id: 'ifc-g3', name: 'Group 3 (Heavyweight Open)', flight: 'B' });

  s = addEvent(s, {
    id: 'ifc-ev-1',
    name: '12" Log Clean & Press (For Reps)',
    scoringType: 'reps',
    timeCapSeconds: 60,
    lanes: 1,
    loadingPoints: 2,
    weightEntryMode: 'total',
    implementEmptyWeight: 135,
    divisionWeights: { 'ifc-g1': 185, 'ifc-g2': 245, 'ifc-g3': 285 },
    hasTrumpWeight: true,
    divisionLightWeights: { 'ifc-g1': 155, 'ifc-g2': 205, 'ifc-g3': 245 },
    hasHeightCallout: true,
    heightLabel: 'Log Clean / Rack Pin',
  });

  s = addEvent(s, {
    id: 'ifc-ev-2',
    name: 'Axle Wagon Wheel Deadlift (For Reps)',
    scoringType: 'reps',
    timeCapSeconds: 60,
    lanes: 1,
    loadingPoints: 2,
    weightEntryMode: 'total',
    implementEmptyWeight: 75,
    divisionWeights: { 'ifc-g1': 405, 'ifc-g2': 525, 'ifc-g3': 635 },
    hasTrumpWeight: false,
    groundTouchWarning: true,
  });

  s = addEvent(s, {
    id: 'ifc-ev-3',
    name: '60ft Head-to-Head Yoke Walk',
    scoringType: 'time_or_distance',
    timeCapSeconds: 60,
    lanes: 2,
    loadingPoints: 4,
    weightEntryMode: 'total',
    implementEmptyWeight: 185,
    divisionWeights: { 'ifc-g1': 485, 'ifc-g2': 625, 'ifc-g3': 745 },
    hasTrumpWeight: false,
    hasHeightCallout: true,
    heightLabel: 'Yoke Crossbar Pin',
  });

  s = addEvent(s, {
    id: 'ifc-ev-4',
    name: '5-Stone Atlas Series',
    scoringType: 'time_or_implements',
    implementCount: 5,
    timeCapSeconds: 60,
    lanes: 1,
    loadingPoints: 0,
    weightEntryMode: 'total',
    implementEmptyWeight: 0,
    divisionWeights: { 'ifc-g1': 240, 'ifc-g2': 300, 'ifc-g3': 360 },
    fixedImplementDescription: '5-stone progression to 52" yoke crossbar',
    hasTrumpWeight: false,
  });

  // Two already-accepted roster entries
  s = addAthlete(s, {
    id: 'ifc-ath-1',
    divisionId: 'ifc-g1',
    name: 'Alex Sample (Fake)',
    lotNumber: 1,
    status: 'active',
  });
  s = addAthlete(s, {
    id: 'ifc-ath-2',
    divisionId: 'ifc-g2',
    name: 'Blake Demo (Fake)',
    lotNumber: 1,
    status: 'active',
  });

  return s;
}

function buildLiveMeetState(): AppState {
  let s = createBlankMeet('Steel River Showdown 2026', '2026-10-16');
  s = {
    ...s,
    meet: {
      ...s.meet,
      id: 'srv-meet-live-2',
      slug: 'steel-river-showdown-2026',
      isDemo: false,
      collarWeightPerPair: 5,
      adminPin: '1050',
    },
  };

  s = addDivision(s, { id: 'srs-d1', name: 'Open 105kg', flight: 'A' });
  s = addDivision(s, { id: 'srs-d2', name: 'Open 82kg', flight: 'B' });
  s = updateDivision(s, 'srs-d1', { sortOrder: 1 });
  s = updateDivision(s, 'srs-d2', { sortOrder: 2 });

  s = addEvent(s, {
    id: 'srs-ev-1',
    name: '12" Log Clean & Press',
    scoringType: 'reps',
    timeCapSeconds: 60,
    lanes: 1,
    loadingPoints: 2,
    weightEntryMode: 'total',
    implementEmptyWeight: 135,
    divisionWeights: { 'srs-d1': 255, 'srs-d2': 165 },
  });

  s = addEvent(s, {
    id: 'srs-ev-2',
    name: '60ft Farmers Walk',
    scoringType: 'time_or_distance',
    timeCapSeconds: 60,
    lanes: 2,
    loadingPoints: 4,
    weightEntryMode: 'per_hand',
    implementEmptyWeight: 25,
    divisionWeights: { 'srs-d1': 265, 'srs-d2': 175 },
  });

  s = addAthlete(s, { id: 'srs-a1', divisionId: 'srs-d1', name: 'Casey Placeholder (Fake)', lotNumber: 1 });
  s = addAthlete(s, { id: 'srs-a2', divisionId: 'srs-d1', name: 'Drew Fictional (Fake)', lotNumber: 2 });
  s = addAthlete(s, { id: 'srs-a3', divisionId: 'srs-d2', name: 'Ellis Mock (Fake)', lotNumber: 1 });
  s = addAthlete(s, { id: 'srs-a4', divisionId: 'srs-d2', name: 'Finley Test (Fake)', lotNumber: 2 });

  s = {
    ...s,
    results: [
      { id: 'srs-ev-1_srs-a1', eventId: 'srs-ev-1', athleteId: 'srs-a1', reps: 8, locked: true, updatedAt: 1760630000000 },
      { id: 'srs-ev-1_srs-a2', eventId: 'srs-ev-1', athleteId: 'srs-a2', reps: 6, locked: true, updatedAt: 1760630100000 },
      { id: 'srs-ev-1_srs-a3', eventId: 'srs-ev-1', athleteId: 'srs-a3', reps: 7, locked: true, updatedAt: 1760630200000 },
    ],
  };

  return s;
}

function buildCompletedMeetState(): AppState {
  let s = createBlankMeet('Susquehanna Summer Anvil 2026', '2026-07-18');
  s = {
    ...s,
    meet: {
      ...s.meet,
      id: 'srv-meet-completed-3',
      slug: 'susquehanna-summer-anvil-2026',
      isDemo: false,
      collarWeightPerPair: 0,
      adminPin: '1050',
    },
  };

  s = addDivision(s, { id: 'ssa-d1', name: 'Middleweight 100kg', flight: 'A' });
  s = addDivision(s, { id: 'ssa-d2', name: 'Masters Heavyweight', flight: 'A' });

  s = addEvent(s, {
    id: 'ssa-ev-1',
    name: 'Circus Dumbbell For Reps',
    scoringType: 'reps',
    timeCapSeconds: 60,
    lanes: 1,
    loadingPoints: 0,
    weightEntryMode: 'total',
    implementEmptyWeight: 0,
    divisionWeights: { 'ssa-d1': 135, 'ssa-d2': 155 },
    fixedImplementDescription: '135 lb / 155 lb fixed Circus Dumbbell',
  });

  s = addEvent(s, {
    id: 'ssa-ev-2',
    name: '5-Stone Atlas Series',
    scoringType: 'time_or_implements',
    implementCount: 5,
    timeCapSeconds: 60,
    lanes: 1,
    loadingPoints: 0,
    weightEntryMode: 'total',
    implementEmptyWeight: 0,
    divisionWeights: { 'ssa-d1': 320, 'ssa-d2': 350 },
    fixedImplementDescription: '220–350 lb Atlas Stones to 52" Crossbar',
  });

  s = addAthlete(s, { id: 'ssa-a1', divisionId: 'ssa-d1', name: 'Gray Example (Fake)', lotNumber: 1 });
  s = addAthlete(s, { id: 'ssa-a2', divisionId: 'ssa-d1', name: 'Harper Standin (Fake)', lotNumber: 2 });
  s = addAthlete(s, { id: 'ssa-a3', divisionId: 'ssa-d2', name: 'Indigo Bogus (Fake)', lotNumber: 1 });

  s = {
    ...s,
    results: [
      { id: 'ssa-ev-1_ssa-a1', eventId: 'ssa-ev-1', athleteId: 'ssa-a1', reps: 6, locked: true, updatedAt: 1752860000000 },
      { id: 'ssa-ev-1_ssa-a2', eventId: 'ssa-ev-1', athleteId: 'ssa-a2', reps: 4, locked: true, updatedAt: 1752860100000 },
      { id: 'ssa-ev-2_ssa-a1', eventId: 'ssa-ev-2', athleteId: 'ssa-a1', implementsCompleted: 5, timeSeconds: 26.4, locked: true, updatedAt: 1752861000000 },
      { id: 'ssa-ev-2_ssa-a2', eventId: 'ssa-ev-2', athleteId: 'ssa-a2', implementsCompleted: 4, splitTimeSeconds: 38.1, locked: true, updatedAt: 1752861100000 },
      { id: 'ssa-ev-1_ssa-a3', eventId: 'ssa-ev-1', athleteId: 'ssa-a3', reps: 5, locked: true, updatedAt: 1752862000000 },
      { id: 'ssa-ev-2_ssa-a3', eventId: 'ssa-ev-2', athleteId: 'ssa-a3', implementsCompleted: 5, timeSeconds: 31.2, locked: true, updatedAt: 1752862100000 },
    ],
  };

  return s;
}

export function createSeedMeets(): PromoterMeetDetail[] {
  const upcomingState = buildUpcomingMeetState();
  const liveState = buildLiveMeetState();
  const completedState = buildCompletedMeetState();

  return [
    {
      summary: {
        serverId: 'srv-meet-upcoming-1',
        slug: 'iron-furnace-classic-2026',
        name: upcomingState.meet.name,
        date: upcomingState.meet.date,
        listing: {
          competitionStatus: 'upcoming',
          registrationStatus: 'open',
          resultsStatus: 'not_started',
          isPublicListed: true,
          venue: {
            facilityName: 'Keystone Iron Barn',
            streetAddress: '450 Foundry Way',
            city: 'York',
            state: 'PA',
            postalCode: '17404',
            country: 'US',
          },
          federation: 'USS (United States Strongman)',
          entryFeeDisplay: '$80 (collected by promoter after registration approval)',
          registrationDeadline: '2026-11-07',
          athleteCap: 40,
        },
        divisionCount: upcomingState.divisions.length,
        athleteCount: upcomingState.athletes.length,
        registrationCount: 7,
        updatedAt: '2026-10-16T18:00:00.000Z',
        joinCode: 'FRNC26',
      },
      state: upcomingState,
    },
    {
      summary: {
        serverId: 'srv-meet-live-2',
        slug: 'steel-river-showdown-2026',
        name: liveState.meet.name,
        date: liveState.meet.date,
        listing: {
          competitionStatus: 'live',
          registrationStatus: 'closed',
          resultsStatus: 'in_progress',
          isPublicListed: true,
          venue: {
            facilityName: 'Riverfront Barbell Warehouse',
            streetAddress: '112 Dock St',
            city: 'Harrisburg',
            state: 'PA',
            postalCode: '17101',
            country: 'US',
          },
          federation: 'Strongman Corporation',
          entryFeeDisplay: '$85',
          registrationDeadline: '2026-10-09',
          athleteCap: 30,
        },
        divisionCount: liveState.divisions.length,
        athleteCount: liveState.athletes.length,
        registrationCount: 4,
        updatedAt: '2026-10-16T19:30:00.000Z',
        joinCode: 'RIVR88',
      },
      state: liveState,
    },
    {
      summary: {
        serverId: 'srv-meet-completed-3',
        slug: 'susquehanna-summer-anvil-2026',
        name: completedState.meet.name,
        date: completedState.meet.date,
        listing: {
          competitionStatus: 'completed',
          registrationStatus: 'closed',
          resultsStatus: 'final',
          isPublicListed: true,
          venue: {
            facilityName: 'Susquehanna Strength Yard',
            streetAddress: '88 Forge Rd',
            city: 'Lancaster',
            state: 'PA',
            postalCode: '17601',
            country: 'US',
          },
          federation: 'Unsanctioned',
          entryFeeDisplay: '$70',
          registrationDeadline: '2026-07-10',
          athleteCap: 25,
        },
        divisionCount: completedState.divisions.length,
        athleteCount: completedState.athletes.length,
        registrationCount: 3,
        updatedAt: '2026-07-18T21:00:00.000Z',
        joinCode: 'ANVL42',
      },
      state: completedState,
    },
  ];
}

// 2 accepted (matching ifc-ath-1 and ifc-ath-2) + 5 pending registrations for the upcoming meet
export function createSeedRegistrations(): RegistrationRequest[] {
  return [
    {
      id: 'reg-ifc-1',
      meetServerId: 'srv-meet-upcoming-1',
      divisionId: 'ifc-g1',
      athleteName: 'Alex Sample (Fake)',
      email: 'alex.sample@example.com',
      status: 'accepted',
      waiverAcceptedAt: '2026-10-10T14:12:00.000Z',
      paid: true,
      createdAt: '2026-10-10T14:12:00.000Z',
    },
    {
      id: 'reg-ifc-2',
      meetServerId: 'srv-meet-upcoming-1',
      divisionId: 'ifc-g2',
      athleteName: 'Blake Demo (Fake)',
      email: 'blake.demo@example.com',
      status: 'accepted',
      waiverAcceptedAt: '2026-10-11T09:30:00.000Z',
      paid: true,
      createdAt: '2026-10-11T09:30:00.000Z',
    },
    {
      id: 'reg-ifc-3',
      meetServerId: 'srv-meet-upcoming-1',
      divisionId: 'ifc-g1',
      athleteName: 'Jules Testperson (Fake)',
      email: 'jules.testperson@example.com',
      status: 'pending',
      waiverAcceptedAt: '2026-10-14T16:05:00.000Z',
      paid: false,
      createdAt: '2026-10-14T16:05:00.000Z',
    },
    {
      id: 'reg-ifc-4',
      meetServerId: 'srv-meet-upcoming-1',
      divisionId: 'ifc-g1',
      athleteName: 'Kendall Mockup (Fake)',
      email: 'kendall.mockup@example.com',
      status: 'pending',
      waiverAcceptedAt: '2026-10-15T11:20:00.000Z',
      paid: false,
      createdAt: '2026-10-15T11:20:00.000Z',
    },
    {
      id: 'reg-ifc-5',
      meetServerId: 'srv-meet-upcoming-1',
      divisionId: 'ifc-g2',
      athleteName: 'Logan Noname (Fake)',
      email: 'logan.noname@example.com',
      status: 'pending',
      waiverAcceptedAt: '2026-10-15T18:44:00.000Z',
      paid: true,
      createdAt: '2026-10-15T18:44:00.000Z',
    },
    {
      id: 'reg-ifc-6',
      meetServerId: 'srv-meet-upcoming-1',
      divisionId: 'ifc-g3',
      athleteName: 'Morgan Pretend (Fake)',
      email: 'morgan.pretend@example.com',
      status: 'pending',
      waiverAcceptedAt: '2026-10-16T08:15:00.000Z',
      paid: false,
      createdAt: '2026-10-16T08:15:00.000Z',
    },
    {
      id: 'reg-ifc-7',
      meetServerId: 'srv-meet-upcoming-1',
      divisionId: 'ifc-g3',
      athleteName: 'Parker Synthetic (Fake)',
      email: 'parker.synthetic@example.com',
      status: 'pending',
      waiverAcceptedAt: '2026-10-16T12:50:00.000Z',
      paid: false,
      createdAt: '2026-10-16T12:50:00.000Z',
    },
  ];
}
