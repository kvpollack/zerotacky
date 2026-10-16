import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
const ROOT = process.env.ZT_SYNC || '../lib/sync';
const C = await import(`${ROOT}/client.ts`);
const A = await import(`${ROOT}/meetApi.ts`);
const M = await import(`${ROOT}/mapping.ts`);
const P = await import(process.env.ZT_PRESETS || '../lib/presets/index.ts');

// Fake fetch: records every call, answers from a handler.
function fakeFetch(handler) {
  const calls = [];
  const f = async (url, init) => {
    const call = { url: String(url), method: init?.method, headers: init?.headers ?? {}, body: init?.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const r = (await handler(call)) ?? { status: 200, json: [] };
    const text = r.text !== undefined ? r.text : r.json !== undefined ? JSON.stringify(r.json) : '';
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      statusText: r.statusText ?? '',
      json: async () => JSON.parse(text),
      text: async () => text,
    };
  };
  return { f, calls };
}

const CFG = { url: 'https://abc.supabase.co/', anonKey: 'ANON' };

describe('client: headers and URLs', () => {
  test('select builds GET with apikey + Bearer anon, trims trailing slash', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200, json: [{ id: 1 }] }));
    const c = C.createSyncClient({ ...CFG, fetchImpl: f });
    const rows = await c.select('meets', 'slug=eq.x&limit=1');
    assert.deepEqual(rows, [{ id: 1 }]);
    assert.equal(calls[0].url, 'https://abc.supabase.co/rest/v1/meets?slug=eq.x&limit=1');
    assert.equal(calls[0].method, 'GET');
    assert.equal(calls[0].headers.apikey, 'ANON');
    assert.equal(calls[0].headers.Authorization, 'Bearer ANON');
    assert.equal(calls[0].headers['x-zt-join'], undefined);
  });
  test('accessToken replaces anon key in Bearer only', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200, json: [] }));
    const c = C.createSyncClient({ ...CFG, accessToken: 'JWT', fetchImpl: f });
    await c.select('meets', 'x=eq.1');
    assert.equal(calls[0].headers.apikey, 'ANON');
    assert.equal(calls[0].headers.Authorization, 'Bearer JWT');
  });
  test('withJoinCode adds x-zt-join without mutating the original client', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200, json: [] }));
    const base = C.createSyncClient({ ...CFG, fetchImpl: f });
    const joined = base.withJoinCode('ABC123');
    await joined.select('results', 'a=eq.1');
    await base.select('results', 'a=eq.1');
    assert.equal(calls[0].headers['x-zt-join'], 'ABC123');
    assert.equal(calls[1].headers['x-zt-join'], undefined);
  });
  test('upsert: POST with on_conflict and merge-duplicates Prefer, body is the rows', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 201, text: '' }));
    const c = C.createSyncClient({ ...CFG, fetchImpl: f });
    const out = await c.upsert('live_state', [{ meet_id: 'm', station: 'A' }], 'meet_id,station');
    assert.equal(out, undefined);
    assert.equal(calls[0].url, 'https://abc.supabase.co/rest/v1/live_state?on_conflict=meet_id%2Cstation');
    assert.equal(calls[0].method, 'POST');
    assert.equal(calls[0].headers.Prefer, 'resolution=merge-duplicates,return=minimal');
    assert.deepEqual(calls[0].body, [{ meet_id: 'm', station: 'A' }]);
  });
  test('insert returns representation', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 201, json: [{ id: 'new', n: 1 }] }));
    const c = C.createSyncClient({ ...CFG, fetchImpl: f });
    const rows = await c.insert('athletes', [{ n: 1 }]);
    assert.deepEqual(rows, [{ id: 'new', n: 1 }]);
    assert.equal(calls[0].headers.Prefer, 'return=representation');
  });
  test('update is PATCH with query; del is DELETE', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 204 }));
    const c = C.createSyncClient({ ...CFG, fetchImpl: f });
    await c.update('athletes', 'id=eq.a1', { status: 'withdrawn' });
    await c.del('results', 'id=eq.r1');
    assert.equal(calls[0].method, 'PATCH');
    assert.equal(calls[0].url, 'https://abc.supabase.co/rest/v1/athletes?id=eq.a1');
    assert.deepEqual(calls[0].body, { status: 'withdrawn' });
    assert.equal(calls[1].method, 'DELETE');
    assert.equal(calls[1].url, 'https://abc.supabase.co/rest/v1/results?id=eq.r1');
  });
  test('rpc posts args to /rest/v1/rpc/<fn> and parses the scalar reply', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200, text: '"Q7K2M9"' }));
    const c = C.createSyncClient({ ...CFG, fetchImpl: f });
    const code = await c.rpc('gen_join_code', {});
    assert.equal(code, 'Q7K2M9');
    assert.equal(calls[0].url, 'https://abc.supabase.co/rest/v1/rpc/gen_join_code');
    assert.deepEqual(calls[0].body, {});
  });
});

describe('client: responses and errors', () => {
  test('204 and empty bodies resolve to undefined', async () => {
    const { f } = fakeFetch((call) => (call.method === 'GET' ? { status: 200, text: '' } : { status: 204 }));
    const c = C.createSyncClient({ ...CFG, fetchImpl: f });
    assert.equal(await c.select('x', 'a=eq.1'), undefined);
    assert.equal(await c.del('x', 'a=eq.1'), undefined);
  });
  test('non-2xx with PostgREST JSON error -> SyncError with status and message', async () => {
    const { f } = fakeFetch(() => ({ status: 401, statusText: 'Unauthorized', json: { message: 'new row violates row-level security policy' } }));
    const c = C.createSyncClient({ ...CFG, fetchImpl: f });
    await assert.rejects(c.upsert('results', [{}], 'id'), (e) => {
      assert.ok(e instanceof C.SyncError);
      assert.equal(e.status, 401);
      assert.match(e.message, /^401: new row violates/);
      return true;
    });
  });
  test('non-2xx with non-JSON body -> SyncError with status text', async () => {
    const { f } = fakeFetch(() => ({ status: 502, statusText: 'Bad Gateway', text: '<html>oops</html>' }));
    const c = C.createSyncClient({ ...CFG, fetchImpl: f });
    await assert.rejects(c.select('meets', 'a=eq.1'), (e) => e instanceof C.SyncError && e.status === 502 && e.message === '502 Bad Gateway');
  });
  test('createSyncClient throws without any fetch', () => {
    const saved = globalThis.fetch;
    try {
      globalThis.fetch = undefined;
      assert.throws(() => C.createSyncClient(CFG), /fetch is not available/);
    } finally {
      globalThis.fetch = saved;
    }
  });
});

describe('readSyncEnv', () => {
  test('null when either var is missing; trims trailing slash when present', () => {
    const saved = { u: process.env.NEXT_PUBLIC_SUPABASE_URL, k: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      assert.equal(C.readSyncEnv(), null);
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co//';
      assert.equal(C.readSyncEnv(), null);
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'K';
      assert.deepEqual(C.readSyncEnv(), { url: 'https://x.supabase.co', anonKey: 'K' });
    } finally {
      if (saved.u === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = saved.u;
      if (saved.k === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = saved.k;
    }
  });
});

// ---------- meetApi ----------
function seeded() {
  const state = P.getInitialSeedState('strongfest-2026');
  state.results = [
    { id: `${state.events[0].id}_${state.athletes[0].id}`, eventId: state.events[0].id, athleteId: state.athletes[0].id, reps: 5, locked: true, updatedAt: 1760000000000 },
  ];
  return state;
}
const UUID = '11111111-2222-3333-4444-555555555555';

describe('meetApi.publishMeet', () => {
  test('one RPC call with the publish key and every table, remote uuid stamped on every row', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200, json: { id: UUID, join_code: 'ABC123' } }));
    const c = C.createSyncClient({ ...CFG, fetchImpl: f });
    const state = seeded();
    const out = await A.publishMeet(c, state, { slug: 'strongfest', meetId: UUID, isDemo: false, deviceId: 'dev1', stations: [{ id: 'A', label: 'Only' }] }, 'KEY-1');
    assert.deepEqual(out, { id: UUID, joinCode: 'ABC123' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://abc.supabase.co/rest/v1/rpc/zt_publish_meet');
    const b = calls[0].body;
    assert.equal(b.p_key, 'KEY-1');
    assert.equal(b.p_meet.id, UUID);
    assert.equal(b.p_meet.slug, 'strongfest');
    assert.deepEqual(b.p_meet.stations, [{ id: 'A', label: 'Only' }]);
    assert.equal(b.p_meet.is_demo, false);
    for (const t of ['p_divisions', 'p_events', 'p_athletes', 'p_results']) for (const row of b[t]) assert.equal(row.meet_id, UUID);
    assert.equal(b.p_divisions.length, state.divisions.length);
    assert.equal(b.p_events.length, state.events.length);
    assert.equal(b.p_athletes.length, state.athletes.length);
    assert.equal(b.p_results.length, 1);
    assert.equal(b.p_results[0].updated_by, 'dev1');
  });
  test('bad key surfaces as SyncError 401/403 from the RPC', async () => {
    const { f } = fakeFetch(() => ({ status: 403, statusText: 'Forbidden', json: { message: 'invalid publish key' } }));
    const c = C.createSyncClient({ ...CFG, fetchImpl: f });
    await assert.rejects(A.publishMeet(c, seeded(), { slug: 's' }, 'nope'), (e) => e instanceof C.SyncError && e.status === 403 && /invalid publish key/.test(e.message));
  });
});

describe('meetApi.fetch*', () => {
  function serveMeet(state, meetRow) {
    const rows = M.stateToRows(state, { slug: meetRow.slug, meetId: meetRow.id });
    const meet = { ...rows.meet, ...meetRow };
    return (call) => {
      const u = new URL(call.url);
      const table = u.pathname.split('/').pop();
      if (table === 'zt_meet_by_join_code') {
        return { status: 200, json: call.body.p_code === meet.join_code ? meet : { id: null } };
      }
      if (table === 'meets') {
        const slug = u.searchParams.get('slug');
        assert.ok(!u.searchParams.get('select').includes('join_code'), 'public select must not ask for join_code');
        const { join_code: _j, admin_pin: _a, ...pub } = meet;
        return { status: 200, json: slug === `eq.${meet.slug}` ? [pub] : [] };
      }
      assert.equal(u.searchParams.get('meet_id'), `eq.${meet.id}`);
      return { status: 200, json: rows[table] };
    };
  }
  test('fetchMeetBySlug returns a lossless state plus meta; null on miss', async () => {
    const state = seeded();
    const { f, calls } = fakeFetch(serveMeet(state, { id: UUID, slug: 'strongfest', join_code: 'ABC123', is_demo: true }));
    const c = C.createSyncClient({ ...CFG, fetchImpl: f });
    const r = await A.fetchMeetBySlug(c, 'strongfest');
    assert.equal(r.slug, 'strongfest');
    assert.equal(r.joinCode, undefined);          // not readable via the public select
    assert.equal(r.isDemo, true);
    assert.equal(r.state.meet.id, UUID);
    assert.equal(r.state.athletes.length, state.athletes.length);
    assert.deepEqual(r.state.results, state.results);
    assert.equal(calls.length, 5);
    assert.equal(await A.fetchMeetBySlug(c, 'nope'), null);
  });
  test('fetchMeetByJoinCode goes through the RPC, upper-cases the code, returns join code + null on miss', async () => {
    const state = seeded();
    const { f, calls } = fakeFetch(serveMeet(state, { id: UUID, slug: 's', join_code: 'ABC123' }));
    const c = C.createSyncClient({ ...CFG, fetchImpl: f });
    const r = await A.fetchMeetByJoinCode(c, ' abc123 ');
    assert.equal(r.slug, 's');
    assert.equal(r.joinCode, 'ABC123');
    assert.equal(r.latestServerAt, null);
    assert.equal(new URL(calls[0].url).pathname, '/rest/v1/rpc/zt_meet_by_join_code');
    assert.deepEqual(calls[0].body, { p_code: 'ABC123' });
    assert.equal(await A.fetchMeetByJoinCode(c, 'ZZZZZZ'), null);
  });
});

describe('meetApi.pullChanges / push*', () => {
  test('pullChanges: no since -> no server_at filter; latestIso = since when nothing new', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200, json: [] }));
    const c = C.createSyncClient({ ...CFG, fetchImpl: f });
    const r = await A.pullChanges(c, UUID, null);
    assert.deepEqual(r, { results: [], athletes: [], latestIso: null, meetUpdatedAt: null });
    assert.ok(calls.some((k) => new URL(k.url).pathname === '/rest/v1/meets' && new URL(k.url).searchParams.get('select') === 'updated_at'));
    const u = new URL(calls[0].url);
    assert.equal(u.searchParams.get('server_at'), null);
    assert.equal(u.searchParams.get('updated_at'), null);
    assert.equal(u.searchParams.get('order'), 'server_at.asc');
  });
  test('pullChanges: watermark is the server clock (gte), not the phones\' updated_at', async () => {
    const rows = [
      // a fast-clocked phone wrote this first (big updated_at) but the server saw it earlier
      { id: 'e1_a1', meet_id: UUID, event_id: 'e1', athlete_id: 'a1', payload: { reps: 3 }, locked: false, updated_at: '2026-10-24T14:05:00.000Z', updated_by: 'fast', server_at: '2026-10-24T14:00:01.000Z' },
      { id: 'e1_a2', meet_id: UUID, event_id: 'e1', athlete_id: 'a2', payload: { reps: 4 }, locked: true, updated_at: '2026-10-24T14:00:02.000Z', updated_by: 'd2', server_at: '2026-10-24T14:00:05.000Z' },
    ];
    const { f, calls } = fakeFetch((call) => ({ status: 200, json: call.url.includes('/results') ? rows : [] }));
    const c = C.createSyncClient({ ...CFG, fetchImpl: f });
    const r = await A.pullChanges(c, UUID, '2026-10-24T14:00:00.000Z');
    assert.equal(new URL(calls[0].url).searchParams.get('server_at'), 'gte.2026-10-24T14:00:00.000Z');
    assert.equal(r.latestIso, '2026-10-24T14:00:05.000Z');
    assert.equal(r.results.length, 2);
    assert.equal(r.results[1].locked, true);
    assert.equal(r.results[0].locked, undefined);
    assert.equal(r.results[0].reps, 3);
  });
  test('pushResults/pushAthletes: no-op on empty, otherwise one upsert each', async () => {
    const { f, calls } = fakeFetch(() => ({ status: 201, text: '' }));
    const c = C.createSyncClient({ ...CFG, fetchImpl: f });
    await A.pushResults(c, UUID, [], 'd1');
    await A.pushAthletes(c, UUID, []);
    assert.equal(calls.length, 0);
    const st = seeded();
    await A.pushResults(c, UUID, st.results, 'd1');
    await A.pushAthletes(c, UUID, st.athletes);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body[0].meet_id, UUID);
    assert.equal(calls[0].body[0].updated_by, 'd1');
    assert.equal(calls[1].body.length, st.athletes.length);
    for (const k of calls) assert.equal(new URL(k.url).searchParams.get('on_conflict'), 'meet_id,id');
  });
  test('setLiveState stamps updated_at and upserts on meet_id,station; getLiveState filters by meet', async () => {
    const { f, calls } = fakeFetch((call) => (call.method === 'GET' ? { status: 200, json: [{ meet_id: UUID, station: 'A' }] } : { status: 201, text: '' }));
    const c = C.createSyncClient({ ...CFG, fetchImpl: f });
    await A.setLiveState(c, { meet_id: UUID, station: 'A', current_event_id: 'e1', current_division_id: 'd1', current_athlete_id: 'a1', lane2_athlete_id: null, updated_by: 'd1' });
    assert.equal(new URL(calls[0].url).searchParams.get('on_conflict'), 'meet_id,station');
    assert.match(calls[0].body[0].updated_at, /^\d{4}-\d{2}-\d{2}T/);
    const live = await A.getLiveState(c, UUID);
    assert.equal(live[0].station, 'A');
    assert.equal(new URL(calls[1].url).searchParams.get('meet_id'), `eq.${UUID}`);
  });
});
