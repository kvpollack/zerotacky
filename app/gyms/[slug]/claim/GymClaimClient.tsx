'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth/useAuth';
import { createSyncClient, readSyncEnv } from '@/lib/sync/client';

// "Gym owner? Claim it" and "Not right? Report it" share one form (015 gym_claims). Nothing changes on the listing when
// a claim is filed; Kurt reviews and the owner flow comes after the meet (ROADMAP 6). Signed-in users get their email
// prefilled and the claim carries their user id so approval can attach ownership without another email round-trip.
type Kind = 'claim' | 'report';

const ROLES = ['Owner', 'Manager or staff', 'Coach who trains here', 'Athlete who trains here', 'Other'];

export default function GymClaimClient({ gymId, gymName, gymSlug }: { gymId: string; gymName: string; gymSlug: string }) {
  const params = useSearchParams();
  const auth = useAuth();
  const [kind, setKind] = useState<Kind>(params.get('mode') === 'report' ? 'report' : 'claim');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(ROLES[0]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.user?.email && !email) setEmail(auth.user.email);
    if (auth.profile?.display_name && !name) setName(auth.profile.display_name);
  }, [auth.user, auth.profile, email, name]);

  const env = readSyncEnv();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!env) { setError('The directory backend is not configured on this build.'); return; }
    const n = name.trim(); const em = email.trim();
    if (n.length < 1 || n.length > 80) { setError('Please enter your name (up to 80 characters).'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em) || em.length > 120) { setError('Please enter a valid email address.'); return; }
    if (message.length > 1000) { setError('Message is limited to 1,000 characters.'); return; }
    if (kind === 'report' && message.trim().length < 5) { setError('Tell us what is wrong so we can fix it.'); return; }
    setBusy(true);
    try {
      const client = createSyncClient({ ...env, accessToken: auth.session?.access_token ?? undefined });
      await client.rpc('zt_file_gym_claim', {
        p_gym_id: gymId, p_kind: kind, p_name: n, p_email: em, p_role: kind === 'claim' ? role : '', p_message: message.trim(),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const field = 'w-full rounded-xl bg-zt-inset border border-zt-border px-3 py-2.5 text-sm text-zt-text focus:outline-none focus:border-zt-primary';
  const label = 'text-[10px] font-extrabold uppercase text-zt-muted block mb-1';

  return (
    <div className="space-y-5 max-w-xl">
      <Link href={`/gyms/${gymSlug}`} className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase text-zt-muted hover:text-zt-text">
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Back to {gymName}
      </Link>

      <div className="flex gap-2" role="tablist" aria-label="What would you like to do">
        {(['claim', 'report'] as Kind[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)}
            className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase border ${kind === k ? 'bg-zt-primary text-zt-on-primary border-zt-primary' : 'bg-zt-inset text-zt-text-2 border-zt-border'}`}>
            {k === 'claim' ? 'Claim this gym' : 'Report a problem'}
          </button>
        ))}
      </div>

      {done ? (
        <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 text-emerald-400 font-black"><CheckCircle2 className="w-5 h-5" aria-hidden="true" /> Received</div>
          <p className="text-sm text-zt-text-2">
            {kind === 'claim'
              ? `Thanks. We check each claim by hand and will email ${email.trim()} when the listing for ${gymName} is yours to edit.`
              : `Thanks. We will look at the listing for ${gymName} and fix what is wrong.`}
          </p>
          <Link href="/gyms" className="inline-block text-xs font-extrabold uppercase text-zt-primary hover:underline">Back to the Gym Directory</Link>
        </section>
      ) : (
        <form onSubmit={submit} className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-4">
          <div className="space-y-1">
            <h1 className="text-xl font-black text-zt-text">{kind === 'claim' ? `Claim ${gymName}` : `Report a problem with ${gymName}`}</h1>
            <p className="text-xs text-zt-text-2">
              {kind === 'claim'
                ? 'This listing was built from the gym\u2019s own website. Claiming it lets you correct the details, list your equipment, and link your shows. We confirm each claim by hand.'
                : 'Closed, moved, wrong equipment, wrong hours: tell us and we will fix or remove the listing.'}
            </p>
          </div>
          <div>
            <label className={label} htmlFor="claim-name">Your name</label>
            <input id="claim-name" className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="name" />
          </div>
          <div>
            <label className={label} htmlFor="claim-email">Email</label>
            <input id="claim-email" className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} required autoComplete="email" />
            {kind === 'claim' && (
              <p className="text-[11px] text-zt-muted mt-1">An address at the gym&rsquo;s own domain is the fastest way to confirm a claim.</p>
            )}
          </div>
          {kind === 'claim' && (
            <div>
              <label className={label} htmlFor="claim-role">Your role</label>
              <select id="claim-role" className={field} value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={label} htmlFor="claim-message">{kind === 'claim' ? 'Anything we should know (optional)' : 'What is wrong?'}</label>
            <textarea id="claim-message" className={`${field} min-h-[96px]`} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
          </div>
          {error && <p className="text-xs font-bold text-red-400" role="alert">{error}</p>}
          <button type="submit" disabled={busy} className="px-5 py-3 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase disabled:opacity-60">
            {busy ? 'Sending…' : kind === 'claim' ? 'Send claim' : 'Send report'}
          </button>
          <p className="text-[11px] text-zt-muted">
            We use your name and email only to follow up on this {kind}. See our <Link href="/legal/privacy" className="underline">privacy notice</Link>.
          </p>
        </form>
      )}
    </div>
  );
}
