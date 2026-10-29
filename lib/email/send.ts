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

export interface Outbound { to: string; subject: string; text: string; html: string; tag: string }

export async function sendViaResend(key: string, m: Outbound): Promise<{ id: string | null }> {
  const send = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to: [m.to], reply_to: EMAIL_REPLY_TO, subject: m.subject, text: m.text, html: m.html, tags: [{ name: 'kind', value: m.tag }] }),
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
