import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const C = await import(`${ROOT}/lib/theme/color.ts`);
const P = await import(`${ROOT}/lib/theme/promoter.ts`);

describe('theme colour maths', () => {
  test('hex round trip and luminance anchors', () => {
    assert.equal(C.rgbToHex(C.hexToRgb('#1d3aa8')), '#1d3aa8');
    assert.equal(C.rgbToHex(C.hexToRgb('abc')), '#aabbcc');
    assert.ok(Math.abs(C.luminance('#ffffff') - 1) < 1e-9);
    assert.equal(C.luminance('#000000'), 0);
    assert.ok(Math.abs(C.contrast('#ffffff', '#000000') - 21) < 1e-6);
  });
  test('OKLCH round trip stays within 1/255 and gamut clipping lands in range', () => {
    for (const h of ['#1d3aa8', '#c8102e', '#5b21b6', '#d6d6d6', '#111111']) {
      const back = C.rgbToHex(C.oklchToRgb(C.rgbToOklch(C.hexToRgb(h))));
      assert.equal(back, h);
    }
    const loud = C.oklchToHexClipped({ l: 0.5, c: 0.6, h: 30 });
    assert.match(loud, /^#[0-9a-f]{6}$/);
  });
  test('CIECAM02 white is J 100; CAM02-UCS black-white is ~100', () => {
    assert.ok(Math.abs(C.xyzToCam02([95.047, 100, 108.883]).J - 100) < 1e-6);
    assert.ok(Math.abs(C.deltaE('#ffffff', '#000000') - 100) < 0.5);
  });
  test('the study defects reproduce: hostile red and brand rose are both inside 20 of the red pen', () => {
    assert.ok(C.deltaE('#e30614', '#c8102e') < 20);
    assert.ok(C.deltaE('#e11d48', '#c8102e') < 20);
  });
  test('deutan simulation collapses a green toward the red pen', () => {
    assert.ok(C.deltaE('#15803d', '#c8102e') > 40);
    assert.ok(C.deltaEAs('#15803d', '#c8102e', 'deutan') < 20);
  });
});

describe('promoter paint', () => {
  test('no paint = ink with the mode label', () => {
    assert.deepEqual([P.resolveAccent(null, 'home').accent, P.resolveAccent(undefined, 'dark').accent], ['#111111', '#f2f2f2']);
    assert.equal(P.resolveAccent(null, 'home').refused, false);
  });
  test('violet passes in both modes, with a readable label', () => {
    const h = P.resolveAccent('#5b21b6', 'home');
    assert.equal(h.refused, false);
    assert.ok(C.contrast(h.accent, h.label) >= 4.5, `home ${h.accent}/${h.label}`);
    const d = P.resolveAccent('#5b21b6', 'dark');
    assert.equal(d.refused, false);
    assert.ok(C.contrast(d.accent, d.label) >= 4.5, `dark ${d.accent}/${d.label}`);
  });
  test('a promoter red is refused and the slots fall back to ink; the clamped colour is still returned for text', () => {
    const r = P.resolveAccent('#e30614', 'home');
    assert.equal(r.refused, true);
    assert.equal(r.accent, '#111111');
    assert.match(r.clamped, /^#[0-9a-f]{6}$/);
    assert.match(r.reason, /no-lift red/);
  });
  test('a green is refused for deutan vision even though it reads fine to normal vision', () => {
    const r = P.resolveAccent('#15803d', 'home');
    assert.equal(r.refused, true);
    assert.equal(r.failedAs, 'deutan');
  });
  test('accent clamp holds L and C in range; a loud yellow comes back dark enough for white text', () => {
    const o = C.rgbToOklch(C.hexToRgb(P.clampAccent('#ffd400', 'home')));
    assert.ok(o.l <= 0.5 + 0.01 && o.l >= 0.3 - 0.01, `L ${o.l}`);
    assert.ok(o.c <= 0.2 + 0.01, `C ${o.c}`);
  });
  test('ground clamp: a navy ground is lifted to a pale tint at home and kept dark in dark mode', () => {
    const home = C.rgbToOklch(C.hexToRgb(P.resolveGround('#0b1d3a', 'home')));
    assert.ok(home.l >= 0.8 - 0.01 && home.c <= 0.05 + 0.01);
    const dark = C.rgbToOklch(C.hexToRgb(P.resolveGround('#0b1d3a', 'dark')));
    assert.ok(dark.l >= 0.18 - 0.01 && dark.l <= 0.3 + 0.01);
    assert.equal(P.resolveGround(null, 'home'), '#d6d6d6');
  });
});
