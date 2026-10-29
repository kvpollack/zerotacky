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
  if (who === 'athlete') return null;   // the athlete only ever hears about their own confirmation
  // only the promoter notice went (athlete had no address): still worth a word to the promoter
  if (r.sent.length) return 'Saved. The athlete has no email address on file, so only you were notified.';
  const athleteSkip = r.skipped.find((s) => s.startsWith('received:') || s.startsWith('decision_'));
  const reason = athleteSkip?.split(':')[1];
  if (reason === 'already_notified') return 'Already emailed earlier.';
  if (reason === 'no_address') return 'No email address on file for this athlete.';
  if (reason === 'in_flight') return 'An email to this athlete is already on its way.';
  if (reason === 'wait') return 'Emailed in the last 10 minutes; try again later.';
  if (reason === 'limit') return 'This athlete has been emailed the maximum number of times for this step.';
  if (r.skipped.some((s) => s === 'notice:no_address')) return 'Your account has no confirmed email, so you will not get new-entry notices.';
  if (r.error) return `Saved, but the email did not go out (${r.error}).`;
  return null;
}
