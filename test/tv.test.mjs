// UI transition Phase 2: the venue TV's view models (lib/tv/model.ts). Pure functions over a small meet.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const M = await import(`${ROOT}/lib/tv/model.ts`);

const ev = (n, extra = {}) => ({
  id: `e${n}`, meetId: 'm', eventNumber: n, name: `Event ${n}`, scoringType: 'reps', timeCapSeconds: 60, lanes: 1,
  loadingPoints: 0, weightEntryMode: 'total', implementEmptyWeight: 0, divisionWeights: { d1: 100 + n, d2: 200 + n }, ...extra,
});
const ath = (i, divisionId = 'd1') => ({ id: `a${i}`, divisionId, name: `Athlete ${i} Surname${i}`, lotNumber: i, status: 'active' });
const res = (e, a, reps, locked = true) => ({ id: `${e}_${a}`, eventId: e, athleteId: a, reps, locked, updatedAt: 1 });

function meet(nAth = 5, nEv = 3) {
  const athletes = Array.from({ length: nAth }, (_, i) => ath(i + 1));
  athletes.push(ath(90, 'd2'));
  return {
    meet: { id: 'm', name: 'Test Classic', date: '2026-11-14', runOrderMethod: 'lot_order', tiebreakerRule: 'event_wins', availablePlates: [], collarWeightPerPair: 0, stations: [{ id: 'A', label: 'Station 1' }, { id: 'B', label: 'Station 2' }] },
    divisions: [{ id: 'd1', meetId: 'm', name: 'Open', flight: 'A', sortOrder: 0 }, { id: 'd2', meetId: 'm', name: 'Novice', flight: 'B', sortOrder: 1 }],
    athletes,
    events: Array.from({ length: nEv }, (_, i) => ev(i + 1)),
    results: [],
  };
}
const liveRow = (station, event_id, division_id, athlete_id, lane2 = null) =>
  ({ meet_id: 'm', station, current_event_id: event_id, current_division_id: division_id, current_athlete_id: athlete_id, lane2_athlete_id: lane2, updated_at: '', updated_by: null });

describe('tv model: helpers', () => {
  test('sheet and mode guards', () => {
    assert.ok(M.isSheet('a') && M.isSheet('b') && !M.isSheet('c') && !M.isSheet(null));
    assert.ok(M.isMode('home') && M.isMode('dark') && !M.isMode('light'));
  });
  test('date reads like the title block: Sat 14 Nov 2026', () => {
    assert.equal(M.formatSheetDate('2026-11-14'), 'Sat 14 Nov 2026');
    assert.equal(M.formatSheetDate(null), '—');
  });
  test('surname and points formatting', () => {
    assert.equal(M.surname('Luis Santangelo'), 'Santangelo');
    assert.equal(M.surname('Cher'), 'Cher');
    assert.equal(M.fmtPts(3), '3');
    assert.equal(M.fmtPts(2.5), '2.5');
  });
  test('rev letter advances with locked scores only', () => {
    assert.equal(M.revFor([]), 'A');
    assert.equal(M.revFor([res('e1', 'a1', 3), res('e1', 'a2', 4, false)]), 'B');
  });
  test('venue line', () => {
    assert.equal(M.venueLine({ facilityName: 'Northbank Barbell', city: 'Erie', state: 'PA' }), 'Northbank Barbell, Erie PA');
    assert.equal(M.venueLine(null), '—');
  });
  test('event spec: weight, scoring, cap', () => {
    assert.equal(M.eventSpec(ev(1), 'd1'), '101 lb · reps · 60 s cap');
  });
});

describe('tv model: station choice', () => {
  test('asked-for station wins, else the live one, else the first', () => {
    const s = meet();
    assert.equal(M.pickStation(s, [], null).id, 'A');
    assert.equal(M.pickStation(s, [liveRow('B', 'e1', 'd2', 'a90')], null).id, 'B');
    assert.equal(M.pickStation(s, [liveRow('B', 'e1', 'd2', 'a90')], 'a').id, 'A');
  });
});

describe('tv model: Sheet A', () => {
  test('null without a live event on the station', () => {
    const s = meet();
    assert.equal(M.buildSheetA(s, [], s.meet.stations[0]), null);
  });
  test('live athlete, target before a score, result after, on deck follows the order', () => {
    const s = meet();
    const live = [liveRow('A', 'e1', 'd1', 'a2')];
    let a = M.buildSheetA(s, live, s.meet.stations[0]);
    assert.equal(a.athlete.id, 'a2');
    assert.equal(a.eventIndex, 1);
    assert.equal(a.eventCount, 3);
    assert.equal(a.mark.cap, 'Target');
    assert.equal(a.mark.pen, false);
    assert.equal(a.mark.value, '101 lb');
    assert.equal(a.status, 'On platform');
    assert.equal(a.runPosition, 2);
    assert.deepEqual(a.onDeck.map((x) => x.id), ['a3', 'a4']);
    assert.equal(a.parts.find((p) => p.athleteId === 'a2').status, 'live');
    assert.equal(a.parts.find((p) => p.athleteId === 'a3').status, 'on deck');
    assert.equal(a.next.id, 'e2');
    assert.equal(a.ladderTitle, 'Divisions on this event');
    assert.equal(a.ladder.length, 1);   // only d1 is on station A
    s.results.push(res('e1', 'a2', 7));
    a = M.buildSheetA(s, live, s.meet.stations[0]);
    assert.equal(a.mark.pen, true);
    assert.equal(a.mark.cap, 'Result · locked');
    assert.equal(a.status, 'Scored');
    assert.equal(a.parts.find((p) => p.athleteId === 'a2').result, '7 reps');
    assert.equal(a.rev, 'B');
  });
  test('rising bar event shows the ladder with the athlete\'s attempts', () => {
    const s = meet();
    s.events[0] = ev(1, { scoringType: 'max_weight', maxFormat: 'rising_bar', risingBarWeights: [200, 220, 240] });
    s.results.push({ id: 'e1_a1', eventId: 'e1', athleteId: 'a1', maxWeightLbs: 220, risingBarAttempts: { 200: 'good', 220: 'good', 240: 'fail' }, updatedAt: 1 });
    const a = M.buildSheetA(s, [liveRow('A', 'e1', 'd1', 'a1')], s.meet.stations[0]);
    assert.equal(a.ladderTitle, 'Rising bar');
    assert.deepEqual(a.ladder.map((r) => r.state), ['good', 'good', 'fail']);
  });
  test('running order window keeps the live athlete in view', () => {
    const parts = Array.from({ length: 30 }, (_, i) => ({ item: i + 1, lot: i + 1, name: '', athleteId: `a${i + 1}`, result: '', points: '', status: '' }));
    assert.equal(M.partsWindow(parts, 0).length, 14);
    assert.equal(M.partsWindow(parts, 10)[0].item, 8);    // three before the live athlete
    assert.equal(M.partsWindow(parts, 20)[0].item, 17);   // clamped to the end of the order
    assert.equal(M.partsWindow(parts, 30)[0].item, 17);
    assert.equal(M.partsWindow(parts.slice(0, 8), 3).length, 8);
  });
});

describe('tv model: Sheet B', () => {
  test('pages of 12, live division first, wins ringed, blank until scored', () => {
    const s = meet(25, 2);
    s.results.push(res('e1', 'a1', 10), res('e1', 'a2', 8));
    const live = [liveRow('B', 'e1', 'd2', 'a90')];
    const pages = M.buildCardPages(s, live, null);
    assert.equal(pages[0].division.id, 'd2');            // live division opens the rotation
    const open = pages.filter((p) => p.division.id === 'd1');
    assert.equal(open.length, 3);
    assert.deepEqual(open.map((p) => [p.from, p.to]), [[1, 12], [13, 24], [25, 25]]);
    assert.equal(open[0].count, 25);
    assert.equal(open[0].afterEvent.id, 'e1');
    const r1 = open[0].rows[0];
    assert.equal(r1.athleteId, 'a1');
    assert.equal(r1.cells[0].win, true);
    assert.equal(r1.cells[0].display, '10 reps');
    assert.equal(r1.cells[1].empty, true);
    const unscored = open[0].rows.find((r) => r.athleteId === 'a3');
    assert.equal(unscored.total, '');
    assert.equal(unscored.cells[0].points, '');
  });
  test('one division asked for, no live row', () => {
    const s = meet(3, 1);
    const pages = M.buildCardPages(s, [], 'd1');
    assert.equal(pages.length, 1);
    assert.equal(pages[0].liveEventId, null);
    assert.equal(pages[0].pages, 1);
  });
});

describe('tv model: idle', () => {
  test('schedule lists every event with the first division\'s spec', () => {
    const idle = M.buildIdle(meet(2, 3));
    assert.equal(idle.schedule.length, 3);
    assert.equal(idle.schedule[0].spec, '101 lb · reps · 60 s cap');
    assert.equal(idle.rev, 'A');
  });
});
