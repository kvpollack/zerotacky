import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const B = await import(`${ROOT}/lib/website/prBoard.ts`);
const H = await import(`${ROOT}/lib/website/showHistory.ts`);
const M = await import(`${ROOT}/lib/sync/mapping.ts`);
const P = await import(`${ROOT}/lib/presets/index.ts`);

const ev = (over) => ({
  eventId: 'e', eventName: 'Log Press (for reps)', scoringType: 'reps', implement: 'log', implementNote: null, weightLbs: 250,
  courseFeet: null, timeCapSeconds: 60, reps: 0, timeSeconds: 0, finished: false, distanceFeet: 0, implementsCompleted: 0, maxWeightLbs: 0, ...over,
});
const entry = (meetId, date, events, over = {}) => ({
  meetId, slug: meetId, name: `Show ${meetId}`, date, href: `/shows/${meetId}`, venue: null, divisionName: 'Open', athleteName: 'A',
  place: 1, isTied: false, fieldSize: 5, totalPoints: 0, eventWins: 0, eventCount: events.length, withdrawn: false, events, ...over,
});

describe('prBoard.competitionBests', () => {
  test('reps: heaviest weight repped wins over more reps at a lighter weight; the row names the show', () => {
    const h = [
      entry('m2', '2026-10-24', [ev({ reps: 12, weightLbs: 220 })]),
      entry('m1', '2026-05-02', [ev({ reps: 3, weightLbs: 250 })]),
    ];
    const [b] = B.competitionBests(h);
    assert.equal(b.label, 'Log');
    assert.equal(b.result, '3 reps at 250 lb (113 kg)');   // D2: imperial rows mirror kg
    assert.equal(b.showName, 'Show m1');
    assert.equal(b.dateLabel, 'May 2, 2026');
    assert.equal(b.appearances, 2);
  });
  test('reps at the same weight: more reps wins; equal rank keeps the newer show', () => {
    const h = [
      entry('new', '2026-10-24', [ev({ reps: 8 })]),
      entry('old', '2026-05-02', [ev({ reps: 8 })]),
      entry('older', '2026-01-02', [ev({ reps: 9 })]),
    ];
    const [b] = B.competitionBests(h);
    assert.equal(b.result, '9 reps at 250 lb (113 kg)');
    assert.equal(b.showName, 'Show older');
    const [b2] = B.competitionBests(h.slice(0, 2));
    assert.equal(b2.showName, 'Show new');
  });
  test('max weight: heaviest effective max; implements group across differently named events', () => {
    const h = [
      entry('m1', '2026-05-02', [ev({ eventName: 'Axle Clean & Press Max', scoringType: 'max_weight', implement: 'axle', weightLbs: 0, maxWeightLbs: 285 })]),
      entry('m2', '2026-10-24', [ev({ eventName: 'Axle Press (rising bar)', scoringType: 'max_weight', implement: 'axle', weightLbs: 0, maxWeightLbs: 300 })]),
    ];
    const bests = B.competitionBests(h);
    assert.equal(bests.length, 1);
    assert.equal(bests[0].label, 'Axle');
    assert.equal(bests[0].result, '300 lb (136 kg)');
    assert.equal(bests[0].appearances, 2);
  });
  test('time: a finished course at a heavier weight beats a faster one at a lighter weight; a DNF shows distance', () => {
    const h = [
      entry('m1', '2026-05-02', [ev({ eventName: 'Yoke', scoringType: 'time_or_distance', implement: 'yoke', weightLbs: 700, courseFeet: 50, timeSeconds: 19.2, finished: true })]),
      entry('m2', '2026-10-24', [ev({ eventName: 'Yoke', scoringType: 'time_or_distance', implement: 'yoke', weightLbs: 600, courseFeet: 50, timeSeconds: 14.1, finished: true })]),
      entry('m3', '2026-11-01', [ev({ eventName: 'Yoke', scoringType: 'time_or_distance', implement: 'yoke', weightLbs: 800, courseFeet: 50, timeSeconds: 0, finished: false, distanceFeet: 31 })]),
    ];
    const [b] = B.competitionBests(h);
    assert.equal(b.result, '19.20 s at 700 lb (318 kg) over 50 ft (15 m)');
    const dnf = B.competitionBests([h[2]]);
    assert.equal(dnf[0].result, '31 of 50 ft (15 m) at 800 lb (363 kg)');
  });
  test('medley: most implements, then time; over a minute formats m:ss.ss', () => {
    const h = [
      entry('m1', '2026-05-02', [ev({ eventName: 'Loading Medley', scoringType: 'time_or_implements', implement: 'loading_medley', weightLbs: 0, implementsCompleted: 4, timeCapSeconds: 90, timeSeconds: 0 })]),
      entry('m2', '2026-10-24', [ev({ eventName: 'Loading Medley', scoringType: 'time_or_implements', implement: 'loading_medley', weightLbs: 0, implementsCompleted: 5, timeSeconds: 72.5, finished: true, timeCapSeconds: 90 })]),
    ];
    const [b] = B.competitionBests(h);
    assert.equal(b.result, '1:12.50');
    assert.equal(b.showName, 'Show m2');
  });
  test('no implement: events group by normalized name; "other" groups by its note; scratched shows add nothing', () => {
    const h = [
      entry('m1', '2026-05-02', [ev({ eventName: 'Sandbag Toss (for reps)', implement: null, weightLbs: 50, reps: 4 }), ev({ eventId: 'x', eventName: 'Sled', implement: 'other', implementNote: 'Prowler', scoringType: 'time_or_distance', weightLbs: 0, timeSeconds: 30, finished: true })]),
      entry('m2', '2026-10-24', [ev({ eventName: 'Sandbag toss for reps', implement: null, weightLbs: 50, reps: 6 })]),
      entry('m3', '2026-11-01', [], { withdrawn: true }),
    ];
    const bests = B.competitionBests(h);
    assert.deepEqual(bests.map((b) => b.label), ['Prowler', 'Sandbag Toss (for reps)']);
    assert.equal(bests[1].result, '6 reps at 50 lb (23 kg)');
    assert.equal(bests[1].appearances, 2);
  });
  test('an empty history gives no rows', () => {
    assert.deepEqual(B.competitionBests([]), []);
  });
});

describe('showHistory entries carry per-event results for the board', () => {
  test('buildShowHistoryEntry: events list the athlete scored, with the division weight and light tier', () => {
    const state = P.getInitialSeedState('demo-show-strongfest-2026');
    const rows = M.stateToRows(state, { meetId: 'm1', slug: 'strongfest', stations: state.meet.stations, isDemo: false });
    const ath = rows.athletes.find((a) => a.division_id === 'sf-g1');
    const e0 = state.events[0];
    const now = '2026-10-24T18:00:00.000Z';
    const results = [{ id: `${e0.id}_${ath.id}`, meet_id: 'm1', event_id: e0.id, athlete_id: ath.id, payload: { reps: 7 }, locked: true, updated_at: now, updated_by: 't', server_at: now }];
    const row = { meet_id: 'm1', slug: 'strongfest', name: 'S', date: '2026-10-24', is_public_listed: true, venue_city: null, venue_state: null, division_id: 'sf-g1', division_name: 'Group 1', athlete_id: ath.id, athlete_name: 'x', athlete_status: 'active' };
    const entry = H.buildShowHistoryEntry(row, { meet: rows.meet, divisions: rows.divisions, events: rows.events, athletes: rows.athletes, results });
    assert.equal(entry.events.length, 1);
    assert.equal(entry.events[0].reps, 7);
    assert.equal(entry.events[0].eventName, e0.name);
    assert.equal(entry.events[0].weightLbs, e0.divisionWeights['sf-g1'] ?? 0);
    const scratched = H.buildShowHistoryEntry({ ...row, athlete_status: 'withdrawn' }, { meet: rows.meet, divisions: rows.divisions, events: rows.events, athletes: rows.athletes.map((a) => (a.id === ath.id ? { ...a, status: 'withdrawn' } : a)), results });
    assert.deepEqual(scratched.events, []);
  });
});
