// UI transition Phase 4: the judge pad's pure model (components/judge/padModel.ts).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const P = await import(`${ROOT}/components/judge/padModel.ts`);

const stones = { scoringType: 'time_or_implements', implementCount: 5 };
const reps = { scoringType: 'reps' };
const bar = { scoringType: 'max_weight', risingBarWeights: [300, 320, 340] };
const yoke = { scoringType: 'time_or_distance' };

describe('clock', () => {
  test('formatClock reads mm:ss.d and floors the tenth', () => {
    assert.equal(P.formatClock(0), '00:00.0');
    assert.equal(P.formatClock(42.67), '00:42.6');
    assert.equal(P.formatClock(61.25), '01:01.2');
    assert.equal(P.formatClock(-3), '00:00.0');
    assert.equal(P.formatClock(NaN), '00:00.0');
  });
  test('clockWord: ready, running, stopped, over cap', () => {
    assert.equal(P.clockWord(0, false, 60), 'ready');
    assert.equal(P.clockWord(5, true, 60), 'running');
    assert.equal(P.clockWord(5, false, 60), 'stopped');
    assert.equal(P.clockWord(60, true, 60), 'over');
    assert.equal(P.clockWord(500, true, 0), 'running', 'no cap means never over');
  });
  test('formatSeconds prints two decimals or nothing', () => {
    assert.equal(P.formatSeconds(6.1), '6.10 s');
    assert.equal(P.formatSeconds(undefined), '');
  });
});

describe('stones log', () => {
  test('good advances the stone, no-lift is a miss on the same stone', () => {
    let r = {};
    r = { ...r, ...P.pressPatch(stones, r, 'good', 6.12) };
    r = { ...r, ...P.pressPatch(stones, r, 'good', 11.47) };
    r = { ...r, ...P.pressPatch(stones, r, 'no', 15.0) };
    r = { ...r, ...P.pressPatch(stones, r, 'no', 17.0) };
    const rows = P.stoneRows(P.logOf(r), 5);
    assert.deepEqual(rows.map((x) => x.state), ['good', 'good', 'no', 'pending', 'pending']);
    assert.equal(rows[2].misses, 2);
    assert.equal(rows[0].split, 6.12);
    assert.equal(r.implementsCompleted, 2, 'misses do not count');
    assert.equal(r.splitTimeSeconds, 11.47, 'last good split is the tiebreaker');
    assert.equal(r.didNotStart, false);
  });
  test('a retry after a miss completes the stone', () => {
    let r = {};
    for (const [k, s] of [['no', 3], ['good', 8]]) r = { ...r, ...P.pressPatch(stones, r, k, s) };
    const rows = P.stoneRows(P.logOf(r), 5);
    assert.equal(rows[0].state, 'good');
    assert.equal(rows[0].misses, 1);
    assert.equal(r.implementsCompleted, 1);
  });
  test('cannot complete more stones than the event has', () => {
    let r = {};
    for (let i = 0; i < 6; i++) r = { ...r, ...P.pressPatch(stones, r, 'good', i + 1) };
    assert.equal(r.implementsCompleted, 5);
    assert.equal(P.logOf(r).length, 5);
  });
  test('undo pops the log and recomputes; old results without a log step down', () => {
    let r = {};
    for (const s of [6, 11, 17]) r = { ...r, ...P.pressPatch(stones, r, 'good', s) };
    r = { ...r, ...P.undoPatch(stones, r) };
    assert.equal(r.implementsCompleted, 2);
    assert.equal(r.splitTimeSeconds, 11);
    assert.deepEqual(P.undoPatch(stones, { implementsCompleted: 3 }), { implementsCompleted: 2 });
    assert.equal(P.canUndo(stones, {}), false);
    assert.equal(P.canUndo(stones, { implementsCompleted: 1 }), true);
  });
});

describe('reps log', () => {
  test('good rep counts, no rep is tallied but not scored', () => {
    let r = {};
    for (const k of ['good', 'good', 'no', 'good']) r = { ...r, ...P.pressPatch(reps, r, k, 0) };
    assert.equal(r.reps, 3);
    assert.deepEqual(P.repsFromLog(P.logOf(r)), { reps: 3, noReps: 1 });
    r = { ...r, ...P.undoPatch(reps, r) };
    assert.equal(r.reps, 2);
    assert.deepEqual(P.undoPatch(reps, { reps: 4 }), { reps: 3 }, 'legacy result');
  });
});

describe('rising bar', () => {
  test('current weight is the lowest pending unless the judge tapped one', () => {
    assert.equal(P.currentBarWeight([300, 320, 340], undefined, null), 300);
    assert.equal(P.currentBarWeight([300, 320, 340], { 300: 'good' }, null), 320);
    assert.equal(P.currentBarWeight([300, 320, 340], { 300: 'good' }, 340), 340);
    assert.equal(P.currentBarWeight([300, 320, 340], { 300: 'good', 320: 'pass', 340: 'fail' }, null), null);
  });
  test('press writes good / fail at the weight; undo clears that weight', () => {
    let r = {};
    r = { ...r, ...P.pressPatch(bar, r, 'good', 0, 300) };
    r = { ...r, ...P.pressPatch(bar, r, 'no', 0, 320) };
    assert.deepEqual(r.risingBarAttempts, { 300: 'good', 320: 'fail' });
    assert.equal(P.bestWeight(r), 300);
    assert.equal(P.bestWeight({ ...r, maxWeightLbs: 333 }), 333, 'typed override wins when higher');
    r = { ...r, ...P.undoPatch(bar, r) };
    assert.deepEqual(r.risingBarAttempts, { 300: 'good' });
    assert.deepEqual(P.pressPatch(bar, r, 'good', 0, null), {}, 'no weight, no press');
  });
});

describe('time or distance', () => {
  test('finish stamps the clock; DNF clears the time so distance decides', () => {
    assert.deepEqual(P.pressPatch(yoke, {}, 'good', 42.67), { timeSeconds: 42.67, didNotStart: false });
    assert.deepEqual(P.pressPatch(yoke, { timeSeconds: 42 }, 'no', 50), { timeSeconds: 0, didNotStart: false });
    assert.equal(P.canUndo(yoke, { timeSeconds: 42 }), true);
  });
});

describe('labels and state', () => {
  test('keys read by event type', () => {
    assert.equal(P.keyLabels('reps').good, 'Good rep');
    assert.equal(P.keyLabels('time_or_distance').no, 'DNF');
    assert.equal(P.keyLabels('time_or_implements').no, 'No lift');
  });
  test('sync cell: filled square only when live, count of waiting scores, never a colour word', () => {
    assert.deepEqual(P.syncLabel(false, undefined), { filled: false, text: 'Local' });
    assert.deepEqual(P.syncLabel(true, { state: 'idle', pending: 0, lastSyncAt: 1, error: null }), { filled: true, text: 'Live' });
    assert.deepEqual(P.syncLabel(true, { state: 'offline', pending: 3, lastSyncAt: 1, error: null }), { filled: false, text: 'Offline 3' });
    assert.deepEqual(P.syncLabel(true, { state: 'idle', pending: 1, lastSyncAt: 1, error: 'UNITS_MISMATCH: x', held: 1 }), { filled: false, text: 'Held 1' });   // KM-03
    assert.deepEqual(P.syncLabel(true, { state: 'error', pending: 0, lastSyncAt: 1, error: 'x' }), { filled: false, text: 'Error' });
  });
  test('hasEntry: a fresh result has none; any mark, DNS or lock counts', () => {
    assert.equal(P.hasEntry({}), false);
    assert.equal(P.hasEntry({ reps: 1 }), true);
    assert.equal(P.hasEntry({ didNotStart: true }), true);
    assert.equal(P.hasEntry({ risingBarAttempts: { 300: 'pass' } }), true);
  });
  test('clockTime is hh:mm', () => {
    const d = new Date(2026, 10, 2, 14, 2, 51).getTime();
    assert.equal(P.clockTime(d), '14:02');
    assert.equal(P.clockTime(null), '');
  });
});

// Astra dry run 11/3: DR3-03 legacy counts, DR3-04 pad/standings agreement, DR3-05 undo at a repeated weight.
describe('Astra DR3 pad fixes', () => {
  test('DR3-03: a saved reps result without a tape keeps its count on the next press', () => {
    const ev = { scoringType: 'reps' };
    const patch = P.pressPatch(ev, { reps: 8 }, 'good', 0);
    assert.equal(patch.reps, 9);
    assert.equal(patch.attemptLog.length, 9);
    assert.ok(patch.attemptLog.slice(0, 8).every((e) => e.kind === 'good' && e.at === 0), 'seeded entries are legacy-stamped');
    const noRep = P.pressPatch(ev, { reps: 8 }, 'no', 0);
    assert.equal(noRep.reps, 8);
    assert.equal(P.repsFromLog(noRep.attemptLog).noReps, 1);
  });
  test('DR3-03: a saved stones count without a tape continues from its count', () => {
    const ev = { scoringType: 'time_or_implements', implementCount: 5 };
    const patch = P.pressPatch(ev, { implementsCompleted: 3, splitTimeSeconds: 20.5 }, 'good', 25.1);
    assert.equal(patch.implementsCompleted, 4);
    assert.equal(patch.splitTimeSeconds, 25.1);
    assert.equal(P.stoneRows(patch.attemptLog, 5).filter((r) => r.state === 'good').length, 4);
  });
  test('DR3-03: seedLog leaves a real tape alone and ignores zero counts', () => {
    const tape = [{ kind: 'good', at: 5 }];
    assert.equal(P.seedLog({ scoringType: 'reps' }, { reps: 7, attemptLog: tape }), tape);
    assert.deepEqual(P.seedLog({ scoringType: 'reps' }, { reps: 0 }), []);
    assert.deepEqual(P.seedLog({ scoringType: 'max_weight' }, { maxWeightLbs: 200 }), []);
  });
  test('DR3-04: BEST follows the engine, so a typed override wins over a heavier good lift', () => {
    const r = { risingBarAttempts: { 100: 'good', 150: 'good' }, maxWeightLbs: 120 };
    assert.equal(P.bestWeight(r), 120);
    assert.equal(P.bestWeight({ risingBarAttempts: { 100: 'good', 150: 'good' } }), 150);
    assert.equal(P.bestWeight({ risingBarAttempts: { 100: 'good' }, didNotStart: true }), 0);
  });
  test('DR3-05: undoing a no-lift at a weight already made restores the good lift', () => {
    const ev = { scoringType: 'max_weight', risingBarWeights: [100, 150, 200] };
    let r = {};
    r = { ...r, ...P.pressPatch(ev, r, 'good', 0, 100) };
    r = { ...r, ...P.pressPatch(ev, r, 'good', 0, 150) };
    r = { ...r, ...P.pressPatch(ev, r, 'no', 0, 150) };
    assert.equal(r.risingBarAttempts[150], 'fail');
    r = { ...r, ...P.undoPatch(ev, r) };
    assert.equal(r.risingBarAttempts[150], 'good', 'the earlier good 150 survives the undo');
    assert.equal(P.bestWeight(r), 150);
    assert.equal(r.attemptLog.length, 2);
    r = { ...r, ...P.undoPatch(ev, r) };
    assert.equal(r.risingBarAttempts[150], undefined, 'no surviving entry: the weight goes back to pending');
    assert.equal(P.bestWeight(r), 100);
  });
});
