// Server-only: drive one broadcast through Resend in chunks and record every outcome (042, hardened in 043).
// Shared by /api/broadcast (promoter's browser, their bearer token, server = false) and /api/cron/reminders (anon key,
// server = true: the database accepts a null uid only with that flag, BC-01).
//
// One pass = repeat { claim up to 100 queued rows (id order) -> one batch call with a deterministic idempotency key ->
// record the chunk's outcome } until nothing is claimable or the time budget is spent (BC-08). A transient provider
// failure leaves the chunk queued with the error noted (BC-07); a rejection fails it; a failure to record an outcome
// after a delivery leaves the rows queued and is reported as `unresolved` (BC-02): the retry will reuse the same
// idempotency key, so the provider delivers once. The browser only ever sees counts and public error codes (BC-09).
import { createHash } from 'node:crypto';
import { rpcAsUser, sendBatchViaResend, type Outbound } from './send';
import { buildMail, type BroadcastPayload } from './broadcast';

export interface MailEnv { supaUrl: string; anon: string; resendKey: string; mailKey: string; site: string }

export type PublicError = 'provider_unavailable' | 'provider_rejected' | 'record_failed' | 'time_budget';

export interface RunResult {
  id: string;
  kind: BroadcastPayload['kind'];
  test_only: boolean;
  recipients: number;   // claimed on this pass
  sent: number;
  failed: number;
  unresolved: number;   // delivered (or attempted) but the outcome could not be recorded; still queued, see history
  remaining: number;    // still queued when the pass ended (transient failures, time budget)
  closed?: 'ineligible';
  errors: PublicError[];
}

export const PUBLIC_ERROR_TEXT: Record<PublicError, string> = {
  provider_unavailable: 'the email service was unavailable; the rest stays queued and will be retried',
  provider_rejected: 'the email service rejected a batch',
  record_failed: 'the outcome could not be recorded for some athletes; check the history before sending again',
  time_budget: 'stopped before the end to stay inside the time limit; the rest stays queued',
};

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

/** Deterministic per chunk: same broadcast, same recipient rows (id order) -> same key (BC-02). */
export function chunkIdempotencyKey(broadcastId: string, recipientIds: string[]): string {
  const h = createHash('sha256').update(recipientIds.join('\n')).digest('hex').slice(0, 32);
  return `zt-bc-${broadcastId}-${h}`;
}

/** Addresses never travel in an error string (BC-09). */
export function scrubAddresses(s: string): string {
  return s.replace(/[^\s@<>"'(),;:]+@[^\s@<>"'(),;:]+/g, '[address]');
}

export interface RunOptions { server: boolean; deadlineMs: number; chunk?: number }

export async function runBroadcast(env: MailEnv, token: string, broadcastId: string, opts: RunOptions): Promise<RunResult> {
  const out: RunResult = { id: broadcastId, kind: 'broadcast', test_only: false, recipients: 0, sent: 0, failed: 0, unresolved: 0, remaining: 0, errors: [] };
  const push = (e: PublicError) => { if (!out.errors.includes(e)) out.errors.push(e); };
  const limit = Math.max(1, Math.min(opts.chunk ?? 100, 100));

  for (;;) {
    const p = await rpcAsUser<BroadcastPayload & { remaining: number; closed?: 'ineligible' }>(
      env.supaUrl, env.anon, token, 'zt_broadcast_payload', { p_broadcast: broadcastId, p_key: env.mailKey, p_server: opts.server, p_limit: limit });
    out.id = p.id; out.kind = p.kind; out.test_only = p.test_only; out.remaining = p.remaining ?? 0;
    if (p.closed) { out.closed = p.closed; break; }
    if (p.recipients.length === 0) break;
    out.recipients += p.recipients.length;

    const tag = `broadcast_${p.kind}${p.test_only ? '_test' : ''}`;
    const mails: Outbound[] = p.recipients.map((r) => {
      const m = buildMail(p, r, env.site, r.division_id ?? null);
      return { to: m.to, subject: m.subject, text: m.text, html: m.html, tag, replyTo: p.promoter_email, unsubscribe: m.unsubscribe };
    });
    const outcome = await sendBatchViaResend(env.resendKey, mails, { idempotencyKey: chunkIdempotencyKey(p.id, p.recipients.map((r) => r.id)), timeoutMs: 15000 });

    let marks: Array<{ id: string; ok: boolean; retry: boolean; error: string | null; provider_id: string | null }>;
    if (outcome.kind === 'sent') {
      marks = p.recipients.map((r, i) => ({ id: r.id, ok: !!outcome.ids[i], retry: false, error: outcome.ids[i] ? null : 'no provider id returned', provider_id: outcome.ids[i] }));
    } else {
      const retry = outcome.kind === 'retry';
      marks = p.recipients.map((r) => ({ id: r.id, ok: false, retry, error: outcome.detail, provider_id: null }));
      push(retry ? 'provider_unavailable' : 'provider_rejected');
    }

    let recorded = false;
    for (let attempt = 0; attempt < 2 && !recorded; attempt++) {
      try {
        await rpcAsUser<null>(env.supaUrl, env.anon, token, 'zt_broadcast_mark_many', { p_results: marks, p_key: env.mailKey, p_server: opts.server });
        recorded = true;
      } catch { /* try once more, then report */ }
    }
    if (recorded) {
      for (const m of marks) { if (m.ok) out.sent += 1; else if (!m.retry) out.failed += 1; }
      if (outcome.kind === 'retry') { out.remaining += p.recipients.length; break; }   // no point hammering a provider that just said wait
    } else {
      out.unresolved += p.recipients.length;
      push('record_failed');
      break;   // rows stay claimed for two minutes; a later pass reuses the same idempotency key
    }
    if (out.remaining === 0) break;
    if (Date.now() > opts.deadlineMs) { push('time_budget'); break; }
  }
  return out;
}
