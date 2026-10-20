import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const D = await import(`${ROOT}/lib/website/data.ts`);
const FX = await import(`${ROOT}/lib/website/fixtures.ts`);

// Astra 10/19: R-L3 (slug decode must never throw), R-L2 (demos-off respected in fallbacks), R-M6 (real meet wins the
// slug over a demo fixture for scoreboard metadata).
const fakeClient = (rows) => ({ select: async () => rows, upsert: async () => {}, insert: async () => [], update: async () => {}, del: async () => {}, rpc: async () => null, withJoinCode() { return this; }, withAccessToken() { return this; } });

describe('website data fallbacks', () => {
  test('cleanSlug decodes once and survives a bare percent sign', () => {
    assert.equal(D.cleanSlug('100%'), '100%');
    assert.equal(D.cleanSlug('100%25'), '100%');
    assert.equal(D.cleanSlug(' Keystone-Fall-Brawl-2026 '), 'keystone-fall-brawl-2026');
    assert.equal(D.cleanSlug(undefined), '');
  });
  test('a malformed slug reaches the lookups without throwing', async () => {
    assert.equal((await D.getPublicShowBySlug('100%', { client: null })).data, null);
    assert.equal(D.getDemoScoreboardState('100%'), null);
    assert.equal(await D.getScoreboardMeta('100%', { client: null, includeDemoShows: true }), null);
    assert.equal((await D.getPublicGymBySlug('%E0%A4%A')).data, null);
  });
  test('no backend + demos off: the list is empty and a fixture slug is not found', async () => {
    assert.deepEqual((await D.listPublicShows({ client: null, includeDemoShows: false })).data, []);
    assert.equal((await D.getPublicShowBySlug('keystone-fall-brawl-2026', { client: null, includeDemoShows: false })).data, null);
    assert.equal((await D.listPublicShows({ client: null, includeDemoShows: true })).data.length, FX.DEMO_SHOW_RECORDS.length);
  });
  test('scoreboard meta: a real meet that owns a fixture slug wins; the fixture only answers when no meet has it', async () => {
    const real = await D.getScoreboardMeta('keystone-fall-brawl-2026', { client: fakeClient([{ name: 'Real Collision', is_demo: false }]) });
    assert.deepEqual(real, { name: 'Real Collision', badge: 'LIVE', source: 'live_supabase' });
    const realDemo = await D.getScoreboardMeta('x', { client: fakeClient([{ name: 'Practice Copy', is_demo: true }]) });
    assert.equal(realDemo.badge, 'DEMO');
    const fixture = await D.getScoreboardMeta('keystone-fall-brawl-2026', { client: fakeClient([]), includeDemoShows: true });
    assert.equal(fixture.source, 'demo');
    assert.match(fixture.name, /Keystone Fall Brawl/);
    assert.equal(await D.getScoreboardMeta('keystone-fall-brawl-2026', { client: fakeClient([]), includeDemoShows: false }), null);
    assert.equal(await D.getScoreboardMeta('nobody-owns-this', { client: fakeClient([]), includeDemoShows: true }), null);
  });
});
