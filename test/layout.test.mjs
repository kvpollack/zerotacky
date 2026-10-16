import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const L = await import(`${ROOT}/lib/layout.ts`);
const mem = (o = {}) => ({ getItem: (k) => (k in o ? o[k] : null) });
const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const TABLET_PORTRAIT = { width: 1024, height: 1366 };

describe('layout mode resolution', () => {
  test('viewport decides when nothing else is set', () => {
    assert.equal(L.resolveLayout('', mem(), PHONE), 'phone');
    assert.equal(L.resolveLayout('', mem(), TV), 'tv');
    assert.equal(L.resolveLayout('', mem(), TABLET_PORTRAIT), 'phone', 'portrait is never TV');
    assert.equal(L.resolveLayout('', mem(), { width: 1023, height: 700 }), 'phone', 'below 1024 wide is a phone/tablet');
  });
  test('saved toggle beats the viewport', () => {
    assert.equal(L.resolveLayout('', mem({ [L.LAYOUT_STORAGE_KEY]: 'tv' }), PHONE), 'tv');
    assert.equal(L.resolveLayout('', mem({ [L.LAYOUT_STORAGE_KEY]: 'phone' }), TV), 'phone');
  });
  test('?layout= in the URL beats everything', () => {
    assert.equal(L.resolveLayout('?layout=tv', mem({ [L.LAYOUT_STORAGE_KEY]: 'phone' }), PHONE), 'tv');
    assert.equal(L.resolveLayout('?theme=volt&layout=phone', mem({ [L.LAYOUT_STORAGE_KEY]: 'tv' }), TV), 'phone');
  });
  test('junk values fall through', () => {
    assert.equal(L.resolveLayout('?layout=huge', mem({ [L.LAYOUT_STORAGE_KEY]: 'nope' }), TV), 'tv');
    assert.equal(L.resolveLayout('', null, PHONE), 'phone');
    assert.equal(L.resolveLayout('', { getItem: () => { throw new Error('blocked'); } }, TV), 'tv');
  });
  test('otherLayout flips', () => {
    assert.equal(L.otherLayout('tv'), 'phone');
    assert.equal(L.otherLayout('phone'), 'tv');
  });
});
