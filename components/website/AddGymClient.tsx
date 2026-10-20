'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Dumbbell, Send } from 'lucide-react';
import { useAuth } from '@/lib/auth/useAuth';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { GYM_LIMITS, GYM_TYPES, addMyGym, cleanAddGym, geocodeAddress, type AddGymInput, type MyGymRow } from '@/lib/website/myGym';

// Add my gym (017, 10/21): a signed-in owner lists a gym that is not in the directory. The row lands as `pending`
// with the caller as owner plus a claim for the approval queue; it goes public when an admin approves. Equipment,
// day passes and hours are edited afterwards on My Gym, so this form stays short.
const inputCls = 'w-full bg-zt-inset border border-zt-border-strong rounded-lg px-3 py-2 text-sm text-zt-text';
const labelCls = 'block text-[10px] font-extrabold uppercase text-zt-muted mb-1';
const primaryBtn = 'px-4 py-2 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-40';
const quietBtn = 'px-3 py-2 rounded-xl bg-zt-surface border border-zt-border-strong text-zt-text font-extrabold text-xs uppercase inline-flex items-center gap-1.5 disabled:opacity-40';

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
    <Link href="/website/account/gym" className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase text-zt-muted hover:text-zt-text">
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> My Gym
    </Link>
  );

  if (!auth.enabled) {
    return <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 text-sm text-zt-text-2">Accounts are not configured on this build.</section>;
  }
  if (auth.loading) {
    return <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 text-xs font-bold uppercase text-zt-muted">Checking your session…</section>;
  }
  if (!auth.user) {
    return (
      <div className="space-y-4">
        {back}
        <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-2 max-w-xl">
          <h1 className="text-xl font-black text-zt-text">Add my gym</h1>
          <p className="text-sm text-zt-text-2">Sign in first so the listing is yours to edit once it is approved.</p>
          <Link href="/website/account" className={primaryBtn}>Sign in</Link>
        </section>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        {back}
        <section role="status" className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-3 max-w-xl">
          <h1 className="text-xl font-black text-zt-text flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-zt-secondary" aria-hidden="true" /> {done.name} is in for review
          </h1>
          <p className="text-sm text-zt-text-2">
            We review new listings by hand; check My Gym for the result. You can fill in equipment, day passes and drop-in hours there now, and everything you add goes public with the listing.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/website/account/gym" className={primaryBtn}>Open My Gym</Link>
            <button type="button" onClick={() => { setDone(null); setDraft(EMPTY); }} className={quietBtn}>Add another</button>
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

  return (
    <div className="space-y-6">
      {back}
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-black text-zt-text">Add my gym</h1>
        <p className="text-xs sm:text-sm text-zt-text-2 max-w-2xl">
          For a gym that is not in the <Link href="/gyms" className="text-zt-primary font-bold">directory</Link> yet. Give us enough to confirm it is a real strongman or powerlifting gym; the rest (equipment, day passes, hours) you fill in on My Gym.
        </p>
      </div>

      <form onSubmit={submit} className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-5 max-w-3xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="md:col-span-2">
            <label htmlFor="ag-name" className={labelCls}>Gym name</label>
            <input id="ag-name" value={draft.name} onChange={(e) => patch({ name: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.name} required autoComplete="organization" />
          </div>
          <div className="md:col-span-2">
            <div className={labelCls}>What kind of gym</div>
            <div role="group" aria-label="Gym type" className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {GYM_TYPES.map((t) => (
                <label key={t.id} className={`p-3 rounded-xl border cursor-pointer ${draft.gym_type === t.id ? 'bg-zt-primary/15 border-zt-primary ring-1 ring-zt-primary' : 'bg-zt-inset border-zt-border'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-zt-text">{t.label}</span>
                    <input type="radio" name="ag-type" checked={draft.gym_type === t.id} onChange={() => patch({ gym_type: t.id })} className="w-4 h-4 accent-[var(--zt-primary)]" />
                  </div>
                  <div className="text-[11px] text-zt-muted mt-0.5">{t.hint}</div>
                </label>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="ag-street" className={labelCls}>Street address</label>
            <input id="ag-street" value={draft.street_address} onChange={(e) => patch({ street_address: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.street_address} autoComplete="street-address" />
          </div>
          <div>
            <label htmlFor="ag-city" className={labelCls}>City</label>
            <input id="ag-city" value={draft.city} onChange={(e) => patch({ city: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.city} required autoComplete="address-level2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="ag-state" className={labelCls}>State</label>
              <input id="ag-state" value={draft.state} onChange={(e) => patch({ state: e.target.value.toUpperCase().slice(0, 2) })} className={inputCls} maxLength={2} placeholder="TX" required autoComplete="address-level1" />
            </div>
            <div>
              <label htmlFor="ag-zip" className={labelCls}>Zip</label>
              <input id="ag-zip" value={draft.zip} onChange={(e) => patch({ zip: e.target.value })} className={inputCls} maxLength={10} inputMode="numeric" placeholder="12345" autoComplete="postal-code" />
            </div>
          </div>
          <div>
            <label htmlFor="ag-web" className={labelCls}>Website</label>
            <input id="ag-web" value={draft.website_url} onChange={(e) => patch({ website_url: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.website_url} placeholder="https://" inputMode="url" autoComplete="url" />
          </div>
          <div>
            <label htmlFor="ag-ig" className={labelCls}>Instagram</label>
            <input id="ag-ig" value={draft.instagram} onChange={(e) => patch({ instagram: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.instagram} placeholder="@handle" />
          </div>
          <div>
            <label htmlFor="ag-phone" className={labelCls}>Phone</label>
            <input id="ag-phone" value={draft.phone} onChange={(e) => patch({ phone: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.phone} inputMode="tel" autoComplete="tel" />
          </div>
          <div>
            <label htmlFor="ag-contact" className={labelCls}>Public contact (email or booking link)</label>
            <input id="ag-contact" value={draft.contact} onChange={(e) => patch({ contact: e.target.value })} className={inputCls} maxLength={GYM_LIMITS.contact} />
          </div>
          <div>
            <label htmlFor="ag-role" className={labelCls}>Your role at the gym</label>
            <input id="ag-role" value={draft.role} onChange={(e) => patch({ role: e.target.value })} className={inputCls} maxLength={40} placeholder="Owner, manager, head coach" />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="ag-msg" className={labelCls}>Anything that helps us confirm it (optional)</label>
            <textarea id="ag-msg" value={draft.message} onChange={(e) => patch({ message: e.target.value })} className={`${inputCls} min-h-[72px]`} maxLength={1000} placeholder="A page showing the strongman equipment, a federation listing, how long you have been open" />
          </div>
        </div>
        <p className="text-[11px] text-zt-muted">
          A website or an Instagram handle is required. Approval is quicker when your account email is at the gym&rsquo;s own domain. New listings are reviewed by hand; three per day per account.
        </p>
        {problem && <div role="alert" className="text-xs font-bold rounded-lg px-3 py-2 bg-zt-danger/10 text-zt-danger-text border border-zt-danger/50">{problem}</div>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={busy} className={primaryBtn}>
            <Send className="w-3.5 h-3.5" aria-hidden="true" /> {busy ? 'Sending…' : 'Submit for review'}
          </button>
          <Link href="/website/account/gym" className={quietBtn}>Cancel</Link>
        </div>
      </form>
    </div>
  );
}
