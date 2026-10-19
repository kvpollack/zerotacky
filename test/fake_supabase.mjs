// In-memory stand-in for the slice of Supabase/PostgREST that ZeroTacky uses: select with eq/gt/order/limit,
// upsert via POST + on_conflict, the zt_publish_meet RPC, the zt_lww trigger and a join-code RLS check.
// Used by test/controller.test.mjs and, via `bun test/fake_supabase.mjs`, as a local HTTP server for browser
// smoke tests (set NEXT_PUBLIC_SUPABASE_URL=http://localhost:3078 and any anon key).
export function fakeServer() {
  const db = { meets: [], divisions: [], events: [], athletes: [], results: [], live_state: [] };
  const KEYS = { meets: ['id'], divisions: ['meet_id', 'id'], events: ['meet_id', 'id'], athletes: ['meet_id', 'id'], results: ['meet_id', 'id'], live_state: ['meet_id', 'station'] };
  const log = [];
  let offline = false;
  let joinCodeCounter = 0;
  let serverClock = 0;   // strictly increasing stand-in for clock_timestamp()
  const serverNow = () => new Date(Date.now() + (serverClock += 1)).toISOString();
  const keyOf = (t, r) => KEYS[t].map((k) => r[k]).join('|');
  function upsert(table, rows) {
    for (const r of rows) {
      const i = db[table].findIndex((x) => keyOf(table, x) === keyOf(table, r));
      const stamp = table === 'results' ? { server_at: serverNow() } : {};
      if (i < 0) db[table].push({ ...r, ...stamp });
      else if ((table === 'results' || table === 'live_state') && r.updated_at < db[table][i].updated_at) { /* zt_lww: skip */ }
      else db[table][i] = { ...db[table][i], ...r, ...stamp };
    }
  }
  const PUBLIC_MEET_COLS = ['id', 'slug', 'name', 'date', 'run_order_method', 'tiebreaker_rule', 'available_plates', 'collar_weight_per_pair', 'stations', 'is_demo', 'created_at', 'updated_at'];
  const publicMeet = (m) => Object.fromEntries(Object.entries(m).filter(([k]) => PUBLIC_MEET_COLS.includes(k)));
  function select(table, params) {
    let rows = db[table];
    for (const [k, v] of params) {
      if (k === 'select' || k === 'limit' || k === 'order') continue;
      const [op, val] = v.split(/\.(.*)/s);
      if (op === 'eq') rows = rows.filter((r) => String(r[k]) === val);
      else if (op === 'gt') rows = rows.filter((r) => r[k] > val);
      else if (op === 'gte') rows = rows.filter((r) => r[k] >= val);
      else throw new Error('unsupported op ' + op);
    }
    const order = params.get('order');
    if (order) { const [col, dir] = order.split('.'); rows = [...rows].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (dir === 'desc' ? -1 : 1)); }
    const lim = params.get('limit');
    if (lim) rows = rows.slice(0, Number(lim));
    return rows.map((r) => ({ ...r }));
  }
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const body = init?.body ? JSON.parse(init.body) : undefined;
    log.push({ method: init.method, path: u.pathname, body, headers: init.headers });
    if (offline) throw new TypeError('Failed to fetch');
    const parts = u.pathname.split('/').filter(Boolean); // rest, v1, table | rpc, fn
    const reply = (status, json) => ({ ok: status < 300, status, statusText: '', json: async () => json, text: async () => (json === undefined ? '' : JSON.stringify(json)) });
    if (parts[2] === 'rpc') {
      if (parts[3] === 'zt_meet_by_join_code') {
        const m = db.meets.find((x) => x.join_code === String(body.p_code || '').trim().toUpperCase());
        return reply(200, m ? { ...m } : { id: null });
      }
      if (parts[3] !== 'zt_publish_meet') return reply(404, { message: 'no fn' });
      if (body.p_key !== 'GOODKEY') return reply(403, { message: 'invalid publish key' });
      const existing = db.meets.find((x) => x.slug === body.p_meet.slug) ?? db.meets.find((x) => x.id === body.p_meet.id);
      const m = { ...body.p_meet, id: existing?.id ?? body.p_meet.id };
      // 004 result guard (and 008 publish guards): a removed athlete with a recorded result is refused as a whole.
      const keepAth = new Set(body.p_athletes.map((r) => r.id));
      const scored = db.athletes.find((a) => a.meet_id === m.id && !keepAth.has(a.id) && db.results.some((r) => r.meet_id === m.id && r.athlete_id === a.id));
      if (scored) return reply(400, { message: `${scored.name} has a recorded result and cannot be removed from the roster. Mark the athlete withdrawn on meet day instead.` });
      const join_code = existing?.join_code ?? `JC${String(++joinCodeCounter).padStart(4, '0')}`;
      // 008: a null admin_pin keeps the server's
      if (m.admin_pin == null) m.admin_pin = existing?.admin_pin ?? '1050';
      upsert('meets', [{ ...m, join_code, updated_at: serverNow() }]);   // RPC: updated_at = now()
      for (const t of ['divisions', 'events', 'athletes']) {
        upsert(t, body[`p_${t}`].map((r) => ({ ...r, meet_id: m.id })));   // RPC stamps children with the resolved id
        const keep = new Set(body[`p_${t}`].map((r) => r.id));
        db[t] = db[t].filter((r) => r.meet_id !== m.id || keep.has(r.id));
      }
      db.results = db.results.filter((r) => db.athletes.some((a) => a.meet_id === r.meet_id && a.id === r.athlete_id));
      upsert('results', body.p_results.map((r) => ({ ...r, meet_id: m.id })));
      return reply(200, { id: m.id, join_code });
    }
    const table = parts[2];
    if (!db[table]) return reply(404, { message: 'no table' });
    if (init.method === 'GET') {
      const sel = u.searchParams.get('select');
      if (table === 'meets' && sel && sel.split(',').some((c) => !PUBLIC_MEET_COLS.includes(c))) return reply(401, { message: 'permission denied for table meets' });
      const rows = select(table, u.searchParams);
      return reply(200, table === 'meets' ? rows.map(publicMeet) : rows);
    }
    if (init.method === 'POST') {
      // RLS stand-in: writes to results/athletes/live_state need the join code of that meet
      const code = init.headers['x-zt-join'];
      const ok = body.every((r) => db.meets.some((m) => m.id === r.meet_id && m.join_code === code));
      if (!ok) return reply(401, { message: 'new row violates row-level security policy' });
      upsert(table, body);
      return reply(201, undefined);
    }
    return reply(405, { message: 'nope' });
  };
  return { db, log, fetchImpl, setOffline: (v) => { offline = v; } };
}


if (import.meta.main) {
  const port = Number(process.env.PORT || 3078);
  const srv = fakeServer();
  // optional persistence so the "backend comes back" half of an offline test keeps its rows
  const file = process.env.FAKE_DB;
  if (file) {
    try { Object.assign(srv.db, JSON.parse(await Bun.file(file).text())); console.log('loaded', file); } catch { /* fresh */ }
    setInterval(() => Bun.write(file, JSON.stringify(srv.db)), 1000);
  }
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, prefer, x-zt-join',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
  Bun.serve({
    port,
    async fetch(req) {
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
      if (new URL(req.url).pathname === '/_debug') return Response.json({ db: srv.db, calls: srv.log.length }, { headers: CORS });
      const headers = Object.fromEntries(req.headers.entries());
      const init = { method: req.method, headers, body: req.method === 'GET' ? undefined : await req.text() };
      try {
        const r = await srv.fetchImpl(req.url, init);
        const text = await r.text();
        return new Response(text, { status: r.status, headers: { ...CORS, 'content-type': 'application/json' } });
      } catch (e) {
        return new Response(JSON.stringify({ message: String(e) }), { status: 500, headers: CORS });
      }
    },
  });
  console.log(`fake supabase on http://localhost:${port}  (GET /_debug for the tables)`);
}
