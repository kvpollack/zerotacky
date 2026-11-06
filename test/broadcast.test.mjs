import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = process.env.ZT_ROOT || '..';
const B = await import(`${ROOT}/lib/email/broadcast.ts`);
const C = await import(`${ROOT}/lib/email/client.ts`);

const SITE = 'https://www.zerotacky.com/';
const payload = (over = {}) => ({
  id: 'b1', kind: 'broadcast', audience: 'accepted', subject: 'Weigh-in moved to 7:00', body: 'Doors at 6:30.\nWeigh-in 7:00 to 8:15.\n\nParking behind the building.',
  test_only: false, meet_id: 'm1', meet_name: 'Iron Harbor Classic 2026', meet_date: '2026-11-14', meet_slug: 'iron-harbor-classic-2026',
  venue: { facilityName: 'Harbor Barbell', city: 'Tacoma', state: 'WA' }, promoter_email: 'promoter@example.com', promoter_name: 'Kurt P', promoter_contact: 'Text 555-0100',
  recipients: [], ...over,
});
const recip = (over = {}) => ({
  id: 'r1', registration_id: '11111111-1111-4111-8111-111111111111', email: 'ana@example.com', athlete_name: 'Ana Mandujano', division_name: 'Open Women',
  division_id: 'd-open-w', mail_token: '22222222-2222-4222-8222-222222222222', ...over,
});

describe('bodyParagraphs', () => {
  test('blank lines split, single newlines join, CRLF tolerated', () => {
    assert.deepEqual(B.bodyParagraphs('a\r\nb\r\n\r\n  c  \n\n\n'), ['a b', 'c']);
    assert.deepEqual(B.bodyParagraphs(''), []);
    assert.deepEqual(B.bodyParagraphs(null), []);
  });
});

describe('unsubscribe urls', () => {
  test('page link and header link share the token; none without a token', () => {
    const r = recip();
    assert.equal(B.unsubscribeUrl(SITE, r), 'https://www.zerotacky.com/unsubscribe?r=11111111-1111-4111-8111-111111111111&t=22222222-2222-4222-8222-222222222222');
    assert.equal(B.unsubscribePostUrl(SITE, r), 'https://www.zerotacky.com/api/unsubscribe?r=11111111-1111-4111-8111-111111111111&t=22222222-2222-4222-8222-222222222222');
    assert.equal(B.unsubscribeUrl(SITE, recip({ mail_token: null })), null);
    assert.equal(B.unsubscribeUrl(SITE, recip({ registration_id: null })), null);
  });
});

describe('broadcastEmail', () => {
  test('promoter words, first-name greeting, show link, unsubscribe in body and header', () => {
    const m = B.broadcastEmail(payload(), recip(), SITE);
    assert.equal(m.to, 'ana@example.com');
    assert.equal(m.subject, 'Weigh-in moved to 7:00');
    assert.match(m.text, /Hi Ana,/);
    assert.match(m.text, /Doors at 6:30\. Weigh-in 7:00 to 8:15\./);
    assert.match(m.text, /Parking behind the building\./);
    assert.match(m.text, /From Kurt P of Iron Harbor Classic 2026 \(Nov(ember)? 14, 2026\)/);
    assert.match(m.text, /https:\/\/www\.zerotacky\.com\/shows\/iron-harbor-classic-2026/);
    assert.match(m.text, /\/unsubscribe\?r=11111111/);
    assert.match(m.html, /Stop messages and reminders for this show/);
    assert.equal(m.unsubscribe, B.unsubscribePostUrl(SITE, recip()));
  });
  test('test send is marked in the subject and greets without a name', () => {
    const m = B.broadcastEmail(payload({ test_only: true }), recip({ athlete_name: 'Test send' }), SITE);
    assert.equal(m.subject, '[Test] Weigh-in moved to 7:00');
    assert.match(m.text, /Hi,/);
  });
  test('html escapes the promoter text', () => {
    const m = B.broadcastEmail(payload({ body: '<script>alert(1)</script> & stuff' }), recip(), SITE);
    assert.doesNotMatch(m.html, /<script>/);
    assert.match(m.html, /&lt;script&gt;|&amp; stuff/);
  });
});

describe('reminderEmail', () => {
  test('7-day: one week subject, prep sheet for the division as the key, venue and contact facts', () => {
    const m = B.reminderEmail(payload({ kind: 'reminder_7d' }), recip(), SITE, 'd-open-w');
    assert.equal(m.subject, 'Iron Harbor Classic 2026 is one week away');
    assert.match(m.text, /https:\/\/www\.zerotacky\.com\/shows\/iron-harbor-classic-2026\/prep\?division=d-open-w/);
    assert.match(m.text, /Harbor Barbell, Tacoma, WA/);
    assert.match(m.text, /Text 555-0100/);
    assert.match(m.text, /in Open Women/);
    assert.match(m.text, /\/unsubscribe\?r=/);
  });
  test('1-day: tomorrow subject, show page as the key, prep sheet without a division when none is known', () => {
    const m = B.reminderEmail(payload({ kind: 'reminder_1d', venue: null, promoter_contact: null }), recip({ division_name: '', division_id: null }), SITE, null);
    assert.equal(m.subject, 'Iron Harbor Classic 2026 is tomorrow');
    assert.match(m.text, /\/shows\/iron-harbor-classic-2026\/prep(\s|$)/m);
    assert.doesNotMatch(m.text, /Where/);
    assert.doesNotMatch(m.text, /Promoter contact/);
  });
  test('buildMail routes by kind', () => {
    assert.equal(B.buildMail(payload({ kind: 'reminder_1d' }), recip(), SITE).subject, 'Iron Harbor Classic 2026 is tomorrow');
    assert.equal(B.buildMail(payload(), recip(), SITE).subject, 'Weigh-in moved to 7:00');
  });
});

describe('reminderDue', () => {
  test('7 and 1 days out, nothing otherwise, bad input null', () => {
    assert.equal(B.reminderDue('2026-11-14', '2026-11-07'), 'reminder_7d');
    assert.equal(B.reminderDue('2026-11-14', '2026-11-13'), 'reminder_1d');
    assert.equal(B.reminderDue('2026-11-14', '2026-11-14'), null);
    assert.equal(B.reminderDue('2026-11-14', '2026-11-08'), null);
    assert.equal(B.reminderDue('nope', '2026-11-08'), null);
  });
});

describe('audienceCount', () => {
  const regs = [
    { status: 'accepted', email: 'A@x.com' }, { status: 'accepted', email: 'a@x.com' }, { status: 'accepted', email: '' },
    { status: 'pending', email: 'p@x.com' }, { status: 'waitlist', email: 'w@x.com' }, { status: 'declined', email: 'd@x.com' }, { status: 'withdrawn', email: 'q@x.com' },
  ];
  test('accepted dedupes by email and skips blanks; all_active adds pending and waitlist only', () => {
    assert.equal(B.audienceCount(regs, 'accepted'), 1);
    assert.equal(B.audienceCount(regs, 'all_active'), 3);
  });
});

describe('describeBroadcastResult', () => {
  const R = (o) => ({ ok: true, recipients: 0, sent: 0, failed: 0, unresolved: 0, remaining: 0, errors: [], ...o });
  test('wording for test, nobody, counts, errors', () => {
    assert.match(C.describeBroadcastResult(R({ recipients: 1, sent: 1 }), true), /Test sent to your account email/);
    assert.match(C.describeBroadcastResult(R({}), true), /confirmed email/);
    assert.match(C.describeBroadcastResult(R({ recipients: 1, unresolved: 1 }), true), /could not be recorded/);
    assert.match(C.describeBroadcastResult(R({}), false), /Nobody to send to/);
    assert.equal(C.describeBroadcastResult(R({ recipients: 12, sent: 11, failed: 1 }), false), 'Sent to 11 athletes; 1 failed.');
    assert.equal(C.describeBroadcastResult(R({ recipients: 1, sent: 1 }), false), 'Sent to 1 athlete.');
    assert.equal(C.describeBroadcastResult(R({ ok: false, error: 'Limit reached' }), false), 'Not sent: Limit reached');
  });
  test('BC-02: unrecorded and still-queued outcomes are named, never folded into success', () => {
    const s = C.describeBroadcastResult(R({ recipients: 100, sent: 50, unresolved: 50 }), false);
    assert.match(s, /Sent to 50 athletes; 50 not confirmed/);
    assert.match(s, /check the history before sending again/);
    assert.match(C.describeBroadcastResult(R({ recipients: 100, sent: 100, remaining: 200 }), false), /200 still queued \(resume from the history\)/);
  });
});

const RUN = await import(`${ROOT}/lib/email/broadcastRun.ts`);
const SEND = await import(`${ROOT}/lib/email/send.ts`);

describe('broadcastRun helpers (043)', () => {
  test('chunk idempotency key is deterministic over the same rows in the same order', () => {
    const k1 = RUN.chunkIdempotencyKey('b1', ['r1', 'r2', 'r3']);
    assert.equal(k1, RUN.chunkIdempotencyKey('b1', ['r1', 'r2', 'r3']));
    assert.notEqual(k1, RUN.chunkIdempotencyKey('b1', ['r1', 'r2']));
    assert.notEqual(k1, RUN.chunkIdempotencyKey('b2', ['r1', 'r2', 'r3']));
    assert.match(k1, /^zt-bc-b1-[0-9a-f]{32}$/);
  });
  test('BC-09: addresses are scrubbed from error text', () => {
    assert.equal(RUN.scrubAddresses('Resend 422: invalid to private-account@example.invalid, retry'), 'Resend 422: invalid to [address], retry');
    assert.equal(RUN.scrubAddresses('no address here'), 'no address here');
  });
});

describe('sendBatchViaResend outcome classes (043 BC-07)', () => {
  const mails = [{ to: 'a@x.com', subject: 's', text: 't', html: 'h', tag: 'k' }];
  const withFetch = async (impl, fn) => { const real = globalThis.fetch; globalThis.fetch = impl; try { return await fn(); } finally { globalThis.fetch = real; } };
  test('2xx -> sent with ids; idempotency header forwarded', async () => {
    let seen;
    const r = await withFetch(async (url, init) => { seen = init; return new Response(JSON.stringify({ data: [{ id: 'm1' }] }), { status: 200 }); },
      () => SEND.sendBatchViaResend('k', mails, { idempotencyKey: 'zt-bc-1-abc' }));
    assert.deepEqual(r, { kind: 'sent', ids: ['m1'] });
    assert.equal(seen.headers['Idempotency-Key'], 'zt-bc-1-abc');
  });
  test('429 and 5xx -> retry; 4xx -> rejected; network -> retry', async () => {
    const st = (s) => async () => new Response('x', { status: s });
    assert.equal((await withFetch(st(503), () => SEND.sendBatchViaResend('k', mails))).kind, 'retry');
    assert.equal((await withFetch(st(429), () => SEND.sendBatchViaResend('k', mails))).kind, 'retry');
    assert.equal((await withFetch(st(422), () => SEND.sendBatchViaResend('k', mails))).kind, 'rejected');
    assert.equal((await withFetch(async () => { throw new TypeError('fetch failed'); }, () => SEND.sendBatchViaResend('k', mails))).kind, 'retry');
  });
  test('empty batch is a no-op; more than 100 refused', async () => {
    assert.deepEqual(await SEND.sendBatchViaResend('k', []), { kind: 'sent', ids: [] });
    await assert.rejects(() => SEND.sendBatchViaResend('k', Array.from({ length: 101 }, () => mails[0])), /at most 100/);
  });
});
