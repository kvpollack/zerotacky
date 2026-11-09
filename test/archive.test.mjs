import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const A = await import(`${ROOT}/lib/website/archive.ts`);

const comp = (over = {}) => ({
  id: 1, slug: 'sr:2026-03-28:x', name: 'X', date: '2026-03-28', sanction: 'sc', city: 'York', state: 'PA', division: 'Open M 105kg',
  place: 1, points: 10, weightClass: '105kg', classKind: 'open', enteredAs: 'Kurt Pollack', fieldSize: 4, events: [], ...over,
});

test('normalizeArchiveKey matches the SQL rule', () => {
  assert.equal(A.normalizeArchiveKey("  Kurt  O'Pollack-Jr. "), 'kurt o pollack jr');
  assert.equal(A.normalizeArchiveKey('JOSÉ'), 'jos');   // accents are not folded on either side; same key both ways
});

test('formatArchivePlace reads "3rd of 10" and handles fields of one', () => {
  assert.equal(A.formatArchivePlace({ place: 3, fieldSize: 10 }), '3rd of 10');
  assert.equal(A.formatArchivePlace({ place: 1, fieldSize: 1 }), '1st');
  assert.equal(A.formatArchivePlace({ place: 11, fieldSize: 12 }), '11th of 12');
  assert.equal(A.formatArchivePlace({ place: 22, fieldSize: 30 }), '22nd of 30');
  assert.equal(A.formatArchivePlace({ place: null, fieldSize: 3 }), 'No place');
});

test('formatArchiveResult by unit, raw fallback', () => {
  assert.equal(A.formatArchiveResult({ value: 3, unit: 'reps', raw: '3+0:13' }), '3 reps');
  assert.equal(A.formatArchiveResult({ value: 1, unit: 'reps', raw: '1' }), '1 rep');
  assert.equal(A.formatArchiveResult({ value: 28.4, unit: 'sec', raw: '28.40' }), '28.40 s');
  assert.equal(A.formatArchiveResult({ value: 200, unit: 'lb', raw: '200' }), '200 lb');
  assert.equal(A.formatArchiveResult({ value: null, unit: null, raw: 'DNF' }), 'DNF');
});

test('summarizeArchive counts podiums and wins only in real fields', () => {
  const s = A.summarizeArchive([comp(), comp({ id: 2, date: '2025-03-29', place: 1, fieldSize: 1, state: 'NJ' }), comp({ id: 3, date: '2024-01-01', place: 3, fieldSize: 8 })]);
  assert.equal(s.competitions, 3); assert.equal(s.wins, 1); assert.equal(s.podiums, 2);
  assert.equal(s.firstDate, '2024-01-01'); assert.equal(s.lastDate, '2026-03-28'); assert.deepEqual(s.states, ['NJ', 'PA']);
});

test('dedupeArchive sorts newest first and drops a repeated slug+division', () => {
  const out = A.dedupeArchive([comp({ date: '2024-01-01', slug: 'a' }), comp({ date: '2026-01-01', slug: 'b' }), comp({ date: '2024-01-01', slug: 'a' })]);
  assert.deepEqual(out.map((c) => c.slug), ['b', 'a']);
});

test('nameSimilarity', () => {
  assert.equal(A.nameSimilarity('Kurt Pollack', 'kurt pollack'), 'same');
  assert.equal(A.nameSimilarity('Kurt V Pollack', 'Kurt Pollack'), 'close');
  assert.equal(A.nameSimilarity('Kurt Pollack', 'Jess Smith'), 'different');
});

test('sanctionLabel', () => {
  assert.equal(A.sanctionLabel('sc'), 'Strongman Corporation');
  assert.equal(A.sanctionLabel('uss'), 'United States Strongman');
  assert.equal(A.sanctionLabel(null), '');
  assert.equal(A.sanctionLabel('xyz'), 'XYZ');
});

test('ARCHIVE_CREDIT names both the source and the original scoring platform', () => {
  assert.match(A.ARCHIVE_CREDIT.text, /strongmanresults\.com/);
  assert.match(A.ARCHIVE_CREDIT.text, /Iron Podium/);
  assert.match(A.ARCHIVE_CREDIT.text, /not affiliated/);
});
