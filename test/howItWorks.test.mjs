import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.ZT_ROOT || '..';
const H = await import(`${ROOT}/lib/website/howItWorks.ts`);
const FX = await import(`${ROOT}/lib/website/fixtures.ts`);

// A link in the walkthrough must land on a route that exists in app/ (static) or on a demo fixture slug (dynamic).
function routeExists(href) {
  const clean = href.split('#')[0];
  const demoBoard = clean.match(/^\/m\/(.+)$/);
  if (demoBoard) return FX.DEMO_SHOW_RECORDS.some((r) => r.slug === demoBoard[1]);
  const legal = clean.match(/^\/legal\/(.+)$/);
  if (legal) return ['terms', 'privacy', 'waiver'].includes(legal[1]);
  return existsSync(fileURLToPath(new URL(`${ROOT}/app${clean === '/' ? '' : clean}/page.tsx`, import.meta.url)));
}

describe('how-it-works copy', () => {
  test('three tracks, each with 5-6 numbered steps, and a FAQ', () => {
    assert.deepEqual(H.HOW_IT_WORKS_TRACKS.map((t) => t.id), ['promoters', 'athletes', 'volunteers']);
    for (const t of H.HOW_IT_WORKS_TRACKS) {
      assert.ok(t.steps.length >= 5 && t.steps.length <= 6, `${t.id} has ${t.steps.length} steps`);
      assert.ok(t.steps.some((s) => s.link), `${t.id} has at least one link into the product`);
    }
    assert.ok(H.HOW_IT_WORKS_FAQ.length >= 6);
  });
  test('every link points at a route that exists', () => {
    const links = [
      ...H.HOW_IT_WORKS_TRACKS.flatMap((t) => t.steps.map((s) => s.link?.href)),
      ...H.HOW_IT_WORKS_FAQ.map((f) => f.link?.href),
    ].filter(Boolean);
    assert.ok(links.length >= 10);
    for (const href of links) assert.ok(routeExists(href), `missing route for ${href}`);
  });
  test('copy carries no em-dashes and no real-meet names', () => {
    const text = JSON.stringify(H.HOW_IT_WORKS_TRACKS) + JSON.stringify(H.HOW_IT_WORKS_FAQ);
    assert.ok(!text.includes('\u2014'), 'em-dash found');
    assert.ok(!/All Out Strongfest|Power Plant/.test(text));
  });
});
