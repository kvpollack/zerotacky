'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/useAuth';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { Cap, Key, KeyButton, keyClass, textLink } from '@/components/website/sheet';
import { GYM_LIMITS, GYM_TYPES, addMyGym, cleanAddGym, geocodeAddress, type AddGymInput, type MyGymRow } from '@/lib/website/myGym';

// Add my gym (017, 10/21): a signed-in owner lists a gym that is not in the directory. The row lands as `pending`
// with the caller as owner plus a claim for the approval queue; it goes public when an admin approves. Equipment,
// day passes and hours are edited afterwards on My Gym, so this form stays short.
// Hand redraw in the sheet grammar (11/5, sweep item 5): one ruled block, a cap over each input, gym type as three
// ruled radio cells (pen when picked), pen key to submit.
const CELL = 'flex flex-col gap-1.5 px-4 py-3.5 sm:px-5 min-w-0';
const NOTE = 'text-[13px] leading-snug text-ink-muted';
const H1 = 'text-[28px] sm:text-[34px] font-bold leading-[1.05] text-ink';
const BACK = 'inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.04em] text-ink-muted hover:text-ink no-underline self-start';

const EMPTY: AddGymInput = {
  name: '', gym_type: 'mixed', street_address: '', city: '', state: '', zip: '',
  website_url: '', phone: '', instagram: '', contact: '', role: 'Owner', message: '',
};

function errText(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
}

export default function AddGymClient() {
  const auth = useAuth();
  const [draft, setDraft] = useState<AddGymInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<MyGymRow | null>(null);
  const patch = (p: Partial<AddGymInput>) => setDraft((d) => ({ ...d, ...p }));

  const back = (
    <Link href="/website/account/gym" className={BACK}>
      <span aria-hidden="true">←</span> My Gym
    </Link>
  );

  if (!auth.enabled) {
    return <section className="zt-block grid-cols-1"><p className="px-5 py-5 text-[15px] text-ink">Accounts are not configured on this build.</p></section>;
  }
  if (auth.loading) {
    return <section className="zt-block grid-cols-1"><p className="px-5 py-5"><Cap as="span">Checking your session…</Cap></p></section>;
  }
  if (!auth.user) {
    return (
      <div className="flex flex-col gap-5">
        {back}
        <section className="zt-block grid-cols-1 max-w-xl">
          <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
            <h1 className="text-[22px] font-bold leading-tight text-ink">Add my gym</h1>
            <p className="text-[15px] leading-relaxed text-ink">Sign in first so the listing is yours to edit once it is approved.</p>
            <Key href="/website/account" variant="pen" className="self-start">Sign in</Key>
          </div>
        </section>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex flex-col gap-5">
        {back}
        <section role="status" className="zt-block grid-cols-1 max-w-xl">
          <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
            <Cap as="span" className="text-pen">Received</Cap>
            <h1 className="text-[22px] font-bold leading-tight text-ink">{done.name} is in for review</h1>
            <p className="text-[15px] leading-relaxed text-ink">
              We review new listings by hand; check My Gym for the result. You can fill in equipment, day passes and drop-in hours there now, and everything you add goes public with the listing.
            </p>
            <div className="flex flex-wrap gap-2">
              <Key href="/website/account/gym" variant="pen">Open My Gym</Key>
              <KeyButton variant="line" onClick={() => { setDone(null); setDraft(EMPTY); }}>Add another</KeyButton>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    const c = cleanAddGym(draft);
    if (!c.input) { setProblem(c.problem); return; }
    const sb = getSupabase();
    if (!sb) { setProblem('Accounts are not configured on this build.'); return; }
    setBusy(true);
    try {
      const pin = await geocodeAddress(c.input);
      const row = await addMyGym(sb, c.input, pin);
      setDone(row);
    } catch (err) {
      setProblem(errText(err));
    } finally {
      setBusy(false);
    }
  };

  const text = (id: string, label: string, key: keyof AddGymInput, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, span = false) => (
    <div className={`${CELL} ${span ? 'md:col-span-2' : ''}`}>
      <label htmlFor={id}><Cap as="span">{label}</Cap></label>
      <input id={id} value={draft[key] as string} onChange={(e) => patch({ [key]: e.target.value } as Partial<AddGymInput>)} className="zt-input" {...extra} />
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {back}
      <div className="flex flex-col gap-2">
        <h1 className={H1}>Add my gym</h1>
        <p className="text-[15px] leading-relaxed text-ink max-w-2xl">
          For a gym that is not in the <Link href="/gyms" className={textLink}>directory</Link> yet. Give us enough to confirm it is a real strongman or powerlifting gym; the rest (equipment, day passes, hours) you fill in on My Gym.
        </p>
      </div>

      <form onSubmit={submit} className="zt-block grid-cols-1 md:grid-cols-2 max-w-3xl">
        {text('ag-name', 'Gym name', 'name', { maxLength: GYM_LIMITS.name, required: true, autoComplete: 'organization' }, true)}
        <div className={`${CELL} md:col-span-2`}>
          <Cap as="span">What kind of gym</Cap>
          <div role="group" aria-label="Gym type" className="zt-block grid-cols-1 sm:grid-cols-3">
            {GYM_TYPES.map((t) => (
              <label key={t.id} className={`flex flex-col gap-1 px-4 py-3 cursor-pointer ${draft.gym_type === t.id ? '!bg-pen text-pen-label' : 'text-ink hover:bg-ground'}`}>
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-bold">{t.label}</span>
                  <input type="radio" name="ag-type" checked={draft.gym_type === t.id} onChange={() => patch({ gym_type: t.id })} className="w-4 h-4" style={{ accentColor: draft.gym_type === t.id ? 'var(--pen-label)' : 'var(--pen)' }} />
                </span>
                <span className={`text-[12px] leading-snug ${draft.gym_type === t.id ? 'opacity-80' : 'text-ink-muted'}`}>{t.hint}</span>
              </label>
            ))}
          </div>
        </div>
        {text('ag-street', 'Street address', 'street_address', { maxLength: GYM_LIMITS.street_address, autoComplete: 'street-address' }, true)}
        {text('ag-city', 'City', 'city', { maxLength: GYM_LIMITS.city, required: true, autoComplete: 'address-level2' })}
        <div className={`${CELL} grid grid-cols-2 gap-x-4`}>
          <label htmlFor="ag-state"><Cap as="span">State</Cap></label>
          <label htmlFor="ag-zip"><Cap as="span">Zip</Cap></label>
          <input id="ag-state" value={draft.state} onChange={(e) => patch({ state: e.target.value.toUpperCase().slice(0, 2) })} className="zt-input" maxLength={2} placeholder="TX" required autoComplete="address-level1" />
          <input id="ag-zip" value={draft.zip} onChange={(e) => patch({ zip: e.target.value })} className="zt-input" maxLength={10} inputMode="numeric" placeholder="12345" autoComplete="postal-code" />
        </div>
        {text('ag-web', 'Website', 'website_url', { maxLength: GYM_LIMITS.website_url, placeholder: 'https://', inputMode: 'url', autoComplete: 'url' })}
        {text('ag-ig', 'Instagram', 'instagram', { maxLength: GYM_LIMITS.instagram, placeholder: '@handle' })}
        {text('ag-phone', 'Phone', 'phone', { maxLength: GYM_LIMITS.phone, inputMode: 'tel', autoComplete: 'tel' })}
        {text('ag-contact', 'Public contact (email or booking link)', 'contact', { maxLength: GYM_LIMITS.contact })}
        {text('ag-role', 'Your role at the gym', 'role', { maxLength: 40, placeholder: 'Owner, manager, head coach' }, true)}
        <div className={`${CELL} md:col-span-2`}>
          <label htmlFor="ag-msg"><Cap as="span">Anything that helps us confirm it (optional)</Cap></label>
          <textarea id="ag-msg" value={draft.message} onChange={(e) => patch({ message: e.target.value })} className="zt-input min-h-[72px]" maxLength={1000} placeholder="A page showing the strongman equipment, a federation listing, how long you have been open" />
        </div>
        <div className={`${CELL} md:col-span-2 gap-3 py-5`}>
          <p className={NOTE}>
            A website or an Instagram handle is required. Approval is quicker when your account email is at the gym&rsquo;s own domain. New listings are reviewed by hand; three per day per account.
          </p>
          {problem && <div role="alert" className="text-[13px] font-bold text-redpen">{problem}</div>}
          <div className="flex flex-wrap items-center gap-2">
            <KeyButton type="submit" variant="pen" disabled={busy}>{busy ? 'Sending…' : 'Submit for review'}</KeyButton>
            <Link href="/website/account/gym" className={keyClass('line')}>Cancel</Link>
          </div>
        </div>
      </form>
    </div>
  );
}
