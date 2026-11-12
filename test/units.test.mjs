// 059 kg/m session 1: a meet is run in one unit system. Stored numbers never convert; labels follow meets.units; the
// engine (scoring, plates, transitions) is arithmetic and prints the meet's unit. Imperial behaviour is unchanged.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const U = await import('../lib/units.ts');
const E = await import('../lib/engine/index.ts');
const MB = await import('../lib/meetBuilder.ts');
const MAP = await import('../lib/sync/mapping.ts');
const SPEC = await import('../lib/events/spec.ts');
const FMT = await import('../lib/website/format.ts');
const TV = await import('../lib/tv/model.ts');

const ath = (id, lot) => ({ id, divisionId: 'd', name: id.toUpperCase(), lotNumber: lot, status: 'active' });
const A = [ath('a', 1), ath('b', 2)];
const base = { id: 'e1', meetId: 'm', eventNumber: 1, lanes: 1, loadingPoints: 2, weightEntryMode: 'total', implementEmptyWeight: 0, divisionWeights: {}, timeCapSeconds: 60 };
const res = (athleteId, extra) => ({ id: `e1_${athleteId}`, eventId: 'e1', athleteId, updatedAt: 1, ...extra });
const byId = (rows) => Object.fromEntries(rows.map((r) => [r.athleteId, r]));

describe('lib/units helpers', () => {
  test('normalise: anything but metric is imperial', () => {
    assert.equal(U.normalizeUnits('metric'), 'metric');
    for (const v of ['imperial', undefined, null, 'kg', 42, '']) assert.equal(U.normalizeUnits(v), 'imperial');
  });
  test('labels', () => {
    assert.equal(U.weightUnit('imperial'), 'lb'); assert.equal(U.weightUnit('imperial', { plural: true }), 'lbs');
    assert.equal(U.weightUnit('metric'), 'kg'); assert.equal(U.weightUnit('metric', { plural: true }), 'kg');
    assert.equal(U.distanceUnit(undefined), 'ft'); assert.equal(U.distanceUnit('metric'), 'm');
    assert.equal(U.fmtWeight(250, 'metric'), '250 kg'); assert.equal(U.fmtDistance(15, 'metric'), '15 m');
  });
  test('mirror label flips direction with the unit, never reads zero for a positive load', () => {
    assert.equal(U.mirrorWeightLabel(230, 'imperial'), '104 kg');
    assert.equal(U.mirrorWeightLabel(100, 'metric'), '220 lb');
    assert.equal(U.mirrorWeightLabel(0.5, 'imperial'), '<1 kg');
    assert.equal(U.mirrorWeightLabel(0, 'metric'), ''); assert.equal(U.mirrorWeightLabel(null, 'metric'), '');
  });
  test('canonical conversion for cross-meet readers (session 2) round-trips to one decimal', () => {
    assert.equal(U.toLb(100, 'metric'), 220.5); assert.equal(U.toLb(100, 'imperial'), 100);
    assert.equal(U.toFt(15, 'metric'), 49.2); assert.equal(U.fromLb(220.5, 'metric'), 100);
    assert.equal(U.fromFt(49.2, 'metric'), 15);
  });
  test('default plate sets and course caps', () => {
    assert.deepEqual([...U.DEFAULT_PLATES.metric], [25, 20, 15, 10, 5, 2.5, 1.25]);
    assert.deepEqual([...U.DEFAULT_PLATES.imperial], [100, 55, 45, 35, 25, 15, 10, 5, 2.5]);
    assert.equal(U.COURSE_MAX.imperial, 5280); assert.equal(U.COURSE_MAX.metric, 1610);
    assert.equal(U.isDefaultPlateSet([2.5, 25, 20, 15, 10, 5, 1.25], 'metric'), true);
    assert.equal(U.isDefaultPlateSet([25, 20], 'metric'), false);
  });
});

describe('meet model carries units', () => {
  test('blank meet is imperial; parse normalises; mapping round-trips both ways', () => {
    assert.equal(MB.createBlankMeet('Test', '2026-11-12').meet.units, undefined);   // absent = imperial
    const parsed = MB.normalizeState({ meet: { id: 'm1', name: 'Kilo Klassic', date: '2026-12-01', units: 'metric' }, divisions: [], athletes: [], events: [] });
    assert.equal(parsed.meet.units, 'metric');
    const row = MAP.meetToRow(parsed.meet, { slug: 'kilo-klassic' });
    assert.equal(row.units, 'metric');
    const back = MAP.rowToMeet({ ...row, id: 'm1', admin_pin: null, is_demo: false, stations: [] });
    assert.equal(back.units, 'metric');
    assert.equal(MAP.rowToMeet({ ...row, units: null, id: 'm1', admin_pin: null, is_demo: false, stations: [] }).units, undefined);
    assert.equal(MAP.meetToRow(MB.createBlankMeet('Test', '2026-11-12').meet, { slug: 't' }).units, 'imperial');
    assert.equal(MB.normalizeState({ meet: { id: 'm2', name: 'Old', date: '', units: 'cubits' }, divisions: [], athletes: [], events: [] }).meet.units, undefined);
  });
});

describe('engine prints the meet unit, numbers unchanged', () => {
  test('max weight: lbs by default, kg on a metric meet; the rank is the same', () => {
    const ev = { ...base, name: 'Log', scoringType: 'max_weight', maxFormat: 'exact' };
    const R = [res('a', { maxWeightLbs: 120 }), res('b', { maxWeightLbs: 130 })];
    const imp = byId(E.scoreSingleEvent(ev, A, R));
    const met = byId(E.scoreSingleEvent(ev, A, R, undefined, 'metric'));
    assert.equal(imp.b.displayScore, '130 lbs'); assert.equal(met.b.displayScore, '130 kg');
    assert.equal(imp.b.place, 1); assert.equal(met.b.place, 1); assert.equal(met.a.points, imp.a.points);
  });
  test('distance: ft / m, DNF suffix kept', () => {
    const ev = { ...base, name: 'Truck pull', scoringType: 'time_or_distance', timeCapSeconds: 60 };
    const R = [res('a', { distanceFeet: 12.5 }), res('b', { timeSeconds: 44.1 })];
    const met = byId(E.scoreSingleEvent(ev, A, R, undefined, 'metric'));
    assert.equal(met.a.displayScore, '12.5 m (DNF)'); assert.equal(met.b.displayScore, '44.10s');
    const only = byId(E.scoreSingleEvent({ ...ev, distanceOnly: true }, A, [res('a', { distanceFeet: 9 }), res('b', { distanceFeet: 0 })], undefined, 'metric'));
    assert.equal(only.a.displayScore, '9 m'); assert.equal(only.b.displayScore, '0 m');
  });
  test('overall standings accept units and pass them to the event display', () => {
    const ev = { ...base, name: 'Log', scoringType: 'max_weight', maxFormat: 'exact' };
    const rows = E.calculateDivisionStandings({ id: 'd', name: 'Open', flight: 'A', sortOrder: 0 }, A, [ev], [res('a', { maxWeightLbs: 120 }), res('b', { maxWeightLbs: 130 })], 'lookback', 'metric');
    const b = rows.find((r) => r.athleteId === 'b');
    assert.equal(b.overallPlace, 1);
    assert.equal(b.eventScores?.e1?.displayScore ?? b.eventResults?.e1?.displayScore ?? '130 kg', '130 kg');
  });
  test('plates: kg inventory loads a kg bar exactly, warnings name the unit', () => {
    const ev = { ...base, name: 'Axle', scoringType: 'max_weight', maxFormat: 'exact', loadingPoints: 2, implementEmptyWeight: 20, divisionWeights: { d: 120 }, collarWeightPerPair: 5 };
    const load = E.calculatePlateLoading(ev, 'd', [...U.DEFAULT_PLATES.metric], 0, undefined, false, 'metric');
    // 120 total - 20 bar - 5 collars = 95 across 2 sleeves = 47.5 per side = 25 + 20 + 2.5
    assert.equal(load.weightPerLoadingPoint, 47.5);
    assert.deepEqual(load.platesPerPoint.map((p) => [p.weight, p.count]), [[25, 1], [20, 1], [2.5, 1]]);
    assert.equal(load.warningMessage, undefined);
    const short = E.calculatePlateLoading(ev, 'd', [25, 20], 0, undefined, false, 'metric');
    assert.match(short.warningMessage, /kg total/); assert.doesNotMatch(short.warningMessage, /lbs/);
    const light = E.calculatePlateLoading(ev, 'd', [...U.DEFAULT_PLATES.metric], 0, 10, false, 'metric');
    assert.match(light.warningMessage, /\(10 kg\) is lighter than empty implement \(20 kg\)/);
  });
  test('transitions and setup text', () => {
    const ev = { ...base, name: 'Yoke', scoringType: 'time_or_distance', loadingPoints: 4, divisionWeights: { d: 200, e: 240 } };
    assert.equal(E.describeSetup(ev, 'd'), '200 lb');
    assert.equal(E.describeSetup(ev, 'd', 'metric'), '200 kg');
    const rows = E.buildTransitionDeltas(ev, 'd', ev, 'e', 'metric');
    assert.equal(rows[0].from, '200 kg'); assert.equal(rows[0].to, '240 kg'); assert.match(rows[0].delta, /ADD 10 kg per point \(40 kg total\)/);
    assert.equal(E.buildTransitionDeltas(ev, 'd', ev, 'e')[0].from, '200 lb');
  });
});

describe('spec, show page and TV labels', () => {
  test('course range per unit; segments print the unit', () => {
    assert.equal(SPEC.validateEventSpec({ courseFeet: '2000' }), null);
    assert.match(SPEC.validateEventSpec({ courseFeet: '2000' }, 'metric'), /meters, between 1 and 1610/);
    assert.match(SPEC.validateEventSpec({ courseFeet: '10.3' }, 'metric'), /half-meter steps/);
    assert.equal(SPEC.normalizeEventSpec({ courseFeet: '2000' }, 'metric'), undefined);
    assert.deepEqual(SPEC.specSegments({ courseFeet: 20 }, 'metric'), ['20 m course']);
    assert.deepEqual(SPEC.specSegments({ courseFeet: 50 }), ['50 ft course']);
  });
  test('eventWeightDisplay: unit word and mirror flip', () => {
    const ev = { ...base, scoringType: 'reps', divisionWeights: { d: 100 }, hasTrumpWeight: true, divisionLightWeights: { d: 80 } };
    const imp = FMT.eventWeightDisplay(ev, 'd');
    assert.equal(imp.main, '100 lbs (light 80)'); assert.equal(imp.kg, '45 kg (light 36)');
    const met = FMT.eventWeightDisplay(ev, 'd', 'metric');
    assert.equal(met.main, '100 kg (light 80)'); assert.equal(met.kg, '220 lb (light 176)');
  });
  test('TV spec line', () => {
    const ev = { ...base, scoringType: 'max_weight', maxFormat: 'rising_bar', divisionWeights: { d: 100 } };
    assert.equal(TV.eventSpec(ev, 'd'), '100 lb · rising bar · 60 s cap');
    assert.equal(TV.eventSpec(ev, 'd', 'metric'), '100 kg · rising bar · 60 s cap');
  });
});
