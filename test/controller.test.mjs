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

// A fake "phone": state holder + controller wired like the hook would.
function phone(server, deviceId, initialState, now) {
  const storage = memStorage();
  const box = { state: initialState, incoming: [] , statuses: [] };
  const client = C.createSyncClient({ url: 'https://x.supabase.co', anonKey: 'A', fetchImpl: server.fetchImpl });
  const ctl = new K.SyncController({
    client, storage, deviceId,
    getState: () => box.state,
    onIncoming: (patch) => { box.incoming.push(patch); box.state = { ...box.state, ...patch }; },
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
    const jl = judge.ctl.attach(remote);
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
    judge.ctl.attach(remote);
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
    await admin.ctl.publish({ slug: 'sf', stations: [{ id: 'A', label: 'Stn 1' }, { id: 'B', label: 'Stn 2' }] }, 'GOODKEY');
    const judge = phone(srv, 'judge1', { meet: {}, divisions: [], events: [], athletes: [], results: [] }, clock);
    const remote = await judge.ctl.lookupJoinCode('JC0001');
    judge.state = remote.state;
    judge.ctl.attach(remote);
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
      meet: { ...s.meet, stations: [{ id: 'A', label: 'Stn 1' }, { id: 'B', label: 'Stn 2' }, { id: 'C', label: 'Stn 3' }] },
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
    judge.ctl.attach(remote);
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
