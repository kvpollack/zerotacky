// 059 kg/m session 2: the places that compare numbers from different shows normalise to pounds and feet first; the
// printed figure keeps each show's unit. Group picker: athlete numbers are pounds, a metric show's division weights
// are converted before the ratio. Show history carries the show's unit on every event result.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const B = await import(`${ROOT}/lib/website/prBoard.ts`);
const H = await import(`${ROOT}/lib/website/showHistory.ts`);
const G = await import(`${ROOT}/lib/website/groupPicker.ts`);
const M = await import(`${ROOT}/lib/sync/mapping.ts`);
const P = await import(`${ROOT}/lib/presets/index.ts`);

const ev = (over) => ({
  eventId: 'e', eventName: 'Log Press (for reps)', scoringType: 'reps', units: 'imperial', implement: 'log', implementNote: null, weightLbs: 250,
  courseFeet: null, timeCapSeconds: 60, reps: 0, timeSeconds: 0, finished: false, distanceFeet: 0, implementsCompleted: 0, maxWeightLbs: 0, ...over,
});
const entry = (meetId, date, events) => ({
  meetId, slug: meetId, name: `Show ${meetId}`, date, href: `/shows/${meetId}`, venue: null, divisionName: 'Open', athleteName: 'A',
  place: 1, isTied: false, fieldSize: 5, totalPoints: 0, eventWins: 0, eventCount: events.length, withdrawn: false, events,
});

describe('prBoard across units', () => {
  test('reps: 115 kg (253.5 lb) outranks 250 lb; the row prints kg with the pound figure beside it', () => {
    const h = [
      entry('lb', '2026-10-24', [ev({ reps: 8, weightLbs: 250 })]),
      entry('kg', '2026-05-02', [ev({ reps: 3, weightLbs: 115, units: 'metric' })]),
    ];
    const [b] = B.competitionBests(h);
    assert.equal(b.showName, 'Show kg');
    assert.equal(b.units, 'metric');
    assert.equal(b.result, '3 reps at 115 kg (254 lb)');
  });
  test('reps: 110 kg (242.5 lb) loses to 250 lb; the imperial row prints as before', () => {
    const h = [
      entry('kg', '2026-10-24', [ev({ reps: 12, weightLbs: 110, units: 'metric' })]),
      entry('lb', '2026-05-02', [ev({ reps: 3, weightLbs: 250 })]),
    ];
    const [b] = B.competitionBests(h);
    assert.equal(b.showName, 'Show lb');
    assert.equal(b.units, 'imperial');
    assert.equal(b.result, '3 reps at 250 lb');
  });
  test('max weight: 200 kg beats 440 lb (440.9 lb); printed "200 kg (441 lb)"', () => {
    const h = [
      entry('lb', '2026-10-24', [ev({ scoringType: 'max_weight', weightLbs: 0, maxWeightLbs: 440 })]),
      entry('kg', '2026-05-02', [ev({ scoringType: 'max_weight', weightLbs: 0, maxWeightLbs: 200, units: 'metric' })]),
    ];
    const [b] = B.competitionBests(h);
    assert.equal(b.result, '200 kg (441 lb)');
  });
  test('distance with no finish (no listed load): 20 m (65.6 ft) beats 60 ft; course prints in m', () => {
    const h = [
      entry('lb', '2026-10-24', [ev({ scoringType: 'time_or_distance', weightLbs: 0, courseFeet: 100, distanceFeet: 60 })]),
      entry('kg', '2026-05-02', [ev({ scoringType: 'time_or_distance', weightLbs: 0, courseFeet: 30, distanceFeet: 20, units: 'metric' })]),
    ];
    const [b] = B.competitionBests(h);
    assert.equal(b.showName, 'Show kg');
    assert.equal(b.result, '20 m of 30');
  });
  test('an event result without `units` (older callers) is read as imperial', () => {
    const e = ev({ reps: 2, weightLbs: 300 });
    delete e.units;
    assert.equal(B.formatBestResult(e), '2 reps at 300 lb');
  });
});

describe('showHistory carries the show unit', () => {
  function bundle(units) {
    const state = P.getInitialSeedState('demo-show-strongfest-2026');
    if (units === 'metric') state.meet.units = 'metric';
    const rows = M.stateToRows(state, { meetId: 'm1', slug: 'strongfest', stations: state.meet.stations, isDemo: false });
    const roster = [['grace', 'Grace Gullo'], ['emily', 'Emily Shaff']].map(([id, name], i) => ({ id, meet_id: 'm1', division_id: 'sf-g1', name, bodyweight: null, lot_number: i + 1, status: 'active', rack_heights: {} }));
    rows.athletes = [...rows.athletes.filter((a) => a.division_id !== 'sf-g1'), ...roster];
    const ev0 = state.events[0].id;
    const now = '2026-10-24T18:00:00.000Z';
    const r = (eventId, athleteId, payload) => ({ id: `${eventId}_${athleteId}`, meet_id: 'm1', event_id: eventId, athlete_id: athleteId, payload, locked: true, updated_at: now, updated_by: 't', server_at: now });
    return { meet: rows.meet, divisions: rows.divisions, events: rows.events, athletes: rows.athletes, results: [r(ev0, 'grace', { reps: 15 }), r(ev0, 'emily', { reps: 1 })] };
  }
  const row = { meet_id: 'm1', slug: 'strongfest', name: 'S', date: '2026-10-24', is_public_listed: true, venue_city: null, venue_state: null, division_id: 'sf-g1', division_name: 'Group 1', athlete_id: 'grace', athlete_name: 'x', athlete_status: 'active' };
  test('metric row -> every event result says metric; imperial row (default column) says imperial', () => {
    const metric = H.buildShowHistoryEntry(row, bundle('metric'));
    assert.ok(metric.events.length > 0);
    assert.ok(metric.events.every((e) => e.units === 'metric'));
    const imperial = H.buildShowHistoryEntry(row, bundle('imperial'));
    assert.ok(imperial.events.every((e) => e.units === 'imperial'));
  });
});

describe('group picker on a metric show', () => {
  const div = { id: 'a', meetId: 'm', name: 'Novice', sortOrder: 0 };
  const evd = (extra = {}) => ({ id: 'e1', meetId: 'm', eventNumber: 1, name: 'Axle Deadlift for Reps', scoringType: 'reps', timeCapSeconds: 60, lanes: 1, loadingPoints: 1, weightEntryMode: 'total', implementEmptyWeight: 0, divisionWeights: { a: 100 }, ...extra });
  test('a 100 kg division weight is 220.5 lb for the ratio and prints "100 kg"', () => {
    const v = G.gradeEvent(evd(), div, { deadlift: 315, overhead: null, carry: null }, 'metric');
    assert.equal(v.weightLb, 220.5);
    assert.equal(v.weightText, '100 kg');
    assert.equal(v.verdict, 'clear');   // 220.5 / 315 = 0.70
    const imperial = G.gradeEvent(evd(), div, { deadlift: 315, overhead: null, carry: null });
    assert.equal(imperial.weightLb, 100);
    assert.equal(imperial.weightText, '100 lbs');
  });
  test('pickGroups threads the unit: 140 kg deadlift (308.6 lb) vs a 315 lb number is above the band (0.98), one such event = a stretch', () => {
    const r = G.pickGroups([div], [evd({ divisionWeights: { a: 140 } })], { deadlift: 315, overhead: null, carry: null }, 'metric');
    assert.equal(r.divisions[0].events[0].verdict, 'heavy');
    assert.equal(r.divisions[0].fit, 'stretch');
    assert.equal(G.pickGroups([div], [evd({ divisionWeights: { a: 140 } })], { deadlift: 315, overhead: null, carry: null }).divisions[0].events[0].verdict, 'clear');
  });
});
