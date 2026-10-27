import { NextResponse } from 'next/server';
import { claimApprovedEmail, EMAIL_FROM, EMAIL_REPLY_TO } from '@/lib/email/claimApproved';
import { siteUrl } from '@/lib/website/siteUrl';

// POST /api/claim-approved  { claimId: string, force?: boolean }   Authorization: Bearer <admin's Supabase access token>
// -> { ok: true, to, skipped?: 'already_notified' } | { error }
//
// Sends the claim-approved email through Resend (027, 10/27). The caller's token is forwarded to Supabase, so the
// admin check is the database's (zt_require_admin inside zt_claim_email_payload); this route holds no service key.
// The recipient and gym come from the database, never from the request body. RESEND_API_KEY lives in Vercel env.
export const dynamic = 'force-dynamic';

interface Payload {
  claim_id: string;
  kind: string;
  status: string;
  to_email: string | null;
  to_name: string;
  gym_id: string;
  gym_name: string;
  gym_slug: string;
  gym_status: string;
  notified_at: string | null;
}

async function rpc<T>(url: string, anon: string, token: string, fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try { msg = (JSON.parse(text) as { message?: string }).message ?? text; } catch { /* plain text */ }
    throw new Error(`${fn}: ${msg || res.status}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}

export async function POST(req: Request) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  if (!supaUrl || !anon) return NextResponse.json({ error: 'Accounts are not configured on this build.' }, { status: 503 });

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (!resendKey) return NextResponse.json({ error: 'Email is not configured (RESEND_API_KEY missing).' }, { status: 503 });

  let body: { claimId?: unknown; force?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { /* empty body */ }
  const claimId = typeof body.claimId === 'string' ? body.claimId.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claimId)) {
    return NextResponse.json({ error: 'claimId must be a uuid.' }, { status: 400 });
  }
  const force = body.force === true;

  let p: Payload;
  try {
    p = await rpc<Payload>(supaUrl, anon, token, 'zt_claim_email_payload', { p_claim: claimId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: /admin only/i.test(msg) ? 403 : 400 });
  }

  if (p.kind !== 'claim') return NextResponse.json({ error: 'Only gym claims get an approval email.' }, { status: 400 });
  if (p.status !== 'approved' || p.gym_status !== 'claimed') {
    return NextResponse.json({ error: `Claim is ${p.status} and the gym is ${p.gym_status}; nothing to announce.` }, { status: 409 });
  }
  if (!p.to_email) return NextResponse.json({ error: 'The claimant has no email address on file.' }, { status: 409 });
  if (p.notified_at && !force) return NextResponse.json({ ok: true, to: p.to_email, skipped: 'already_notified' });

  const mail = claimApprovedEmail({
    toName: p.to_name,
    gymName: p.gym_name,
    gymSlug: p.gym_slug,
    siteUrl: siteUrl().origin,
  });

  const send = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [p.to_email],
      reply_to: EMAIL_REPLY_TO,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      tags: [{ name: 'kind', value: 'claim_approved' }],
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!send.ok) {
    const detail = await send.text().catch(() => '');
    return NextResponse.json({ error: `Resend refused the message (${send.status}): ${detail.slice(0, 300)}` }, { status: 502 });
  }
  const sent = (await send.json().catch(() => ({}))) as { id?: string };

  try {
    await rpc<null>(supaUrl, anon, token, 'zt_mark_claim_notified', { p_claim: claimId });
  } catch {
    /* the email went out; a missing stamp only risks a duplicate on a retry */
  }
  return NextResponse.json({ ok: true, to: p.to_email, id: sent.id ?? null });
}
