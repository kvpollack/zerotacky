import type { AppState, Athlete, Division, EventDef, Meet } from '../types';

export function getYorkSeedState(): AppState {
  const meetId = 'york-iron-2026';

  const meet: Meet = {
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

  const divisions: Division[] = [
    { id: 'div-m105', meetId, name: "Men's Open 105kg", flight: 'A', sortOrder: 1 },
    { id: 'div-mnov', meetId, name: "Men's Novice", flight: 'A', sortOrder: 2 },
    { id: 'div-w82', meetId, name: "Women's Open 82kg", flight: 'B', sortOrder: 3 },
    { id: 'div-mopen', meetId, name: "Men's Open HW", flight: 'B', sortOrder: 4 },
  ];

  const athletes: Athlete[] = [
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

  const events: EventDef[] = [
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
      implementCount: 5,
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
