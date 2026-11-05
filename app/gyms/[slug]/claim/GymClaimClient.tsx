'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth/useAuth';
import { createSyncClient, readSyncEnv } from '@/lib/sync/client';
import { Cap, KeyButton, keyClass, textLink } from '@/components/website/sheet';

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

  // Hand redraw in the sheet grammar (11/5, sweep item 5): claim / report as two keys, the form as one ruled block
  // with a cap over each input; the receipt is the same block with a pen heading.
  const NOTE = 'text-[13px] leading-snug text-ink-muted';

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      <Link href={`/gyms/${gymSlug}`} className="inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.04em] text-ink-muted hover:text-ink no-underline self-start">
        <span aria-hidden="true">←</span> Back to {gymName}
      </Link>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="What would you like to do">
        {(['claim', 'report'] as Kind[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={keyClass(kind === k ? 'pen' : 'line')}>
            {k === 'claim' ? 'Claim this gym' : 'Report a problem'}
          </button>
        ))}
      </div>

      {done ? (
        <section className="zt-block grid-cols-1">
          <div className="flex flex-col gap-2 px-5 py-5 sm:px-6">
            <Cap as="span" className="text-pen">Received</Cap>
            <p className="text-[15px] leading-relaxed text-ink">
              {kind === 'claim'
                ? `Thanks. We check each claim by hand and will email ${email.trim()} when the listing for ${gymName} is yours to edit.`
                : `Thanks. We will look at the listing for ${gymName} and fix what is wrong.`}
            </p>
            <Link href="/gyms" className={`text-[13px] ${textLink} self-start`}>Back to the Gym Directory</Link>
          </div>
        </section>
      ) : (
        <form onSubmit={submit} className="zt-block grid-cols-1">
          <div className="flex flex-col gap-1.5 px-5 py-5 sm:px-6">
            <h1 className="text-[22px] font-bold leading-tight text-ink">{kind === 'claim' ? `Claim ${gymName}` : `Report a problem with ${gymName}`}</h1>
            <p className={NOTE}>
              {kind === 'claim'
                ? 'This listing was built from the gym\u2019s own website. Claiming it lets you correct the details, list your equipment, and link your shows. We confirm each claim by hand.'
                : 'Closed, moved, wrong equipment, wrong hours: tell us and we will fix or remove the listing.'}
            </p>
          </div>
          <div className="flex flex-col gap-1.5 px-5 py-4 sm:px-6">
            <label htmlFor="claim-name"><Cap as="span">Your name</Cap></label>
            <input id="claim-name" className="zt-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="name" />
            {auth.user && <p className={NOTE}>Filled from your account. Change it if you are filing this for someone else.</p>}
          </div>
          <div className="flex flex-col gap-1.5 px-5 py-4 sm:px-6">
            <label htmlFor="claim-email"><Cap as="span">Email</Cap></label>
            <input id="claim-email" className="zt-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} required autoComplete="email" />
            {kind === 'claim' && <p className={NOTE}>An address at the gym&rsquo;s own domain is the fastest way to confirm a claim.</p>}
          </div>
          {kind === 'claim' && (
            <div className="flex flex-col gap-1.5 px-5 py-4 sm:px-6">
              <label htmlFor="claim-role"><Cap as="span">Your role</Cap></label>
              <select id="claim-role" className="zt-input" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          <div className="flex flex-col gap-1.5 px-5 py-4 sm:px-6">
            <label htmlFor="claim-message"><Cap as="span">{kind === 'claim' ? 'Anything we should know (optional)' : 'What is wrong?'}</Cap></label>
            <textarea id="claim-message" className="zt-input min-h-[96px]" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
          </div>
          <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
            {error && <p className="text-[13px] font-bold text-redpen" role="alert">{error}</p>}
            <KeyButton type="submit" variant="pen" disabled={busy} className="self-start">
              {busy ? 'Sending…' : kind === 'claim' ? 'Send claim' : 'Send report'}
            </KeyButton>
            <p className={NOTE}>
              We use your name and email only to follow up on this {kind}. See our <Link href="/legal/privacy" className={textLink}>privacy notice</Link>.
            </p>
          </div>
        </form>
      )}
    </div>
  );
}
