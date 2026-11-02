// UI transition Phase 5: the scorer shell's pure model (components/scorer/scorerModel.ts).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const M = await import(`${ROOT}/components/scorer/scorerModel.ts`);

describe('navTabs', () => {
  test('admin sees all four tabs in order', () => {
    assert.deepEqual(M.navTabs('admin').map((t) => t.id), ['judge', 'pitcrew', 'standings', 'setup']);
  });
  test('judge: no setup; pit crew: no judge pad or setup', () => {
    assert.deepEqual(M.navTabs('judge').map((t) => t.id), ['judge', 'pitcrew', 'standings']);
    assert.deepEqual(M.navTabs('pitcrew').map((t) => t.id), ['pitcrew', 'standings']);
  });
  test('spectator sees the floor view as Next Up', () => {
    const tabs = M.navTabs('spectator');
    assert.deepEqual(tabs.map((t) => t.id), ['pitcrew', 'standings']);
    assert.equal(tabs[0].label, 'Next Up');
    assert.equal(M.navTabs('admin')[1].label, 'Pit Crew');
  });
});

describe('sheetLabel', () => {
  const ev = { eventNumber: 3 };
  test('judge and pit crew read the event number of the count', () => {
    assert.equal(M.sheetLabel('judge', { event: ev, eventCount: 5 }), 'E3 of 5');
    assert.equal(M.sheetLabel('pitcrew', { event: ev }), 'E3');
    assert.equal(M.sheetLabel('judge', { event: null, eventCount: 5 }), 'No event');
  });
  test('standings and setup', () => {
    assert.equal(M.sheetLabel('standings', {}), 'Standings');
    assert.equal(M.sheetLabel('setup', { setupSection: 'meet' }), 'Setup 1 of 6');
    assert.equal(M.sheetLabel('setup', { setupSection: 'athletes' }), 'Setup 5 of 6');
    assert.equal(M.sheetLabel('setup', {}), 'Setup 1 of 6');
  });
  test('SETUP_SECTIONS are numbered 1..6 in order', () => {
    assert.deepEqual(M.SETUP_SECTIONS.map((s) => s.n), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(M.SETUP_SECTIONS.map((s) => s.id), ['meet', 'divisions', 'events', 'stations', 'athletes', 'meets']);
  });
});

describe('stationChips / divisionOption', () => {
  test('falls back to the two default stations, All last', () => {
    assert.deepEqual(M.stationChips({}).map((c) => c.id), ['A', 'B', 'ALL']);
    assert.deepEqual(M.stationChips({ stations: [] }).map((c) => c.label), ['Station 1', 'Station 2', 'All']);
  });
  test('uses the meet stations when present', () => {
    const chips = M.stationChips({ stations: [{ id: 'X', label: 'Floor' }] });
    assert.deepEqual(chips, [{ id: 'X', label: 'Floor' }, { id: 'ALL', label: 'All' }]);
  });
  test('division option brackets the station label, or Unassigned', () => {
    const stations = [{ id: 'A', label: 'Station 1' }];
    assert.equal(M.divisionOption({ name: 'Open Men', flight: 'A' }, stations), '[Station 1] Open Men');
    assert.equal(M.divisionOption({ name: 'Open Men', flight: 'Z' }, stations), '[Unassigned (Z)] Open Men');
  });
});

describe('tv control / ordinal', () => {
  test('default is Sheet A, bright', () => {
    assert.deepEqual(M.TV_DEFAULT, { sheet: 'a', mode: 'home' });
  });
  test('tvControlWord', () => {
    assert.equal(M.tvControlWord('idle'), '');
    assert.equal(M.tvControlWord('saving'), 'Sending');
    assert.equal(M.tvControlWord('error'), 'Not sent');
    assert.equal(M.tvControlWord('offline'), 'Join the meet to drive the TV');
  });
  test('ordinal', () => {
    assert.equal(M.ordinal(1), '1st');
    assert.equal(M.ordinal(3), '3rd');
    assert.equal(M.ordinal(11), '11th');
  });
});
