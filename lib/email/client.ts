// Browser side of the registration emails (031): ask the server to send, with the session token, and never let a
// mail problem interrupt the thing the user actually did (the registration or the decision went through already).
import type { SupabaseClient } from '@supabase/supabase-js';

export interface EmailRequestResult { ok: boolean; sent: Array<{ kind: string; to: string }>; skipped: string[]; error?: string }

export async function requestRegistrationEmail(
  sb: SupabaseClient | null,
  registrationId: string,
  kind: 'received' | 'decision',
  opts: { force?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<EmailRequestResult> {
  const none: EmailRequestResult = { ok: false, sent: [], skipped: [] };
  try {
    if (!sb) return { ...none, error: 'no backend' };
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ...none, error: 'no session' };
    const f = opts.fetchImpl ?? fetch;
    const res = await f('/api/registration-email', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationId, kind, force: opts.force === true }),
    });
    const j = (await res.json().catch(() => ({}))) as Partial<EmailRequestResult>;
    if (!res.ok || !j.ok) return { ...none, skipped: j.skipped ?? [], error: j.error || `Email request failed (${res.status}).` };
    return { ok: true, sent: j.sent ?? [], skipped: j.skipped ?? [] };
  } catch (e) {
    return { ...none, error: e instanceof Error ? e.message : String(e) };
  }
}

// What the UI says after a send attempt. Null when there is nothing worth saying (nothing sent, nothing failed).
export function describeEmailResult(r: EmailRequestResult, who: 'athlete' | 'promoter'): string | null {
  const athlete = r.sent.find((s) => s.kind === 'received' || s.kind.startsWith('decision'));
  if (athlete) return who === 'athlete' ? `A confirmation is on its way to ${athlete.to}.` : `Emailed ${athlete.to}.`;
  // only the promoter notice went (athlete had no address): still worth a word to the promoter, not the athlete
  if (who === 'promoter' && r.sent.length) return 'Saved. The athlete has no email address on file, so only you were notified.';
  if (r.skipped.some((s) => s.endsWith('already_notified'))) return who === 'athlete' ? null : 'Already emailed earlier.';
  if (r.skipped.some((s) => s.endsWith('no_address'))) return who === 'athlete' ? null : 'No email address on file for this athlete.';
  if (r.error) return who === 'athlete' ? null : `Saved, but the email did not go out (${r.error}).`;
  return null;
}
