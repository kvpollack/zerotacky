import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
const ROOT = process.env.ZT_SYNC || '../lib/sync';
const C = await import(`${ROOT}/client.ts`);
const K = await import(`${ROOT}/controller.ts`);
const P = await import(process.env.ZT_PRESETS || '../lib/presets/index.ts');
import { fakeServer } from './fake_supabase.mjs';

// 011 (Astra R-H1, 2026-10-19): the join code lets a phone read and follow a meet; writing scores needs the grant a
// correct PIN issues. These tests run the real client + controller against the fake server's stand-in for the 011 RLS.

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
let T = 1_760_100_000_000;
const clock = () => T;
function phone(server, deviceId, initialState) {
  const box = { state: initialState };
  const client = C.createSyncClient({ url: 'https://x.supabase.co', anonKey: 'A', fetchImpl: server.fetchImpl });
  const ctl = new K.SyncController({ client, storage: memStorage(), deviceId, getState: () => box.state, onIncoming: (p) => { box.state = { ...box.state, ...p }; }, now: clock });
  if (/^a/.test(deviceId)) ctl.setAccessToken(`TOKEN_${deviceId}`, `user-${deviceId}`);   // 024: admins publish signed in
  box.mutate = (fn) => { box.state = fn(box.state); ctl.noteLocalChange(); };
  box.ctl = ctl;
  return box;
}
function score(state, reps) {
  const ev = state.events[0], a = state.athletes[0];
  const id = `${ev.id}_${a.id}`;
  return { ...state, results: [...state.results.filter((r) => r.id !== id), { id, eventId: ev.id, athleteId: a.id, tier: 'heavy', reps, updatedAt: ++T }] };
}
async function setup() {
  const srv = fakeServer();
  const admin = phone(srv, 'admin1', P.getInitialSeedState('strongfest-2026'));
  await admin.ctl.publish({ slug: 'sf', stations: [], isDemo: false });
  const joined = phone(srv, 'spectator1', { meet: {}, divisions: [], events: [], athletes: [], results: [] });
  const remote = await joined.ctl.lookupJoinCode('JC0001');
  joined.state = remote.state;
  joined.ctl.attach(remote, 'device');
  return { srv, admin, joined };
}

describe('judge grants (011)', () => {
  test('a joined phone without the PIN cannot write a score: 401, row kept, no grant on the link', async () => {
    const { srv, joined } = await setup();
    assert.equal(joined.ctl.canScore, false);
    joined.mutate((s) => score(s, 3));
    await joined.ctl.tick();
    assert.equal(joined.ctl.status.state, 'error');
    assert.match(joined.ctl.status.error, /401/);
    assert.equal(srv.db.results.length, 0);
    const post = srv.log.find((e) => e.method === 'POST' && e.path.endsWith('/results'));
    assert.equal(post.headers['x-zt-join'], 'JC0001');
    assert.equal(post.headers['x-zt-grant'], undefined);
  });

  test('a wrong PIN issues nothing; the right PIN stores a grant that rides on every write and the score lands', async () => {
    const { srv, joined } = await setup();
    assert.equal(await joined.ctl.checkAdminPin('0000'), false);
    assert.equal(joined.ctl.link.grant ?? null, null);
    assert.equal(await joined.ctl.checkAdminPin('1050'), true);
    assert.ok(joined.ctl.link.grant);
    assert.equal(joined.ctl.canScore, true);
    assert.equal(srv.db.grants.at(-1).device_id, 'spectator1');
    joined.mutate((s) => score(s, 4));
    await joined.ctl.tick();
    assert.equal(joined.ctl.status.state, 'idle');
    assert.equal(srv.db.results[0].payload.reps, 4);
    const post = srv.log.findLast((e) => e.method === 'POST' && e.path.endsWith('/results'));
    assert.equal(post.headers['x-zt-grant'], joined.ctl.link.grant);
  });

  test('rotating the join code kills every grant: the next write is refused until the PIN is proved again', async () => {
    const { srv, joined } = await setup();
    await joined.ctl.checkAdminPin('1050');
    srv.db.meets[0].join_code = 'NEWCODE';
    joined.mutate((s) => score(s, 2));
    await joined.ctl.tick();
    assert.equal(joined.ctl.status.state, 'error');
    assert.equal(srv.db.results.length, 0);
  });

  test('leaving the meet revokes the grant on the server', async () => {
    const { srv, joined } = await setup();
    await joined.ctl.checkAdminPin('1050');
    const token = joined.ctl.link.grant;
    joined.ctl.unlink();
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(srv.db.grants.find((g) => g.token === token).revoked_at);
    assert.equal(joined.ctl.link, null);
  });

  test('the publishing phone mints its own grant from the PIN it set, so a key-published admin can still score', async () => {
    const { srv, admin } = await setup();
    assert.ok(admin.ctl.link.grant);
    assert.equal(admin.ctl.canScore, true);
    admin.mutate((s) => score(s, 7));
    await admin.ctl.tick();
    assert.equal(srv.db.results[0].payload.reps, 7);
    // a re-publish with the same code keeps the grant instead of spending another PIN try
    const before = srv.db.grants.length;
    await admin.ctl.publish({ slug: 'sf', stations: [], isDemo: false });
    assert.equal(srv.db.grants.length, before);
  });

  test('pit crew edits to athletes still work on the join code alone (no PIN for that role)', async () => {
    const { srv, joined } = await setup();
    joined.mutate((s) => ({ ...s, athletes: s.athletes.map((a, i) => (i === 0 ? { ...a, rackHeights: { ...(a.rackHeights ?? {}), [s.events[0].id]: 7 } } : a)) }));
    await joined.ctl.tick();
    assert.equal(joined.ctl.status.state, 'idle');
    const row = srv.db.athletes.find((a) => a.id === joined.state.athletes[0].id);
    assert.equal(row.rack_heights[joined.state.events[0].id], 7);
  });
});

// 025 (Astra LT-01, 10/26): the join code alone writes no athlete rows; pit-crew rack pins go through zt_set_rack_heights.
describe('025: athlete writes need a grant; rack pins by join code', () => {
  test('a joined phone without a grant sends rack pins through the RPC and the server merges only rack_heights', async () => {
    const { srv, admin, joined } = await setup();
    const ev = joined.state.events[0].id, ath = joined.state.athletes[0].id;
    joined.mutate((s) => ({ ...s, athletes: s.athletes.map((a) => (a.id === ath ? { ...a, name: 'Renamed By Spectator', rackHeights: { ...(a.rackHeights ?? {}), [ev]: 7 } } : a)) }));
    await joined.ctl.tick();
    const calls = srv.log.filter((e) => e.path.endsWith('/rpc/zt_set_rack_heights'));
    assert.equal(calls.length, 1, 'one RPC call for the one changed athlete');
    assert.equal(srv.log.some((e) => e.method === 'POST' && e.path.endsWith('/athletes')), false, 'no table upsert from a grantless phone');
    const row = srv.db.athletes.find((a) => a.id === ath);
    assert.equal(row.rack_heights[ev], 7, 'pin landed');
    assert.equal(row.name, admin.state.athletes[0].name, 'name untouched: the RPC only merges rack heights');
    assert.equal(joined.ctl.status.pending, 0);
  });

  test('a grant holder still upserts athlete rows (walk-ons, scratches)', async () => {
    const { srv, joined } = await setup();
    const token = await joined.ctl.checkAdminPin('1050');
    assert.ok(token, 'PIN mints a grant');
    joined.mutate((s) => ({ ...s, athletes: [...s.athletes, { id: 'ath-floor', divisionId: s.divisions[0].id, name: 'Floor Walk-On', lotNumber: 60, status: 'active', rackHeights: {} }] }));
    await joined.ctl.tick();
    assert.ok(srv.db.athletes.some((a) => a.id === 'ath-floor'), 'walk-on written through the table');
    assert.equal(srv.log.some((e) => e.path.endsWith('/rpc/zt_set_rack_heights')), false);
  });

  test('a stale or wrong join code gets 401 from the RPC and the row stays queued', async () => {
    const { srv, joined } = await setup();
    srv.db.meets[0].join_code = 'ROTATED';   // the promoter rotated the code; this phone still carries the old one
    const ev = joined.state.events[0].id, ath = joined.state.athletes[0].id;
    joined.mutate((s) => ({ ...s, athletes: s.athletes.map((a) => (a.id === ath ? { ...a, rackHeights: { [ev]: 9 } } : a)) }));
    await joined.ctl.tick().catch(() => {});
    assert.equal(srv.db.athletes.find((a) => a.id === ath).rack_heights[ev], undefined);
    assert.equal(joined.ctl.status.pending, 1, 'kept for the retry after the code is re-entered');
  });
});
