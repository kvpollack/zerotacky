import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const H = await import(`${ROOT}/lib/website/showHistory.ts`);
const M = await import(`${ROOT}/lib/sync/mapping.ts`);
const P = await import(`${ROOT}/lib/presets/index.ts`);

// Strongfest demo roster, Group 1 only scored: Grace sweeps, Emily and Jessica tie on points, Amber scratched.
function bundle({ withAmberResults = false } = {}) {
  const state = P.getInitialSeedState('demo-show-strongfest-2026');
  const rows = M.stateToRows(state, { meetId: 'm1', slug: 'strongfest', stations: state.meet.stations, isDemo: false });
  // Own Group 1 roster so the test does not depend on how many sample lifters the demo ships with.
  const g1Names = [['grace', 'Grace Gullo'], ['emily', 'Emily Shaff'], ['jessica', 'Jessica Rucci'], ['amber', 'Amber Simcox']];
  const roster = g1Names.map(([id, name], i) => ({ id, meet_id: 'm1', division_id: 'sf-g1', name, bodyweight: null, lot_number: i + 1, status: 'active', rack_heights: {} }));
  rows.athletes = [...rows.athletes.filter((a) => a.division_id !== 'sf-g1'), ...roster];
  const [grace, emily, jessica, amber] = g1Names.map(([id]) => id);
  const ev = state.events.map((e) => e.id);
  const now = '2026-10-24T18:00:00.000Z';
  const r = (eventId, athleteId, payload) => ({ id: `${eventId}_${athleteId}`, meet_id: 'm1', event_id: eventId, athlete_id: athleteId, payload, locked: true, updated_at: now, updated_by: 't', server_at: now });
  const results = [
    r(ev[0], grace, { reps: 15 }), r(ev[0], emily, { reps: 1 }), r(ev[0], jessica, { reps: 8 }),
    r(ev[1], grace, { reps: 6 }), r(ev[1], emily, { reps: 4 }), r(ev[1], jessica, { reps: 4 }),
    r(ev[2], grace, { timeSeconds: 23.59 }), r(ev[2], emily, { timeSeconds: 26.88 }), r(ev[2], jessica, { timeSeconds: 31.38 }),
  ];
  if (withAmberResults && amber) results.push(r(ev[0], amber, { reps: 5 }));
  const athletes = rows.athletes.map((a) => (a.id === amber && !withAmberResults ? { ...a, status: 'withdrawn' } : a));
  return { ids: { grace, emily, jessica, amber }, bundle: { meet: rows.meet, divisions: rows.divisions, events: rows.events, athletes, results } };
}

const row = (athlete_id, extra = {}) => ({
  meet_id: 'm1', slug: 'strongfest', name: 'All Out Strongfest 2026', date: '2026-10-24', is_public_listed: true,
  venue_city: 'Hershey', venue_state: 'PA', division_id: 'sf-g1', division_name: 'Group 1', athlete_id, athlete_name: 'x', athlete_status: 'active', ...extra,
});

describe('showHistory.buildShowHistoryEntry', () => {
  test('winner: 1st of the active field, points and event wins from the engine', () => {
    const { ids, bundle: b } = bundle();
    const e = H.buildShowHistoryEntry(row(ids.grace), b);
    assert.equal(e.place, 1);
    assert.equal(e.isTied, false);
    assert.equal(e.fieldSize, 3, 'scratched athlete is not counted in the field');
    assert.equal(e.totalPoints, 9);
    assert.equal(e.eventWins, 3);
    assert.equal(e.eventCount, 3);
    assert.equal(e.href, '/shows/strongfest');
    assert.equal(e.venue, 'Hershey, PA');
    assert.equal(e.athleteName, b.athletes.find((a) => a.id === ids.grace).name);
    assert.equal(H.formatPlace(e), '1st of 3');
  });

  test('equal points and event wins: the final-event tiebreak decides, no tie flag', () => {
    const { ids, bundle: b } = bundle();
    const emily = H.buildShowHistoryEntry(row(ids.emily), b);
    const jessica = H.buildShowHistoryEntry(row(ids.jessica), b);
    assert.equal(emily.totalPoints, 4.5);
    assert.equal(jessica.totalPoints, 4.5);
    assert.equal(emily.place, 2, 'Emily placed higher on the last event');
    assert.equal(jessica.place, 3);
    assert.equal(emily.isTied, false);
    assert.equal(H.formatPlace(emily), '2nd of 3');
    assert.equal(H.formatPlace(jessica), '3rd of 3');
  });
  test('a true tie (same points, wins and final-event points) carries the T- prefix', () => {
    const { ids, bundle: b } = bundle();
    // make Emily and Jessica identical on every event
    b.results = b.results.map((r) => (r.athlete_id === ids.jessica ? { ...r, payload: { ...b.results.find((x) => x.athlete_id === ids.emily && x.event_id === r.event_id).payload } } : r));
    const emily = H.buildShowHistoryEntry(row(ids.emily), b);
    const jessica = H.buildShowHistoryEntry(row(ids.jessica), b);
    assert.equal(emily.place, jessica.place);
    assert.equal(emily.isTied, true);
    assert.equal(H.formatPlace(emily), 'T-2nd of 3');
  });

  test('scratched athlete: no place, label says so', () => {
    const { ids, bundle: b } = bundle();
    if (!ids.amber) return;
    const e = H.buildShowHistoryEntry(row(ids.amber, { athlete_status: 'withdrawn' }), b);
    assert.equal(e.place, null);
    assert.equal(e.withdrawn, true);
    assert.equal(H.formatPlace(e), 'Scratched');
  });

  test('unlisted show links to the public board; missing roster row returns null', () => {
    const { ids, bundle: b } = bundle();
    const e = H.buildShowHistoryEntry(row(ids.grace, { is_public_listed: false, venue_city: null, venue_state: 'Not provided' }), b);
    assert.equal(e.href, '/m/strongfest');
    assert.equal(e.venue, null);
    assert.equal(H.buildShowHistoryEntry(row('nobody'), b), null);
    assert.equal(H.buildShowHistoryEntry(row(ids.grace, { division_id: 'sf-g9' }), b), null);
  });
});

describe('showHistory helpers', () => {
  test('ordinals', () => {
    assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(H.PLACE_SUFFIX), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th']);
  });
  test('formatShowDate parses the ISO day without a timezone shift', () => {
    assert.equal(H.formatShowDate('2026-10-24'), 'Oct 24, 2026');
    assert.equal(H.formatShowDate('2026-01-01T00:00:00Z'), 'Jan 1, 2026');
    assert.equal(H.formatShowDate(null), '');
    assert.equal(H.formatShowDate('TBD'), 'TBD');
  });
  test('formatPlace: no score when nothing scored', () => {
    assert.equal(H.formatPlace({ place: null, isTied: false, fieldSize: 4, withdrawn: false }), 'No score');
  });
});
