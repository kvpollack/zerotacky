import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
const C = await import('../lib/sync/client.ts');
const A = await import('../lib/sync/meetApi.ts');
const PR = await import('../lib/auth/profile.ts');
const P = await import('../lib/presets/index.ts');

function fakeFetch(handler) {
  const calls = [];
  const f = async (url, init) => {
    const call = { url: String(url), method: init?.method, headers: init?.headers ?? {}, body: init?.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const r = (await handler(call)) ?? { status: 200, json: [] };
    const text = r.json !== undefined ? JSON.stringify(r.json) : '';
    return { ok: r.status < 300, status: r.status, statusText: '', json: async () => JSON.parse(text), text: async () => text };
  };
  return { f, calls };
}
const CFG = { url: 'https://abc.supabase.co', anonKey: 'ANON' };

describe('v2 auth: access token on the sync client', () => {
  test('withAccessToken swaps the bearer; apikey stays anon; null drops back to anon', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200, json: [] }));
    const base = C.createSyncClient({ ...CFG, fetchImpl: f });
    await base.withAccessToken('JWT').select('meets', 'select=id');
    await base.withAccessToken('JWT').withAccessToken(null).select('meets', 'select=id');
    await base.withAccessToken('JWT').withJoinCode('ABC123').select('results', 'select=id');
    assert.equal(calls[0].headers.Authorization, 'Bearer JWT');
    assert.equal(calls[0].headers.apikey, 'ANON');
    assert.equal(calls[1].headers.Authorization, 'Bearer ANON');
    assert.equal(calls[2].headers.Authorization, 'Bearer JWT');
    assert.equal(calls[2].headers['x-zt-join'], 'ABC123');
  });

  test('publishMeet sends no p_key (024); the session token carries the identity', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200, json: { id: 'm1', join_code: 'ZZZ999' } }));
    const client = C.createSyncClient({ ...CFG, accessToken: 'JWT', fetchImpl: f });
    const state = P.getInitialSeedState('strongfest-2026');
    const out = await A.publishMeet(client, state, { meetId: '11111111-1111-4111-8111-111111111111', deviceId: 'd1', slug: 'x', stations: 1, isDemo: false });
    assert.equal(out.joinCode, 'ZZZ999');
    assert.equal(calls[0].url, 'https://abc.supabase.co/rest/v1/rpc/zt_publish_meet');
    assert.equal('p_key' in calls[0].body, false);
    assert.equal(calls[0].headers.Authorization, 'Bearer JWT');
  });
});

describe('v2 auth: profile helpers', () => {
  test('profileLabel prefers display name, then email local part', () => {
    assert.equal(PR.profileLabel({ display_name: 'Kurt P', email: 'k@x.com' }), 'Kurt P');
    assert.equal(PR.profileLabel({ display_name: '  ', email: 'k@x.com' }), 'k');
    assert.equal(PR.profileLabel(null, 'promoter@zerotacky.com'), 'promoter');
    assert.equal(PR.profileLabel(null, null), 'Account');
  });
  test('roleBadges lists the flags that are on, in a fixed order', () => {
    assert.deepEqual(PR.roleBadges({ is_athlete: true, is_promoter: false, is_gym_owner: true }), ['Athlete', 'Gym owner']);
    assert.deepEqual(PR.roleBadges(null), []);
  });
});
