'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/useAuth';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { Cap, keyClass, textLink } from '@/components/website/sheet';

// Feature 2 MVP (11/3): list a show that registers elsewhere. Signed-in users submit; an admin reviews before it shows
// on /shows (an admin's own submission lists at once, server side). The row links out; ZeroTacky never scrapes.
const INPUT = 'zt-input w-full';
// Supabase RPC errors are plain objects with `message`, not Error instances; the raise_exception text carries a SQLSTATE-style prefix we drop.
const errText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e)).replace(/^[A-Z0-9]+:\s*/, '');

type Draft = { name: string; date: string; city: string; state: string; facility_name: string; federation: string; divisions_note: string; registration_url: string; submitter_note: string };
const EMPTY: Draft = { name: '', date: '', city: '', state: '', facility_name: '', federation: '', divisions_note: '', registration_url: '', submitter_note: '' };

type FieldProps = {
  label: string; k: keyof Draft; value: string; onChange: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  type?: string; required?: boolean; hint?: string; maxLength?: number; placeholder?: string; wide?: boolean;
};
// BLD-02: defined at module level on purpose. Declared inside the component it was a new component type on every
// render, so React remounted the input after each keystroke and typing lost focus after one character.
function Field({ label, k, value, onChange, type = 'text', required, hint, maxLength, placeholder, wide }: FieldProps) {
  return (
    <label className={`flex flex-col gap-1 px-3.5 py-2.5 ${wide ? 'col-span-full' : ''}`}>
      <Cap as="span">{label}{required ? '' : ' (optional)'}</Cap>
      {k === 'divisions_note' || k === 'submitter_note' ? (
        <textarea id={`ext-${k}`} value={value} onChange={onChange} rows={2} maxLength={maxLength} placeholder={placeholder} className={`${INPUT} min-h-[64px]`} />
      ) : (
        <input id={`ext-${k}`} type={type} value={value} onChange={onChange} required={required} maxLength={maxLength} placeholder={placeholder} className={INPUT} />
      )}
      {hint && <span className="text-xs text-ink-muted">{hint}</span>}
    </label>
  );
}

export default function SubmitExternalShowClient() {
  const auth = useAuth();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<'pending' | 'listed' | null>(null);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true); setError(null);
    try {
      const { data, error: err } = await sb.rpc('zt_submit_external_show', { p_input: { ...draft, state: draft.state.toUpperCase() } });
      if (err) throw err;
      setDone((data as { status?: 'pending' | 'listed' })?.status === 'listed' ? 'listed' : 'pending');
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Cap as="h2">List a show held elsewhere</Cap>
        <h1 className="text-[28px] font-bold leading-tight text-ink">Add a show that registers on another site</h1>
        <p className="text-[15px] text-ink leading-snug">
          Iron Podium, Eventbrite, your own page: give the basics and the registration link and the show joins the{' '}
          <Link href="/shows" className={textLink}>Shows</Link> list with a link out. We check each listing before it goes up, and it comes down the day after the show.
        </p>
      </div>

      {!auth.enabled ? (
        <p className="text-[15px] text-ink-muted">Accounts are not configured on this build.</p>
      ) : auth.loading ? (
        <p className="text-[13px] uppercase tracking-[0.04em] text-ink-muted">Checking your session…</p>
      ) : !auth.user ? (
        <div className="zt-block">
          <div className="px-5 py-5 flex flex-col gap-3">
            <p className="text-[15px] text-ink">Sign in to list a show; it takes a minute and keeps the calendar honest.</p>
            <Link href="/website/account" className={keyClass('ink', 'self-start')}>Sign in or create an account</Link>
          </div>
        </div>
      ) : done ? (
        <div className="zt-block" role="status">
          <div className="px-5 py-5 flex flex-col gap-2">
            <div className="text-[18px] font-bold text-ink">{done === 'listed' ? 'Listed.' : 'Thanks, it is in the review queue.'}</div>
            <p className="text-[15px] text-ink">
              {done === 'listed'
                ? 'The show is on the Shows list now.'
                : 'An admin checks the link and the details, usually within a few days, and the show then appears on the Shows list.'}
            </p>
            <div className="flex flex-wrap gap-2 mt-1">
              <Link href="/shows" className={keyClass('ink')}>Back to Shows</Link>
              <button type="button" onClick={() => { setDraft(EMPTY); setDone(null); }} className={keyClass('line')}>List another</button>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="zt-block grid-cols-1 sm:grid-cols-2">
            <Field label="Show name" k="name" required maxLength={120} wide placeholder="e.g. Keystone Classic 2027" value={draft.name} onChange={set('name')} />
            <Field label="Date" k="date" type="date" required value={draft.date} onChange={set('date')} />
            <Field label="Registration link" k="registration_url" type="url" required maxLength={500} placeholder="https://" hint="The page where athletes sign up." value={draft.registration_url} onChange={set('registration_url')} />
            <Field label="City" k="city" required maxLength={80} value={draft.city} onChange={set('city')} />
            <Field label="State" k="state" required maxLength={2} placeholder="PA" hint="US two-letter code." value={draft.state} onChange={set('state')} />
            <Field label="Venue" k="facility_name" maxLength={120} value={draft.facility_name} onChange={set('facility_name')} />
            <Field label="Federation" k="federation" maxLength={80} placeholder="Strongman Corporation, USS, unsanctioned" value={draft.federation} onChange={set('federation')} />
            <Field label="Divisions" k="divisions_note" maxLength={400} wide placeholder="Novice, Open, Masters 40+; comma separated" hint="Shown under the show on the list." value={draft.divisions_note} onChange={set('divisions_note')} />
            <Field label="Note to the reviewer" k="submitter_note" maxLength={400} wide hint="Not shown publicly." value={draft.submitter_note} onChange={set('submitter_note')} />
          </div>
          {error && <div role="alert" className="text-[13px] font-bold text-ink">{error}</div>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className={keyClass('ink', 'disabled:opacity-50 disabled:cursor-not-allowed')}>{busy ? 'Sending…' : 'Submit for review'}</button>
            <Link href="/shows" className={textLink}>Cancel</Link>
          </div>
        </form>
      )}
    </div>
  );
}
