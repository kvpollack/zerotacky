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

// First-show guide (10/21): every screenshot it references must exist in public/guide, every link must land on a real
// route, and the copy carries no em-dashes and no real meet or venue names (the walkthrough uses a made-up show).
const FS = await import(`${ROOT}/lib/website/firstShow.ts`);
describe('first-show guide', () => {
  test('ten steps, each with a kicker, body, public-side note and at least one image', () => {
    assert.equal(FS.FIRST_SHOW_STEPS.length, 10);
    for (const s of FS.FIRST_SHOW_STEPS) {
      assert.ok(s.where && s.title && s.publicSide, `${s.id} incomplete`);
      assert.ok(s.body.length >= 1 && s.images.length >= 1, `${s.id} needs body and image`);
    }
    assert.equal(new Set(FS.FIRST_SHOW_STEPS.map((s) => s.id)).size, 10, 'step ids unique');
  });
  test('every screenshot exists under public/guide', () => {
    for (const img of FS.FIRST_SHOW_STEPS.flatMap((s) => s.images)) {
      assert.ok(img.src.startsWith('/guide/') && img.alt, `bad image entry ${img.src}`);
      assert.ok(existsSync(fileURLToPath(new URL(`${ROOT}/public${img.src}`, import.meta.url))), `missing ${img.src}`);
    }
  });
  test('every link points at a route that exists', () => {
    for (const href of FS.FIRST_SHOW_STEPS.map((s) => s.link?.href).filter(Boolean)) assert.ok(routeExists(href), `missing route for ${href}`);
  });
  test('copy carries no em-dashes and no real-meet names', () => {
    const text = JSON.stringify(FS.FIRST_SHOW_STEPS) + JSON.stringify(FS.FIRST_SHOW_INTRO) + JSON.stringify(FS.FIRST_SHOW_OUTRO);
    assert.ok(!text.includes('\u2014'), 'em-dash found');
    assert.ok(!/All Out Strongfest|Power Plant|Pollack/.test(text));
  });
});
