import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const S = await import(`${ROOT}/lib/engine/scoring.ts`);
const M = await import(`${ROOT}/lib/website/supabaseShows.ts`);
const A = await import(`${ROOT}/lib/website/adoptArchive.ts`);

const ev = (over = {}) => ({
  id: 'imp-e1', meetId: 'm', eventNumber: 1, name: 'Car Deadlift', scoringType: 'reps', timeCapSeconds: 60, lanes: 1,
  loadingPoints: 0, weightEntryMode: 'total', implementEmptyWeight: 0, divisionWeights: {}, imported: true, ...over,
});
const ath = (id, lot) => ({ id, divisionId: 'd1', name: id, lotNumber: lot, status: 'active' });
const res = (athleteId, importedPoints, importedDisplay) => ({ id: `imp-e1_${athleteId}`, eventId: 'imp-e1', athleteId, importedPoints, importedDisplay, updatedAt: 1 });

test('imported event: published points stand, equal points share a place, zero sits last with its mark', () => {
  const athletes = [ath('a', 1), ath('b', 2), ath('c', 3), ath('d', 4)];
  const results = [res('a', 4, '25 reps'), res('b', 2.5, '18 reps'), res('c', 2.5, '18 reps'), res('d', 0, '0 reps')];
  const rows = S.scoreSingleEvent(ev(), athletes, results, [ev()]);
  const by = Object.fromEntries(rows.map((r) => [r.athleteId, r]));
  assert.equal(by.a.place, 1); assert.equal(by.a.points, 4); assert.equal(by.a.displayScore, '25 reps'); assert.equal(by.a.isTied, false);
  assert.equal(by.b.place, 2); assert.equal(by.c.place, 2); assert.equal(by.b.isTied, true); assert.equal(by.b.points, 2.5);
  assert.equal(by.d.place, 4); assert.equal(by.d.points, 0); assert.equal(by.d.isZero, true); assert.equal(by.d.displayScore, '0 reps');
});

test('imported event: a missing result reads as a dash and is never rescored from reps', () => {
  const athletes = [ath('a', 1), ath('b', 2)];
  const results = [{ ...res('a', 1, '10 reps'), reps: 10 }];
  const rows = S.scoreSingleEvent(ev(), athletes, results, [ev()]);
  const b = rows.find((r) => r.athleteId === 'b');
  assert.equal(b.displayScore, '—'); assert.equal(b.isZero, true);
  assert.equal(S.resultHasScore(res('x', 0, '0 reps'), ev()), false);
  assert.equal(S.resultHasScore(res('x', 3, '12 reps'), ev()), true);
});

test('native event is untouched by the imported branch', () => {
  const native = ev({ imported: undefined });
  const athletes = [ath('a', 1), ath('b', 2)];
  const results = [{ id: 'imp-e1_a', eventId: 'imp-e1', athleteId: 'a', reps: 10, updatedAt: 1 }, { id: 'imp-e1_b', eventId: 'imp-e1', athleteId: 'b', reps: 7, updatedAt: 1 }];
  const rows = S.scoreSingleEvent(native, athletes, results, [native]);
  assert.deepEqual(rows.map((r) => [r.athleteId, r.place, r.points]), [['a', 1, 2], ['b', 2, 1]]);
});

test('suppliedFromImported groups published places by division and keeps tie flags', () => {
  const athletes = [{ id: 'a', divisionId: 'd1' }, { id: 'b', divisionId: 'd1' }, { id: 'c', divisionId: 'd2' }, { id: 'zz', divisionId: 'd9' }];
  const rows = [
    { meet_id: 'm', athlete_id: 'a', place: 1, points: 20, is_tied: false },
    { meet_id: 'm', athlete_id: 'b', place: 1, points: 20, is_tied: true },
    { meet_id: 'm', athlete_id: 'c', place: 1, points: 9, is_tied: false },
    { meet_id: 'm', athlete_id: 'ghost', place: 3, points: 1, is_tied: false },
  ];
  const out = M.suppliedFromImported(athletes, rows);
  assert.deepEqual(Object.keys(out).sort(), ['d1', 'd2']);
  assert.deepEqual(out.d1, [{ athleteId: 'a', overallPlace: 1, isTiedOverall: false }, { athleteId: 'b', overallPlace: 1, isTiedOverall: true }]);
  assert.equal(out.d2.length, 1);
});

test('adopt helpers: place, counts, state, headline, query', () => {
  assert.equal(A.archivePlace({ city: 'Parkesburg', state: 'PA' }), 'Parkesburg, PA');
  assert.equal(A.archivePlace({ city: null, state: 'PA' }), 'PA');
  assert.equal(A.archivePlace({ city: ' ', state: null }), '');
  assert.equal(A.archiveCounts({ athletes: 1, divisions: 12, events: 5 }), '1 athlete · 12 divisions · 5 events');
  assert.equal(A.adoptState({ adopted: null }), 'open');
  assert.equal(A.adoptState({ adopted: { slug: 's', id: 'i', mine: true } }), 'mine');
  assert.equal(A.adoptState({ adopted: { slug: 's', id: 'i', mine: false } }), 'taken');
  assert.equal(A.importedHeadline('strongmanresults.com'), 'Results imported from Iron Podium via strongmanresults.com');
  assert.equal(A.importedHeadline(''), 'Results imported from an outside source');
  assert.equal(A.cleanArchiveQuery('  pennsylvania   2026 '), 'pennsylvania 2026');
});
