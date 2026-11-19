import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// UI pass 1 (audits/ui-audit-merged-2026-11-13.md): the softer web palette is scoped to [data-zt-web], which only the
// website frame sets. The scorer and judge pad keep the weight-500, all-ink sheet. These checks keep that boundary.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const css = read('app/globals.css');

// Return the body of the first rule whose selector list is exactly `selector`.
function ruleBody(selector) {
  const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
  const m = css.match(re);
  return m ? m[1] : null;
}

describe('web-scoped legibility tokens', () => {
  test('bright web scope defines muted, rule-subtle, sheet-subtle and weight 400', () => {
    const body = ruleBody('[data-zt-web]');
    assert.ok(body, '[data-zt-web] rule missing');
    for (const v of ['--muted:', '--rule-subtle:', '--sheet-subtle:', 'font-weight: 400']) {
      assert.ok(body.includes(v), `[data-zt-web] lacks ${v}`);
    }
  });

  test('dark web scope redefines the same tokens plus a brighter --rule', () => {
    const body = ruleBody("[data-zt-web][data-zt-mode='dark']");
    assert.ok(body, 'dark web rule missing');
    for (const v of ['--muted:', '--rule:', '--rule-subtle:', 'sheet-subtle:']) {
      assert.ok(body.includes(v), `dark web scope lacks ${v}`);
    }
  });

  test('the shared sheet scope does not carry the web-only tokens or weight 400', () => {
    const sheetBodies = [...css.matchAll(/(?<![\w\]-])\[data-zt-sheet\]\s*\{([^}]*)\}/g)].map((m) => m[1]);
    assert.ok(sheetBodies.length > 0, 'expected at least one bare [data-zt-sheet] rule');
    for (const body of sheetBodies) {
      assert.ok(!body.includes('--rule-subtle'), 'bare [data-zt-sheet] sets --rule-subtle');
      assert.ok(!body.includes('--sheet-subtle'), 'bare [data-zt-sheet] sets --sheet-subtle');
      assert.ok(!/font-weight:\s*400/.test(body), 'bare [data-zt-sheet] sets font-weight 400');
    }
  });

  test('every web-only rule is prefixed with [data-zt-web]', () => {
    const lines = css.split('\n').filter((l) => /(rule-subtle|sheet-subtle|\.zt-cap)/.test(l) && /\{/.test(l));
    assert.ok(lines.length >= 5, 'expected the pass-1 rule set');
    for (const l of lines) {
      if (l.includes('--color-')) continue; // @theme aliases
      assert.ok(l.trimStart().startsWith('[data-zt-web]'), `unscoped web rule: ${l.trim()}`);
    }
  });

  test('Tailwind aliases exist for the new tokens', () => {
    assert.ok(css.includes('--color-rule-subtle: var(--rule-subtle)'));
    assert.ok(css.includes('--color-sheet-subtle: var(--sheet-subtle)'));
  });
});

describe('data-zt-web is set only by the website frame', () => {
  test('WebsiteThemeFrame sets it alongside data-zt-sheet', () => {
    const src = read('components/website/WebsiteThemeFrame.tsx');
    assert.ok(/data-zt-sheet=""[^>]*data-zt-web=""|data-zt-web=""[^>]*data-zt-sheet=""/.test(src));
  });

  for (const p of ['components/scorer/ScorerShell.tsx', 'components/judge/JudgePad.tsx']) {
    test(`${p} does not`, () => {
      const src = read(p);
      assert.ok(src.includes('data-zt-sheet'), `${p} should still mount data-zt-sheet`);
      assert.ok(!src.includes('data-zt-web'), `${p} must not set data-zt-web`);
    });
  }
});
