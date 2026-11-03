// Astra DR3-01 / DR3-02 / DR3-12 (11/3): where the judge pad lands and what survives a reload.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
const ROOT = process.env.ZT_ROOT || '..';
const S = await import(`${ROOT}/lib/scorerSelection.ts`);

const meet = { id: 'm1', slug: 'dry-run', stations: [{ id: 'A', label: 'Station 1' }, { id: 'B', label: 'Station 2', eventOrder: ['e2', 'e1', 'e3'] }] };
const divisions = [
  { id: 'g1', meetId: 'm1', name: 'Group 1', flight: 'A', sortOrder: 1 },
  { id: 'g2', meetId: 'm1', name: 'Group 2', flight: 'A', sortOrder: 2 },
  { id: 'g3', meetId: 'm1', name: 'Group 3', flight: 'B', sortOrder: 3 },
  { id: 'g4', meetId: 'm1', name: 'Group 4', flight: 'B', sortOrder: 4 },
  { id: 'g5', meetId: 'm1', name: 'Group 5', flight: 'B', sortOrder: 5 },
];
const events = [1, 2, 3].map((n) => ({ id: `e${n}`, meetId: 'm1', eventNumber: n, name: `E${n}`, scoringType: 'reps', timeCapSeconds: 60, lanes: 1, divisionWeights: {} }));
const ath = (id, div, lot) => ({ id, divisionId: div, name: id, lotNumber: lot, status: 'active' });
const athletes = [ath('a1', 'g1', 1), ath('a2', 'g1', 2), ath('b1', 'g2', 1), ath('c1', 'g3', 1), ath('d1', 'g4', 1), ath('d2', 'g4', 2), ath('f1', 'g5', 1)];
const locked = (e, a) => ({ id: `${e}_${a}`, eventId: e, athleteId: a, reps: 3, locked: true });
const state = { meet, divisions, events, athletes };

class MemStorage { constructor() { this.m = new Map(); } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, v); } }

describe('stationLanding (DR2-01 + DR3-12)', () => {
  test('fresh station: its first event in its own order, first division', () => {
    assert.deepEqual(S.stationLanding(meet, 'B', divisions, events, athletes, []), { divisionId: 'g3', eventId: 'e2' });
    assert.deepEqual(S.stationLanding(meet, 'A', divisions, events, athletes, []), { divisionId: 'g1', eventId: 'e1' });
  });
  test('Station B with Event 2 done for every group and Group 3 Event 1 done lands on Group 4 Event 1, not Group 3 Event 3', () => {
    const results = [locked('e2', 'c1'), locked('e2', 'd1'), locked('e2', 'd2'), locked('e2', 'f1'), locked('e1', 'c1')];
    assert.deepEqual(S.stationLanding(meet, 'B', divisions, events, athletes, results), { divisionId: 'g4', eventId: 'e1' });
  });
  test('everything locked: first event and first division as the fallback', () => {
    const results = events.flatMap((e) => athletes.filter((a) => ['g3', 'g4', 'g5'].includes(a.divisionId)).map((a) => locked(e.id, a.id)));
    assert.deepEqual(S.stationLanding(meet, 'B', divisions, events, athletes, results), { divisionId: 'g3', eventId: 'e2' });
  });
  test('scratched athletes do not hold an event open; ALL spans every division; unknown station is null', () => {
    const scratched = athletes.map((a) => (a.id === 'c1' ? { ...a, status: 'scratched' } : a));
    const results = [locked('e2', 'd1'), locked('e2', 'd2'), locked('e2', 'f1')];
    // Group 3's only athlete is scratched, so it never holds an event open; Event 2 is done elsewhere -> Group 4 Event 1
    assert.deepEqual(S.stationLanding(meet, 'B', divisions, events, scratched, results), { divisionId: 'g4', eventId: 'e1' });
    assert.deepEqual(S.stationLanding(meet, 'ALL', divisions, events, athletes, []), { divisionId: 'g1', eventId: 'e1' });
    assert.equal(S.stationLanding(meet, 'Z', divisions, events, athletes, []), null);
  });
});

describe('selection persistence (DR3-02)', () => {
  test('round trip: what the judge had is what comes back', () => {
    const st = new MemStorage();
    S.writeSelection(st, { meet: 'm1', station: 'A', division: 'g2', event: 'e1', athlete: 'b1' });
    const back = S.restoreSelection(S.readSelection(st, S.meetKey(meet)), state);
    assert.deepEqual(back, { station: 'A', division: 'g2', event: 'e1', athlete: 'b1' });
  });
  test('another meet, or nothing saved, gives the old defaults with an empty athlete (run order picks lot 1)', () => {
    const st = new MemStorage();
    S.writeSelection(st, { meet: 'other', station: 'B', division: 'g3', event: 'e2', athlete: 'c1' });
    assert.deepEqual(S.restoreSelection(S.readSelection(st, 'm1'), state), { station: 'A', division: 'g1', event: 'e1', athlete: '' });
    assert.deepEqual(S.restoreSelection(null, state), { station: 'A', division: 'g1', event: 'e1', athlete: '' });
  });
  test('stale parts fall back one at a time', () => {
    const saved = { meet: 'm1', station: 'B', division: 'gone', event: 'e3', athlete: 'a1' };
    // station kept, division defaults to the first on that station, event kept, athlete dropped (not in that division)
    assert.deepEqual(S.restoreSelection(saved, state), { station: 'B', division: 'g3', event: 'e3', athlete: '' });
    assert.deepEqual(S.restoreSelection({ meet: 'm1', station: 'ALL', division: 'g5', event: 'nope', athlete: 'f1' }, state), { station: 'ALL', division: 'g5', event: 'e1', athlete: 'f1' });
  });
  test('garbage in storage reads as nothing; a storage that throws is ignored', () => {
    const st = new MemStorage(); st.setItem(S.SELECTION_KEY, '{not json');
    assert.equal(S.readSelection(st, 'm1'), null);
    const boom = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    assert.equal(S.readSelection(boom, 'm1'), null);
    assert.doesNotThrow(() => S.writeSelection(boom, { meet: 'm1', station: 'A', division: '', event: '', athlete: '' }));
    assert.equal(S.meetKey({ id: '', slug: 'x', stations: [] }), 'x');
  });
});
