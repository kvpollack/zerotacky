// Per-station event order (10/21). Run with the rest: bun test test/
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const E = await import(`${ROOT}/lib/engine/index.ts`);
const MB = await import(`${ROOT}/lib/meetBuilder.ts`);
const M = await import(`${ROOT}/lib/sync/mapping.ts`);

const ev = (id, eventNumber, name = id) => ({
  id, eventNumber, name, scoringType: 'reps', timeCapSeconds: 60, lanes: 1, loadingPoints: 2,
  weightEntryMode: 'total', implementEmptyWeight: 0, divisionWeights: {}, hasTrumpWeight: false,
});
// Deliberately out of array order so meet order comes from eventNumber, not position.
const EVENTS = [ev('e2', 2, 'Keg'), ev('e1', 1, 'Basket'), ev('e3', 3, 'Truck')];
const stA = { id: 'A', label: 'Station 1' };
const stB = { id: 'B', label: 'Station 2', eventOrder: ['e2', 'e1', 'e3'] };
const meet = { stations: [stA, stB] };
const divA = { id: 'd1', name: 'G1', flight: 'A', sortOrder: 1 };
const divB = { id: 'd3', name: 'G3', flight: 'B', sortOrder: 3 };
const ids = (list) => list.map((e) => e.id);

describe('normalizeEventOrder', () => {
  test('meet order or empty input collapses to undefined', () => {
    assert.equal(E.normalizeEventOrder(undefined, EVENTS), undefined);
    assert.equal(E.normalizeEventOrder([], EVENTS), undefined);
    assert.equal(E.normalizeEventOrder(['e1', 'e2', 'e3'], EVENTS), undefined);
    assert.equal(E.normalizeEventOrder(['e2'], []), undefined);
  });
  test('unknown ids dropped, duplicates dropped, missing appended in meet order', () => {
    assert.deepEqual(E.normalizeEventOrder(['e3', 'zzz', 'e3', 7], EVENTS), ['e3', 'e1', 'e2']);
    assert.deepEqual(E.normalizeEventOrder(['e2', 'e1', 'e3'], EVENTS), ['e2', 'e1', 'e3']);
  });
});

describe('stationEvents and lookups', () => {
  test('station without override follows eventNumber; override reorders', () => {
    assert.deepEqual(ids(E.stationEvents(stA, EVENTS)), ['e1', 'e2', 'e3']);
    assert.deepEqual(ids(E.stationEvents(undefined, EVENTS)), ['e1', 'e2', 'e3']);
    assert.deepEqual(ids(E.stationEvents(stB, EVENTS)), ['e2', 'e1', 'e3']);
  });
  test('stationForDivision / stationById / eventsForDivision', () => {
    assert.equal(E.stationForDivision(meet, divB)?.id, 'B');
    assert.equal(E.stationForDivision(meet, undefined), undefined);
    assert.equal(E.stationById(meet, 'ALL'), undefined);
    assert.equal(E.stationById(meet, 'B')?.id, 'B');
    assert.deepEqual(ids(E.eventsForDivision(meet, divB, EVENTS)), ['e2', 'e1', 'e3']);
    assert.deepEqual(ids(E.eventsForDivision(meet, divA, EVENTS)), ['e1', 'e2', 'e3']);
  });
  test('next and prior events follow the station order', () => {
    assert.equal(E.nextEventOnStation(stB, EVENTS, 'e2')?.id, 'e1');
    assert.equal(E.nextEventOnStation(stB, EVENTS, 'e1')?.id, 'e3');
    assert.equal(E.nextEventOnStation(stB, EVENTS, 'e3'), undefined);
    assert.equal(E.nextEventOnStation(stA, EVENTS, 'e1')?.id, 'e2');
    assert.equal(E.nextEventOnStation(stA, EVENTS, 'nope'), undefined);
    assert.deepEqual(ids(E.priorEventsOnStation(stB, EVENTS, EVENTS[1])), ['e2']);   // e1 on B: keg ran first
    assert.deepEqual(ids(E.priorEventsOnStation(stB, EVENTS, EVENTS[0])), []);        // e2 on B is first
    assert.deepEqual(ids(E.priorEventsOnStation(stA, EVENTS, EVENTS[2])), ['e1', 'e2']);
  });
  test('stationPosition and hasCustomEventOrder', () => {
    assert.equal(E.stationPosition(stB, EVENTS, 'e1'), 2);
    assert.equal(E.stationPosition(stA, EVENTS, 'e1'), 1);
    assert.equal(E.stationPosition(stA, EVENTS, 'x'), 0);
    assert.equal(E.hasCustomEventOrder(stA, EVENTS), false);
    assert.equal(E.hasCustomEventOrder(stB, EVENTS), true);
    assert.equal(E.hasCustomEventOrder({ id: 'C', label: 'c', eventOrder: ['e1', 'e2', 'e3'] }, EVENTS), false);
  });
  test('moveEventInOrder swaps neighbours, clamps at the ends, collapses back to meet order', () => {
    assert.deepEqual(E.moveEventInOrder(stA, EVENTS, 'e2', -1), ['e2', 'e1', 'e3']);
    assert.deepEqual(E.moveEventInOrder(stB, EVENTS, 'e2', 1), undefined);   // back to meet order
    assert.deepEqual(E.moveEventInOrder(stB, EVENTS, 'e2', -1), ['e2', 'e1', 'e3']); // already first
    assert.deepEqual(E.moveEventInOrder(stA, EVENTS, 'e3', 1), undefined);
    assert.deepEqual(E.moveEventInOrder(stB, EVENTS, 'e3', -1), ['e2', 'e3', 'e1']);
  });
});

describe('generateEventRunOrder with stations and lot_order', () => {
  const ath = (n, lot = n) => ({ id: `a${n}`, divisionId: 'd3', name: `A${n}`, lotNumber: lot, status: 'active', rackHeights: {} });
  const roster = [ath(1, 4), ath(2, 3), ath(3, 2), ath(4, 1)];
  const kegResults = roster.map((a, i) => ({ id: `e2_${a.id}`, eventId: 'e2', athleteId: a.id, reps: 10 - i }));
  const e1 = EVENTS[1], e2 = EVENTS[0];

  test('lot_order ignores results and always goes by lot number', () => {
    const ro = E.generateEventRunOrder(e1, divB, roster, EVENTS, kegResults, 'lot_order', meet.stations);
    assert.deepEqual(ro.map((r) => r.athlete.id), ['a4', 'a3', 'a2', 'a1']);
  });
  test('on station B, Ev 1 (basket) runs after keg, so keg results drive reverse_overall', () => {
    const ro = E.generateEventRunOrder(e1, divB, roster, EVENTS, kegResults, 'reverse_overall', meet.stations);
    // a1 has the most keg reps, so goes last
    assert.deepEqual(ro.map((r) => r.athlete.id), ['a4', 'a3', 'a2', 'a1']);
    assert.equal(ro[3].currentOverallPoints, 4);
  });
  test('on station B, Ev 2 (keg) is first: lot order even with basket results present', () => {
    const basketResults = roster.map((a, i) => ({ id: `e1_${a.id}`, eventId: 'e1', athleteId: a.id, reps: i + 1 }));
    const ro = E.generateEventRunOrder(e2, divB, roster, EVENTS, basketResults, 'reverse_overall', meet.stations);
    assert.deepEqual(ro.map((r) => r.athlete.id), ['a4', 'a3', 'a2', 'a1']);
    assert.equal(ro[0].currentOverallPoints, 0);
  });
  test('without stations the old eventNumber behaviour holds', () => {
    const divA3 = { ...divA, id: 'd3' };
    const ro = E.generateEventRunOrder(e2, divA3, roster, EVENTS, kegResults.map((r) => ({ ...r, eventId: 'e1' })), 'reverse_overall');
    assert.deepEqual(ro.map((r) => r.athlete.id), ['a4', 'a3', 'a2', 'a1']);
  });
});

describe('meetBuilder keeps station event orders valid', () => {
  const build = () => {
    let s = MB.createBlankMeet('Order Meet', '2026-10-24');
    s = MB.addEvent(s, { id: 'e1', name: 'Basket' });
    s = MB.addEvent(s, { id: 'e2', name: 'Keg' });
    s = MB.addEvent(s, { id: 'e3', name: 'Truck' });
    return s;
  };
  test('updateStation sets, normalises and clears eventOrder', () => {
    let s = build();
    s = MB.updateStation(s, 'B', { eventOrder: ['e2', 'e1', 'bogus'] });
    assert.deepEqual(s.meet.stations[1].eventOrder, ['e2', 'e1', 'e3']);
    assert.equal('eventOrder' in s.meet.stations[0], false);
    s = MB.updateStation(s, 'B', { label: 'Floor 2' });
    assert.deepEqual(s.meet.stations[1].eventOrder, ['e2', 'e1', 'e3']);   // label patch leaves order alone
    assert.equal(s.meet.stations[1].label, 'Floor 2');
    s = MB.updateStation(s, 'B', { eventOrder: ['e1', 'e2', 'e3'] });
    assert.equal('eventOrder' in s.meet.stations[1], false);                 // meet order = no key
    s = MB.updateStation(s, 'B', { eventOrder: ['e3'] });
    assert.deepEqual(s.meet.stations[1].eventOrder, ['e3', 'e1', 'e2']);
    s = MB.updateStation(s, 'B', { eventOrder: null });
    assert.equal('eventOrder' in s.meet.stations[1], false);
  });
  test('removeEvent drops the id; reorderEvents collapses an order that now matches; addEvent appends', () => {
    let s = build();
    s = MB.updateStation(s, 'B', { eventOrder: ['e2', 'e1', 'e3'] });
    s = MB.removeEvent(s, 'e2');
    assert.equal('eventOrder' in s.meet.stations[1], false);                 // [e1,e3] is meet order now
    s = build();
    s = MB.updateStation(s, 'B', { eventOrder: ['e2', 'e1', 'e3'] });
    s = MB.reorderEvents(s, ['e2', 'e1', 'e3']);
    assert.deepEqual(s.events.map((e) => e.id), ['e2', 'e1', 'e3']);
    assert.equal('eventOrder' in s.meet.stations[1], false);                 // station matches the new meet order
    s = build();
    s = MB.updateStation(s, 'B', { eventOrder: ['e3', 'e1', 'e2'] });
    s = MB.addEvent(s, { id: 'e4', name: 'Stones' });
    assert.deepEqual(s.meet.stations[1].eventOrder, ['e3', 'e1', 'e2', 'e4']);
  });
  test('normalizeState keeps a valid order, cleans a stale one, and accepts lot_order', () => {
    const s = build();
    const raw = JSON.parse(JSON.stringify(MB.updateStation(s, 'B', { eventOrder: ['e3', 'e1', 'e2'] })));
    raw.meet.stations[0].eventOrder = ['gone', 'e1'];
    raw.meet.runOrderMethod = 'lot_order';
    const n = MB.normalizeState(raw);
    assert.deepEqual(n.meet.stations[1].eventOrder, ['e3', 'e1', 'e2']);
    assert.equal('eventOrder' in n.meet.stations[0], false);
    assert.equal(n.meet.runOrderMethod, 'lot_order');
    const bad = MB.normalizeState({ ...raw, meet: { ...raw.meet, runOrderMethod: 'nonsense' } });
    assert.equal(bad.meet.runOrderMethod, 'reverse_overall');
  });
});

describe('mapping carries eventOrder', () => {
  test('meetToRow -> rowToMeet keeps per-station order and drops junk', () => {
    const m = {
      id: 'm', name: 'N', date: '', runOrderMethod: 'lot_order', tiebreakerRule: 'event_wins', availablePlates: [45],
      collarWeightPerPair: 5, stations: [{ id: 'A', label: 'S1' }, { id: 'B', label: 'S2', eventOrder: ['e2', 'e1'] }],
    };
    const row = M.meetToRow(m, { slug: 's' });
    assert.deepEqual(row.stations[1].eventOrder, ['e2', 'e1']);
    row.stations[1].eventOrder = ['e2', 5, 'e1'];
    const back = M.rowToMeet(row);
    assert.deepEqual(back.stations, [{ id: 'A', label: 'S1' }, { id: 'B', label: 'S2', eventOrder: ['e2', 'e1'] }]);
    assert.equal(back.runOrderMethod, 'lot_order');
  });
});
