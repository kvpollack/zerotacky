import { NextResponse } from 'next/server';
import { rpcAsUser, UUID } from '@/lib/email/send';

// /api/unsubscribe?r=<registration id>&t=<mail token>   (042, feature gaps #10)
//   POST: the RFC 8058 one-click unsubscribe a mail client fires from its own button; opts the registration out, 200.
//   GET:  a human landed here from that same header; send them to the page with the confirm key.
// The token is per registration (registrations.mail_token); it proves the link came from a mail we sent.
export const dynamic = 'force-dynamic';

function readParams(req: Request): { r: string; t: string } | null {
  const u = new URL(req.url);
  const r = (u.searchParams.get('r') ?? '').trim();
  const t = (u.searchParams.get('t') ?? '').trim();
  return UUID.test(r) && UUID.test(t) ? { r, t } : null;
}

export async function GET(req: Request) {
  const p = readParams(req);
  const u = new URL(req.url);
  const dest = new URL('/unsubscribe', u.origin);
  if (p) { dest.searchParams.set('r', p.r); dest.searchParams.set('t', p.t); }
  return NextResponse.redirect(dest, 303);
}

export async function POST(req: Request) {
  const p = readParams(req);
  if (!p) return NextResponse.json({ error: 'Bad link.' }, { status: 400 });
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !anon) return NextResponse.json({ error: 'Accounts are not configured on this build.' }, { status: 503 });
  try {
    const r = await rpcAsUser<{ meet_name: string } | null>(supaUrl, anon, anon, 'zt_mail_opt_out', { p_reg: p.r, p_token: p.t });
    if (!r) return NextResponse.json({ error: 'Bad link.' }, { status: 404 });
    return NextResponse.json({ ok: true, meet: r.meet_name });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
