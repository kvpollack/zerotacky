'use client';
// Promoter broadcasts and reminders (042, 11/5, feature gaps #10). Sits under Registrations in the promoter editor.
// The promoter writes a subject and a message, picks who gets it, previews it, sends a test to their own inbox, then
// sends for real behind an armed confirm. History and the reminders switch come from zt_list_broadcasts /
// zt_set_reminders. Addresses stay on the server; this component only ever sees counts.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, BellOff, Mail, Send } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RegistrationRequest } from '@/lib/promoter/contract';
import { AUDIENCE_LABELS, BROADCAST_LIMITS, KIND_LABELS, audienceCount, bodyParagraphs, type BroadcastAudience } from '@/lib/email/broadcast';
import { formatShowDate } from '@/lib/website/showHistory';
import {
  describeBroadcastResult, fetchBroadcastHistory, requestBroadcast, setReminders, type BroadcastHistory,
} from '@/lib/email/client';

interface Props {
  meetId: string;                       // server id (meets.id)
  meetName: string;
  meetDate?: string;                    // YYYY-MM-DD or ''
  registrations: RegistrationRequest[];
  sb: SupabaseClient | null;            // null = preview/offline build: the section explains and does nothing
  isDemo?: boolean;
  ownerEmailUnconfirmed?: boolean;
}

const INPUT = 'w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text';
const LABEL = 'block text-[11px] font-bold uppercase text-zt-muted mb-1';
const KEY_LINE = 'px-4 py-2.5 rounded-xl bg-zt-surface border border-zt-border-strong text-zt-text font-black text-xs uppercase inline-flex items-center gap-1.5 disabled:opacity-40';
const KEY_INK = 'px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase inline-flex items-center gap-1.5 shadow disabled:opacity-40';

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function BroadcastSection({ meetId, meetName, meetDate = '', registrations, sb, isDemo = false, ownerEmailUnconfirmed = false }: Props) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<BroadcastAudience>('accepted');
  const [preview, setPreview] = useState(false);
  const [armedReach, setArmedReach] = useState<number | null>(null);   // BC-10: the count the promoter saw when arming
  const armed = armedReach !== null;
  const setArmed = (on: boolean) => setArmedReach(on ? reach : null);
  const [busy, setBusy] = useState<'test' | 'send' | 'reminders' | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const [history, setHistory] = useState<BroadcastHistory | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const reach = useMemo(() => audienceCount(registrations, audience), [registrations, audience]);
  // BC-10: the registrations list refreshed under an armed key (a status change, another device): disarm
  useEffect(() => { setArmedReach(null); }, [registrations]);
  const paragraphs = useMemo(() => bodyParagraphs(body), [body]);
  const canWrite = !!sb && !isDemo;
  const ready = subject.trim().length > 0 && body.trim().length > 0 && subject.length <= BROADCAST_LIMITS.subject && body.length <= BROADCAST_LIMITS.body;

  const load = useCallback(async () => {
    if (!sb || !meetId) return;
    const r = await fetchBroadcastHistory(sb, meetId);
    if (r.error) setHistoryError(r.error); else { setHistory(r.data); setHistoryError(null); }
  }, [sb, meetId]);
  useEffect(() => { void load(); }, [load]);

  // leaving the armed state alone for 8 s disarms it: a stale "Yes, send" key is how accidents happen
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 8000);
    return () => window.clearTimeout(t);
  }, [armed]);

  const send = async (test: boolean) => {
    if (!canWrite || !ready) return;
    if (!test && armedReach !== reach) { setArmedReach(null); return; }   // BC-10: the list moved since arming; look again
    setBusy(test ? 'test' : 'send');
    setNotice(null);
    const r = await requestBroadcast(sb, { meetId, subject: subject.trim(), body, audience, test });
    setBusy(null);
    setArmedReach(null);
    const settled = r.ok && r.failed === 0 && r.unresolved === 0 && r.remaining === 0 && (test ? r.sent > 0 : true);
    setNotice({ text: describeBroadcastResult(r, test), tone: settled ? 'ok' : 'bad' });
    if (r.ok && !test && (r.sent > 0 || r.unresolved > 0 || r.remaining > 0)) { setSubject(''); setBody(''); setPreview(false); }
    void load();
  };

  // 043: pick up a broadcast that stopped part way (provider outage, time budget, unrecorded outcome)
  const [resuming, setResuming] = useState<string | null>(null);
  const resume = async (id: string) => {
    if (!canWrite) return;
    setResuming(id);
    const r = await requestBroadcast(sb, { broadcastId: id });
    setResuming(null);
    setNotice({ text: describeBroadcastResult(r, false), tone: r.ok && r.failed === 0 && r.unresolved === 0 && r.remaining === 0 ? 'ok' : 'bad' });
    void load();
  };

  const toggleReminders = async () => {
    if (!sb || !history) return;
    setBusy('reminders');
    const err = await setReminders(sb, meetId, !history.reminders_enabled);
    setBusy(null);
    if (err) setNotice({ text: `Reminders not changed: ${err}`, tone: 'bad' });
    else setHistory({ ...history, reminders_enabled: !history.reminders_enabled });
  };

  const remindersOn = history?.reminders_enabled !== false;

  return (
    <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-5" aria-labelledby="broadcast-heading">
      <div className="border-b border-zt-border pb-3">
        <h2 id="broadcast-heading" className="text-sm font-black uppercase tracking-wider text-zt-primary flex items-center gap-2">
          <Mail className="w-4 h-4" aria-hidden="true" />
          <span>Email the athletes</span>
        </h2>
        <p className="text-xs text-zt-muted mt-0.5">
          A message from you to the athletes registered for {meetName || 'this show'}: schedule, weigh-in, parking, a change. It goes out from ZeroTacky
          with replies to your account email. Up to {BROADCAST_LIMITS.perDay} sends a day per show, {BROADCAST_LIMITS.recipients} athletes each. Athletes can opt out of these (not of their registration emails).
        </p>
      </div>

      {!sb && <p className="text-xs font-bold text-zt-muted">Email needs the live backend; this preview build cannot send.</p>}
      {isDemo && <p className="text-xs font-bold text-zt-muted">Demo meets do not send email.</p>}
      {canWrite && ownerEmailUnconfirmed && (
        <p role="status" className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-300 text-xs font-bold">
          Confirm your account email first (the link in your sign-up email). Replies and the test send need it.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <label htmlFor="bc-subject" className={LABEL}>Subject <span className="normal-case font-normal">({subject.length}/{BROADCAST_LIMITS.subject})</span></label>
          <input id="bc-subject" className={INPUT} value={subject} maxLength={BROADCAST_LIMITS.subject} onChange={(e) => { setSubject(e.target.value); setArmed(false); }} disabled={!canWrite} placeholder={`${meetName || 'Show'}: weigh-in and schedule`} />
        </div>
        <div>
          <span className={LABEL}>To</span>
          <div role="radiogroup" aria-label="Audience" className="inline-flex rounded-xl border border-zt-border-strong overflow-hidden">
            {(Object.keys(AUDIENCE_LABELS) as BroadcastAudience[]).map((a) => (
              <button
                key={a} type="button" role="radio" aria-checked={audience === a} disabled={!canWrite}
                onClick={() => { setAudience(a); setArmed(false); }}
                className={`px-3 py-2 text-[11px] font-black uppercase ${audience === a ? 'bg-zt-primary text-zt-on-primary' : 'bg-zt-inset text-zt-text-2'}`}
              >
                {a === 'accepted' ? 'Accepted' : 'Everyone'}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-zt-muted -mt-2">
        {AUDIENCE_LABELS[audience]}: about <span className="font-bold text-zt-text">{Math.min(reach, BROADCAST_LIMITS.recipients)}</span> with an email address. An estimate from this list; opt-outs and duplicate addresses come off when you send, and the result line says what went.
      </p>

      <div>
        <label htmlFor="bc-body" className={LABEL}>Message <span className="normal-case font-normal">({body.length}/{BROADCAST_LIMITS.body}; blank line = new paragraph)</span></label>
        <textarea id="bc-body" className={`${INPUT} min-h-[9rem] font-medium`} value={body} maxLength={BROADCAST_LIMITS.body} onChange={(e) => { setBody(e.target.value); setArmed(false); }} disabled={!canWrite}
          placeholder={'Weigh-ins open at 7:00 and close at 8:15. Rules meeting at 8:30, first event at 9:00.\n\nParking is behind the building; the front lot belongs to the dentist.'} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={KEY_LINE} onClick={() => setPreview((v) => !v)} disabled={!ready}>{preview ? 'Hide preview' : 'Preview'}</button>
        <button type="button" className={KEY_LINE} onClick={() => void send(true)} disabled={!canWrite || !ready || busy !== null}>
          <Mail className="w-3.5 h-3.5" aria-hidden="true" />{busy === 'test' ? 'Sending test\u2026' : 'Send a test to me'}
        </button>
        {!armed ? (
          <button type="button" className={KEY_INK} onClick={() => setArmed(true)} disabled={!canWrite || !ready || busy !== null || reach === 0}>
            <Send className="w-3.5 h-3.5" aria-hidden="true" />Send to {reach} {reach === 1 ? 'athlete' : 'athletes'}
          </button>
        ) : (
          <>
            <button type="button" className={`${KEY_INK} ring-2 ring-zt-primary/50`} onClick={() => void send(false)} disabled={busy !== null}>
              <Send className="w-3.5 h-3.5" aria-hidden="true" />{busy === 'send' ? 'Sending\u2026' : `Yes, send to ${armedReach} now`}
            </button>
            <button type="button" className={KEY_LINE} onClick={() => setArmed(false)} disabled={busy !== null}>Cancel</button>
          </>
        )}
      </div>
      {notice && (
        <p role="status" className={`text-xs font-bold ${notice.tone === 'ok' ? 'text-emerald-400' : 'text-amber-300'}`}>{notice.text}</p>
      )}

      {preview && ready && (
        <div className="rounded-xl border border-zt-border-strong bg-zt-inset p-4 space-y-2" aria-label="Preview">
          <div className="text-[11px] font-bold uppercase text-zt-muted">Preview {'\u00b7'} the athlete sees</div>
          <div className="text-sm font-black text-zt-text">{subject.trim()}</div>
          <div className="text-xs text-zt-text-2">Hi &lt;first name&gt;,</div>
          {paragraphs.map((p, i) => <p key={i} className="text-xs text-zt-text-2 whitespace-pre-wrap">{p}</p>)}
          <p className="text-xs text-zt-text-2">From &lt;your name&gt; of {meetName || 'this show'}{meetDate ? ` (${formatShowDate(meetDate)})` : ''}. Reply to this email to reach them.</p>
          <p className="text-[11px] text-zt-muted">Then a &ldquo;View the show&rdquo; key and the unsubscribe link.</p>
        </div>
      )}

      <div className="border-t border-zt-border pt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase text-zt-muted flex items-center gap-1.5">
            {remindersOn ? <Bell className="w-3.5 h-3.5" aria-hidden="true" /> : <BellOff className="w-3.5 h-3.5" aria-hidden="true" />}
            Automatic reminders {remindersOn ? 'on' : 'off'}
          </div>
          <p className="text-xs text-zt-muted mt-0.5">
            One week out and the day before the show date, accepted athletes get a reminder with the date, venue, your contact line and the prep sheet for their division. Listed shows only; nothing goes while the show is postponed or cancelled.
            {history?.opted_out ? ` ${history.opted_out} ${history.opted_out === 1 ? 'registration has' : 'registrations have'} opted out of show emails.` : ''}
          </p>
        </div>
        <button type="button" className={KEY_LINE} onClick={() => void toggleReminders()} disabled={!canWrite || !history || busy !== null}>
          {busy === 'reminders' ? 'Saving\u2026' : remindersOn ? 'Turn reminders off' : 'Turn reminders on'}
        </button>
      </div>

      <div className="border-t border-zt-border pt-4">
        <div className="text-[11px] font-bold uppercase text-zt-muted mb-2">Sent</div>
        {historyError && <p className="text-xs font-bold text-amber-300">Could not load history: {historyError}</p>}
        {history && history.broadcasts.length === 0 && <p className="text-xs text-zt-muted">Nothing sent for this show yet.</p>}
        {history && history.broadcasts.length > 0 && (
          <ul className="divide-y divide-zt-border text-xs">
            {history.broadcasts.map((b) => (
              <li key={b.id} className="py-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <div className="min-w-0">
                  <span className="font-bold text-zt-text">{b.subject}</span>
                  <span className="text-zt-muted"> {'\u00b7'} {KIND_LABELS[b.kind]}{b.test_only ? ' (test)' : ''}{b.kind === 'broadcast' && !b.test_only ? ` ${'\u00b7'} ${b.audience === 'accepted' ? 'accepted' : 'everyone'}` : ''}</span>
                </div>
                <div className="text-zt-text-2 whitespace-nowrap flex items-baseline gap-2">
                  <span>
                    {b.sent_count}/{b.recipient_count} sent{b.failed_count ? `, ${b.failed_count} failed` : ''}{b.skipped_count ? `, ${b.skipped_count} skipped` : ''}{(b.queued_count ?? 0) > 0 ? `, ${b.queued_count} queued` : ''} {'\u00b7'} {when(b.created_at)}
                  </span>
                  {(b.queued_count ?? 0) > 0 && b.kind === 'broadcast' && (
                    <button type="button" className="underline underline-offset-2 font-bold text-zt-primary disabled:opacity-40" onClick={() => void resume(b.id)} disabled={!canWrite || busy !== null || resuming !== null}>
                      {resuming === b.id ? 'Resuming\u2026' : 'Resume'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
