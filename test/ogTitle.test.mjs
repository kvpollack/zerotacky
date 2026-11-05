import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { fitOgTitle } from '../lib/website/og.tsx';
import * as T from '../lib/website/og.tsx';

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
    assert.equal(r.fontSize, 36); assert.equal(r.lines, 3); assert.ok(r.text.endsWith('...')); assert.ok(T.ogTitleLines(r.text, 43) <= 3);
  });
  test('whitespace is collapsed before measuring', () => {
    assert.equal(fitOgTitle('  Iron   Harbor\n Classic ').text, 'Iron Harbor Classic');
  });
});

describe('fitOgTitle: unbroken tokens (Astra recheck 11/5)', () => {
  test('ogTitleLines breaks a word longer than the line the way break-word paints it', () => {
    const { ogTitleLines } = T;
    assert.equal(ogTitleLines('abc def', 10), 1);
    assert.equal(ogTitleLines('abcdefghij klm', 10), 2);
    assert.equal(ogTitleLines('abcdefghijklmnopqrstu', 10), 3);
    assert.equal(ogTitleLines('ab abcdefghijklmnopqrstu', 10), 4);
  });
  test('a 99-character single token fits three lines at 36 to 40 px without a cut', () => {
    const t = 'StrongmanChampionshipInvitational'.repeat(3);
    const r = fitOgTitle(t);
    assert.equal(r.text, t); assert.equal(r.lines, 3); assert.ok(r.fontSize >= 36 && r.fontSize <= 40);
  });
  test('150 unbroken characters are cut to the three-line capacity with an ellipsis', () => {
    const r = fitOgTitle('W'.repeat(150));
    assert.equal(r.fontSize, 36); assert.ok(r.text.endsWith('...')); assert.ok(T.ogTitleLines(r.text, 43) <= 3);
  });
});
