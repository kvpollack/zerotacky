// 11/10 scoring audit: replay real Iron Podium scoreboards (ironpodium.com/api/get_scoreboard/<id>, pulled 2026-11-10)
// through ZeroTacky's engine and require the same event points, totals and overall places. Iron Podium is the
// scoreboard every USS / Strongman Corporation athlete has seen, so matching it is the "how do we know the scoring is
// right" answer. Rules from ironpodium.com/docs/getting_started "Strongman Point System": N points for 1st down to 1,
// zero = 0, event ties split the pooled points, overall ties by "lookback" (1sts, then 2nds, then 3rds, else shared).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ENGINE = process.env.ZT_ENGINE || '../lib/engine/index.ts';
const { calculateDivisionStandings, scoreSingleEvent, describeTiebreaker, normalizeTiebreakerRule, DEFAULT_TIEBREAKER } = await import(ENGINE);

const div = { id: 'd', name: 'Replay', flight: 'A', sortOrder: 1 };
const ath = (id, lot, extra = {}) => ({ id, divisionId: 'd', name: id, lotNumber: lot, status: 'active', rackHeights: {}, ...extra });
const ev = (id, n, scoringType, over = {}) => ({
  id, eventNumber: n, name: id, scoringType, timeCapSeconds: 60, lanes: 1, loadingPoints: 2, weightEntryMode: 'total',
  implementEmptyWeight: 0, divisionWeights: { d: 100 }, hasTrumpWeight: false, ...over,
});
const res = (a, e, patch) => ({ id: `${e}_${a}`, eventId: e, athleteId: a, updatedAt: 0, ...patch });
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.athleteId, r]));
const pts = (st, e) => Object.fromEntries(Object.values(st).map((r) => [r.athleteId, r.eventBreakdown[e]?.points ?? 0]));

describe('Iron Podium replay: Idaho Strongman Championships 2025 (event 18445), Novice Men, 6 athletes', () => {
  // Formats: reps | lbs | reps | ft + mm:ss (75 s cap, 200 ft) | reps + mm:ss (4 stones, 60 s)
  const events = [
    ev('e1', 1, 'reps'),
    ev('e2', 2, 'max_weight', { maxFormat: 'none' }),
    ev('e3', 3, 'reps'),
    ev('e4', 4, 'time_or_distance', { timeCapSeconds: 75 }),
    ev('e5', 5, 'time_or_implements', { implementCount: 4 }),
  ];
  const A = ['u27637', 'u35526', 'u36409', 'u36735', 'u37394', 'u37448'].map((id, i) => ath(id, i + 1));
  const results = [
    // e1 circus dumbbell reps: only u36735 scored
    res('u27637', 'e1', { reps: 0 }), res('u35526', 'e1', { reps: 0 }), res('u36409', 'e1', { reps: 0 }),
    res('u36735', 'e1', { reps: 2 }), res('u37394', 'e1', { reps: 0 }), res('u37448', 'e1', { reps: 0 }),
    // e2 max axle deadlift
    res('u27637', 'e2', { maxWeightLbs: 555 }), res('u35526', 'e2', { maxWeightLbs: 435 }), res('u36409', 'e2', { maxWeightLbs: 0 }),
    res('u36735', 'e2', { maxWeightLbs: 555 }), res('u37394', 'e2', { maxWeightLbs: 465 }), res('u37448', 'e2', { maxWeightLbs: 495 }),
    // e3 wagon wheel squat reps
    res('u27637', 'e3', { reps: 8 }), res('u35526', 'e3', { reps: 6 }), res('u36409', 'e3', { reps: 3 }),
    res('u36735', 'e3', { reps: 20 }), res('u37394', 'e3', { reps: 1 }), res('u37448', 'e3', { reps: 6 }),
    // e4 carry medley: 200+0:54.47 = finished; 100+1:15.00 = 100 ft at the cap
    res('u27637', 'e4', { timeSeconds: 54.47, distanceFeet: 200 }), res('u35526', 'e4', { distanceFeet: 100 }), res('u36409', 'e4', { distanceFeet: 100 }),
    res('u36735', 'e4', { timeSeconds: 58.47, distanceFeet: 200 }), res('u37394', 'e4', { distanceFeet: 100 }), res('u37448', 'e4', { timeSeconds: 45.16, distanceFeet: 200 }),
    // e5 stone series: 4+0:21.97 = all four in 21.97; 1+0:60.00 = one stone at the cap
    res('u27637', 'e5', { timeSeconds: 21.97, implementsCompleted: 4 }), res('u35526', 'e5', { implementsCompleted: 1, splitTimeSeconds: 60 }),
    res('u36409', 'e5', { implementsCompleted: 1, splitTimeSeconds: 60 }), res('u36735', 'e5', { timeSeconds: 30.22, implementsCompleted: 4 }),
    res('u37394', 'e5', { implementsCompleted: 2, splitTimeSeconds: 60 }), res('u37448', 'e5', { timeSeconds: 20.38, implementsCompleted: 4 }),
  ];
  const st = byId(calculateDivisionStandings(div, A, events, results, 'lookback'));

  test('event points match Iron Podium: zeros score 0, a shared 1st pays (6+5)/2, a shared 5th pays (2+1)/2', () => {
    assert.deepEqual(pts(st, 'e1'), { u27637: 0, u35526: 0, u36409: 0, u36735: 6, u37394: 0, u37448: 0 });
    assert.deepEqual(pts(st, 'e2'), { u27637: 5.5, u35526: 2, u36409: 0, u36735: 5.5, u37394: 3, u37448: 4 });
    assert.deepEqual(pts(st, 'e3'), { u27637: 5, u35526: 3.5, u36409: 2, u36735: 6, u37394: 1, u37448: 3.5 });
    assert.deepEqual(pts(st, 'e4'), { u27637: 5, u35526: 2, u36409: 2, u36735: 4, u37394: 2, u37448: 6 });
    assert.deepEqual(pts(st, 'e5'), { u27637: 5, u35526: 1.5, u36409: 1.5, u36735: 4, u37394: 3, u37448: 6 });
  });
  test('totals match Iron Podium', () => {
    assert.deepEqual(Object.fromEntries(Object.values(st).map((r) => [r.athleteId, r.totalPoints])),
      { u27637: 20.5, u35526: 9, u36409: 5.5, u36735: 25.5, u37394: 9, u37448: 19.5 });
  });
  test('overall places match Iron Podium: the 9-point tie goes to the athlete with a 3rd place (lookback), not to the better final event', () => {
    assert.deepEqual(Object.fromEntries(Object.values(st).map((r) => [r.athleteId, r.overallPlace])),
      { u36735: 1, u27637: 2, u37448: 3, u35526: 4, u37394: 5, u36409: 6 });
    assert.equal(st.u35526.isTiedOverall, false);
    assert.deepEqual(st.u35526.placeCounts, [0, 0, 1]);   // shared 3rd in the squat counts as a 3rd
    assert.deepEqual(st.u37394.placeCounts, [0, 0, 0]);
    assert.ok(st.u37394.finalEventPoints > st.u35526.finalEventPoints, 'final-event rule would have reversed this pair');
  });
  test('the old event_wins rule would place this pair the other way round: that is why lookback is the default', () => {
    const old = byId(calculateDivisionStandings(div, A, events, results, 'event_wins'));
    assert.equal(old.u37394.overallPlace, 4);
    assert.equal(old.u35526.overallPlace, 5);
    assert.equal(DEFAULT_TIEBREAKER, 'lookback');
  });
});

describe('Iron Podium replay: overall ties that stay shared', () => {
  // Red River Strongman 2025 (18946), Masters W MW 165, 4 athletes: both have one 1st, one 2nd, one 3rd, one 4th.
  // Iron Podium shows both at place 2; the final event (2.0 vs 1.0) is NOT used.
  test('Red River Masters W 165: level through 3rds shares 2nd even though the final event differs', () => {
    const events = [ev('e1', 1, 'reps'), ev('e2', 2, 'time_or_distance', { timeCapSeconds: 60 }), ev('e3', 3, 'max_weight', { maxFormat: 'none' }), ev('e4', 4, 'time_or_distance', { timeCapSeconds: 60 })];
    const A = ['u9248', 'u26889', 'x1', 'x2'].map((id, i) => ath(id, i + 1));
    const results = [
      res('u9248', 'e1', { reps: 4 }), res('u26889', 'e1', { reps: 2 }), res('x1', 'e1', { reps: 9 }), res('x2', 'e1', { reps: 1 }),
      res('u9248', 'e2', { distanceFeet: 80, timeSeconds: 37.68 }), res('u26889', 'e2', { distanceFeet: 80, timeSeconds: 24.25 }), res('x1', 'e2', { distanceFeet: 80, timeSeconds: 20 }), res('x2', 'e2', { distanceFeet: 80, timeSeconds: 30 }),
      res('u9248', 'e3', { maxWeightLbs: 490 }), res('u26889', 'e3', { maxWeightLbs: 490 }), res('x1', 'e3', { maxWeightLbs: 400 }), res('x2', 'e3', { maxWeightLbs: 300 }),
      res('u9248', 'e4', { distanceFeet: 80, timeSeconds: 21.97 }), res('u26889', 'e4', { distanceFeet: 80, timeSeconds: 22.37 }), res('x1', 'e4', { distanceFeet: 80, timeSeconds: 15 }), res('x2', 'e4', { distanceFeet: 80, timeSeconds: 18 }),
    ];
    const st = byId(calculateDivisionStandings(div, A, events, results, 'lookback'));
    assert.equal(st.u9248.totalPoints, 9.5); assert.equal(st.u26889.totalPoints, 9.5);
    assert.deepEqual(st.u9248.placeCounts, [1, 1, 1]); assert.deepEqual(st.u26889.placeCounts, [1, 1, 1]);
    assert.equal(st.u9248.overallPlace, 2); assert.equal(st.u26889.overallPlace, 2);
    assert.equal(st.u9248.isTiedOverall, true); assert.equal(st.u26889.isTiedOverall, true);
    assert.equal(st.x1.overallPlace, 1); assert.equal(st.x2.overallPlace, 4, 'the place after a shared 2nd is 4th');
    // with no tiebreaker at all the pair also shares
    const none = byId(calculateDivisionStandings(div, A, events, results, 'none'));
    assert.equal(none.u9248.overallPlace, 2); assert.equal(none.u26889.overallPlace, 2);
  });
  // 2025 QRF Strongman Invitational (18719), Open M SHW, 8 athletes: 32-point tie, three 1sts beat zero 1sts even though
  // the other athlete took 7 of 8 in the final event.
  test('QRF Open M SHW: three event wins beat a better final event', () => {
    const a = ath('u25611', 1), b = ath('u11562', 2);
    const events = [1, 2, 3, 4, 5].map((n) => ev(`e${n}`, n, 'reps'));
    const results = [];
    const field = [a, b, ...[3, 4, 5, 6, 7, 8].map((n) => ath(`x${n}`, n))];
    // Only the points pattern matters: a places 1,1,1,4,6 and b places 3,2,3,3,2 in an 8-athlete field.
    const placesA = [1, 1, 1, 4, 6], placesB = [3, 2, 3, 3, 2];
    events.forEach((e, i) => {
      const taken = new Set([placesA[i], placesB[i]]);
      results.push(res(a.id, e.id, { reps: 100 - placesA[i] }), res(b.id, e.id, { reps: 100 - placesB[i] }));
      let p = 1;
      for (const x of field.slice(2)) { while (taken.has(p)) p++; taken.add(p); results.push(res(x.id, e.id, { reps: 100 - p })); }
    });
    const st = byId(calculateDivisionStandings(div, field, events, results, 'lookback'));
    assert.equal(st.u25611.totalPoints, 32); assert.equal(st.u11562.totalPoints, 32);
    assert.ok(st.u11562.finalEventPoints > st.u25611.finalEventPoints);
    assert.equal(st.u25611.overallPlace, 2, 'Iron Podium: place 2');
    assert.equal(st.u11562.overallPlace, 3, 'Iron Podium: place 3');
  });
});

describe('tiebreak rules: bodyweight, normalisation, labels', () => {
  const events = [ev('e1', 1, 'reps'), ev('e2', 2, 'reps')];
  const results = [res('h', 'e1', { reps: 10 }), res('l', 'e1', { reps: 5 }), res('h', 'e2', { reps: 5 }), res('l', 'e2', { reps: 10 })];
  test('bodyweight: lighter athlete wins the tie; missing bodyweight shares', () => {
    const A = [ath('h', 1, { bodyweight: 231 }), ath('l', 2, { bodyweight: 198.5 })];
    const st = byId(calculateDivisionStandings(div, A, events, results, 'bodyweight'));
    assert.equal(st.l.overallPlace, 1); assert.equal(st.h.overallPlace, 2); assert.equal(st.l.isTiedOverall, false);
    const B = [ath('h', 1, { bodyweight: 231 }), ath('l', 2)];
    const st2 = byId(calculateDivisionStandings(div, B, events, results, 'bodyweight'));
    assert.equal(st2.l.overallPlace, 1); assert.equal(st2.h.overallPlace, 1); assert.equal(st2.h.isTiedOverall, true);
  });
  test('lookback on a 1st/2nd swap is level and shares; lot order only decides row order', () => {
    const A = [ath('h', 2), ath('l', 1)];
    const rows = calculateDivisionStandings(div, A, events, results, 'lookback');
    assert.deepEqual(rows.map((r) => [r.athleteId, r.overallPlace, r.isTiedOverall]), [['l', 1, true], ['h', 1, true]]);
  });
  test('normaliseTiebreakerRule keeps every rule and defaults the rest to lookback', () => {
    for (const r of ['lookback', 'bodyweight', 'event_wins', 'final_event', 'none']) assert.equal(normalizeTiebreakerRule(r), r);
    assert.equal(normalizeTiebreakerRule('head_to_head'), 'lookback');
    assert.equal(normalizeTiebreakerRule(undefined), 'lookback');
  });
  test('describeTiebreaker has a short label for every rule and falls back to lookback', () => {
    for (const r of ['lookback', 'bodyweight', 'event_wins', 'final_event', 'none']) assert.ok(describeTiebreaker(r).short.length > 4);
    assert.equal(describeTiebreaker('bogus').value, 'lookback');
  });
  test('scoreSingleEvent: zero-score athletes never earn a place count', () => {
    const rows = scoreSingleEvent(ev('e1', 1, 'reps'), [ath('a', 1), ath('b', 2)], [res('a', 'e1', { reps: 0 }), res('b', 'e1', { reps: 0 })]);
    assert.ok(rows.every((r) => r.isZero && r.points === 0));
  });
});

describe('time_or_implements: a missing split is scored at the cap (Iron Podium "n+0:60")', () => {
  const e = ev('e1', 1, 'time_or_implements', { implementCount: 5, timeCapSeconds: 60 });
  test('same count, one split recorded at the cap and one not recorded: shared place', () => {
    const rows = byId(scoreSingleEvent(e, [ath('a', 1), ath('b', 2), ath('c', 3)], [
      res('a', 'e1', { implementsCompleted: 3, splitTimeSeconds: 60 }),
      res('b', 'e1', { implementsCompleted: 3 }),
      res('c', 'e1', { implementsCompleted: 3, splitTimeSeconds: 41.2 }),
    ]));
    assert.equal(rows.c.place, 1); assert.equal(rows.c.points, 3);
    assert.equal(rows.a.place, 2); assert.equal(rows.b.place, 2);
    assert.equal(rows.a.points, 1.5); assert.equal(rows.b.points, 1.5);
    assert.equal(rows.b.displayScore, '3 impl');
    assert.equal(rows.a.displayScore, '3 impl @ 60.00s');
  });
});
