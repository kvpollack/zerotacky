// Browser side of the registration emails (031): ask the server to send, with the session token, and never let a
// mail problem interrupt the thing the user actually did (the registration or the decision went through already).
import type { SupabaseClient } from '@supabase/supabase-js';

export interface EmailRequestResult { ok: boolean; sent: Array<{ kind: string; to?: string }>; skipped: string[]; error?: string }

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
  if (athlete) return who === 'athlete' ? `A confirmation is on its way to ${athlete.to ?? 'your email address'}.` : `Emailed ${athlete.to ?? 'the athlete'}.`;
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

// ---------------------------------------------------------------------------------------------------------------------
// 042 (feature gaps #10): promoter broadcasts and reminders. Same shape as above: the browser asks with its session
// token, the server owns the addresses, the UI gets counts back.
export interface BroadcastRequest { meetId: string; subject: string; body: string; audience: 'accepted' | 'all_active'; test?: boolean }
export type BroadcastErrorCode = 'provider_unavailable' | 'provider_rejected' | 'record_failed' | 'time_budget';
export interface BroadcastResult {
  ok: boolean; id?: string; recipients: number; sent: number; failed: number;
  unresolved: number;    // 043 BC-02: delivered or attempted, outcome not recorded; still queued, shows in history
  remaining: number;     // still queued when the pass ended
  errors: BroadcastErrorCode[]; error?: string;
}

export async function requestBroadcast(sb: SupabaseClient | null, req: BroadcastRequest | { broadcastId: string }, fetchImpl: typeof fetch = fetch): Promise<BroadcastResult> {
  const none: BroadcastResult = { ok: false, recipients: 0, sent: 0, failed: 0, unresolved: 0, remaining: 0, errors: [] };
  try {
    if (!sb) return { ...none, error: 'no backend' };
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ...none, error: 'Sign in required.' };
    const res = await fetchImpl('/api/broadcast', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const j = (await res.json().catch(() => ({}))) as Partial<BroadcastResult>;
    const counts = { recipients: j.recipients ?? 0, sent: j.sent ?? 0, failed: j.failed ?? 0, unresolved: j.unresolved ?? 0, remaining: j.remaining ?? 0, errors: Array.isArray(j.errors) ? j.errors : [] };
    if (!res.ok || !j.ok) return { ...none, ...counts, id: j.id, error: j.error || `Send failed (${res.status}).` };
    return { ok: true, id: j.id, ...counts };
  } catch (e) {
    return { ...none, error: e instanceof Error ? e.message : String(e) };
  }
}

export interface BroadcastHistoryItem {
  id: string; kind: 'broadcast' | 'reminder_7d' | 'reminder_1d'; audience: 'accepted' | 'all_active'; subject: string; test_only: boolean;
  created_at: string; finished_at: string | null; recipient_count: number; sent_count: number; failed_count: number;
  skipped_count?: number; queued_count?: number;
}
export interface BroadcastHistory { reminders_enabled: boolean; broadcasts: BroadcastHistoryItem[]; opted_out: number }

export async function fetchBroadcastHistory(sb: SupabaseClient, meetId: string): Promise<{ data: BroadcastHistory | null; error: string | null }> {
  const { data, error } = await sb.rpc('zt_list_broadcasts', { p_meet: meetId });
  if (error) return { data: null, error: error.message };
  const d = (data ?? {}) as Partial<BroadcastHistory>;
  return { data: { reminders_enabled: d.reminders_enabled !== false, broadcasts: d.broadcasts ?? [], opted_out: d.opted_out ?? 0 }, error: null };
}

export async function setReminders(sb: SupabaseClient, meetId: string, on: boolean): Promise<string | null> {
  const { error } = await sb.rpc('zt_set_reminders', { p_meet: meetId, p_on: on });
  return error ? error.message : null;
}

/** One line for the UI after a broadcast attempt. Says exactly what is not settled (043 BC-02). */
export function describeBroadcastResult(r: BroadcastResult, test: boolean): string {
  if (!r.ok) return r.error ? `Not sent: ${r.error}` : 'Not sent.';
  if (test) {
    if (r.unresolved > 0) return 'The test went to the email service, but the outcome could not be recorded. Check your inbox before sending to the athletes.';
    return r.sent > 0 ? 'Test sent to your account email. Check your inbox, then send to the athletes.' : 'The test did not go out. Your account needs a confirmed email address.';
  }
  if (r.recipients === 0 && r.remaining === 0 && r.unresolved === 0) return 'Nobody to send to: no athletes in that group have an email address, or they have all opted out.';
  const parts: string[] = [];
  if (r.sent > 0) parts.push(`Sent to ${r.sent} ${r.sent === 1 ? 'athlete' : 'athletes'}`);
  if (r.failed > 0) parts.push(`${r.failed} failed`);
  if (r.unresolved > 0) parts.push(`${r.unresolved} not confirmed (the outcome could not be recorded; check the history before sending again)`);
  if (r.remaining > 0) parts.push(`${r.remaining} still queued (resume from the history)`);
  return (parts.length ? parts.join('; ') : 'Nothing was sent') + '.';
}
