import { NextResponse } from 'next/server';
import { rpcAsUser, sendViaResend, UUID } from '@/lib/email/send';
import {
  emailLogKey, promoterNoticeEmail, registrationDecisionEmail, registrationReceivedEmail,
  type RegistrationEmailKind, type RegistrationEmailPayload,
} from '@/lib/email/registration';
import { siteUrl } from '@/lib/website/siteUrl';

// POST /api/registration-email  { registrationId: string, kind: 'received' | 'decision', force?: boolean }
//   Authorization: Bearer <caller's Supabase access token>
// -> { ok: true, sent: [{ kind, to }], skipped: [kind] } | { error }
//
// 031 (10/28). 'received' is asked for by the athlete's browser right after zt_submit_registration and sends the
// athlete's confirmation plus the promoter's notice. 'decision' is asked for by the promoter's browser after
// zt_set_registration_status and sends accepted/declined to the athlete. Recipients come from the database
// (zt_registration_email_payload, which also checks the caller is the registrant or the meet's owner/member); the
// request body only names the row.
//
// 033 (10/29, Astra EM-01..04): every database call also carries ZT_MAIL_KEY, a server-only secret whose hash lives in
// zt_server_config, so a browser holding the same bearer token can neither read recipient addresses nor stamp the log.
// Before each send the route asks zt_reserve_registration_email for an atomic claim (row lock, already-sent check,
// in-flight marker, 5 attempts per kind, 10 minutes between forced resends, registrants may never force); after the
// send zt_confirm_registration_email records the outcome. A waitlisted entry gets the waitlist wording of 'received'.
export const dynamic = 'force-dynamic';

type Reservation = { decision: 'go' } | { decision: 'skip'; reason: string };

export async function POST(req: Request) {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const mailKey = process.env.ZT_MAIL_KEY;
  if (!supaUrl || !anon) return NextResponse.json({ error: 'Accounts are not configured on this build.' }, { status: 503 });

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (!resendKey) return NextResponse.json({ error: 'Email is not configured (RESEND_API_KEY missing).' }, { status: 503 });
  if (!mailKey) return NextResponse.json({ error: 'Email is not configured (ZT_MAIL_KEY missing).' }, { status: 503 });

  let body: { registrationId?: unknown; kind?: unknown; force?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { /* empty body */ }
  const id = typeof body.registrationId === 'string' ? body.registrationId.trim() : '';
  if (!UUID.test(id)) return NextResponse.json({ error: 'registrationId must be a uuid.' }, { status: 400 });
  const kind = body.kind === 'received' || body.kind === 'decision' ? (body.kind as RegistrationEmailKind) : null;
  if (!kind) return NextResponse.json({ error: "kind must be 'received' or 'decision'." }, { status: 400 });
  const force = body.force === true;

  let p: RegistrationEmailPayload;
  try {
    p = await rpcAsUser<RegistrationEmailPayload>(supaUrl, anon, token, 'zt_registration_email_payload', { p_reg: id, p_key: mailKey });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: /access|sign in/i.test(msg) ? 403 : 400 });
  }
  if (p.is_demo) return NextResponse.json({ error: 'Demo meets do not send email.' }, { status: 409 });

  const site = siteUrl().origin;
  const plan: Array<{ key: string; to: string | null; build: () => { subject: string; text: string; html: string } }> = [];

  if (kind === 'received') {
    if (p.caller_role !== 'athlete' && p.caller_role !== 'promoter') return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
    if (force && p.caller_role !== 'promoter') return NextResponse.json({ error: 'Only the promoter can resend.' }, { status: 403 });
    // 032: an auto-accepted entry skips "received" and gets the accepted mail straight away; the promoter still hears
    if (p.status === 'accepted') {
      plan.push({ key: emailLogKey('decision', p.status), to: p.athlete_email, build: () => registrationDecisionEmail(p, site) });
    } else if (p.status === 'pending' || p.status === 'waitlist') {
      plan.push({ key: emailLogKey('received', p.status), to: p.athlete_email, build: () => registrationReceivedEmail(p, site) });
    } else {
      return NextResponse.json({ error: `Registration is ${p.status}; the received email only goes out for a new entry.` }, { status: 409 });
    }
    plan.push({ key: emailLogKey('notice', p.status), to: p.promoter_email, build: () => promoterNoticeEmail(p, site) });
  } else {
    if (p.caller_role !== 'promoter') return NextResponse.json({ error: 'Only the promoter can send a decision email.' }, { status: 403 });
    if (p.status !== 'accepted' && p.status !== 'declined') {
      return NextResponse.json({ error: `Registration is ${p.status}; decision emails go out for accepted or declined.` }, { status: 409 });
    }
    plan.push({ key: emailLogKey('decision', p.status), to: p.athlete_email, build: () => registrationDecisionEmail(p, site) });
  }

  const sent: Array<{ kind: string; to: string }> = [];
  const skipped: string[] = [];
  const errors: string[] = [];
  for (const step of plan) {
    if (!step.to) { skipped.push(`${step.key}:no_address`); continue; }
    let claim: Reservation;
    try {
      claim = await rpcAsUser<Reservation>(supaUrl, anon, token, 'zt_reserve_registration_email', { p_reg: id, p_kind: step.key, p_force: force, p_key: mailKey });
    } catch (e) {
      errors.push(`${step.key}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (claim.decision !== 'go') { skipped.push(`${step.key}:${claim.reason}`); continue; }
    let ok = false;
    try {
      const m = step.build();
      await sendViaResend(resendKey, { to: step.to, subject: m.subject, text: m.text, html: m.html, tag: `registration_${step.key}` });
      ok = true;
      sent.push({ kind: step.key, to: step.to });
    } catch (e) {
      errors.push(`${step.key}: ${e instanceof Error ? e.message : String(e)}`);
    }
    try {
      await rpcAsUser<null>(supaUrl, anon, token, 'zt_confirm_registration_email', { p_reg: id, p_kind: step.key, p_ok: ok, p_key: mailKey });
    } catch { /* the attempt marker expires on its own after two minutes; a sent mail then risks one duplicate on retry */ }
  }
  if (sent.length === 0 && errors.length > 0) return NextResponse.json({ error: errors.join('; ') }, { status: 502 });
  return NextResponse.json({ ok: true, sent, skipped, ...(errors.length ? { errors } : {}) });
}
