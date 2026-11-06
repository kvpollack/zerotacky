// Feature gaps #7b: the phone board's "you're up" status for a followed athlete (lib/tv/youreUp.ts).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const U = await import(`${ROOT}/lib/tv/youreUp.ts`);

const ev = (n) => ({
  id: `e${n}`, meetId: 'm', eventNumber: n, name: `Event ${n}`, scoringType: 'reps', timeCapSeconds: 60, lanes: 1,
  loadingPoints: 0, weightEntryMode: 'total', implementEmptyWeight: 0, divisionWeights: { d1: 100 + n, d2: 200 + n },
});
const ath = (i, divisionId = 'd1') => ({ id: `a${i}`, divisionId, name: `Athlete ${i}`, lotNumber: i, status: 'active' });
const res = (e, a, reps) => ({ id: `${e}_${a}`, eventId: e, athleteId: a, reps, locked: true, updatedAt: 1 });
function meet() {
  return {
    meet: { id: 'm', name: 'Test Classic', date: '2026-11-14', runOrderMethod: 'lot_order', tiebreakerRule: 'event_wins', availablePlates: [], collarWeightPerPair: 0, stations: [{ id: 'A', label: 'Station 1' }, { id: 'B', label: 'Station 2' }] },
    divisions: [{ id: 'd1', meetId: 'm', name: 'Open', flight: 'A', sortOrder: 0 }, { id: 'd2', meetId: 'm', name: 'Novice', flight: 'B', sortOrder: 1 }],
    athletes: [ath(1), ath(2), ath(3), ath(4), ath(5), ath(90, 'd2')],
    events: [ev(1), ev(2)],
    results: [],
  };
}
const liveRow = (station, event_id, division_id, athlete_id) =>
  ({ meet_id: 'm', station, current_event_id: event_id, current_division_id: division_id, current_athlete_id: athlete_id, lane2_athlete_id: null, updated_at: '', updated_by: null });

describe('you\'re up', () => {
  test('up, on deck, queued, scored and waiting', () => {
    const s = meet();
    s.results.push(res('e1', 'a1', 5));
    const live = [liveRow('A', 'e1', 'd1', 'a2')];
    assert.equal(U.upStatus(s, live, 'a2').kind, 'up');
    const deck = U.upStatus(s, live, 'a3');
    assert.equal(deck.kind, 'on_deck'); assert.equal(deck.away, 1);
    const deck2 = U.upStatus(s, live, 'a4');
    assert.equal(deck2.kind, 'on_deck'); assert.equal(deck2.away, 2);
    const q = U.upStatus(s, live, 'a5');
    assert.equal(q.kind, 'queued'); assert.equal(q.away, 3);
    const done = U.upStatus(s, live, 'a1');
    assert.equal(done.kind, 'scored'); assert.match(done.result, /^5/); assert.equal(done.nextEventName, 'Event 2');
    const w = U.upStatus(s, live, 'a90');
    assert.equal(w.kind, 'waiting'); assert.equal(w.stationLabel, 'Station 2');
    assert.equal(U.upStatus(s, live, 'ghost').kind, 'unknown');
    assert.equal(U.upStatus(s, live, null).kind, 'unknown');
  });
  test('scored rows ahead do not count toward "away"', () => {
    const s = meet();
    s.results.push(res('e1', 'a1', 5), res('e1', 'a3', 2));
    const live = [liveRow('A', 'e1', 'd1', 'a2')];
    const q = U.upStatus(s, live, 'a5');
    assert.equal(q.away, 2);   // a4 then a5
  });
  test('lines and notify keys', () => {
    const s = meet();
    const live = [liveRow('A', 'e1', 'd1', 'a2')];
    const up = U.upLine(U.upStatus(s, live, 'a2'));
    assert.equal(up.title, 'Athlete 2 is up'); assert.match(up.detail, /Station 1 · Event 1 \(event 1 of 2\)/); assert.equal(up.tone, 'up');
    const deck = U.upLine(U.upStatus(s, live, 'a3'));
    assert.equal(deck.title, 'Athlete 3 is on deck'); assert.match(deck.detail, /^Next on Station 1/); assert.equal(deck.tone, 'soon');
    assert.equal(U.upLine(U.upStatus(s, live, 'a5')).title, 'Athlete 5: 3 away');
    assert.equal(U.upLine(U.upStatus(s, live, 'a90')).detail, 'Novice is not on Station 2 yet');
    assert.equal(U.notifyKey(U.upStatus(s, live, 'a2')), 'up:a2:Event 1');
    assert.equal(U.notifyKey(U.upStatus(s, live, 'a3')), 'deck:a3:Event 1');
    assert.equal(U.notifyKey(U.upStatus(s, live, 'a5')), null);
    assert.equal(U.FOLLOW_KEY('x'), 'zt:follow:x');
  });
});
