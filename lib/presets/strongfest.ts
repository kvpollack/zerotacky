import type { AppState, Athlete, Division, EventDef, Meet, PitCrewCalloutEntry } from '../types';

export function getStrongfestSeedState(): AppState {
  const meetId = 'strongfest-2026';

  const meet: Meet = {
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

  const divisions: Division[] = [
    { id: 'sf-g1', meetId, name: 'Group 1', flight: 'A', sortOrder: 1 },
    { id: 'sf-g2', meetId, name: 'Group 2', flight: 'A', sortOrder: 2 },
    { id: 'sf-g3', meetId, name: 'Group 3', flight: 'A', sortOrder: 3 },
    { id: 'sf-g4', meetId, name: 'Group 4', flight: 'B', sortOrder: 4 },
    { id: 'sf-g5', meetId, name: 'Group 5', flight: 'B', sortOrder: 5 },
  ];

  // Real roster from Iron Podium (director view, 2026-10-16). Lot numbers = listed order.
  const athletes: Athlete[] = [
    { id: 'sf-ath-1', divisionId: 'sf-g1', name: 'Jessica Rucci', lotNumber: 1, status: 'active', rackHeights: {} },
    { id: 'sf-ath-2', divisionId: 'sf-g1', name: 'Emily Shaff', lotNumber: 2, status: 'active', rackHeights: {} },
    { id: 'sf-ath-3', divisionId: 'sf-g1', name: 'Amber Simcox', lotNumber: 3, status: 'active', rackHeights: {} },
    { id: 'sf-ath-4', divisionId: 'sf-g1', name: 'Grace Gullo', lotNumber: 4, status: 'active', rackHeights: {} },
    { id: 'sf-ath-5', divisionId: 'sf-g2', name: 'Josh Palange', lotNumber: 1, status: 'active', rackHeights: {} },
    { id: 'sf-ath-6', divisionId: 'sf-g2', name: 'Jennifer Slagus', lotNumber: 2, status: 'active', rackHeights: {} },
    { id: 'sf-ath-7', divisionId: 'sf-g2', name: 'Hannah Litchfield', lotNumber: 3, status: 'active', rackHeights: {} },
    { id: 'sf-ath-8', divisionId: 'sf-g2', name: 'Nadia Hall', lotNumber: 4, status: 'active', rackHeights: {} },
    { id: 'sf-ath-9', divisionId: 'sf-g2', name: 'Sarah Daniel', lotNumber: 5, status: 'active', rackHeights: {} },
    { id: 'sf-ath-10', divisionId: 'sf-g2', name: 'Edward Anderson', lotNumber: 6, status: 'active', rackHeights: {} },
    { id: 'sf-ath-11', divisionId: 'sf-g3', name: 'Yen Chun Huang', lotNumber: 1, status: 'active', rackHeights: {} },
    { id: 'sf-ath-12', divisionId: 'sf-g4', name: 'Hyden Zhang', lotNumber: 1, status: 'active', rackHeights: {} },
    { id: 'sf-ath-13', divisionId: 'sf-g4', name: 'Kurt Pollack', lotNumber: 2, status: 'active', rackHeights: { 'sf-ev-2': '48" Bar (Std)' } },
    { id: 'sf-ath-14', divisionId: 'sf-g5', name: 'Marcus Potter', lotNumber: 1, status: 'active', rackHeights: {} },
  ];

  const truckCallout = (vehicle: string): PitCrewCalloutEntry => ({
    headline: vehicle,
    stats: [
      { label: 'Course', value: '50 ft' },
      { label: 'Scoring', value: 'Fastest Time / Ft if Capped' },
    ],
  });

  const events: EventDef[] = [
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
