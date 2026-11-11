// 11/11 scoring audit follow-ups (audits/slate-2026-11-10-scoring-vs-iron-podium.md open items 1, 2, 3, 5):
// Wessels attempt tiebreak on max weight, hold events (max_time), max-distance events without a finish, and the
// promoter's word for one implement. Pure engine, meetBuilder and pad-model checks.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const E = await import('../lib/engine/index.ts');
const MB = await import('../lib/meetBuilder.ts');
const PAD = await import('../components/judge/padModel.ts');

const ath = (id, lot) => ({ id, divisionId: 'd', name: id.toUpperCase(), lotNumber: lot, status: 'active' });
const A = [ath('a', 1), ath('b', 2), ath('c', 3)];
const base = { id: 'e1', meetId: 'm', eventNumber: 1, lanes: 1, loadingPoints: 2, weightEntryMode: 'total', implementEmptyWeight: 0, divisionWeights: {}, timeCapSeconds: 60 };
const res = (athleteId, extra) => ({ id: `e1_${athleteId}`, eventId: 'e1', athleteId, updatedAt: 1, ...extra });
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.athleteId, r]));

describe('max_time (hold): longer wins, cap ignored', () => {
  const ev = { ...base, name: 'Hercules hold', scoringType: 'max_time', timeCapSeconds: 60 };
  test('ranks by time descending, zero hold scores zero, a time over the cap still counts', () => {
    const rows = byId(E.scoreSingleEvent(ev, A, [res('a', { timeSeconds: 41.3 }), res('b', { timeSeconds: 95.02 }), res('c', { timeSeconds: 0 })]));
    assert.equal(rows.b.place, 1); assert.equal(rows.b.points, 3); assert.equal(rows.b.displayScore, '95.02s');
    assert.equal(rows.a.place, 2); assert.equal(rows.a.points, 2);
    assert.equal(rows.c.isZero, true); assert.equal(rows.c.points, 0); assert.equal(rows.c.place, 3);
  });
  test('equal holds split the points', () => {
    const rows = byId(E.scoreSingleEvent(ev, A, [res('a', { timeSeconds: 50 }), res('b', { timeSeconds: 50 }), res('c', { timeSeconds: 10 })]));
    assert.equal(rows.a.points, 2.5); assert.equal(rows.b.points, 2.5); assert.equal(rows.a.isTied, true);
  });
  test('resultHasScore and the pad model treat a hold like a stamped time', () => {
    assert.equal(E.resultHasScore(res('a', { timeSeconds: 12 }), ev), true);
    assert.equal(E.resultHasScore(res('a', { timeSeconds: 0 }), ev), false);
    assert.deepEqual(PAD.pressPatch(ev, {}, 'good', 33.3), { timeSeconds: 33.3, didNotStart: false });
    assert.deepEqual(PAD.pressPatch(ev, {}, 'no', 33.3), { timeSeconds: 0, didNotStart: false });
    assert.deepEqual(PAD.undoPatch(ev, { timeSeconds: 33.3 }), { timeSeconds: 0 });
    assert.equal(PAD.canUndo(ev, { timeSeconds: 33.3 }), true);
    assert.deepEqual(PAD.keyLabels('max_time'), { good: 'Drop', no: 'No hold', qtyCap: 'hold' });
  });
});

describe('max_weight with the Wessels attempt tiebreak', () => {
  const plain = { ...base, name: 'Log', scoringType: 'max_weight' };
  const wessels = { ...plain, maxTiebreak: 'attempts' };
  const tape = (weights) => weights.map(([w, k]) => ({ kind: k, at: 0, weight: w }));
  test('without the rule equal weights split the points', () => {
    const rows = byId(E.scoreSingleEvent(plain, A, [
      res('a', { attemptLog: tape([[250, 'good'], [270, 'good']]), risingBarAttempts: { 250: 'good', 270: 'good' } }),
      res('b', { attemptLog: tape([[250, 'good'], [270, 'no'], [270, 'good']]), risingBarAttempts: { 250: 'good', 270: 'good' } }),
      res('c', { maxWeightLbs: 230 }),
    ]));
    assert.equal(rows.a.points, 2.5); assert.equal(rows.b.points, 2.5); assert.equal(rows.a.displayScore, '270 lbs');
  });
  test('with the rule the earlier attempt wins and the display carries the attempt number', () => {
    const rows = byId(E.scoreSingleEvent(wessels, A, [
      res('a', { attemptLog: tape([[250, 'good'], [270, 'good']]), risingBarAttempts: { 250: 'good', 270: 'good' } }),
      res('b', { attemptLog: tape([[250, 'good'], [270, 'no'], [270, 'good']]), risingBarAttempts: { 250: 'good', 270: 'good' } }),
      res('c', { maxWeightLbs: 230 }),
    ]));
    assert.equal(rows.a.place, 1); assert.equal(rows.a.points, 3); assert.equal(rows.a.displayScore, '270 lbs (att 2)');
    assert.equal(rows.b.place, 2); assert.equal(rows.b.points, 2); assert.equal(rows.b.displayScore, '270 lbs (att 3)');
    assert.equal(rows.a.isTied, false);
  });
  test('bestLiftAttempt: typed override, tape, rising-bar grid, unknown', () => {
    assert.equal(E.bestLiftAttempt(res('a', { maxWeightLbs: 300, maxWeightAttempt: 2 })), 2);
    assert.equal(E.bestLiftAttempt(res('a', { attemptLog: tape([[250, 'no'], [250, 'good'], [270, 'no']]), risingBarAttempts: { 250: 'good', 270: 'fail' } })), 2);
    // grid only (older pad, no tape): good 230, fail 250, good 250 is one key per weight -> 2 attempts to the best
    assert.equal(E.bestLiftAttempt(res('a', { risingBarAttempts: { 230: 'good', 250: 'good', 270: 'fail' } })), 2);
    // a typed max above anything on the tape has no attempt number
    assert.equal(E.bestLiftAttempt(res('a', { maxWeightLbs: 320, attemptLog: tape([[250, 'good']]), risingBarAttempts: { 250: 'good' } })), 0);
    assert.equal(E.bestLiftAttempt(res('a', { didNotStart: true, maxWeightLbs: 300 })), 0);
  });
  test('an unknown attempt ranks below a known one at the same weight; two unknowns still split', () => {
    const rows = byId(E.scoreSingleEvent(wessels, A, [
      res('a', { maxWeightLbs: 300 }),
      res('b', { maxWeightLbs: 300, maxWeightAttempt: 3 }),
      res('c', { maxWeightLbs: 300 }),
    ]));
    assert.equal(rows.b.place, 1); assert.equal(rows.a.points, 1.5); assert.equal(rows.c.points, 1.5);
    assert.equal(rows.a.displayScore, '300 lbs');
  });
});

describe('time_or_distance with distanceOnly (max distance)', () => {
  const ev = { ...base, name: 'Sandbag toss', scoringType: 'time_or_distance', distanceOnly: true };
  test('furthest mark wins, no DNF suffix, the clock is ignored', () => {
    const rows = byId(E.scoreSingleEvent(ev, A, [
      res('a', { distanceFeet: 42.5, timeSeconds: 12 }),
      res('b', { distanceFeet: 51 }),
      res('c', { distanceFeet: 0, timeSeconds: 30 }),
    ]));
    assert.equal(rows.b.place, 1); assert.equal(rows.b.displayScore, '51 ft');
    assert.equal(rows.a.place, 2); assert.equal(rows.a.displayScore, '42.5 ft');
    assert.equal(rows.c.isZero, true); assert.equal(rows.c.displayScore, '0 ft');
    assert.equal(E.resultHasScore(res('c', { timeSeconds: 30 }), ev), false);
  });
  test('the plain event still prints (DNF) and ranks a finish above any distance', () => {
    const plain = { ...ev, distanceOnly: undefined };
    const rows = byId(E.scoreSingleEvent(plain, A, [res('a', { distanceFeet: 42.5 }), res('b', { timeSeconds: 55 }), res('c', { distanceFeet: 60 })]));
    assert.equal(rows.b.place, 1); assert.equal(rows.a.displayScore, '42.5 ft (DNF)'); assert.equal(rows.c.place, 2);
  });
  test('pad labels and clock usage', () => {
    assert.deepEqual(PAD.keyLabels('time_or_distance', ev), { good: 'Mark', no: 'No mark', qtyCap: 'mark' });
    assert.equal(E.usesTimeCap(ev), false);
    assert.equal(E.usesTimeCap({ scoringType: 'time_or_distance' }), true);
    assert.equal(E.usesTimeCap({ scoringType: 'max_time' }), false);
  });
});

describe('implementLabel: the word for one implement', () => {
  const ev = { ...base, name: 'Stone series', scoringType: 'time_or_implements', implementCount: 5, implementLabel: 'stones' };
  test('standings use the word; default stays impl', () => {
    const rows = byId(E.scoreSingleEvent(ev, A, [res('a', { implementsCompleted: 3, splitTimeSeconds: 41.2 }), res('b', { implementsCompleted: 5, timeSeconds: 50 }), res('c', { implementsCompleted: 0 })]));
    assert.equal(rows.a.displayScore, '3 stones @ 41.20s');
    assert.equal(rows.b.displayScore, 'All in 50.00s');
    assert.equal(rows.c.displayScore, '0 stones');
    const plain = byId(E.scoreSingleEvent({ ...ev, implementLabel: undefined }, A, [res('a', { implementsCompleted: 3 })]));
    assert.equal(plain.a.displayScore, '3 impl');
  });
  test('normaliser: trims, strips control characters, 1..12 chars, "impl" means absent', () => {
    assert.equal(E.normalizeImplementLabel('  bags '), 'bags');
    assert.equal(E.normalizeImplementLabel('ke\u0007gs'), 'kegs');
    assert.equal(E.normalizeImplementLabel(''), undefined);
    assert.equal(E.normalizeImplementLabel('impl'), undefined);
    assert.equal(E.normalizeImplementLabel('x'.repeat(13)), undefined);
    assert.equal(E.normalizeImplementLabel(42), undefined);
    assert.equal(E.implementWord({ scoringType: 'time_or_implements' }), 'impl');
    assert.equal(PAD.keyLabels('time_or_implements', ev).qtyCap, 'stones');
    assert.equal(PAD.keyLabels('time_or_implements', { implementLabel: 'bags' }).qtyCap, 'bags');
  });
});

describe('eventKinds labels and normalisers', () => {
  test('scoring type list and fallbacks', () => {
    assert.deepEqual([...E.SCORING_TYPES], ['reps', 'max_weight', 'time_or_distance', 'time_or_implements', 'max_time']);
    assert.equal(E.normalizeScoringType('max_time'), 'max_time');
    assert.equal(E.normalizeScoringType('bogus'), 'reps');
    assert.equal(E.normalizeMaxTiebreak('attempts'), 'attempts');
    assert.equal(E.normalizeMaxTiebreak('x'), undefined);
  });
  test('labels in the three styles', () => {
    assert.equal(E.scoringTypeLabel({ scoringType: 'max_time' }, 'long'), 'Longest Hold');
    assert.equal(E.scoringTypeLabel({ scoringType: 'max_time' }, 'setup'), 'Hold');
    assert.equal(E.scoringTypeLabel({ scoringType: 'time_or_distance', distanceOnly: true }, 'long'), 'Furthest Distance');
    assert.equal(E.scoringTypeLabel({ scoringType: 'time_or_distance' }, 'long'), 'Fastest Time / Distance if Capped');
    assert.equal(E.scoringTypeLabel({ scoringType: 'max_weight', maxFormat: 'rising_bar' }), 'Max weight (rising bar)');
    assert.equal(E.scoringTypeLabel({ scoringType: 'time_or_implements', implementLabel: 'stones' }), 'Time or stones');
    assert.equal(E.scoringTypeLabel({ scoringType: 'time_or_implements' }, 'setup'), 'Stones / Impl');
    assert.match(E.scoringRuleText({ scoringType: 'max_weight', maxTiebreak: 'attempts' }), /Wessels/);
    assert.match(E.scoringRuleText({ scoringType: 'time_or_implements', implementLabel: 'kegs' }), /All kegs/);
  });
});

describe('meetBuilder keeps the per-kind flags on their own kind', () => {
  test('flags are normalised on add and dropped on a type change', () => {
    let s = MB.createBlankMeet('Flags');
    s = MB.addDivision(s, { name: 'Open' });
    s = MB.addEvent(s, { id: 'e1', name: 'Log', scoringType: 'max_weight', maxTiebreak: 'attempts', distanceOnly: true, implementLabel: 'stones' });
    let e1 = s.events.find((e) => e.id === 'e1');
    assert.equal(e1.maxTiebreak, 'attempts'); assert.equal(e1.distanceOnly, undefined); assert.equal(e1.implementLabel, undefined);
    s = MB.updateEvent(s, 'e1', { scoringType: 'time_or_implements', implementLabel: ' Bags ' });
    e1 = s.events.find((e) => e.id === 'e1');
    assert.equal(e1.maxTiebreak, undefined); assert.equal(e1.implementLabel, 'Bags'); assert.equal(e1.implementCount, 5);
    s = MB.updateEvent(s, 'e1', { scoringType: 'time_or_distance', distanceOnly: true });
    e1 = s.events.find((e) => e.id === 'e1');
    assert.equal(e1.distanceOnly, true); assert.equal(e1.implementLabel, undefined);
    s = MB.updateEvent(s, 'e1', { scoringType: 'max_time' });
    e1 = s.events.find((e) => e.id === 'e1');
    assert.equal(e1.scoringType, 'max_time'); assert.equal(e1.distanceOnly, undefined);
  });
  test('normalizeState accepts max_time and keeps the flags; unknown types fall back to reps', () => {
    const raw = {
      meet: { id: 'm', name: 'N', date: '', runOrderMethod: 'reverse_overall', tiebreakerRule: 'lookback', availablePlates: [45], collarWeightPerPair: 0 },
      divisions: [{ id: 'd', meetId: 'm', name: 'Open', flight: 'A', sortOrder: 1 }],
      athletes: [],
      events: [
        { id: 'h', meetId: 'm', eventNumber: 1, name: 'Hold', scoringType: 'max_time', timeCapSeconds: 60 },
        { id: 't', meetId: 'm', eventNumber: 2, name: 'Toss', scoringType: 'time_or_distance', distanceOnly: true, timeCapSeconds: 60 },
        { id: 'x', meetId: 'm', eventNumber: 3, name: 'Odd', scoringType: 'teleport', maxTiebreak: 'attempts', timeCapSeconds: 60 },
      ],
      results: [],
    };
    const s = MB.normalizeState(raw);
    const by = Object.fromEntries(s.events.map((e) => [e.id, e]));
    assert.equal(by.h.scoringType, 'max_time');
    assert.equal(by.t.distanceOnly, true);
    assert.equal(by.x.scoringType, 'reps'); assert.equal(by.x.maxTiebreak, undefined);
  });
});
