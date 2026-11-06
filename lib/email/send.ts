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

/** Up to 100 messages in one call (Resend batch). Returns one id or error per message, in order. */
export async function sendBatchViaResend(key: string, mails: Outbound[]): Promise<Array<{ id: string | null; error: string | null }>> {
  const out: Array<{ id: string | null; error: string | null }> = [];
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100);
    try {
      const res = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk.map(resendBody)),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        for (const _ of chunk) out.push({ id: null, error: `Resend refused the batch (${res.status}): ${detail}` });
        continue;
      }
      const j = (await res.json().catch(() => ({}))) as { data?: Array<{ id?: string }> };
      const ids = j.data ?? [];
      chunk.forEach((_, k) => out.push({ id: ids[k]?.id ?? null, error: ids[k]?.id ? null : 'no id returned' }));
    } catch (e) {
      for (const _ of chunk) out.push({ id: null, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
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
