import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fitOgTitle } from '../lib/website/og.tsx';

// Astra BR-03 (11/5): the share-card title must never run into the date line. Red Hat Mono is monospace, so the fit is
// arithmetic on character counts; these pin the tiers.
describe('fitOgTitle', () => {
  test('short title: one line at 66 px, text untouched', () => {
    assert.deepEqual(fitOgTitle('Iron Harbor Classic'), { text: 'Iron Harbor Classic', fontSize: 66, lines: 1 });
  });
  test('mid title: two lines, size between 42 and 60', () => {
    const r = fitOgTitle('All Out Strongfest 2026 at The Power Plant Gym Harrisburg');
    assert.equal(r.lines, 2); assert.ok(r.fontSize >= 42 && r.fontSize <= 60); assert.equal(r.text.includes('...'), false);
  });
  test('90+ character title: three lines at 36 to 40 px, nothing cut', () => {
    const t = 'The Twenty-Sixth Annual Keystone State Strongman and Strongwoman Championship Invitational 2027';
    const r = fitOgTitle(t);
    assert.equal(r.lines, 3); assert.ok(r.fontSize >= 36 && r.fontSize <= 40); assert.equal(r.text, t);
  });
  test('absurd title is cut with an ellipsis at the three-line capacity', () => {
    const r = fitOgTitle('x '.repeat(120));
    assert.equal(r.fontSize, 36); assert.equal(r.lines, 3); assert.ok(r.text.endsWith('...')); assert.ok(r.text.length <= 129);
  });
  test('whitespace is collapsed before measuring', () => {
    assert.equal(fitOgTitle('  Iron   Harbor\n Classic ').text, 'Iron Harbor Classic');
  });
});
