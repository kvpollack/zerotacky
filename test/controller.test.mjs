import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
const ROOT = process.env.ZT_SYNC || '../lib/sync';
const C = await import(`${ROOT}/client.ts`);
const K = await import(`${ROOT}/controller.ts`);
const Q = await import(`${ROOT}/queue.ts`);
const P = await import(process.env.ZT_PRESETS || '../lib/presets/index.ts');

import { fakeServer } from './fake_supabase.mjs';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

// A fake "phone": state holder + controller wired like the hook would. `asyncIncoming` applies onIncoming on the
// next macrotask, the way React commits a setState (Astra G2-H2: the synchronous default hid a real race).
function phone(server, deviceId, initialState, now, { asyncIncoming = false } = {}) {
  const storage = memStorage();
  const box = { state: initialState, incoming: [] , statuses: [] };
  const client = C.createSyncClient({ url: 'https://x.supabase.co', anonKey: 'A', fetchImpl: server.fetchImpl });
  const apply = (patch) => { box.incoming.push(patch); box.state = { ...box.state, ...patch }; };
  const ctl = new K.SyncController({
    client, storage, deviceId,
    getState: () => box.state,
    onIncoming: (patch) => { if (asyncIncoming) setTimeout(() => apply(patch), 0); else apply(patch); },
    onStatus: (s) => box.statuses.push(s.state),
    now,
  });
  // mimic the hook: any local mutation goes through this
  box.mutate = (fn) => { box.state = fn(box.state); ctl.noteLocalChange(); };
  box.ctl = ctl; box.storage = storage; box.client = client;
  return box;
}

function score(state, evIdx, athIdx, patch, at) {
  const ev = state.events[evIdx], a = state.athletes[athIdx];
  const id = `${ev.id}_${a.id}`;
  const others = state.results.filter((r) => r.id !== id);
  const existing = state.results.find((r) => r.id === id);
  return { ...state, results: [...others, { id, eventId: ev.id, athleteId: a.id, tier: 'heavy', ...existing, ...patch, updatedAt: at }] };
}

let T = 1_760_000_000_000;
const clock = () => T;

describe('SyncController: publish + join', () => {
  test('admin publishes, device joins by code and receives the same state; re-publish keeps the uuid and code', async () => {
    const srv = fakeServer();
    const admin = phone(srv, 'admin1', P.getInitialSeedState('strongfest-2026'), clock);
    assert.equal(admin.ctl.status.state, 'off');
    const link = await admin.ctl.publish({ slug: 'strongfest', isDemo: false }, 'GOODKEY');
    assert.equal(link.role, 'admin');
    assert.match(link.meetId, /^[0-9a-f-]{36}$/);
    assert.equal(link.joinCode, 'JC0001');
    assert.equal(admin.ctl.status.state, 'idle');
    assert.equal(srv.db.athletes.length, admin.state.athletes.length);
    assert.ok(srv.db.athletes.every((a) => a.meet_id === link.meetId));

    const judge = phone(srv, 'judge1', P.getInitialSeedState('york-iron-2026'), clock);
    const remote = await judge.ctl.lookupJoinCode('jc0001');
    assert.ok(remote);
    assert.equal(remote.slug, 'strongfest');
    assert.equal(remote.state.meet.id, link.meetId);
    assert.equal(remote.state.athletes.length, admin.state.athletes.length);
    judge.state = remote.state;
    const jl = judge.ctl.attach(remote); await judge.ctl.checkAdminPin('1050');   // 011: scores need the grant a correct PIN issues
    assert.equal(jl.role, 'device');
    assert.equal(jl.joinCode, 'JC0001');
    assert.equal(judge.ctl.status.state, 'idle');
    assert.equal(K.readLink(judge.storage).meetId, link.meetId);

    const again = await admin.ctl.publish({ slug: 'strongfest', isDemo: false }, 'GOODKEY');
    assert.equal(again.meetId, link.meetId);
    assert.equal(again.joinCode, 'JC0001');
    assert.equal(srv.db.meets.length, 1);
  });
  test('leave then publish the same slug updates the same remote meet (uuid and join code kept)', async () => {
    const srv = fakeServer();
    const admin = phone(srv, 'a', P.getInitialSeedState('strongfest-2026'), clock);
    const first = await admin.ctl.publish({ slug: 'sf' }, 'GOODKEY');
    admin.ctl.unlink();
    const second = await admin.ctl.publish({ slug: 'sf' }, 'GOODKEY');
    assert.equal(second.meetId, first.meetId);
    assert.equal(second.joinCode, first.joinCode);
    assert.equal(srv.db.meets.length, 1);
    assert.ok(srv.db.athletes.every((x) => x.meet_id === first.meetId));
  });
  test('bad publish key -> error status, no link; unknown join code -> null', async () => {
    const srv = fakeServer();
    const admin = phone(srv, 'a', P.getInitialSeedState('strongfest-2026'), clock);
    await assert.rejects(admin.ctl.publish({ slug: 's' }, 'BAD'), (e) => e.status === 403);
    assert.equal(admin.ctl.link, null);
    assert.equal(admin.ctl.status.state, 'error');
    assert.match(admin.ctl.status.error, /invalid publish key/);
    assert.equal(await admin.ctl.lookupJoinCode('ZZZZZZ'), null);
  });
});

describe('SyncController: scores flow between phones', () => {
  async function pair() {
    const srv = fakeServer();
    const admin = phone(srv, 'admin1', P.getInitialSeedState('strongfest-2026'), clock);
    await admin.ctl.publish({ slug: 'sf' }, 'GOODKEY');
    const judge = phone(srv, 'judge1', { meet: {}, divisions: [], events: [], athletes: [], results: [] }, clock);
    const remote = await judge.ctl.lookupJoinCode('JC0001');
    judge.state = remote.state;
    judge.ctl.attach(remote); await judge.ctl.checkAdminPin('1050');   // 011: scores need the grant a correct PIN issues
    const board = phone(srv, 'board1', { meet: {}, divisions: [], events: [], athletes: [], results: [] }, clock);
    const r2 = await board.ctl.lookupJoinCode('JC0001');
    board.state = r2.state; board.ctl.attach(r2);
    return { srv, admin, judge, board };
  }
  test('judge scores -> queued -> tick pushes -> admin and board pick it up; no echo re-push', async () => {
    const { srv, admin, judge, board } = await pair();
    T += 1000;
    judge.mutate((s) => score(s, 0, 0, { reps: 6 }, T));
    assert.equal(judge.ctl.status.pending, 1);
    assert.equal(Q.readQueue(judge.storage).length, 1);
    await judge.ctl.tick();
    assert.equal(judge.ctl.status.pending, 0);
    assert.equal(judge.ctl.status.state, 'idle');
    assert.equal(srv.db.results.length, 1);
    assert.equal(srv.db.results[0].updated_by, 'judge1');
    assert.equal(srv.db.results[0].payload.reps, 6);

    await admin.ctl.tick();
    assert.equal(admin.state.results.length, 1);
    assert.equal(admin.state.results[0].reps, 6);
    assert.equal(admin.state.results[0].updatedAt, T);
    await board.ctl.tick();
    assert.equal(board.state.results[0].reps, 6);

    // the admin's own pull-in must not be pushed back out
    admin.ctl.noteLocalChange();
    assert.equal(admin.ctl.status.pending, 0);
    // a second judge tick finds nothing new and does not re-apply
    const before = judge.incoming.length;
    await judge.ctl.tick();
    assert.equal(judge.incoming.length, before);
  });
  test('last writer wins both directions: older offline flush loses to a newer server row', async () => {
    const { srv, admin, judge } = await pair();
    T += 1000; const tOld = T;
    srv.setOffline(true);
    judge.mutate((s) => score(s, 0, 0, { reps: 3 }, tOld));
    await judge.ctl.tick();
    assert.equal(judge.ctl.status.state, 'offline');
    assert.equal(judge.ctl.status.pending, 1);

    T += 5000; const tNew = T;
    admin.mutate((s) => score(s, 0, 0, { reps: 9 }, tNew));
    srv.setOffline(false);
    await admin.ctl.tick();
    assert.equal(srv.db.results[0].payload.reps, 9);

    await judge.ctl.tick();              // flush old (rejected by LWW) then pull new
    assert.equal(judge.ctl.status.state, 'idle');
    assert.equal(judge.ctl.status.pending, 0);
    assert.equal(srv.db.results[0].payload.reps, 9);
    assert.equal(judge.state.results.find((r) => r.id === srv.db.results[0].id).reps, 9);
  });
  test('queue coalesces rapid edits to one row and survives a reload', async () => {
    const { srv, judge } = await pair();
    srv.setOffline(true);
    for (let i = 1; i <= 5; i++) { T += 100; judge.mutate((s) => score(s, 1, 2, { reps: i }, T)); }
    T += 100; judge.mutate((s) => score(s, 1, 3, { reps: 1 }, T));
    assert.equal(judge.ctl.status.pending, 2);
    // "reload": new controller over the same storage and state
    const seen = [];
    const reborn = new K.SyncController({ client: judge.client, storage: judge.storage, deviceId: 'judge1', getState: () => judge.state, onIncoming: () => {}, onStatus: (st, l) => seen.push([st.state, l?.joinCode]), now: clock });
    assert.equal(reborn.link.joinCode, 'JC0001');
    assert.deepEqual(seen[0], ['idle', 'JC0001']);   // constructor reports status with the link (regression: TDZ on ctl)
    assert.equal(reborn.status.pending, 2);
    srv.setOffline(false);
    await reborn.tick();
    assert.equal(reborn.status.pending, 0);
    assert.equal(srv.db.results.find((r) => r.id.endsWith(`_${judge.state.athletes[2].id}`)).payload.reps, 5);
  });
  test('athlete edits (scratch, rack pin) sync; local order kept, newcomers appended', async () => {
    const { srv, admin, judge, board } = await pair();
    const target = judge.state.athletes[1].id;
    judge.mutate((s) => ({ ...s, athletes: s.athletes.map((a) => (a.id === target ? { ...a, status: 'withdrawn', rackHeights: { e1: '3' } } : a)) }));
    assert.equal(judge.ctl.status.pending, 1);
    await judge.ctl.tick();
    assert.equal(srv.db.athletes.find((a) => a.id === target).status, 'withdrawn');
    await board.ctl.tick();
    assert.equal(board.state.athletes[1].id, target);
    assert.equal(board.state.athletes[1].status, 'withdrawn');
    assert.deepEqual(board.state.athletes[1].rackHeights, { e1: '3' });
    // walk-on added on the admin phone via re-publish
    admin.mutate((s) => ({ ...s, athletes: [...s.athletes, { id: 'ath-walkon', divisionId: s.divisions[0].id, name: 'Walk On', lotNumber: 99, status: 'active', rackHeights: {} }] }));
    await admin.ctl.tick();   // pushes via join-code path too
    await board.ctl.tick();
    assert.equal(board.state.athletes.at(-1).id, 'ath-walkon');
    assert.equal(board.state.athletes.length, admin.state.athletes.length);
  });
  test('an empty athlete list from the server never wipes the local roster', async () => {
    const { srv, judge } = await pair();
    const n = judge.state.athletes.length;
    srv.db.athletes = [];                 // backend lost the meet's roster (or the meet itself)
    await judge.ctl.tick();
    assert.equal(judge.state.athletes.length, n);
    assert.equal(judge.incoming.length, 0);
  });
  test('local reset while linked rewinds the watermark and re-pulls server scores', async () => {
    const { judge, admin } = await pair();
    judge.mutate((s) => score(s, 0, 0, { reps: 4 }, ++T));
    await judge.ctl.tick();
    await admin.ctl.tick();
    assert.equal(admin.state.results.length, 1);
    admin.mutate((s) => ({ ...s, results: [] }));      // "reset scores" on the admin phone, same meet id
    assert.equal(admin.ctl.link.since, null);
    await admin.ctl.tick();
    assert.equal(admin.state.results.length, 1);
    assert.equal(admin.state.results[0].reps, 4);
  });
  test('live_state is queued per station with the newest row winning', async () => {
    const { srv, judge } = await pair();
    judge.ctl.setLive({ station: 'A', current_event_id: 'e1', current_division_id: 'd1', current_athlete_id: 'a1', lane2_athlete_id: null });
    T += 10;
    judge.ctl.setLive({ station: 'A', current_event_id: 'e1', current_division_id: 'd1', current_athlete_id: 'a2', lane2_athlete_id: null });
    judge.ctl.setLive({ station: 'B', current_event_id: 'e2', current_division_id: 'd2', current_athlete_id: 'b1', lane2_athlete_id: 'b2' });
    assert.equal(judge.ctl.status.pending, 2);
    await judge.ctl.tick();
    assert.equal(srv.db.live_state.length, 2);
    assert.equal(srv.db.live_state.find((l) => l.station === 'A').current_athlete_id, 'a2');
    assert.equal(srv.db.live_state.find((l) => l.station === 'B').lane2_athlete_id, 'b2');
    assert.equal(srv.db.live_state[0].updated_by, 'judge1');
  });
  test('switching to a different local meet drops the link and the queue', async () => {
    const { judge } = await pair();
    judge.mutate((s) => score(s, 0, 0, { reps: 2 }, ++T));
    assert.equal(judge.ctl.status.pending, 1);
    judge.state = P.getInitialSeedState('york-iron-2026');
    judge.ctl.noteLocalChange();
    assert.equal(judge.ctl.link, null);
    assert.equal(judge.ctl.status.state, 'off');
    assert.equal(judge.ctl.status.pending, 0);
    assert.equal(K.readLink(judge.storage), null);
  });
  test('wrong join code on a write surfaces as error, not offline', async () => {
    const { srv, judge } = await pair();
    srv.db.meets[0].join_code = 'ROTATED';
    judge.mutate((s) => score(s, 0, 0, { reps: 2 }, ++T));
    await judge.ctl.tick();
    assert.equal(judge.ctl.status.state, 'error');
    assert.match(judge.ctl.status.error, /401/);
    assert.equal(judge.ctl.status.pending, 1);   // kept for retry after re-join
  });
});

describe('SyncController: config republish reaches judge phones', () => {
  async function pair() {
    const srv = fakeServer();
    const admin = phone(srv, 'admin1', P.getInitialSeedState('strongfest-2026'), clock);
    await admin.ctl.publish({ slug: 'sf', stations: [{ id: 'A', label: 'Station 1' }, { id: 'B', label: 'Station 2' }] }, 'GOODKEY');
    const judge = phone(srv, 'judge1', { meet: {}, divisions: [], events: [], athletes: [], results: [] }, clock);
    const remote = await judge.ctl.lookupJoinCode('JC0001');
    judge.state = remote.state;
    judge.ctl.attach(remote); await judge.ctl.checkAdminPin('1050');   // 011: scores need the grant a correct PIN issues
    return { srv, admin, judge, remote };
  }
  test('attach records meets.updated_at; a plain tick does not re-read config', async () => {
    const { judge, remote } = await pair();
    assert.ok(remote.updatedAt);
    assert.equal(judge.ctl.link.configAt, remote.updatedAt);
    await judge.ctl.tick();
    assert.equal(judge.incoming.filter((p) => p.config).length, 0);
  });
  test('admin republishes a weight + new station -> judge tick applies divisions/events/meet, keeps local id and PIN', async () => {
    const { admin, judge } = await pair();
    const before = judge.state.events[1].divisionWeights['sf-g1'];
    judge.state = { ...judge.state, meet: { ...judge.state.meet, adminPin: '4242' } };
    admin.mutate((s) => ({
      ...s,
      meet: { ...s.meet, stations: [{ id: 'A', label: 'Station 1' }, { id: 'B', label: 'Station 2' }, { id: 'C', label: 'Station 3' }] },
      events: s.events.map((e, i) => (i === 1 ? { ...e, divisionWeights: { ...e.divisionWeights, 'sf-g1': before + 25 } } : e)),
    }));
    await admin.ctl.publish({ slug: 'sf', stations: admin.state.meet.stations }, 'GOODKEY');
    await judge.ctl.tick();
    const cfgs = judge.incoming.filter((p) => p.config);
    assert.equal(cfgs.length, 1);
    const cfg = cfgs[0].config;
    assert.equal(cfg.events[1].divisionWeights['sf-g1'], before + 25);
    assert.equal(cfg.meet.stations.length, 3);
    assert.equal(cfg.divisions.length, 5);
    assert.equal(cfg.meet.id, judge.ctl.link.meetId);
    assert.equal(cfg.meet.adminPin, undefined);            // public columns: the hook keeps the local PIN
    assert.equal(judge.ctl.link.configAt, cfg.updatedAt);
    // second tick: nothing new
    await judge.ctl.tick();
    assert.equal(judge.incoming.filter((p) => p.config).length, 1);
  });
  test('admin phone never re-reads its own config, but tracks the stamp', async () => {
    const { admin } = await pair();
    await admin.ctl.tick();
    assert.equal(admin.incoming.filter((p) => p.config).length, 0);
    assert.ok(admin.ctl.link.configAt);
    await admin.ctl.publish({ slug: 'sf' }, 'GOODKEY');
    await admin.ctl.tick();
    assert.equal(admin.incoming.filter((p) => p.config).length, 0);
  });
});

describe('SyncController: resilience (verifier findings)', () => {
  async function pair() {
    const srv = fakeServer();
    const admin = phone(srv, 'admin1', P.getInitialSeedState('strongfest-2026'), clock);
    await admin.ctl.publish({ slug: 'sf' }, 'GOODKEY');
    const judge = phone(srv, 'judge1', { meet: {}, divisions: [], events: [], athletes: [], results: [] }, clock);
    const remote = await judge.ctl.lookupJoinCode('JC0001');
    judge.state = remote.state;
    judge.ctl.attach(remote); await judge.ctl.checkAdminPin('1050');   // 011: scores need the grant a correct PIN issues
    return { srv, admin, judge };
  }
  test('walk-on + score + rack pin flushes athletes before results (FK order), one tick', async () => {
    const { srv, judge } = await pair();
    const div = judge.state.divisions[0].id;
    judge.mutate((s) => ({ ...s, athletes: [...s.athletes, { id: 'ath-new', divisionId: div, name: 'New', lotNumber: 50, status: 'active', rackHeights: {} }] }));
    judge.mutate((s) => ({ ...s, results: [...s.results, { id: `${s.events[0].id}_ath-new`, eventId: s.events[0].id, athleteId: 'ath-new', reps: 1, updatedAt: ++T }] }));
    judge.mutate((s) => ({ ...s, athletes: s.athletes.map((a) => (a.id === 'ath-new' ? { ...a, rackHeights: { x: '2' } } : a)) }));
    const order = [];
    const origFetch = srv.fetchImpl;
    srv.fetchImpl = (u, i) => { if (i.method === 'POST') order.push(new URL(u).pathname.split('/').pop()); return origFetch(u, i); };
    const c2 = C.createSyncClient({ url: 'https://x.supabase.co', anonKey: 'A', fetchImpl: (u, i) => srv.fetchImpl(u, i) });
    const ctl = new K.SyncController({ client: c2, storage: judge.storage, deviceId: 'judge1', getState: () => judge.state, onIncoming: () => {}, now: clock });
    await ctl.tick();
    assert.deepEqual(order, ['athletes', 'results']);
    assert.equal(ctl.status.pending, 0);
    assert.equal(srv.db.athletes.find((a) => a.id === 'ath-new').rack_heights.x, '2');
  });
  test('a row the server rejects (4xx, not auth) is dropped, the rest flush, pull still runs', async () => {
    const { srv, judge, admin } = await pair();
    const orig = srv.fetchImpl;
    srv.fetchImpl = async (u, i) => {
      if (i.method === 'POST' && u.includes('/results')) {
        const rows = JSON.parse(i.body);
        if (rows.some((r) => r.athlete_id === 'ghost')) return { ok: false, status: 409, statusText: 'Conflict', json: async () => ({ message: 'violates foreign key constraint' }), text: async () => '' };
      }
      return orig(u, i);
    };
    const c2 = C.createSyncClient({ url: 'https://x.supabase.co', anonKey: 'A', fetchImpl: (u, i) => srv.fetchImpl(u, i) });
    const ctl = new K.SyncController({ client: c2, storage: judge.storage, deviceId: 'judge1', getState: () => judge.state, onIncoming: (p) => { judge.state = { ...judge.state, ...p }; }, now: clock });
    judge.state = { ...judge.state, results: [
      { id: `${judge.state.events[0].id}_ghost`, eventId: judge.state.events[0].id, athleteId: 'ghost', reps: 9, updatedAt: ++T },
      { id: `${judge.state.events[0].id}_${judge.state.athletes[0].id}`, eventId: judge.state.events[0].id, athleteId: judge.state.athletes[0].id, reps: 2, updatedAt: ++T },
    ] };
    ctl.noteLocalChange();
    admin.mutate((s) => score(s, 1, 1, { reps: 7 }, ++T));
    await admin.ctl.tick();
    await ctl.tick();
    assert.equal(ctl.status.pending, 0);
    assert.equal(ctl.status.dropped, 1);
    assert.match(ctl.status.error, /rejected 1 row/);
    assert.equal(ctl.status.state, 'idle');
    assert.ok(srv.db.results.some((r) => r.payload.reps === 2));                     // good row landed
    assert.ok(judge.state.results.some((r) => r.reps === 7));                         // pull still happened
    await ctl.tick();
    assert.equal(ctl.status.dropped, 1);                                               // not re-queued
  });
  test('bad join code (401) keeps the whole queue and still pulls', async () => {
    const { srv, judge, admin } = await pair();
    srv.db.meets[0].join_code = 'ROTATED';
    judge.mutate((s) => score(s, 0, 0, { reps: 2 }, ++T));
    admin.ctl.unlink();
    srv.db.meets[0].join_code = 'JC0001';
    admin.mutate((s) => score(s, 1, 2, { reps: 5 }, ++T));
    const relink = await admin.ctl.publish({ slug: 'sf' }, 'GOODKEY');
    assert.equal(relink.joinCode, 'JC0001');
    srv.db.meets[0].join_code = 'ROTATED';
    await judge.ctl.tick();
    assert.equal(judge.ctl.status.state, 'error');
    assert.equal(judge.ctl.status.pending, 1);
    assert.ok(judge.state.results.some((r) => r.reps === 5));   // public read still works
  });
  test('tick requested while busy runs once more instead of being dropped', async () => {
    const { srv, judge } = await pair();
    let release;
    const gate = new Promise((r) => { release = r; });
    const orig = srv.fetchImpl;
    let gated = false;
    srv.fetchImpl = async (u, i) => { if (!gated && i.method === 'GET') { gated = true; await gate; } return orig(u, i); };
    const c2 = C.createSyncClient({ url: 'https://x.supabase.co', anonKey: 'A', fetchImpl: (u, i) => srv.fetchImpl(u, i) });
    const ctl = new K.SyncController({ client: c2, storage: judge.storage, deviceId: 'judge1', getState: () => judge.state, onIncoming: () => {}, now: clock });
    const t1 = ctl.tick();                       // blocks in pull
    judge.state = score(judge.state, 0, 0, { reps: 3 }, ++T);
    ctl.noteLocalChange();
    const t2 = ctl.tick();                       // busy -> rerun flag
    release();
    await Promise.all([t1, t2]);
    assert.equal(ctl.status.pending, 0);
    assert.equal(srv.db.results.find((r) => r.id.endsWith(judge.state.athletes[0].id)).payload.reps, 3);
  });
  test('admin re-publish pulls first, so a walk-on added on the floor survives', async () => {
    const { srv, judge, admin } = await pair();
    const div = judge.state.divisions[0].id;
    judge.mutate((s) => ({ ...s, athletes: [...s.athletes, { id: 'ath-floor', divisionId: div, name: 'Floor', lotNumber: 60, status: 'active', rackHeights: {} }] }));
    await judge.ctl.tick();
    assert.ok(srv.db.athletes.some((a) => a.id === 'ath-floor'));
    admin.mutate((s) => ({ ...s, meet: { ...s.meet, collarWeightPerPair: 5 } }));   // config change -> republish
    await admin.ctl.publish({ slug: 'sf' }, 'GOODKEY');
    assert.ok(srv.db.athletes.some((a) => a.id === 'ath-floor'));
    assert.ok(admin.state.athletes.some((a) => a.id === 'ath-floor'));
  });
  test('unlink during a tick never leaves status idle without a link', async () => {
    const { srv, judge } = await pair();
    const orig = srv.fetchImpl;
    srv.fetchImpl = async (u, i) => { if (i.method === 'GET') judge.ctl.unlink(); return orig(u, i); };
    const c2 = C.createSyncClient({ url: 'https://x.supabase.co', anonKey: 'A', fetchImpl: (u, i) => srv.fetchImpl(u, i) });
    const ctl = new K.SyncController({ client: c2, storage: judge.storage, deviceId: 'judge1', getState: () => judge.state, onIncoming: () => {}, now: clock });
    const inner = ctl;
    srv.fetchImpl = async (u, i) => { if (i.method === 'GET') inner.unlink(); return orig(u, i); };
    await ctl.tick();
    assert.equal(ctl.link, null);
    assert.equal(ctl.status.state, 'off');
  });
  test('athleteSig ignores key order', () => {
    assert.equal(K.athleteSig({ id: 'a', name: 'x', status: 'active' }), K.athleteSig({ status: 'active', name: 'x', id: 'a' }));
  });
});

describe('controller helpers', () => {
  test('mergeAthletes: unchanged returns same array; order kept; removed dropped', () => {
    const local = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
    assert.equal(K.mergeAthletes(local, [local[2], local[0], local[1]]).changed, false);
    const r = K.mergeAthletes(local, [{ id: 'c', name: 'C2' }, { id: 'a', name: 'A' }, { id: 'd', name: 'D' }]);
    assert.equal(r.changed, true);
    assert.deepEqual(r.merged.map((a) => a.id), ['a', 'c', 'd']);
    assert.equal(r.merged[1].name, 'C2');
  });
  test('getDeviceId is sticky; newMeetUuid is v4-shaped; readLink rejects junk', () => {
    const st = memStorage();
    const id = K.getDeviceId(st);
    assert.equal(K.getDeviceId(st), id);
    assert.match(id, /^dev-/);
    assert.match(K.newMeetUuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    st.setItem(K.LINK_KEY, '{"nope":1}');
    assert.equal(K.readLink(st), null);
    st.setItem(K.LINK_KEY, 'garbage');
    assert.equal(K.readLink(st), null);
  });
  test('isNetworkError: 5xx and thrown TypeError are network; 4xx is not', () => {
    assert.equal(K.isNetworkError(new C.SyncError(503, 'x')), true);
    assert.equal(K.isNetworkError(new TypeError('Failed to fetch')), true);
    assert.equal(K.isNetworkError(new C.SyncError(401, 'x')), false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Sign-out behaviour (Astra A4, 10/17). Own fake client: every call records the bearer it was made under, and
// promises can be held open to simulate work in flight across a sign-out.
// ---------------------------------------------------------------------------------------------------------------
const A4MB = await import('../lib/meetBuilder.ts');

// Each call is { kind, table|fn, token, joinCode, resolve, reject } and resolves only when the test says so,
// unless `auto` is true.
function a4FakeClient(log, { token = null, joinCode = null, auto = true } = {}) {
  const pend = (kind, name, extra = {}) =>
    new Promise((resolve, reject) => {
      const entry = { kind, name, token, joinCode, ...extra, resolve, reject };
      log.push(entry);
      // 011: publish mints a grant with a follow-up PIN rpc; the manual-drive tests predate it, so answer that one
      // immediately (a refusal, which publish treats as best effort) instead of making every test drive it.
      if (auto || (kind === 'rpc' && name === 'zt_check_admin_pin')) resolve(entry.autoValue ?? undefined);
    });
  const client = {
    select: (table, query) => pend('select', table, { query, autoValue: [] }),
    upsert: (table, rows) => pend('upsert', table, { rows }),
    insert: (table, rows) => pend('insert', table, { rows, autoValue: rows }),
    update: (table) => pend('update', table),
    del: (table) => pend('del', table),
    rpc: (fn, args) => pend('rpc', fn, { args, autoValue: { id: 'srv-uuid-1', join_code: 'ABC234' } }),
    withJoinCode: (code) => a4FakeClient(log, { token, joinCode: code, auto }),
    withAccessToken: (t) => a4FakeClient(log, { token: t ?? null, joinCode, auto }),
  };
  return client;
}

function a4Controller({ auto = true, storage = memStorage(), state } = {}) {
  const log = [];
  const st = state ?? A4MB.createBlankMeet('A4 Meet', '2026-11-01');
  const statuses = [];
  const ctl = new K.SyncController({
    client: a4FakeClient(log, { auto }),
    storage,
    deviceId: 'dev-test',
    getState: () => st,
    onIncoming: () => {},
    onStatus: (s) => statuses.push({ ...s }),
  });
  return { ctl, log, statuses, st, storage };
}

describe('SyncController sign-out (A4)', () => {
  test('account publish tags the link auth=account; key publish tags auth=key; attach tags auth=join', async () => {
    const a = a4Controller();
    a.ctl.setAccessToken('TOKEN_A');
    const link = await a.ctl.publish({ slug: 'a4-meet', stations: [], isDemo: false }, null);
    assert.equal(link.auth, 'account');
    assert.equal(a.log.at(-1).token, 'TOKEN_A');

    const k = a4Controller();
    const klink = await k.ctl.publish({ slug: 'a4-meet', stations: [], isDemo: false }, 'legacy-key');
    assert.equal(klink.auth, 'key');

    const j = a4Controller();
    const jl = j.ctl.attach({ state: j.st, slug: 'a4-meet', joinCode: 'ZZZ999', latestServerAt: null, updatedAt: null }, 'device');
    assert.equal(jl.auth, 'join');
  });

  test('keyless publish with no token is refused before any network call', async () => {
    const a = a4Controller();
    await assert.rejects(() => a.ctl.publish({ slug: 'x', stations: [], isDemo: false }, null), /Sign in/);
    assert.equal(a.log.length, 0);
  });

  test('sign-out pauses an account link: queue kept, nothing sent, status paused; sign-in resumes', async () => {
    const a = a4Controller();
    a.ctl.setAccessToken('TOKEN_A');
    await a.ctl.publish({ slug: 'a4-meet', stations: [], isDemo: false }, null);
    a.log.length = 0;

    a.ctl.setAccessToken(null);
    assert.equal(a.ctl.paused, true);
    assert.equal(a.ctl.status.state, 'paused');
    assert.match(a.ctl.status.error, /sign back in/i);

    a.ctl.setLive({ station: 'A', current_event_id: null, current_division_id: null, current_athlete_id: null, lane2_athlete_id: null });
    assert.equal(a.ctl.status.pending, 1, 'queued, not dropped');
    await a.ctl.tick();
    await a.ctl.flush();
    await a.ctl.pull();
    assert.equal(a.log.length, 0, 'no network while paused');
    assert.ok(a.ctl.link, 'link kept');

    a.ctl.setAccessToken('TOKEN_A');
    assert.equal(a.ctl.paused, false);
    assert.equal(a.ctl.status.state, 'idle');
    await a.ctl.tick();
    const upserts = a.log.filter((e) => e.kind === 'upsert');
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].token, 'TOKEN_A');
    assert.equal(a.ctl.status.pending, 0);
  });

  test('key and join links are accountless by design: sign-out does not pause them', async () => {
    const k = a4Controller();
    k.ctl.setAccessToken('TOKEN_A');
    await k.ctl.publish({ slug: 'a4-meet', stations: [], isDemo: false }, 'legacy-key');
    k.ctl.setAccessToken(null);
    assert.equal(k.ctl.paused, false);
    assert.equal(k.ctl.status.state, 'idle');

    const j = a4Controller();
    j.ctl.attach({ state: j.st, slug: 'a4-meet', joinCode: 'ZZZ999', latestServerAt: null, updatedAt: null }, 'device');
    j.ctl.setAccessToken('TOKEN_A');
    j.ctl.setAccessToken(null);
    assert.equal(j.ctl.paused, false);
  });

  test('a publish in flight when the account signs out does not create the link (session generation)', async () => {
    const a = a4Controller({ auto: false });
    a.ctl.setAccessToken('OLD_TOKEN');
    const p = a.ctl.publish({ slug: 'a4-meet', stations: [], isDemo: false }, null);
    await Promise.resolve();
    const rpc = a.log.find((e) => e.kind === 'rpc' && e.name === 'zt_publish_meet');
    assert.ok(rpc, 'publish rpc sent');
    assert.equal(rpc.token, 'OLD_TOKEN');

    a.ctl.setAccessToken(null);        // sign out while the server is still working
    rpc.resolve({ id: 'srv-uuid-1', join_code: 'ABC234' });   // ...and then the old call completes
    await assert.rejects(p, /Sign-in changed/);
    assert.equal(a.ctl.link, null, 'no admin link recreated from a stale completion');
    assert.equal(a.storage.getItem(K.LINK_KEY), null);
  });

  test('a flush in flight across a sign-out leaves the queue alone and sends nothing more', async () => {
    const a = a4Controller({ auto: false });
    a.ctl.setAccessToken('TOKEN_A');
    const pub = a.ctl.publish({ slug: 'a4-meet', stations: [], isDemo: false }, null);
    await Promise.resolve();
    a.log.find((e) => e.kind === 'rpc').resolve({ id: 'srv-uuid-1', join_code: 'ABC234' });
    await pub;
    a.log.length = 0;

    a.ctl.setLive({ station: 'A', current_event_id: null, current_division_id: null, current_athlete_id: null, lane2_athlete_id: null });
    const f = a.ctl.flush();
    await Promise.resolve();
    const up = a.log.find((e) => e.kind === 'upsert');
    assert.ok(up);
    a.ctl.setAccessToken(null);
    up.resolve();
    await f;
    assert.equal(a.ctl.status.pending, 1, 'queue kept for the next session');
    assert.equal(a.log.filter((e) => e.kind === 'upsert').length, 1, 'no anonymous follow-up write');
  });

  test('legacy stored links without auth are treated as key (admin) or join (device)', () => {
    const storage = memStorage();
    storage.setItem(K.LINK_KEY, JSON.stringify({ meetId: 'srv-uuid-1', localMeetId: 'x', slug: 's', joinCode: 'ABC234', role: 'admin', since: null }));
    const a = a4Controller({ storage });
    assert.equal(a.ctl.linkAuth(a.ctl.link), 'key');
    assert.equal(a.ctl.paused, false);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Astra gate round (10/17 pm): an account link is bound to the user that published it; publish refusals persist in
// status.publishError; joined phones verify the admin PIN server-side.
// ---------------------------------------------------------------------------------------------------------------
describe('SyncController account binding + publish errors (gate round)', () => {
  test('account publish records the user id on the link', async () => {
    const a = a4Controller();
    a.ctl.setAccessToken('TOKEN_A', 'user-a');
    const link = await a.ctl.publish({ slug: 'g-meet', stations: [], isDemo: false }, null);
    assert.equal(link.auth, 'account');
    assert.equal(link.userId, 'user-a');
    const stored = JSON.parse(a.storage.getItem(K.LINK_KEY));
    assert.equal(stored.userId, 'user-a');
  });

  test('a different signed-in account does not resume the queue: still paused, nothing sent, clear message', async () => {
    const a = a4Controller();
    a.ctl.setAccessToken('TOKEN_A', 'user-a');
    await a.ctl.publish({ slug: 'g-meet', stations: [], isDemo: false }, null);
    a.ctl.setAccessToken(null);
    a.ctl.setLive({ station: 'A', current_event_id: null, current_division_id: null, current_athlete_id: null, lane2_athlete_id: null });
    a.log.length = 0;

    a.ctl.setAccessToken('TOKEN_B', 'user-b');
    assert.equal(a.ctl.paused, true);
    assert.equal(a.ctl.status.state, 'paused');
    assert.match(a.ctl.status.error, /different ZeroTacky account/);
    await a.ctl.tick();
    await a.ctl.flush();
    assert.equal(a.log.length, 0, 'no network under the other account');
    assert.equal(a.ctl.status.pending, 1, 'queue kept for the owner');
    await assert.rejects(() => a.ctl.publish({ slug: 'g-meet', stations: [], isDemo: false }, null), /different ZeroTacky account/);
    assert.equal(a.log.length, 0);

    // the owner comes back: resumes and flushes under their token
    a.ctl.setAccessToken('TOKEN_A', 'user-a');
    assert.equal(a.ctl.paused, false);
    await a.ctl.tick();
    const upserts = a.log.filter((e) => e.kind === 'upsert');
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0].token, 'TOKEN_A');
  });

  test('a link written before user ids existed (no userId) resumes for any token, as before', async () => {
    const storage = memStorage();
    storage.setItem(K.LINK_KEY, JSON.stringify({ meetId: 'srv-uuid-1', localMeetId: 'x', slug: 'g', joinCode: 'ABC234', role: 'admin', auth: 'account', since: null }));
    const a = a4Controller({ storage });
    assert.equal(a.ctl.paused, true, 'no token yet');
    a.ctl.setAccessToken('TOKEN_B', 'user-b');
    assert.equal(a.ctl.paused, false);
  });

  test('a signed-in phone that also holds a key sends the key (claim path) and the link is a key link', async () => {
    const a = a4Controller();
    a.ctl.setAccessToken('TOKEN_A', 'user-a');
    const link = await a.ctl.publish({ slug: 'g-meet', stations: [], isDemo: false }, 'legacy-key');
    const call = a.log.find((e) => e.kind === 'rpc' && e.name === 'zt_publish_meet');
    assert.equal(call.args.p_key, 'legacy-key');
    assert.equal(call.token, 'TOKEN_A');
    assert.equal(link.auth, 'key');
    a.ctl.setAccessToken(null);
    assert.equal(a.ctl.paused, false, 'key links are accountless');
  });

  // Resolve pending fake calls (newest first is fine) until `stop(entry)` matches one, which is returned unresolved.
  // Yields through a timer so the controller's own awaits get to run; bounded so a bug fails instead of hanging.
  // (Windows timers tick at ~15 ms, so the round budget stays small.)
  async function driveUntil(a, stop, value = (e) => e.autoValue) {
    let idle = 0;
    for (let i = 0; i < 120; i++) {
      const hit = a.log.find((e) => !e.done && stop(e));
      if (hit) return hit;
      const next = a.log.find((e) => !e.done);
      if (next) { idle = 0; next.done = true; next.resolve(value(next)); } else if (++idle >= 6) return null;   // nothing pending: drained
      await new Promise((r) => setTimeout(r, 0));
    }
    throw new Error('driveUntil: no matching call after 120 rounds');
  }
  const PUBLISH_OK = (e) => (e.kind === 'rpc' ? { id: 'srv-uuid-1', join_code: 'ABC234' } : e.autoValue);
  const isPublish = (e) => e.kind === 'rpc' && e.name === 'zt_publish_meet';
  const never = () => false;

  test('a refused publish stays visible in status.publishError across successful ticks; the next good publish clears it', async () => {
    const a = a4Controller({ auto: false });
    a.ctl.setAccessToken('TOKEN_A', 'user-a');
    const p1 = a.ctl.publish({ slug: 'g-meet', stations: [], isDemo: false }, null);
    const first = await driveUntil(a, isPublish);
    first.done = true; first.resolve(PUBLISH_OK(first));
    await p1;
    assert.equal(a.ctl.status.publishError, null);

    const p2 = a.ctl.publish({ slug: 'g-meet', stations: [], isDemo: false }, null).catch((e) => e);
    const rpc = await driveUntil(a, isPublish);
    rpc.done = true;
    rpc.reject(new C.SyncError(400, 'Jessica Rucci has 1 recorded result(s) and cannot be removed.'));
    const err = await p2;
    assert.match(err.message, /recorded result/);
    assert.match(a.ctl.status.publishError, /recorded result/);
    assert.equal(a.ctl.status.state, 'error');

    // a successful tick clears `error` but keeps `publishError`
    const t = a.ctl.tick();
    assert.equal(await driveUntil(a, never), null);   // drains everything the tick asks for
    await t;
    assert.equal(a.ctl.status.state, 'idle');
    assert.equal(a.ctl.status.error, null);
    assert.match(a.ctl.status.publishError, /recorded result/);

    const p3 = a.ctl.publish({ slug: 'g-meet', stations: [], isDemo: false }, null);
    const third = await driveUntil(a, isPublish);
    third.done = true; third.resolve(PUBLISH_OK(third));
    await p3;
    assert.equal(a.ctl.status.publishError, null);
  });

  test('checkAdminPin asks the server with the join code; null when not linked (R1: the hook then uses local state)', async () => {
    const a = a4Controller();
    assert.equal(await a.ctl.checkAdminPin('1234'), null);
    assert.equal(a.log.length, 0);
    a.ctl.attach({ state: a.st, slug: 'g', joinCode: 'ZZZ999', latestServerAt: null, updatedAt: null }, 'device');
    const p = a.ctl.checkAdminPin('1234');
    const call = a.log.find((e) => e.kind === 'rpc' && e.name === 'zt_check_admin_pin');
    assert.deepEqual(call.args, { p_code: 'ZZZ999', p_pin: '1234', p_device_id: 'dev-test' });
    // the fake resolves rpc calls with the publish shape; anything but a token string is a refusal (011)
    assert.equal(await p, false);
    assert.equal(a.ctl.link.grant ?? null, null);
  });

  // Astra rehearsal R2 (10/17): a re-publish whose pre-pull fails must not go ahead with the stale roster.
  test('publish aborts when the pre-publish flush/pull fails; nothing reaches the server, publishError says why', async () => {
    const srv = fakeServer();
    const admin = phone(srv, 'a-r2', P.getInitialSeedState('strongfest-2026'), clock);
    await admin.ctl.publish({ slug: 'r2' }, 'GOODKEY');
    const athletesBefore = srv.db.athletes.length;
    const calls = srv.log.length;
    // roster shrinks locally while the network is down
    admin.mutate((s) => ({ ...s, athletes: s.athletes.slice(1) }));
    srv.setOffline(true);
    await assert.rejects(admin.ctl.publish({ slug: 'r2' }, 'GOODKEY'), /Not published: could not fetch the latest/);
    assert.match(admin.ctl.status.publishError, /Not published/);
    srv.setOffline(false);
    assert.equal(srv.db.athletes.length, athletesBefore);
    assert.ok(!srv.log.slice(calls).some((e) => e.path.endsWith('/rpc/zt_publish_meet')));
    // back online: the retry publishes and clears the message
    await admin.ctl.publish({ slug: 'r2' }, 'GOODKEY');
    assert.equal(admin.ctl.status.publishError, null);
    assert.equal(srv.db.athletes.length, athletesBefore - 1);
  });

  // Astra rehearsal R5 (10/17): roster removals on the admin phone survive the poll until the republish carries them.
  test('R5: a locally removed athlete is not resurrected by a pull; the republish deletes it on the server', async () => {
    const srv = fakeServer();
    const admin = phone(srv, 'a-r5', P.getInitialSeedState('strongfest-2026'), clock);
    await admin.ctl.publish({ slug: 'r5' }, 'GOODKEY');
    const gone = admin.state.athletes[2];
    admin.mutate((s) => ({ ...s, athletes: s.athletes.filter((a) => a.id !== gone.id) }));
    await admin.ctl.tick();                                     // the 3 s poll before the 1.5 s republish fires
    assert.ok(!admin.state.athletes.some((a) => a.id === gone.id), 'pull brought the deleted athlete back');
    assert.ok(srv.db.athletes.some((a) => a.id === gone.id));   // still on the server until the publish
    await admin.ctl.publish({ slug: 'r5' }, 'GOODKEY');
    assert.ok(!srv.db.athletes.some((a) => a.id === gone.id));
    // a judge phone sees the roster shrink
    const judge = phone(srv, 'j-r5', P.getInitialSeedState('york-iron-2026'), clock);
    const remote = await judge.ctl.lookupJoinCode(admin.ctl.link.joinCode);
    assert.ok(!remote.state.athletes.some((a) => a.id === gone.id));
  });
  test('R5: removing a scored athlete is refused by the server; publishError says so and the next pull restores the athlete', async () => {
    const srv = fakeServer();
    const admin = phone(srv, 'a-r5b', P.getInitialSeedState('strongfest-2026'), clock);
    await admin.ctl.publish({ slug: 'r5b' }, 'GOODKEY');
    const judge = phone(srv, 'j-r5b', P.getInitialSeedState('york-iron-2026'), clock);
    const remote = await judge.ctl.lookupJoinCode(admin.ctl.link.joinCode);
    judge.state = remote.state; judge.ctl.attach(remote); await judge.ctl.checkAdminPin('1050');   // 011: scores need the grant a correct PIN issues
    judge.mutate((s) => score(s, 0, 0, { reps: 5, locked: true }, T += 1000));
    await judge.ctl.tick();
    await admin.ctl.tick();
    const scored = admin.state.athletes[0];
    assert.ok(admin.state.results.some((r) => r.athleteId === scored.id));
    admin.mutate((s) => ({ ...s, athletes: s.athletes.filter((a) => a.id !== scored.id) }));
    await admin.ctl.tick();
    assert.ok(!admin.state.athletes.some((a) => a.id === scored.id));
    await assert.rejects(admin.ctl.publish({ slug: 'r5b' }, 'GOODKEY'), /recorded result/);
    assert.match(admin.ctl.status.publishError, /recorded result/);
    assert.ok(srv.db.athletes.some((a) => a.id === scored.id));
    await admin.ctl.tick();
    assert.ok(admin.state.athletes.some((a) => a.id === scored.id), 'refused deletion was not restored by the pull');
  });
  // Astra gate 2, G2-H2 (10/17 night): the pull's merged roster reaches React asynchronously; publish must not read
  // the stale pre-pull state. The judge adds a walk-on; the stale admin's first healthy publish has to keep it.
  test('G2-H2: a walk-on fetched by the pre-publish pull is in the publish payload even before the host commits it', async () => {
    const srv = fakeServer();
    const admin = phone(srv, 'a-h2', P.getInitialSeedState('strongfest-2026'), clock, { asyncIncoming: true });
    await admin.ctl.publish({ slug: 'h2' }, 'GOODKEY');
    const judge = phone(srv, 'j-h2', P.getInitialSeedState('york-iron-2026'), clock);
    const remote = await judge.ctl.lookupJoinCode(admin.ctl.link.joinCode);
    judge.state = remote.state; judge.ctl.attach(remote); await judge.ctl.checkAdminPin('1050');   // 011: scores need the grant a correct PIN issues
    const walkon = { ...judge.state.athletes[0], id: 'walkon-h2', name: 'Walk On', lotNumber: 99 };
    judge.mutate((s) => ({ ...s, athletes: [...s.athletes, walkon] }));
    await judge.ctl.tick();
    assert.ok(srv.db.athletes.some((a) => a.id === 'walkon-h2'));
    // admin edits a weight (a config change -> republish) while its React state still lacks the walk-on
    admin.mutate((s) => ({ ...s, meet: { ...s.meet, collarWeightPerPair: 5 } }));
    assert.ok(!admin.state.athletes.some((a) => a.id === 'walkon-h2'));
    const calls = srv.log.length;
    await admin.ctl.publish({ slug: 'h2' }, 'GOODKEY');
    assert.ok(!admin.state.athletes.some((a) => a.id === 'walkon-h2'), 'test premise: host has not committed the pull yet');
    const pub = srv.log.slice(calls).find((e) => e.path.endsWith('/rpc/zt_publish_meet'));
    assert.ok(pub.body.p_athletes.some((a) => a.id === 'walkon-h2'), 'publish payload omitted the pulled walk-on');
    assert.ok(srv.db.athletes.some((a) => a.id === 'walkon-h2'), 'server lost the walk-on');
    await new Promise((r) => setTimeout(r, 5));
    assert.ok(admin.state.athletes.some((a) => a.id === 'walkon-h2'));   // and the host catches up
    const again = await judge.ctl.lookupJoinCode(admin.ctl.link.joinCode);
    assert.ok(again.state.athletes.some((a) => a.id === 'walkon-h2'));
  });
  test('R1: the admin phone publishes without a PIN and the server keeps its own (null admin_pin never overwrites)', async () => {
    const srv = fakeServer();
    const admin = phone(srv, 'a-r1', P.getInitialSeedState('strongfest-2026'), clock);
    admin.state = { ...admin.state, meet: { ...admin.state.meet, adminPin: '7391' } };
    await admin.ctl.publish({ slug: 'r1' }, 'GOODKEY');
    assert.equal(srv.db.meets[0].admin_pin, '7391');
    const { adminPin: _x, ...noPin } = admin.state.meet;
    void _x;
    admin.state = { ...admin.state, meet: noPin };
    await admin.ctl.publish({ slug: 'r1' }, 'GOODKEY');
    assert.equal(srv.db.meets[0].admin_pin, '7391');
  });
});
