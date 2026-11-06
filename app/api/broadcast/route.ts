import { NextResponse } from 'next/server';
import { rpcAsUser, UUID } from '@/lib/email/send';
import { BROADCAST_LIMITS, type BroadcastAudience } from '@/lib/email/broadcast';
import { readMailEnv, runBroadcast } from '@/lib/email/broadcastRun';
import { siteUrl } from '@/lib/website/siteUrl';

// POST /api/broadcast   Authorization: Bearer <promoter's Supabase access token>
//   { meetId, subject, body, audience: 'accepted' | 'all_active', test?: boolean }   -> create and send
//   { broadcastId }                                                                   -> resume one that stopped part way
// -> { ok: true, id, kind, test_only, recipients, sent, failed, errors? } | { error }
//
// 042 (11/5, feature gaps #10). The promoter writes a subject and a few paragraphs; zt_create_broadcast checks they own
// the meet, applies the limits (3 sends per meet per day, 10 tests per promoter per day, 500 recipients), snapshots the
// recipient list, and a test puts one row addressed to the promoter's own confirmed email. The route then claims the
// queued rows, sends them through Resend in batches of 100 with reply-to set to the promoter and a one-click
// unsubscribe, and records sent/failed per recipient. Addresses never leave the server; the browser gets counts.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const envRead = readMailEnv(siteUrl().origin);
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if ('missing' in envRead) return NextResponse.json({ error: envRead.missing }, { status: 503 });
  const env = envRead.env;

  let body: { meetId?: unknown; subject?: unknown; body?: unknown; audience?: unknown; test?: unknown; broadcastId?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { /* empty body */ }

  let broadcastId = typeof body.broadcastId === 'string' ? body.broadcastId.trim() : '';
  let created: number | null = null;
  if (!broadcastId) {
    const meetId = typeof body.meetId === 'string' ? body.meetId.trim() : '';
    if (!UUID.test(meetId)) return NextResponse.json({ error: 'meetId must be a uuid.' }, { status: 400 });
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const text = typeof body.body === 'string' ? body.body.replace(/\r\n?/g, '\n').trim() : '';
    if (!subject) return NextResponse.json({ error: 'Subject is required.' }, { status: 400 });
    if (subject.length > BROADCAST_LIMITS.subject) return NextResponse.json({ error: `Subject is limited to ${BROADCAST_LIMITS.subject} characters.` }, { status: 400 });
    if (!text) return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    if (text.length > BROADCAST_LIMITS.body) return NextResponse.json({ error: `Message is limited to ${BROADCAST_LIMITS.body} characters.` }, { status: 400 });
    const audience: BroadcastAudience = body.audience === 'all_active' ? 'all_active' : 'accepted';
    const test = body.test === true;
    try {
      const r = await rpcAsUser<{ id: string; recipients: number }>(env.supaUrl, env.anon, token, 'zt_create_broadcast',
        { p_meet: meetId, p_subject: subject, p_body: text, p_audience: audience, p_test: test, p_key: env.mailKey });
      broadcastId = r.id; created = r.recipients;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: msg.replace(/^zt_create_broadcast:\s*/, '') }, { status: /access|sign in/i.test(msg) ? 403 : 400 });
    }
    if (created === 0) return NextResponse.json({ ok: true, id: broadcastId, recipients: 0, sent: 0, failed: 0 });
  } else if (!UUID.test(broadcastId)) {
    return NextResponse.json({ error: 'broadcastId must be a uuid.' }, { status: 400 });
  }

  try {
    const r = await runBroadcast(env, token, broadcastId);
    if (r.sent === 0 && r.failed > 0) return NextResponse.json({ error: r.errors[0] || 'Every send failed.', ...r }, { status: 502 });
    return NextResponse.json({ ok: true, ...r, ...(r.errors.length ? {} : { errors: undefined }) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg.replace(/^zt_broadcast_payload:\s*/, '') }, { status: /access|sign in/i.test(msg) ? 403 : 400 });
  }
}
