import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
const ROOT = process.env.ZT_SYNC || '../lib/sync';
const M = await import(`${ROOT}/mapping.ts`);
const Q = await import(`${ROOT}/queue.ts`);
const PRESETS = process.env.ZT_PRESETS || '../lib/presets/index.ts';
const P = await import(PRESETS);

describe('mapping round-trips', () => {
  for (const presetId of ['strongfest-2026', 'york-iron-2026']) {
    test(`${presetId}: state -> rows -> state is lossless`, () => {
      const state = P.getInitialSeedState(presetId);
      state.results = [
        { id: `${state.events[0].id}_${state.athletes[0].id}`, eventId: state.events[0].id, athleteId: state.athletes[0].id, reps: 7, tier: 'heavy', locked: true, groundTouchWarned: true, updatedAt: 1760000000000 },
        { id: `${state.events[1].id}_${state.athletes[1].id}`, eventId: state.events[1].id, athleteId: state.athletes[1].id, risingBarAttempts: { 225: 'good', 245: 'fail' }, maxWeightLbs: 0, updatedAt: 1760000001000 },
      ];
      const rows = M.stateToRows(state, { slug: 'x', deviceId: 'dev1' });
      const back = M.rowsToState(rows);
      const { presetId: _p, ...meetNoPreset } = state.meet;   // presetId is client-only, not persisted
      // slug comes from the publish extra; isDemo/stations ride along on the meet row
      assert.deepEqual(back.meet, { ...meetNoPreset, slug: 'x', isDemo: !!state.meet.isDemo, stations: state.meet.stations ?? [{ id: 'A', label: 'Station 1' }, { id: 'B', label: 'Station 2' }] });
      assert.deepEqual(back.divisions, state.divisions);
      assert.deepEqual(back.events, state.events);
      assert.deepEqual(back.athletes, state.athletes);
      assert.deepEqual(back.results, state.results);
    });
  }
  test('event config holds every non-column field and nothing else', () => {
    const e = P.getInitialSeedState('york-iron-2026').events[1]; // trump weight axle
    const row = M.eventToRow(e);
    assert.deepEqual(Object.keys(row.config).sort(), ['divisionLightWeights', 'divisionWeights', 'hasTrumpWeight']);
    assert.equal(row.scoring_type, 'reps'); assert.equal(row.implement_empty_weight, 75);
  });
  test('event collarWeightPerPair rides in config and survives the round trip (10/26)', () => {
    const e = { ...P.getInitialSeedState('york-iron-2026').events[1], collarWeightPerPair: 7.5 };
    const row = M.eventToRow(e);
    assert.equal(row.config.collarWeightPerPair, 7.5);
    assert.equal(M.rowToEvent({ ...row, meet_id: 'm' }).collarWeightPerPair, 7.5);
    const legacy = M.rowToEvent({ ...M.eventToRow(P.getInitialSeedState('york-iron-2026').events[1]), meet_id: 'm' });
    assert.equal(legacy.collarWeightPerPair, undefined);   // pre-10/26 rows: engine falls back to the meet value
    assert.equal('collarWeightPerPair' in legacy, false);
    // PS-09: a string in config comes back numeric; junk is dropped (treated as absent)
    assert.equal(M.rowToEvent({ ...row, meet_id: 'm', config: { ...row.config, collarWeightPerPair: '10' } }).collarWeightPerPair, 10);
    assert.equal('collarWeightPerPair' in M.rowToEvent({ ...row, meet_id: 'm', config: { ...row.config, collarWeightPerPair: 'abc' } }), false);
  });
  test('result payload excludes ids/locked/updatedAt and row carries ISO time + device', () => {
    const row = M.resultToRow({ id: 'e_a', eventId: 'e', athleteId: 'a', reps: 3, locked: true, updatedAt: 1760000000000 }, 'm1', 'phone-7');
    assert.deepEqual(row.payload, { reps: 3 });
    assert.equal(row.locked, true); assert.equal(row.updated_at, '2025-10-09T08:53:20.000Z'); assert.equal(row.updated_by, 'phone-7');
    assert.equal(M.rowToResult(row).updatedAt, 1760000000000);
  });
  test('rowToMeet sorts plates descending and coerces numerics', () => {
    const m = M.rowToMeet({ id: 'm', slug: 's', name: 'N', date: null, admin_pin: '1234', run_order_method: 'reverse_overall', tiebreaker_rule: 'event_wins', available_plates: ['2.5', '45', '100'], collar_weight_per_pair: '5', stations: [], is_demo: false });
    assert.deepEqual(m.availablePlates, [100, 45, 2.5]); assert.equal(m.collarWeightPerPair, 5); assert.equal(m.date, '');
  });
});

describe('mergeResults (last writer wins)', () => {
  const r = (id, updatedAt, reps) => ({ id, eventId: 'e', athleteId: id, reps, updatedAt });
  test('newer incoming replaces, older incoming ignored, unknown added; unchanged returns same array', () => {
    const local = [r('a', 100, 1), r('b', 200, 2)];
    const { merged, changed } = M.mergeResults(local, [r('a', 150, 9), r('b', 50, 9), r('c', 10, 3)]);
    assert.equal(changed, true);
    const by = Object.fromEntries(merged.map((x) => [x.id, x]));
    assert.equal(by.a.reps, 9); assert.equal(by.b.reps, 2); assert.equal(by.c.reps, 3);
    const again = M.mergeResults(merged, [r('a', 150, 9)]);
    assert.equal(again.changed, false); assert.equal(again.merged, merged);
  });
});

describe('queue', () => {
  test('enqueue coalesces same table+id, keeps order, respects limit', () => {
    let q = [];
    q = Q.enqueue(q, { table: 'results', id: 'r1', row: { v: 1 } }, 1);
    q = Q.enqueue(q, { table: 'results', id: 'r2', row: { v: 1 } }, 2);
    q = Q.enqueue(q, { table: 'results', id: 'r1', row: { v: 2 } }, 3);
    assert.deepEqual(q.map((x) => [x.id, x.row.v, x.enqueuedAt]), [['r2', 1, 2], ['r1', 2, 3]]);
    let big = [];
    for (let i = 0; i < Q.QUEUE_LIMIT + 5; i++) big = Q.enqueue(big, { table: 'results', id: `x${i}`, row: {} }, i);
    assert.equal(big.length, Q.QUEUE_LIMIT); assert.equal(big[0].id, 'x5');
  });
  test('groupByTable and removeFlushed', () => {
    let q = [];
    q = Q.enqueue(q, { table: 'results', id: 'r1', row: {} }, 1);
    q = Q.enqueue(q, { table: 'live_state', id: 'm:A', row: {} }, 2);
    q = Q.enqueue(q, { table: 'results', id: 'r2', row: {} }, 3);
    const g = Q.groupByTable(q);
    assert.deepEqual(Object.keys(g).sort(), ['live_state', 'results']); assert.equal(g.results.length, 2);
    const rest = Q.removeFlushed(q, g.results);
    assert.deepEqual(rest.map((x) => x.id), ['m:A']);
  });
  test('readQueue tolerates garbage; writeQueue swallows errors', () => {
    assert.deepEqual(Q.readQueue({ getItem: () => '{bad' }), []);
    assert.deepEqual(Q.readQueue({ getItem: () => '{"a":1}' }), []);
    assert.deepEqual(Q.readQueue({ getItem: () => '[{"table":"results"}]' }), [{ table: 'results' }]);
    Q.writeQueue({ setItem: () => { throw new Error('full'); } }, []);
  });
});

describe('remote meet id override', () => {
  test('stateToRows stamps every row with the remote uuid while local meet.id stays', () => {
    const state = P.getInitialSeedState('strongfest-2026');
    state.results = [{ id: 'sf-ev-1_sf-ath-1', eventId: 'sf-ev-1', athleteId: 'sf-ath-1', reps: 1, updatedAt: 5 }];
    const uuid = '11111111-2222-3333-4444-555555555555';
    const rows = M.stateToRows(state, { slug: 'x', meetId: uuid });
    assert.equal(rows.meet.id, uuid);
    for (const coll of ['divisions', 'events', 'athletes', 'results']) for (const r of rows[coll]) assert.equal(r.meet_id, uuid);
    assert.equal(state.meet.id, 'strongfest-2026');
    const back = M.rowsToState(rows);
    assert.equal(back.meet.id, uuid); assert.equal(back.divisions[0].meetId, uuid);
  });
});
