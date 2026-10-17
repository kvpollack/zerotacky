import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = process.env.ZT_ROOT || '..';
const C = await import(`${ROOT}/lib/constants.ts`);
const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, '..', 'app', 'globals.css'), 'utf-8');

const REQUIRED_VARS = [
  '--zt-bg', '--zt-surface', '--zt-surface-2', '--zt-inset', '--zt-border', '--zt-border-strong',
  '--zt-primary', '--zt-primary-2', '--zt-on-primary', '--zt-secondary', '--zt-on-secondary',
];
const LIGHT_EXTRA_VARS = ['--zt-text', '--zt-text-2', '--zt-muted', '--zt-success-text', '--zt-danger-text'];

function blockFor(id) {
  const m = css.match(new RegExp(`\\[data-zt-theme='${id}'\\] \\{\\n([\\s\\S]*?)\\n\\}`));
  return m ? m[1] : null;
}

describe('themes: constants and globals.css agree', () => {
  test('13 themes, unique ids, two light ones', () => {
    assert.equal(C.THEMES.length, 13);
    assert.equal(new Set(C.THEMES.map((t) => t.id)).size, 13);
    assert.deepEqual(C.THEMES.filter((t) => t.light).map((t) => t.id), ['daylight', 'sandstone']);
    assert.equal(C.isLightTheme('daylight'), true);
    assert.equal(C.isLightTheme('sandstone'), true);
    assert.equal(C.isLightTheme('arena-tv'), false);
    assert.equal(C.isLightTheme('nope'), false);
    assert.ok(C.THEMES.some((t) => t.id === C.DEFAULT_THEME_ID));
    assert.ok(C.isLightTheme(C.DAYLIGHT_THEME_ID));
  });

  test('every theme id has a CSS block with the core variables; light themes also restate text colours and color-scheme', () => {
    for (const t of C.THEMES) {
      const block = blockFor(t.id);
      assert.ok(block, `no [data-zt-theme='${t.id}'] block in globals.css`);
      for (const v of REQUIRED_VARS) assert.ok(block.includes(`${v}:`), `${t.id} lacks ${v}`);
      // The picker swatch is the surface colour, except daylight which has always used its bg (#F8FAFC) as the swatch.
      const sw = t.surface.toLowerCase();
      assert.ok(block.toLowerCase().includes(`--zt-surface: ${sw}`) || block.toLowerCase().includes(`--zt-bg: ${sw}`), `${t.id} swatch matches neither surface nor bg`);
      assert.ok(block.toLowerCase().includes(`--zt-primary: ${t.primary.toLowerCase()}`), `${t.id} primary swatch mismatch`);
      if (t.light) {
        for (const v of LIGHT_EXTRA_VARS) assert.ok(block.includes(`${v}:`), `${t.id} (light) lacks ${v}`);
        assert.ok(block.includes('color-scheme: light'), `${t.id} (light) lacks color-scheme: light`);
      } else {
        assert.ok(!block.includes('color-scheme: light'), `${t.id} (dark) sets color-scheme: light`);
      }
    }
  });

  test('no CSS theme block without a THEMES entry', () => {
    const ids = [...css.matchAll(/\[data-zt-theme='([a-z-]+)'\]/g)].map((m) => m[1]);
    for (const id of ids) assert.ok(C.THEMES.some((t) => t.id === id), `globals.css has orphan theme block '${id}'`);
  });
});
