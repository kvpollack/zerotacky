import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const MB = await import(`${ROOT}/lib/meetBuilder.ts`);
const P = await import(`${ROOT}/lib/presets/index.ts`);
const { ALL_POSSIBLE_PLATES } = await import(`${ROOT}/lib/constants.ts`);

describe('slugify & createBlankMeet', () => {
  test('slugify produces url-safe lowercase slugs and falls back to meet', () => {
    assert.equal(MB.slugify('Keystone State Strongman 2026!'), 'keystone-state-strongman-2026');
    assert.equal(MB.slugify('  ---York   Barbell---  '), 'york-barbell');
    assert.equal(MB.slugify('!!!'), 'meet');
  });

  test('createBlankMeet initializes two stations, empty arrays, isDemo false, adminPin 1050, and all plates', () => {
    const s = MB.createBlankMeet('Keystone State Strongman', '2026-11-14');
    assert.match(s.meet.id, /^meet-\d+/);
    assert.equal(s.meet.name, 'Keystone State Strongman');
    assert.equal(s.meet.date, '2026-11-14');
    assert.equal(s.meet.slug, 'keystone-state-strongman');
    assert.equal(s.meet.isDemo, false);
    assert.equal(s.meet.adminPin, '1050');
    assert.deepEqual(s.meet.stations, [
      { id: 'A', label: 'Station 1' },
      { id: 'B', label: 'Station 2' },
    ]);
    assert.deepEqual(s.meet.availablePlates, ALL_POSSIBLE_PLATES);
    assert.deepEqual(s.divisions, []);
    assert.deepEqual(s.athletes, []);
    assert.deepEqual(s.events, []);
    assert.deepEqual(s.results, []);
  });
});

describe('normalizeState', () => {
  test('hydrates today Strongfest getInitialSeedState() JSON with isDemo/stations deleted and sets defaults', () => {
    const raw = JSON.parse(JSON.stringify(P.getInitialSeedState('strongfest-2026')));
    delete raw.meet.isDemo;
    delete raw.meet.stations;
    delete raw.meet.slug;

    const norm = MB.normalizeState(raw);
    assert.equal(norm.meet.isDemo, true);
    assert.deepEqual(norm.meet.stations, [
      { id: 'A', label: 'Station 1' },
      { id: 'B', label: 'Station 2' },
    ]);
    assert.equal(norm.meet.slug, 'all-out-strongfest-2026-the-power-plant-gym');
    assert.equal(norm.divisions.length, 5);
    assert.equal(norm.athletes.length, 14);
  });

  test('upgrades legacy "Stn n" station labels to "Station n"; custom labels untouched', () => {
    const raw = JSON.parse(JSON.stringify(P.getInitialSeedState('strongfest-2026')));
    raw.meet.stations = [{ id: 'A', label: 'Stn 1' }, { id: 'B', label: 'Stn 2' }, { id: 'C', label: 'Log Side' }];
    const norm = MB.normalizeState(raw);
    assert.deepEqual(norm.meet.stations, [
      { id: 'A', label: 'Station 1' },
      { id: 'B', label: 'Station 2' },
      { id: 'C', label: 'Log Side' },
    ]);
  });

  test('hydrates a legacy custom save without presetId as isDemo false and fills implementCount on stone events', () => {
    const raw = JSON.parse(JSON.stringify(P.getInitialSeedState('york-iron-2026')));
    delete raw.meet.presetId;
    delete raw.meet.isDemo;
    delete raw.meet.stations;
    delete raw.events[4].implementCount;

    const norm = MB.normalizeState(raw);
    assert.equal(norm.meet.isDemo, false);
    assert.equal(norm.meet.stations.length, 2);
    assert.equal(norm.events[4].implementCount, 5);
  });

  test('never throws on null or garbage input and falls back to normalized seed state', () => {
    const norm = MB.normalizeState(null);
    assert.equal(norm.meet.isDemo, true);
    assert.equal(norm.meet.stations.length, 2);
    assert.ok(norm.divisions.length > 0);
  });
});

describe('stations CRUD', () => {
  test('addStation, updateStation, and removeStation (enforcing min 1 station)', () => {
    let s = MB.createBlankMeet('Test Meet', '2026-11-01');
    s = MB.addStation(s, { label: 'Platform 3' });
    assert.equal(s.meet.stations.length, 3);
    assert.equal(s.meet.stations[2].id, 'C');
    assert.equal(s.meet.stations[2].label, 'Platform 3');

    s = MB.updateStation(s, 'A', { label: 'Main Turf' });
    assert.equal(s.meet.stations[0].label, 'Main Turf');

    s = MB.removeStation(s, 'C');
    s = MB.removeStation(s, 'B');
    assert.equal(s.meet.stations.length, 1);
    // Cannot remove the last remaining station
    const afterMin = MB.removeStation(s, 'A');
    assert.equal(afterMin.meet.stations.length, 1);
  });
  test('R-M4: a new station never takes the id a removed station left on a division', () => {
    let s = MB.createBlankMeet('Test Meet', '2026-11-01');
    s = MB.addDivision(s, { id: 'd1', name: 'Open', flight: 'A' });
    s = MB.removeStation(s, 'A');                    // d1 now points at a station that no longer exists
    assert.deepEqual(s.meet.stations.map((x) => x.id), ['B']);
    s = MB.addStation(s, { label: 'Replacement' });
    assert.deepEqual(s.meet.stations.map((x) => x.id), ['B', 'C']);   // not 'A'
    assert.equal(s.divisions[0].flight, 'A');       // still visibly unassigned until the promoter picks
  });
});

describe('divisions CRUD & reorder', () => {
  test('addDivision and updateDivision are immutable and assign sortOrder', () => {
    const s0 = MB.createBlankMeet('Test Meet', '2026-11-01');
    const s1 = MB.addDivision(s0, { id: 'd1', name: 'Men Open 105kg', flight: 'A' });
    const s2 = MB.addDivision(s1, { id: 'd2', name: 'Women Open 82kg', flight: 'B' });
    assert.equal(s0.divisions.length, 0);
    assert.equal(s2.divisions.length, 2);
    assert.equal(s2.divisions[1].sortOrder, 2);

    const s3 = MB.updateDivision(s2, 'd2', { name: 'Women Open', flight: 'A' });
    assert.equal(s3.divisions[1].name, 'Women Open');
    assert.equal(s3.divisions[1].flight, 'A');
  });

  test('reorderDivisions re-sorts and renumbers sortOrder 1..n', () => {
    let s = MB.createBlankMeet('Test', '2026-11-01');
    s = MB.addDivision(s, { id: 'd1', name: 'D1', flight: 'A' });
    s = MB.addDivision(s, { id: 'd2', name: 'D2', flight: 'A' });
    s = MB.addDivision(s, { id: 'd3', name: 'D3', flight: 'B' });

    const reordered = MB.reorderDivisions(s, ['d3', 'd1', 'd2']);
    assert.deepEqual(reordered.divisions.map((d) => [d.id, d.sortOrder]), [
      ['d3', 1],
      ['d1', 2],
      ['d2', 3],
    ]);
  });

  test('removeDivision removes its athletes, their results, and division keys in every event map', () => {
    let s = MB.createBlankMeet('Test', '2026-11-01');
    s = MB.addDivision(s, { id: 'd1', name: 'D1', flight: 'A' });
    s = MB.addDivision(s, { id: 'd2', name: 'D2', flight: 'B' });
    s = MB.addAthlete(s, { id: 'a1', divisionId: 'd1', name: 'Lifter 1' });
    s = MB.addAthlete(s, { id: 'a2', divisionId: 'd2', name: 'Lifter 2' });
    s = MB.addEvent(s, {
      id: 'e1',
      name: 'Deadlift',
      scoringType: 'reps',
      hasTrumpWeight: true,
      divisionWeights: { d1: 500, d2: 600 },
      divisionLightWeights: { d1: 400, d2: 500 },
      hasHeightCallout: true,
      divisionDefaultHeights: { d1: 'Pin 1', d2: 'Pin 2' },
      pitCrewCallout: { title: 'Load', byDivision: { d1: { headline: 'H1' }, d2: { headline: 'H2' } } },
    });
    s = {
      ...s,
      results: [
        { id: 'e1_a1', eventId: 'e1', athleteId: 'a1', reps: 5, updatedAt: 1 },
        { id: 'e1_a2', eventId: 'e1', athleteId: 'a2', reps: 8, updatedAt: 2 },
      ],
    };

    const after = MB.removeDivision(s, 'd1');
    assert.deepEqual(after.divisions.map((d) => d.id), ['d2']);
    assert.equal(after.divisions[0].sortOrder, 1);
    assert.deepEqual(after.athletes.map((a) => a.id), ['a2']);
    assert.deepEqual(after.results.map((r) => r.id), ['e1_a2']);
    assert.deepEqual(after.events[0].divisionWeights, { d2: 600 });
    assert.deepEqual(after.events[0].divisionLightWeights, { d2: 500 });
    assert.deepEqual(after.events[0].divisionDefaultHeights, { d2: 'Pin 2' });
    assert.deepEqual(Object.keys(after.events[0].pitCrewCallout.byDivision), ['d2']);
  });
});

describe('events CRUD & reorder', () => {
  test('addEvent and updateEvent preserve preset pitCrewCallout stats while updating headline', () => {
    let s = MB.normalizeState(P.getInitialSeedState('strongfest-2026'));
    const ev2 = s.events[1];
    const patched = MB.updateEvent(s, ev2.id, {
      name: 'Keg Toss Over Bar',
      pitCrewCallout: {
        title: 'Updated Title',
        byDivision: {
          ...ev2.pitCrewCallout.byDivision,
          'sf-g1': { headline: '46" Yoke Bar • 110 lb Keg' },
        },
      },
    });
    const updatedEv2 = patched.events[1];
    assert.equal(updatedEv2.name, 'Keg Toss Over Bar');
    assert.equal(updatedEv2.pitCrewCallout.byDivision['sf-g1'].headline, '46" Yoke Bar • 110 lb Keg');
    assert.equal(updatedEv2.pitCrewCallout.byDivision['sf-g1'].stats.length, 2);
  });

  test('addEvent prefills collarWeightPerPair from the meet default; updateEvent keeps an explicit 0 (10/26)', () => {
    let s = MB.createBlankMeet('Test', '2026-11-01');
    s = { ...s, meet: { ...s.meet, collarWeightPerPair: 5 } };
    s = MB.addEvent(s, { id: 'e1', name: 'Log', scoringType: 'reps' });
    assert.equal(s.events[0].collarWeightPerPair, 5);
    s = MB.updateEvent(s, 'e1', { collarWeightPerPair: 0 });
    assert.equal(s.events[0].collarWeightPerPair, 0);
    s = MB.updateEvent(s, 'e1', { collarWeightPerPair: -3 });
    assert.equal(s.events[0].collarWeightPerPair, 0);   // never negative
  });
  test('reorderEvents renumbers eventNumber 1..n', () => {
    let s = MB.createBlankMeet('Test', '2026-11-01');
    s = MB.addEvent(s, { id: 'e1', name: 'Log', scoringType: 'reps' });
    s = MB.addEvent(s, { id: 'e2', name: 'Yoke', scoringType: 'time_or_distance' });
    s = MB.addEvent(s, { id: 'e3', name: 'Stones', scoringType: 'time_or_implements', implementCount: 4 });

    const reordered = MB.reorderEvents(s, ['e3', 'e1', 'e2']);
    assert.deepEqual(reordered.events.map((e) => [e.id, e.eventNumber]), [
      ['e3', 1],
      ['e1', 2],
      ['e2', 3],
    ]);
  });

  test('removeEvent removes its results, cleans athletes rackHeights[eventId], and renumbers', () => {
    let s = MB.createBlankMeet('Test', '2026-11-01');
    s = MB.addDivision(s, { id: 'd1', name: 'D1', flight: 'A' });
    s = MB.addEvent(s, { id: 'e1', name: 'Log', scoringType: 'reps' });
    s = MB.addEvent(s, { id: 'e2', name: 'Yoke', scoringType: 'time_or_distance' });
    s = MB.addAthlete(s, {
      id: 'a1',
      divisionId: 'd1',
      name: 'Kurt',
      rackHeights: { e1: 'Pin 14', e2: 'Pin 16' },
    });
    s = {
      ...s,
      results: [
        { id: 'e1_a1', eventId: 'e1', athleteId: 'a1', reps: 5, updatedAt: 1 },
        { id: 'e2_a1', eventId: 'e2', athleteId: 'a1', timeSeconds: 18.2, updatedAt: 2 },
      ],
    };

    const after = MB.removeEvent(s, 'e1');
    assert.deepEqual(after.events.map((e) => [e.id, e.eventNumber]), [['e2', 1]]);
    assert.deepEqual(after.results.map((r) => r.id), ['e2_a1']);
    assert.deepEqual(after.athletes[0].rackHeights, { e2: 'Pin 16' });
  });
});

describe('athletes CRUD, moveAthlete & shuffleLots', () => {
  test('addAthlete assigns incrementing lotNumbers per division and bulkAddAthletes adds multiple lines', () => {
    let s = MB.createBlankMeet('Test', '2026-11-01');
    s = MB.addDivision(s, { id: 'd1', name: 'D1', flight: 'A' });
    s = MB.addAthlete(s, { id: 'a1', divisionId: 'd1', name: 'Alpha' });
    s = MB.addAthlete(s, { id: 'a2', divisionId: 'd1', name: 'Bravo' });
    assert.deepEqual(s.athletes.map((a) => a.lotNumber), [1, 2]);

    s = MB.bulkAddAthletes(s, 'd1', 'Charlie\n\n  Delta  \r\n');
    assert.equal(s.athletes.length, 4);
    assert.deepEqual(s.athletes.map((a) => [a.name, a.lotNumber]), [
      ['Alpha', 1],
      ['Bravo', 2],
      ['Charlie', 3],
      ['Delta', 4],
    ]);
  });

  test('updateAthlete, moveAthlete (assigns next lot in target division), and removeAthlete (removes results)', () => {
    let s = MB.createBlankMeet('Test', '2026-11-01');
    s = MB.addDivision(s, { id: 'd1', name: 'D1', flight: 'A' });
    s = MB.addDivision(s, { id: 'd2', name: 'D2', flight: 'B' });
    s = MB.addAthlete(s, { id: 'a1', divisionId: 'd1', name: 'Alpha' });
    s = MB.addAthlete(s, { id: 'a2', divisionId: 'd2', name: 'Bravo' });
    s = MB.updateAthlete(s, 'a1', { name: 'Alpha Renamed', lotNumber: 7 });
    assert.equal(s.athletes[0].name, 'Alpha Renamed');
    assert.equal(s.athletes[0].lotNumber, 7);

    s = MB.moveAthlete(s, 'a1', 'd2');
    const moved = s.athletes.find((a) => a.id === 'a1');
    assert.equal(moved.divisionId, 'd2');
    assert.equal(moved.lotNumber, 2);

    s = {
      ...s,
      results: [{ id: 'e1_a1', eventId: 'e1', athleteId: 'a1', reps: 3, updatedAt: 1 }],
    };
    const afterRemove = MB.removeAthlete(s, 'a1');
    assert.equal(afterRemove.athletes.length, 1);
    assert.equal(afterRemove.results.length, 0);
  });

  test('shuffleLots is deterministic with injected rng and only shuffles target division', () => {
    let s = MB.createBlankMeet('Test', '2026-11-01');
    s = MB.addDivision(s, { id: 'd1', name: 'D1', flight: 'A' });
    s = MB.addDivision(s, { id: 'd2', name: 'D2', flight: 'B' });
    s = MB.addAthlete(s, { id: 'a1', divisionId: 'd1', name: 'A1' });
    s = MB.addAthlete(s, { id: 'a2', divisionId: 'd1', name: 'A2' });
    s = MB.addAthlete(s, { id: 'a3', divisionId: 'd1', name: 'A3' });
    s = MB.addAthlete(s, { id: 'b1', divisionId: 'd2', name: 'B1', lotNumber: 9 });

    // rng always returning 0 forces every swap with index 0 -> [a2, a3, a1]
    const s1 = MB.shuffleLots(s, 'd1', () => 0);
    const s2 = MB.shuffleLots(s, 'd1', () => 0);
    assert.deepEqual(
      s1.athletes.filter((a) => a.divisionId === 'd1').map((a) => [a.id, a.lotNumber]),
      [
        ['a1', 3],
        ['a2', 1],
        ['a3', 2],
      ]
    );
    assert.deepEqual(s1.athletes, s2.athletes);
    assert.equal(s1.athletes.find((a) => a.id === 'b1').lotNumber, 9);
  });
});

describe('validateMeet (all problem types)', () => {
  test('both demo presets validate as ok: true with zero problems', () => {
    const sf = MB.normalizeState(P.getInitialSeedState('strongfest-2026'));
    const yk = MB.normalizeState(P.getInitialSeedState('york-iron-2026'));
    assert.deepEqual(MB.validateMeet(sf), { ok: true, problems: [] });
    assert.deepEqual(MB.validateMeet(yk), { ok: true, problems: [] });
  });

  test('flags empty meet (no divisions, no events, no athletes)', () => {
    const blank = MB.createBlankMeet('Blank', '2026-11-01');
    const v = MB.validateMeet(blank);
    assert.equal(v.ok, false);
    assert.ok(v.problems.includes('Meet has no divisions.'));
    assert.ok(v.problems.includes('Meet has no events.'));
    assert.ok(v.problems.includes('Meet has no athletes.'));
  });

  test('flags division with no athletes ("Group 3 has no athletes")', () => {
    let s = MB.normalizeState(P.getInitialSeedState('strongfest-2026'));
    s = { ...s, athletes: s.athletes.filter((a) => a.divisionId !== 'sf-g3') };
    const v = MB.validateMeet(s);
    assert.equal(v.ok, false);
    assert.ok(v.problems.includes('Group 3 has no athletes'));
  });

  test('flags missing division weight on event ("Ev 2 has no weight for Group 1")', () => {
    let s = MB.normalizeState(P.getInitialSeedState('strongfest-2026'));
    s = MB.updateEvent(s, 'sf-ev-2', {
      divisionWeights: { ...s.events[1].divisionWeights, 'sf-g1': 0 },
      pitCrewCallout: { title: 'Yoke', byDivision: {} },
    });
    const v = MB.validateMeet(s);
    assert.equal(v.ok, false);
    assert.ok(v.problems.includes('Ev 2 has no weight for Group 1'));
  });

  test('updateEvent lets a patch clear a division callout but keeps stats for divisions it retains', () => {
    let s = MB.normalizeState(P.getInitialSeedState('strongfest-2026'));
    const before = s.events.find((e) => e.id === 'sf-ev-2').pitCrewCallout.byDivision;
    s = MB.updateEvent(s, 'sf-ev-2', {
      pitCrewCallout: { title: 'Yoke', byDivision: { 'sf-g2': { headline: 'New headline' } } },
    });
    const after = s.events.find((e) => e.id === 'sf-ev-2').pitCrewCallout;
    assert.equal(after.title, 'Yoke');
    assert.deepEqual(Object.keys(after.byDivision), ['sf-g2']);
    assert.equal(after.byDivision['sf-g2'].headline, 'New headline');
    assert.deepEqual(after.byDivision['sf-g2'].stats, before['sf-g2'].stats);
  });

  test('flags duplicate lot numbers within a division ("Two athletes in Group 2 share lot 3")', () => {
    let s = MB.normalizeState(P.getInitialSeedState('strongfest-2026'));
    const g2Athletes = s.athletes.filter((a) => a.divisionId === 'sf-g2');
    s = MB.updateAthlete(s, g2Athletes[0].id, { lotNumber: 3 });
    const v = MB.validateMeet(s);
    assert.equal(v.ok, false);
    assert.ok(v.problems.includes('Two athletes in Group 2 share lot 3'));
  });

  test('flags rising bar event with no bar weights ("Event 4 is rising bar but has no bar weights")', () => {
    let s = MB.normalizeState(P.getInitialSeedState('york-iron-2026'));
    s = MB.updateEvent(s, 'ev-4', {
      scoringType: 'max_weight',
      maxFormat: 'rising_bar',
      risingBarWeights: [],
    });
    const v = MB.validateMeet(s);
    assert.equal(v.ok, false);
    assert.ok(v.problems.includes('Event 4 is rising bar but has no bar weights'));
  });

  test('flags division assigned to a station that was removed', () => {
    let s = MB.normalizeState(P.getInitialSeedState('strongfest-2026'));
    s = MB.removeStation(s, 'B');
    const v = MB.validateMeet(s);
    assert.equal(v.ok, false);
    assert.ok(v.problems.some((p) => p.includes('unknown station B')));
  });

  test('flags trump weight event missing divisionLightWeights', () => {
    let s = MB.normalizeState(P.getInitialSeedState('york-iron-2026'));
    s = MB.updateEvent(s, 'ev-2', {
      divisionLightWeights: { ...s.events[1].divisionLightWeights, 'div-m105': 0 },
    });
    const v = MB.validateMeet(s);
    assert.equal(v.ok, false);
    assert.ok(v.problems.includes("Ev 2 has no light weight for Men's Open 105kg"));
  });
});