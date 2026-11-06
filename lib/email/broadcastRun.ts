// Server-only: claim a broadcast's queued recipients, send them through Resend in batches, record the outcome (042).
// Shared by /api/broadcast (promoter's browser, their bearer token) and /api/cron/reminders (Vercel cron, no user; the
// database functions accept a null uid when the server key is right).
import { rpcAsUser, sendBatchViaResend, type Outbound } from './send';
import { buildMail, type BroadcastPayload } from './broadcast';

export interface MailEnv { supaUrl: string; anon: string; resendKey: string; mailKey: string; site: string }

export interface RunResult {
  id: string;
  kind: BroadcastPayload['kind'];
  test_only: boolean;
  recipients: number;   // claimed on this pass (0 = nothing left queued)
  sent: number;
  failed: number;
  errors: string[];
}

/** Read the mail environment or say which piece is missing. */
export function readMailEnv(site: string): { env: MailEnv } | { missing: string } {
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const mailKey = process.env.ZT_MAIL_KEY;
  if (!supaUrl || !anon) return { missing: 'Accounts are not configured on this build.' };
  if (!resendKey) return { missing: 'Email is not configured (RESEND_API_KEY missing).' };
  if (!mailKey) return { missing: 'Email is not configured (ZT_MAIL_KEY missing).' };
  return { env: { supaUrl, anon, resendKey, mailKey, site } };
}

/**
 * One pass over a broadcast. `token` is the promoter's access token, or the anon key for the cron (the functions then
 * run with auth.uid() null and rely on the server key alone). Recipients already claimed in the last two minutes are
 * skipped, so a retry after a half-finished pass sends only what is still queued.
 */
export async function runBroadcast(env: MailEnv, token: string, broadcastId: string): Promise<RunResult> {
  const p = await rpcAsUser<BroadcastPayload>(env.supaUrl, env.anon, token, 'zt_broadcast_payload', { p_broadcast: broadcastId, p_key: env.mailKey });
  const out: RunResult = { id: p.id, kind: p.kind, test_only: p.test_only, recipients: p.recipients.length, sent: 0, failed: 0, errors: [] };
  if (p.recipients.length === 0) return out;

  const tag = `broadcast_${p.kind}${p.test_only ? '_test' : ''}`;
  const mails: Outbound[] = p.recipients.map((r) => {
    const m = buildMail(p, r, env.site, r.division_id ?? null);
    return { to: m.to, subject: m.subject, text: m.text, html: m.html, tag, replyTo: p.promoter_email, unsubscribe: m.unsubscribe };
  });

  let results: Array<{ id: string | null; error: string | null }>;
  try {
    results = await sendBatchViaResend(env.resendKey, mails);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    results = p.recipients.map(() => ({ id: null, error: msg }));
  }

  const marks = p.recipients.map((r, i) => {
    const ok = !!results[i]?.id && !results[i]?.error;
    if (ok) out.sent += 1; else { out.failed += 1; if (results[i]?.error) out.errors.push(results[i].error as string); }
    return { id: r.id, ok, error: results[i]?.error ?? null };
  });
  for (let i = 0; i < marks.length; i += 100) {
    try {
      await rpcAsUser<null>(env.supaUrl, env.anon, token, 'zt_broadcast_mark_many', { p_results: marks.slice(i, i + 100), p_key: env.mailKey });
    } catch (e) {
      // the claim expires after two minutes; a retry then sends those rows again, so say so rather than hide it
      out.errors.push(`record outcome: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  out.errors = Array.from(new Set(out.errors)).slice(0, 5);
  return out;
}
