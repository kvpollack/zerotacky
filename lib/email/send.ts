// Server-side helpers shared by the mail routes (031): a PostgREST rpc call with the caller's own token, and one
// Resend send. No service key anywhere; the database decides who may ask for what.
import { EMAIL_FROM, EMAIL_REPLY_TO } from './claimApproved';

export async function rpcAsUser<T>(url: string, anon: string, token: string, fn: string, args: Record<string, unknown>): Promise<T> {
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

export interface Outbound { to: string; subject: string; text: string; html: string; tag: string; replyTo?: string | null; unsubscribe?: string | null }

function resendBody(m: Outbound) {
  return {
    from: EMAIL_FROM, to: [m.to], reply_to: m.replyTo || EMAIL_REPLY_TO, subject: m.subject, text: m.text, html: m.html,
    tags: [{ name: 'kind', value: m.tag }],
    // 042: one-click unsubscribe for broadcasts and reminders (RFC 8058 header; mail clients surface it as a button)
    ...(m.unsubscribe ? { headers: { 'List-Unsubscribe': `<${m.unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
  };
}

/** One Resend batch call (at most 100 messages; the caller chunks). All-or-nothing on the provider side.
 * `idempotencyKey` (043, BC-02): the same key with the same payload inside 24 h is delivered once; a retried chunk must
 * therefore have the same members in the same order, which the database claim guarantees (id order).
 * Outcome classes (BC-07): `sent` with one provider id per message; `retry` for 429/5xx/network/timeout (rows stay
 * queued); `rejected` for any other non-2xx (rows fail). `detail` is for the server record only, never for the browser. */
export type BatchOutcome =
  | { kind: 'sent'; ids: Array<string | null> }
  | { kind: 'retry'; detail: string }
  | { kind: 'rejected'; detail: string };

export async function sendBatchViaResend(key: string, mails: Outbound[], opts: { idempotencyKey?: string; timeoutMs?: number } = {}): Promise<BatchOutcome> {
  if (mails.length === 0) return { kind: 'sent', ids: [] };
  if (mails.length > 100) throw new Error('sendBatchViaResend: at most 100 messages per call');
  let res: Response;
  try {
    res = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
      },
      body: JSON.stringify(mails.map(resendBody)),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
    });
  } catch (e) {
    return { kind: 'retry', detail: `network: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300) };
  }
  if (!res.ok) {
    const detail = `Resend ${res.status}: ${(await res.text().catch(() => '')).slice(0, 250)}`;
    return res.status === 429 || res.status >= 500 ? { kind: 'retry', detail } : { kind: 'rejected', detail };
  }
  const j = (await res.json().catch(() => ({}))) as { data?: Array<{ id?: string }> };
  const ids = j.data ?? [];
  return { kind: 'sent', ids: mails.map((_, k) => ids[k]?.id ?? null) };
}

export async function sendViaResend(key: string, m: Outbound): Promise<{ id: string | null }> {
  const send = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(resendBody(m)),
    signal: AbortSignal.timeout(15000),
  });
  if (!send.ok) {
    const detail = await send.text().catch(() => '');
    throw new Error(`Resend refused the message (${send.status}): ${detail.slice(0, 300)}`);
  }
  const j = (await send.json().catch(() => ({}))) as { id?: string };
  return { id: j.id ?? null };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
