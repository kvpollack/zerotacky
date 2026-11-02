import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = process.env.ZT_ROOT || '..';
const T = await import(`${ROOT}/components/sheet/TitleBlock.tsx`);
const S = await import(`${ROOT}/components/sheet/StoneMark.tsx`);
const W = await import(`${ROOT}/components/brand/Wordmark.tsx`);
const K = await import(`${ROOT}/components/sheet/NoLiftKey.tsx`);

describe('sheet parts', () => {
  test('REV letters skip I O Q S X Z and stop at the last letter', () => {
    assert.equal(T.REV_LETTERS, 'ABCDEFGHJKLMNPRTUVWY');
    for (const bad of 'IOQSXZ') assert.ok(!T.REV_LETTERS.includes(bad));
    assert.equal(T.nextRev('H'), 'J');
    assert.equal(T.nextRev('Y'), 'Y');
    assert.equal(T.nextRev('?'), 'A');
    assert.equal(T.revFromCount(0), 'A');
    assert.equal(T.revFromCount(3), 'D');
    assert.equal(T.revFromCount(99), 'Y');
  });
  test('the stone is an outline in currentColor with no fill and no red', () => {
    const html = renderToStaticMarkup(React.createElement(S.default, { size: 24 }));
    assert.match(html, /stroke="currentColor"/);
    assert.ok(!/fill="#/.test(html), 'no hex fill');
    assert.ok(!/e11d48|c8102e|9f1239/.test(html), 'no red');
    assert.match(html, /aria-hidden="true"/);
    const titled = renderToStaticMarkup(React.createElement(S.default, { title: 'ZeroTacky' }));
    assert.match(titled, /role="img"/);
  });
  test('the wordmark reads ZeroTacky to a screen reader and carries no fill colour', () => {
    const html = renderToStaticMarkup(React.createElement(W.default));
    assert.match(html, /sr-only[^>]*>ZeroTacky</);
    assert.match(html, /font-wordmark/);
    assert.ok(!/fill="#/.test(html));
  });
  test('NO LIFT is a light key with an X glyph and a red-pen border; GOOD LIFT is an ink fill', () => {
    const no = renderToStaticMarkup(React.createElement(K.default));
    assert.match(no, /bg-sheet/);
    assert.match(no, /border-redpen/);
    assert.match(no, /✕|&#x2715;|\u2715/);
    const good = renderToStaticMarkup(React.createElement(K.GoodLiftKey));
    assert.match(good, /bg-ink/);
    assert.match(good, /text-sheet/);
  });
});
