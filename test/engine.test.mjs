// ZeroTacky engine tests. Run: node --test ~/.aki/tmp/zt_tests/
// ENGINE points at the baseline extraction now; repoint to lib/engine after the split.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ENGINE = process.env.ZT_ENGINE || '../lib/engine/index.ts';
const E = await import(ENGINE);
const {
  scoreSingleEvent, calculateDivisionStandings, generateEventRunOrder,
  calculatePlateLoading, resolveAthleteHeightCallout, buildTransitionDeltas,
  parseMeasure, formatSigned,
} = E;

// ---------- fixtures ----------
const div = { id: 'd1', name: 'Open', flight: 'A', sortOrder: 1 };
const ath = (n, lot = n, extra = {}) =>
  ({ id: `a${n}`, divisionId: 'd1', name: `Athlete ${n}`, lotNumber: lot, status: 'active', rackHeights: {}, ...extra });
const A4 = [ath(1), ath(2), ath(3), ath(4)];
const ev = (over = {}) => ({
  id: 'e1', eventNumber: 1, name: 'Ev', scoringType: 'reps', timeCapSeconds: 60, lanes: 1,
  loadingPoints: 2, weightEntryMode: 'total', implementEmptyWeight: 0, divisionWeights: { d1: 200 },
  hasTrumpWeight: false, ...over,
});
const res = (athleteId, eventId, patch) => ({ id: `${eventId}_${athleteId}`, eventId, athleteId, ...patch });
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.athleteId, r]));

// ---------- scoreSingleEvent ----------
describe('scoreSingleEvent: reps', () => {
  test('N-down-to-1 points, ordered by reps desc', () => {
    const e = ev();
    const rows = byId(scoreSingleEvent(e, A4, [
      res('a1', 'e1', { reps: 5 }), res('a2', 'e1', { reps: 9 }),
      res('a3', 'e1', { reps: 7 }), res('a4', 'e1', { reps: 1 }),
    ]));
    assert.equal(rows.a2.place, 1); assert.equal(rows.a2.points, 4);
    assert.equal(rows.a3.place, 2); assert.equal(rows.a3.points, 3);
    assert.equal(rows.a1.place, 3); assert.equal(rows.a1.points, 2);
    assert.equal(rows.a4.place, 4); assert.equal(rows.a4.points, 1);
    assert.equal(rows.a2.displayScore, '9 reps');
    assert.equal(rows.a4.displayScore, '1 rep');
  });

  test('zero reps, DNS and missing result all score 0 points at place N', () => {
    const rows = byId(scoreSingleEvent(ev(), A4, [
      res('a1', 'e1', { reps: 3 }), res('a2', 'e1', { reps: 0 }), res('a3', 'e1', { didNotStart: true, reps: 4 }),
    ]));
    assert.equal(rows.a1.points, 4);
    for (const id of ['a2', 'a3', 'a4']) { assert.equal(rows[id].points, 0); assert.equal(rows[id].place, 4); assert.equal(rows[id].isZero, true); }
    assert.equal(rows.a2.displayScore, '0 reps');
    assert.equal(rows.a3.displayScore, 'DNS');
    assert.equal(rows.a4.displayScore, '—');
  });

  test('tie split pools and divides points, flags isTied', () => {
    const rows = byId(scoreSingleEvent(ev(), A4, [
      res('a1', 'e1', { reps: 8 }), res('a2', 'e1', { reps: 8 }),
      res('a3', 'e1', { reps: 2 }), res('a4', 'e1', { reps: 1 }),
    ]));
    assert.equal(rows.a1.points, 3.5); assert.equal(rows.a2.points, 3.5);
    assert.equal(rows.a1.place, 1); assert.equal(rows.a2.place, 1);
    assert.equal(rows.a1.isTied, true); assert.equal(rows.a3.isTied, false);
    assert.equal(rows.a3.place, 3); assert.equal(rows.a3.points, 2);
  });

  test('three-way tie rounds to 2 decimals', () => {
    const rows = byId(scoreSingleEvent(ev(), A4, [
      res('a1', 'e1', { reps: 8 }), res('a2', 'e1', { reps: 8 }), res('a3', 'e1', { reps: 8 }), res('a4', 'e1', { reps: 1 }),
    ]));
    assert.equal(rows.a1.points, 3); // (4+3+2)/3
    assert.equal(rows.a4.place, 4); assert.equal(rows.a4.points, 1);
  });

  test('trump weight: 1 heavy rep beats any number of light reps', () => {
    const e = ev({ hasTrumpWeight: true, divisionLightWeights: { d1: 150 } });
    const rows = byId(scoreSingleEvent(e, A4, [
      res('a1', 'e1', { reps: 1, tier: 'heavy' }), res('a2', 'e1', { reps: 12, tier: 'light' }),
      res('a3', 'e1', { reps: 3, tier: 'light' }), res('a4', 'e1', { reps: 0, tier: 'heavy' }),
    ]));
    assert.equal(rows.a1.place, 1); assert.equal(rows.a2.place, 2); assert.equal(rows.a3.place, 3);
    assert.equal(rows.a1.displayScore, '1 rep (Heavy)');
    assert.equal(rows.a2.displayScore, '12 reps (Light)');
    assert.equal(rows.a4.points, 0);
  });

  test('missing tier defaults to heavy', () => {
    const e = ev({ hasTrumpWeight: true, divisionLightWeights: { d1: 150 } });
    const rows = byId(scoreSingleEvent(e, A4.slice(0, 2), [
      res('a1', 'e1', { reps: 2 }), res('a2', 'e1', { reps: 5, tier: 'light' }),
    ]));
    assert.equal(rows.a1.place, 1);
  });
});

describe('scoreSingleEvent: time_or_distance', () => {
  const e = ev({ scoringType: 'time_or_distance', timeCapSeconds: 60 });
  test('any finish beats any DNF; faster time wins; DNF by distance', () => {
    const rows = byId(scoreSingleEvent(e, A4, [
      res('a1', 'e1', { timeSeconds: 45.2 }), res('a2', 'e1', { timeSeconds: 31.07 }),
      res('a3', 'e1', { distanceFeet: 42.5 }), res('a4', 'e1', { distanceFeet: 55 }),
    ]));
    assert.deepEqual([rows.a2.place, rows.a1.place, rows.a4.place, rows.a3.place], [1, 2, 3, 4]);
    assert.equal(rows.a2.displayScore, '31.07s');
    assert.equal(rows.a3.displayScore, '42.5 ft (DNF)');
  });
  test('time over cap is treated as DNF and ranked by distance', () => {
    const rows = byId(scoreSingleEvent(e, A4.slice(0, 3), [
      res('a1', 'e1', { timeSeconds: 61, distanceFeet: 50 }), res('a2', 'e1', { timeSeconds: 59.99 }), res('a3', 'e1', { distanceFeet: 20 }),
    ]));
    assert.equal(rows.a2.place, 1); assert.equal(rows.a1.place, 2); assert.equal(rows.a3.place, 3);
    assert.equal(rows.a1.displayScore, '50 ft (DNF)');
  });
  test('no time and no distance = zero', () => {
    const rows = byId(scoreSingleEvent(e, A4.slice(0, 2), [res('a1', 'e1', { timeSeconds: 10 }), res('a2', 'e1', { timeSeconds: 0, distanceFeet: 0 })]));
    assert.equal(rows.a2.points, 0); assert.equal(rows.a2.displayScore, '0 ft');
  });
  test('exact time ties split points', () => {
    const rows = byId(scoreSingleEvent(e, A4.slice(0, 3), [res('a1', 'e1', { timeSeconds: 30 }), res('a2', 'e1', { timeSeconds: 30 }), res('a3', 'e1', { timeSeconds: 40 })]));
    assert.equal(rows.a1.points, 2.5); assert.equal(rows.a2.points, 2.5); assert.equal(rows.a3.points, 1);
  });
});

describe('scoreSingleEvent: time_or_implements', () => {
  const e = ev({ scoringType: 'time_or_implements', timeCapSeconds: 60 });
  test('finished beats partial; partial by count then faster split', () => {
    const rows = byId(scoreSingleEvent(e, A4, [
      res('a1', 'e1', { timeSeconds: 40, implementsCompleted: 5 }),
      res('a2', 'e1', { implementsCompleted: 4, splitTimeSeconds: 50 }),
      res('a3', 'e1', { implementsCompleted: 4, splitTimeSeconds: 44.5 }),
      res('a4', 'e1', { implementsCompleted: 2, splitTimeSeconds: 20 }),
    ]));
    assert.deepEqual([rows.a1.place, rows.a3.place, rows.a2.place, rows.a4.place], [1, 2, 3, 4]);
    assert.equal(rows.a1.displayScore, 'All in 40.00s');
    assert.equal(rows.a3.displayScore, '4 impl @ 44.50s');
  });
  test('partial with no split shows count only and sorts after same count with split', () => {
    const rows = byId(scoreSingleEvent(e, A4.slice(0, 2), [res('a1', 'e1', { implementsCompleted: 3 }), res('a2', 'e1', { implementsCompleted: 3, splitTimeSeconds: 55 })]));
    assert.equal(rows.a1.displayScore, '3 impl');
    assert.equal(rows.a2.place, 1);
  });
});

describe('scoreSingleEvent: max_weight', () => {
  const e = ev({ scoringType: 'max_weight', maxFormat: 'rising_bar', risingBarWeights: [225, 245, 265] });
  test('rising bar uses heaviest good; pass/fail ignored; override wins', () => {
    const rows = byId(scoreSingleEvent(e, A4, [
      res('a1', 'e1', { risingBarAttempts: { 225: 'good', 245: 'good', 265: 'fail' } }),
      res('a2', 'e1', { risingBarAttempts: { 225: 'pass', 245: 'good', 265: 'good' } }),
      res('a3', 'e1', { risingBarAttempts: { 225: 'fail' } }),
      res('a4', 'e1', { risingBarAttempts: { 225: 'good' }, maxWeightLbs: 300 }),
    ]));
    assert.equal(rows.a4.place, 1); assert.equal(rows.a4.displayScore, '300 lbs');
    assert.equal(rows.a2.place, 2); assert.equal(rows.a2.displayScore, '265 lbs');
    assert.equal(rows.a1.place, 3); assert.equal(rows.a1.displayScore, '245 lbs');
    assert.equal(rows.a3.points, 0); assert.equal(rows.a3.displayScore, 'No Lift');
  });
});

// ---------- calculateDivisionStandings ----------
describe('calculateDivisionStandings', () => {
  const e1 = ev({ id: 'e1', eventNumber: 1 });
  const e2 = ev({ id: 'e2', eventNumber: 2 });
  const e3 = ev({ id: 'e3', eventNumber: 3 });
  const A3 = A4.slice(0, 3);
  test('sums points across scored events, skips events with no results, counts wins', () => {
    const results = [
      res('a1', 'e1', { reps: 10 }), res('a2', 'e1', { reps: 5 }), res('a3', 'e1', { reps: 1 }),
      res('a1', 'e2', { reps: 1 }), res('a2', 'e2', { reps: 5 }), res('a3', 'e2', { reps: 10 }),
    ];
    const st = byId(calculateDivisionStandings(div, A3, [e1, e2, e3], results));
    assert.equal(st.a1.totalPoints, 4); assert.equal(st.a2.totalPoints, 4); assert.equal(st.a3.totalPoints, 4);
    assert.equal(st.a1.eventWins, 1); assert.equal(st.a2.eventWins, 0); assert.equal(st.a3.eventWins, 1);
    assert.equal(st.a1.eventBreakdown.e3, undefined);
  });
  test('event_wins tiebreaker then finalEventPoints; final_event tiebreaker reverses priority', () => {
    const results = [
      res('a1', 'e1', { reps: 10 }), res('a2', 'e1', { reps: 5 }), res('a3', 'e1', { reps: 1 }),
      res('a1', 'e2', { reps: 1 }), res('a2', 'e2', { reps: 5 }), res('a3', 'e2', { reps: 10 }),
    ];
    const byWins = calculateDivisionStandings(div, A3, [e1, e2], results, 'event_wins');
    assert.equal(byWins[0].athleteId, 'a3'); // 1 win, 3 pts in final event
    assert.equal(byWins[1].athleteId, 'a1'); // 1 win, 1 pt in final
    assert.equal(byWins[2].athleteId, 'a2'); // 0 wins
    assert.deepEqual(byWins.map((r) => r.overallPlace), [1, 2, 3]);
    const byFinal = calculateDivisionStandings(div, A3, [e1, e2], results, 'final_event');
    assert.equal(byFinal[0].athleteId, 'a3'); assert.equal(byFinal[1].athleteId, 'a2'); assert.equal(byFinal[2].athleteId, 'a1');
  });
  test('a first place with zero score is not an event win', () => {
    const st = byId(calculateDivisionStandings(div, A3, [e1], [res('a1', 'e1', { reps: 0 })]));
    assert.equal(st.a1.eventWins, 0);
  });
});

// ---------- generateEventRunOrder ----------
describe('generateEventRunOrder', () => {
  const e1 = ev({ id: 'e1', eventNumber: 1 });
  const e2 = ev({ id: 'e2', eventNumber: 2 });
  const e3 = ev({ id: 'e3', eventNumber: 3, lanes: 2 });
  const results = [res('a1', 'e1', { reps: 10 }), res('a2', 'e1', { reps: 7 }), res('a3', 'e1', { reps: 3 }), res('a4', 'e1', { reps: 1 })];

  test('event 1 by lot number, withdrawn excluded', () => {
    const roster = [ath(1, 3), ath(2, 1), ath(3, 2), ath(4, 4, { status: 'withdrawn' })];
    const ro = generateEventRunOrder(e1, div, roster, [e1, e2], [], 'reverse_overall');
    assert.deepEqual(ro.map((r) => r.athlete.id), ['a2', 'a3', 'a1']);
    assert.deepEqual(ro.map((r) => r.orderIndex), [1, 2, 3]);
  });
  test('later event: reverse overall points, lot number breaks ties', () => {
    const ro = generateEventRunOrder(e2, div, A4, [e1, e2], results, 'reverse_overall');
    assert.deepEqual(ro.map((r) => r.athlete.id), ['a4', 'a3', 'a2', 'a1']);
    assert.equal(ro[3].currentOverallPoints, 4);
  });
  test('later event: reverse previous event place carries previousEventDisplay', () => {
    const ro = generateEventRunOrder(e2, div, A4, [e1, e2], results, 'reverse_previous_event');
    assert.deepEqual(ro.map((r) => r.athlete.id), ['a4', 'a3', 'a2', 'a1']);
    assert.equal(ro[0].previousEventDisplay, '1 rep');
  });
  test('event with no prior results falls back to lot order even when later in number', () => {
    const ro = generateEventRunOrder(e2, div, A4, [e1, e2], [], 'reverse_overall');
    assert.deepEqual(ro.map((r) => r.athlete.id), ['a1', 'a2', 'a3', 'a4']);
  });
  test('2-lane events pair consecutive athletes into heats', () => {
    const ro = generateEventRunOrder(e3, div, A4, [e1, e2, e3], results, 'reverse_overall');
    assert.deepEqual(ro.map((r) => [r.heatNumber, r.lane]), [[1, 1], [1, 2], [2, 1], [2, 2]]);
  });
  test('odd roster leaves lane 1 solo in final heat', () => {
    const ro = generateEventRunOrder(e3, div, A4.slice(0, 3), [e3], [], 'reverse_overall');
    assert.deepEqual(ro.map((r) => [r.heatNumber, r.lane]), [[1, 1], [1, 2], [2, 1]]);
  });
  test('height callout: personal pin > division default > Not Set > undefined when disabled', () => {
    const eh = ev({ hasHeightCallout: true, divisionDefaultHeights: { d1: '52"' } });
    assert.equal(resolveAthleteHeightCallout(eh, 'd1', ath(1, 1, { rackHeights: { e1: 'Pin 14' } })), 'Pin 14');
    assert.equal(resolveAthleteHeightCallout(eh, 'd1', ath(1, 1, { rackHeights: { e1: '  ' } })), '52"');
    assert.equal(resolveAthleteHeightCallout(eh, 'd9', ath(1)), 'Not Set');
    assert.equal(resolveAthleteHeightCallout(ev(), 'd1', ath(1)), undefined);
  });
});

// ---------- calculatePlateLoading ----------
describe('calculatePlateLoading', () => {
  const PL = [100, 55, 45, 35, 25, 15, 10, 5, 2.5];
  test('0 points: fixed implement, no plates', () => {
    const r = calculatePlateLoading(ev({ loadingPoints: 0, divisionWeights: { d1: 250 } }), 'd1', PL);
    assert.equal(r.loadingPoints, 0); assert.equal(r.platesPerPoint.length, 0); assert.equal(r.totalSystemWeight, 250);
  });
  test('1 point: loading pin, tare deducted, no collars', () => {
    const r = calculatePlateLoading(ev({ loadingPoints: 1, implementEmptyWeight: 20, divisionWeights: { d1: 120 } }), 'd1', PL, 5);
    assert.equal(r.weightPerLoadingPoint, 100); assert.equal(r.collarWeightApplied, 0);
    assert.deepEqual(r.platesPerPoint, [{ weight: 100, count: 1 }]);
  });
  test('2 points: barbell with collars, greedy stack per sleeve', () => {
    const r = calculatePlateLoading(ev({ loadingPoints: 2, implementEmptyWeight: 45, divisionWeights: { d1: 405 } }), 'd1', PL, 5);
    assert.equal(r.collarWeightApplied, 5); assert.equal(r.weightPerLoadingPoint, 177.5);
    assert.deepEqual(r.platesPerPoint, [{ weight: 100, count: 1 }, { weight: 55, count: 1 }, { weight: 15, count: 1 }, { weight: 5, count: 1 }, { weight: 2.5, count: 1 }]);
    assert.equal(r.remainderUnloadedTotal, 0); assert.equal(r.warningMessage, undefined);
  });
  test('4 points per_hand: farmers, target is per hand, total doubles', () => {
    const r = calculatePlateLoading(ev({ loadingPoints: 4, weightEntryMode: 'per_hand', implementEmptyWeight: 25, divisionWeights: { d1: 260 } }), 'd1', PL, 5);
    assert.equal(r.totalSystemWeight, 520); assert.equal(r.weightPerLoadingPoint, 115);
    assert.deepEqual(r.platesPerPoint, [{ weight: 100, count: 1 }, { weight: 15, count: 1 }]);
  });
  test('4 points total: yoke, uneven remainder warns about center plate', () => {
    const r = calculatePlateLoading(ev({ loadingPoints: 4, weightEntryMode: 'total', implementEmptyWeight: 185, divisionWeights: { d1: 665 } }), 'd1', PL, 5);
    assert.equal(r.weightPerLoadingPoint, 120); assert.equal(r.collarWeightApplied, 0);
    assert.deepEqual(r.platesPerPoint, [{ weight: 100, count: 1 }, { weight: 15, count: 1 }, { weight: 5, count: 1 }]);
    const r2 = calculatePlateLoading(ev({ loadingPoints: 4, weightEntryMode: 'total', implementEmptyWeight: 185, divisionWeights: { d1: 675 } }), 'd1', PL);
    assert.equal(r2.remainderUnloadedTotal, 0); // 490/4 = 122.5 -> 100+20+2.5 loads clean
    const r3 = calculatePlateLoading(ev({ loadingPoints: 4, weightEntryMode: 'total', implementEmptyWeight: 185, divisionWeights: { d1: 670 } }), 'd1', PL);
    assert.equal(r3.remainderUnloadedTotal, 5); assert.match(r3.warningMessage, /Uneven 4-Post Load: 5 lbs/);
  });
  test('limited inventory leaves unloadable remainder with warning', () => {
    const r = calculatePlateLoading(ev({ loadingPoints: 2, implementEmptyWeight: 0, divisionWeights: { d1: 100 } }), 'd1', [45, 25]);
    assert.equal(r.weightPerLoadingPoint, 50); assert.deepEqual(r.platesPerPoint, [{ weight: 45, count: 1 }]);
    assert.equal(r.remainderUnloadedTotal, 10); assert.match(r.warningMessage, /Unloaded remainder: 10 lbs total/);
  });
  test('target lighter than tare warns and loads nothing', () => {
    const r = calculatePlateLoading(ev({ loadingPoints: 2, implementEmptyWeight: 135, divisionWeights: { d1: 100 } }), 'd1', PL);
    assert.deepEqual(r.platesPerPoint, []); assert.match(r.warningMessage, /lighter than empty implement/);
  });
  test('override and light tier select the target', () => {
    const e = ev({ loadingPoints: 2, hasTrumpWeight: true, divisionWeights: { d1: 585 }, divisionLightWeights: { d1: 505 }, implementEmptyWeight: 75 });
    assert.equal(calculatePlateLoading(e, 'd1', PL, 0, '', true).targetInputWeight, 505);
    assert.equal(calculatePlateLoading(e, 'd1', PL, 0, '300', true).targetInputWeight, 300);
    assert.equal(calculatePlateLoading(e, 'd1', PL, 0, 'abc', false).targetInputWeight, 585);
  });
});

// ---------- transitions ----------
describe('buildTransitionDeltas', () => {
  test('parseMeasure / formatSigned', () => {
    assert.deepEqual(parseMeasure('48"'), { num: 48, unit: '"' });
    assert.deepEqual(parseMeasure('125 lb'), { num: 125, unit: 'lb' });
    assert.equal(parseMeasure('Compact Car'), null);
    assert.equal(formatSigned(2, '"'), '+2"'); assert.equal(formatSigned(-75, 'lb'), '-75 lb');
  });
  test('event changeover row', () => {
    const rows = buildTransitionDeltas(ev({ id: 'e1', eventNumber: 1 }), 'd1', ev({ id: 'e2', eventNumber: 2, divisionWeights: { d1: 300 } }), 'd1');
    assert.equal(rows.length, 1); assert.equal(rows[0].delta, 'Strike Ev 1 → Build Ev 2'); assert.equal(rows[0].to, '300 lb');
  });
  test('same event, weight delta per side', () => {
    const e = ev({ loadingPoints: 2, divisionWeights: { d1: 200, d2: 350 } });
    const rows = buildTransitionDeltas(e, 'd1', e, 'd2');
    assert.equal(rows[0].delta, 'ADD 75 lb per side (150 lb total)'); assert.equal(rows[0].changed, true);
    assert.equal(buildTransitionDeltas(e, 'd2', e, 'd1')[0].delta, 'REMOVE 75 lb per side (150 lb total)');
    assert.equal(buildTransitionDeltas(e, 'd1', e, 'd1')[0].delta, 'No plate change');
  });
  test('numeric stat deltas from pitCrewCallout', () => {
    const e = ev({ loadingPoints: 0, divisionWeights: { d1: 100, d2: 125 }, pitCrewCallout: { title: 'Yoke', byDivision: {
      d1: { headline: '44"', stats: [{ label: 'Yoke Crossbar', value: '44"' }, { label: 'Keg Weight', value: '100 lb' }] },
      d2: { headline: '46"', stats: [{ label: 'Yoke Crossbar', value: '46"' }, { label: 'Keg Weight', value: '125 lb' }] },
    } } });
    const rows = buildTransitionDeltas(e, 'd1', e, 'd2');
    assert.deepEqual(rows.map((r) => [r.label, r.delta, r.changed]), [['Yoke Crossbar', '+2"', true], ['Keg Weight', '+25 lb', true]]);
  });
  test('headline-only callouts produce swap/no-change row', () => {
    const e = ev({ loadingPoints: 0, divisionWeights: {}, pitCrewCallout: { title: 'Vehicle', byDivision: { d1: { headline: 'Car' }, d2: { headline: 'SUV' }, d3: { headline: 'SUV' } } } });
    assert.equal(buildTransitionDeltas(e, 'd1', e, 'd2')[0].delta, 'Swap setup');
    assert.equal(buildTransitionDeltas(e, 'd2', e, 'd3')[0].changed, false);
  });
});

// Astra R-M5 (10/19): reverse-previous-event order on a tie, and shared overall places after both tiebreak criteria.
describe('run order and standings on ties (R-M5)', () => {
  const div = { id: 'd', meetId: 'm', name: 'Open', flight: 'A', sortOrder: 1 };
  const athletes = [
    { id: 'a1', divisionId: 'd', name: 'A1', lotNumber: 1, status: 'active' },
    { id: 'a2', divisionId: 'd', name: 'A2', lotNumber: 2, status: 'active' },
    { id: 'a3', divisionId: 'd', name: 'A3', lotNumber: 3, status: 'active' },
  ];
  const ev = (n) => ({ id: `e${n}`, meetId: 'm', eventNumber: n, name: `E${n}`, scoringType: 'reps', timeCapSeconds: 60, lanes: 1, divisionWeights: {} });
  const events = [ev(1), ev(2), ev(3)];
  const res = (e, a, reps) => ({ id: `${e}_${a}`, eventId: e, athleteId: a, reps });
  test('tied in the previous event: lower overall points lifts first, then lot number', () => {
    // E1: a2 wins (3 pts), a1 second (2), a3 third (1). E2: a1 and a2 tie on 5 reps, a3 behind.
    const results = [res('e1', 'a1', 4), res('e1', 'a2', 6), res('e1', 'a3', 2), res('e2', 'a1', 5), res('e2', 'a2', 5), res('e2', 'a3', 1)];
    const order = generateEventRunOrder(events[2], div, athletes, events, results, 'reverse_previous_event');
    assert.deepEqual(order.map((o) => o.athlete.id), ['a3', 'a1', 'a2']);   // a1 has fewer overall points than a2
  });
  test('athletes level after both tiebreak criteria share the place and the next place is skipped', () => {
    const results = [res('e1', 'a1', 4), res('e1', 'a2', 4), res('e1', 'a3', 1)];
    const rows = calculateDivisionStandings(div, athletes, [events[0]], results, 'event_wins');
    assert.deepEqual(rows.map((r) => [r.athleteId, r.overallPlace, r.isTiedOverall]), [['a1', 1, true], ['a2', 1, true], ['a3', 3, false]]);
  });
});
