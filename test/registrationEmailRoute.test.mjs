import { test, describe, expect, beforeEach } from 'bun:test';

// Route-level tests for /api/registration-email (031 + 033). The database is faked in memory with the same rules as
// supabase/033_mail_reservations.sql (reserve -> send -> confirm); Resend is a counter. Astra 2026-10-29 EM-01..03.
const ROOT = process.env.ZT_ROOT || '..';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-supabase.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon';
process.env.RESEND_API_KEY = 'fake-resend';
process.env.ZT_MAIL_KEY = 'k'.repeat(64);
process.env.NEXT_PUBLIC_SITE_URL = 'https://example.invalid';

const REG = 'aa04e0da-4b0d-4aa7-b696-79f46d719f9a';
const KINDS = new Set(['received', 'notice', 'decision_accepted', 'decision_declined']);
const db = { row: null, log: {}, keys: [] };
const resend = { sent: [], fail: false };
let now = Date.parse('2026-10-29T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

function reserve({ p_kind, p_force, p_key }) {
  if (p_key !== process.env.ZT_MAIL_KEY) throw new Error('Server key required.');
  if (!KINDS.has(p_kind)) throw new Error('bad kind');
  if (db.row.caller_role === 'athlete' && (p_force || !['received', 'notice', 'decision_accepted'].includes(p_kind)
    || (p_kind === 'decision_accepted' && db.row.status !== 'accepted'))) throw new Error('Not allowed.');
  const e = db.log[p_kind];
  let sent = null, attempt = null, count = 0;
  if (typeof e === 'string') { sent = Date.parse(e); count = 1; }
  else if (e) { sent = e.sent ? Date.parse(e.sent) : null; attempt = e.attempt ? Date.parse(e.attempt) : null; count = e.count ?? 0; }
  if (attempt !== null && attempt > now - 2 * 60_000) return { decision: 'skip', reason: 'in_flight' };
  if (sent !== null && !p_force) return { decision: 'skip', reason: 'already_notified' };
  if (count >= 5) return { decision: 'skip', reason: 'limit' };
  if (sent !== null && sent > now - 10 * 60_000) return { decision: 'skip', reason: 'wait' };
  db.log[p_kind] = { sent: sent === null ? null : iso(sent), count: count + 1, attempt: iso(now) };
  return { decision: 'go' };
}
function confirm({ p_kind, p_ok, p_key }) {
  if (p_key !== process.env.ZT_MAIL_KEY) throw new Error('Server key required.');
  const e = db.log[p_kind];
  if (!e || typeof e !== 'object') return null;
  db.log[p_kind] = { sent: p_ok ? iso(now) : e.sent, count: e.count, attempt: null };
  return null;
}

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const body = init.body ? JSON.parse(init.body) : {};
  const rpcError = (m) => Response.json({ message: m }, { status: 400 });
  if (u.endsWith('/rpc/zt_registration_email_payload')) {
    db.keys.push(body.p_key);
    if (body.p_key !== process.env.ZT_MAIL_KEY) return rpcError('Server key required.');
    return Response.json({ ...db.row, email_log: { ...db.log } });
  }
  if (u.endsWith('/rpc/zt_reserve_registration_email')) { try { return Response.json(reserve(body)); } catch (e) { return rpcError(e.message); } }
  if (u.endsWith('/rpc/zt_confirm_registration_email')) { try { return Response.json(confirm(body)); } catch (e) { return rpcError(e.message); } }
  if (u.endsWith('/rpc/zt_mark_registration_notified')) throw new Error('031 stamp RPC must not be called');
  if (u === 'https://api.resend.com/emails') {
    if (resend.fail) return Response.json({ message: 'boom' }, { status: 500 });
    resend.sent.push(body); return Response.json({ id: `m${resend.sent.length}` });
  }
  throw new Error('unexpected url ' + u);
};

const { POST } = await import(`${ROOT}/app/api/registration-email/route.ts`);
const call = (kind, force = false, token = 'tok') => POST(new Request('https://example.invalid/api/registration-email', {
  method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify({ registrationId: REG, kind, force }),
}));
const payload = (over = {}) => ({
  registration_id: REG, caller_role: 'athlete', status: 'pending', waitlisted: false, athlete_name: 'Test Person',
  athlete_email: 'athlete@example.invalid', division_name: 'Open', meet_id: '23da26d1-3694-463f-90bc-99ef608def31',
  meet_slug: 'test-meet', meet_name: 'Test Meet', meet_date: '2026-11-14', is_demo: false, venue: null,
  entry_fee_display: null, promoter_contact: null, promoter_email: 'promoter@example.invalid', promoter_name: 'Promoter', ...over,
});

beforeEach(() => { db.row = payload(); db.log = {}; db.keys = []; resend.sent = []; resend.fail = false; now = Date.parse('2026-10-29T12:00:00Z'); });

describe('registration email route (033)', () => {
  test('received: athlete mail + promoter notice, stamped once, repeat skips both', async () => {
    const r1 = await (await call('received')).json();
    expect(r1.sent.map((s) => s.kind)).toEqual(['received', 'notice']);
    expect(db.log.received.sent).toBeTruthy(); expect(db.log.received.attempt).toBeNull(); expect(db.log.received.count).toBe(1);
    const r2 = await (await call('received')).json();
    expect(r2.sent).toEqual([]); expect(r2.skipped).toEqual(['received:already_notified', 'notice:already_notified']);
    expect(resend.sent.length).toBe(2);
  });

  test('EM-01 waitlisted entry gets the waitlist received mail and the notice', async () => {
    db.row = payload({ status: 'waitlist', waitlisted: true });
    const res = await call('received');
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.sent.map((s) => s.kind)).toEqual(['received', 'notice']);
    expect(resend.sent[0].subject.toLowerCase()).toContain('waitlist');
    expect(resend.sent[1].text).toContain('on the waitlist');
  });

  test('EM-02 two simultaneous requests send once (in-flight marker)', async () => {
    const [a, b] = await Promise.all([call('received'), call('received')]);
    const ja = await a.json(), jb = await b.json();
    expect(resend.sent.length).toBe(2);
    const skips = [...ja.skipped, ...jb.skipped];
    expect(skips.filter((s) => s.endsWith('in_flight')).length).toBe(2);
  });

  test('EM-02 registrant cannot force a resend', async () => {
    await call('received');
    const res = await call('received', true);
    expect(res.status).toBe(403);
    expect(resend.sent.length).toBe(2);
  });

  test('EM-02 promoter resend: 10 minute window, then 5 attempt cap', async () => {
    db.row = payload({ caller_role: 'promoter', status: 'accepted' });
    expect((await (await call('decision')).json()).sent.length).toBe(1);
    let j = await (await call('decision', true)).json();
    expect(j.skipped).toEqual(['decision_accepted:wait']);
    for (let i = 0; i < 4; i++) { now += 11 * 60_000; j = await (await call('decision', true)).json(); expect(j.sent.length).toBe(1); }
    now += 11 * 60_000;
    j = await (await call('decision', true)).json();
    expect(j.skipped).toEqual(['decision_accepted:limit']);
    expect(resend.sent.length).toBe(5);
  });

  test('EM-03 a failed send clears the marker and keeps the row unsent, so a retry goes out', async () => {
    resend.fail = true;
    const res = await call('received');
    expect(res.status).toBe(502);
    expect(db.log.received.sent).toBeNull(); expect(db.log.received.attempt).toBeNull(); expect(db.log.received.count).toBe(1);
    resend.fail = false;
    const j = await (await call('received')).json();
    expect(j.sent.map((s) => s.kind)).toEqual(['received', 'notice']);
  });

  test('031 string stamps read as sent', async () => {
    db.log = { received: '2026-10-29T11:43:48Z', notice: '2026-10-29T11:43:49Z' };
    const j = await (await call('received')).json();
    expect(j.skipped).toEqual(['received:already_notified', 'notice:already_notified']);
  });

  test('EM-04 the payload call carries the server key; missing key is 503 before any call', async () => {
    await call('received');
    expect(db.keys).toEqual([process.env.ZT_MAIL_KEY]);
    const saved = process.env.ZT_MAIL_KEY; delete process.env.ZT_MAIL_KEY;
    const res = await call('received');
    process.env.ZT_MAIL_KEY = saved;
    expect(res.status).toBe(503);
  });

  test('accepted (032) sends the decision mail in place of received', async () => {
    db.row = payload({ status: 'accepted' });
    const j = await (await call('received')).json();
    expect(j.sent.map((s) => s.kind)).toEqual(['decision_accepted', 'notice']);
  });

  test('promoter notice with no owner address is reported, athlete mail still goes', async () => {
    db.row = payload({ promoter_email: null });
    const j = await (await call('received')).json();
    expect(j.sent.map((s) => s.kind)).toEqual(['received']);
    expect(j.skipped).toEqual(['notice:no_address']);
  });
});

describe('describeEmailResult (EM-05)', async () => {
  const { describeEmailResult } = await import(`${ROOT}/lib/email/client.ts`);
  test('athlete hears only about their own confirmation', () => {
    expect(describeEmailResult({ ok: true, sent: [{ kind: 'received', to: 'a@x' }], skipped: ['notice:no_address'] }, 'athlete')).toBe('A confirmation is on its way to a@x.');
    expect(describeEmailResult({ ok: true, sent: [], skipped: ['received:no_address', 'notice:no_address'] }, 'athlete')).toBeNull();
  });
  test('promoter: athlete-address and owner-address problems read differently', () => {
    expect(describeEmailResult({ ok: true, sent: [], skipped: ['decision_accepted:no_address'] }, 'promoter')).toBe('No email address on file for this athlete.');
    expect(describeEmailResult({ ok: true, sent: [], skipped: ['received:already_notified', 'notice:no_address'] }, 'promoter')).toBe('Already emailed earlier.');
    expect(describeEmailResult({ ok: true, sent: [{ kind: 'received', to: 'a@x' }], skipped: ['notice:no_address'] }, 'promoter')).toBe('Emailed a@x.');
    expect(describeEmailResult({ ok: true, sent: [], skipped: ['notice:no_address'] }, 'promoter')).toBe('Your account has no confirmed email, so you will not get new-entry notices.');
    expect(describeEmailResult({ ok: true, sent: [], skipped: ['decision_accepted:wait'] }, 'promoter')).toBe('Emailed in the last 10 minutes; try again later.');
  });
});
