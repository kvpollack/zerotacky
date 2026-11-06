import { NextResponse } from 'next/server';
import { rpcAsUser, UUID } from '@/lib/email/send';
import { BROADCAST_LIMITS, type BroadcastAudience } from '@/lib/email/broadcast';
import { readMailEnv, runBroadcast, scrubAddresses } from '@/lib/email/broadcastRun';
import { siteUrl } from '@/lib/website/siteUrl';

// POST /api/broadcast   Authorization: Bearer <promoter's Supabase access token>
//   { meetId, subject, body, audience: 'accepted' | 'all_active', test?: boolean }   -> create and send
//   { broadcastId }                                                                   -> resume one that stopped part way
// -> { ok: true, id, kind, test_only, recipients, sent, failed, unresolved, remaining, errors: code[] } | { error }
//
// 042 (11/5, feature gaps #10), hardened 043 (11/6, Astra BC-01..09). The promoter writes a subject and a few
// paragraphs; zt_create_broadcast checks they own the meet, applies the limits (3 sends per meet per day, 10 tests per
// promoter per day, 500 recipients), snapshots the recipient list, and a test puts one row addressed to the promoter's
// own confirmed email. runBroadcast then claims the queued rows in chunks, sends each chunk through Resend with a
// deterministic idempotency key, reply-to set to the promoter and a one-click unsubscribe, and records sent/failed per
// chunk. Every database call here runs as the signed-in user (p_server false): an anonymous bearer gets "Sign in
// required" from the database, and only the meet's owner or a member can create, resume or record (BC-01). Addresses
// never leave the server; errors reach the browser as codes, and any address in a message is scrubbed (BC-09).
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const BUDGET_MS = 40_000;

function publicMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  return scrubAddresses(raw.replace(/^zt_[a-z_]+:\s*/, '')).slice(0, 200);
}

export async function POST(req: Request) {
  const started = Date.now();
  const envRead = readMailEnv(siteUrl().origin);
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if ('missing' in envRead) return NextResponse.json({ error: envRead.missing }, { status: 503 });
  const env = envRead.env;

  let body: { meetId?: unknown; subject?: unknown; body?: unknown; audience?: unknown; test?: unknown; broadcastId?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { /* empty body */ }

  let broadcastId = typeof body.broadcastId === 'string' ? body.broadcastId.trim() : '';
  if (!broadcastId) {
    const meetId = typeof body.meetId === 'string' ? body.meetId.trim() : '';
    if (!UUID.test(meetId)) return NextResponse.json({ error: 'meetId must be a uuid.' }, { status: 400 });
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const text = typeof body.body === 'string' ? body.body.replace(/\r\n?/g, '\n').trim() : '';
    if (!subject) return NextResponse.json({ error: 'Subject is required.' }, { status: 400 });
    if (/[\u0000-\u001f\u007f]/.test(subject)) return NextResponse.json({ error: 'The subject cannot contain line breaks or control characters.' }, { status: 400 });
    if (subject.length > BROADCAST_LIMITS.subject) return NextResponse.json({ error: `Subject is limited to ${BROADCAST_LIMITS.subject} characters.` }, { status: 400 });
    if (!text) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    if (text.length > BROADCAST_LIMITS.body) return NextResponse.json({ error: `Message is limited to ${BROADCAST_LIMITS.body} characters.` }, { status: 400 });
    const audience: BroadcastAudience = body.audience === 'all_active' ? 'all_active' : 'accepted';
    const test = body.test === true;
    try {
      const r = await rpcAsUser<{ id: string; recipients: number }>(env.supaUrl, env.anon, token, 'zt_create_broadcast',
        { p_meet: meetId, p_subject: subject, p_body: text, p_audience: audience, p_test: test, p_key: env.mailKey });
      broadcastId = r.id;
    } catch (e) {
      const msg = publicMessage(e);
      return NextResponse.json({ error: msg }, { status: /access|sign in/i.test(msg) ? 403 : 400 });
    }
  } else if (!UUID.test(broadcastId)) {
    return NextResponse.json({ error: 'broadcastId must be a uuid.' }, { status: 400 });
  }

  try {
    const r = await runBroadcast(env, token, broadcastId, { server: false, deadlineMs: started + BUDGET_MS });
    if (r.sent === 0 && r.unresolved === 0 && r.failed + r.remaining > 0) {
      return NextResponse.json({ error: r.errors[0] === 'provider_unavailable' ? 'The email service is unavailable right now; the message stays queued. Resume it from the history in a few minutes.' : 'The email service rejected the message.', ...r }, { status: 502 });
    }
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const msg = publicMessage(e);
    return NextResponse.json({ error: msg }, { status: /access|sign in/i.test(msg) ? 403 : 400 });
  }
}
