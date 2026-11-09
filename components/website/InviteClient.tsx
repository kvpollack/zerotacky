'use client';
// 052 (Kurt 11/9): /invite/<token>. Signed out: say what the invite is and who sent it, then the sign-in form in
// sign-up mode with this page as the return path (the confirmation email lands on /website/account and bounces back
// here, the same route the registration page uses). Signed in: redeem once, then point at the new thing. Re-opening a
// redeemed link as its redeemer is harmless (the RPC answers `already`).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import SignInForm from '@/components/auth/SignInForm';
import { Cap, Key, textLink } from '@/components/website/sheet';
import { useAuth } from '@/lib/auth/useAuth';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { formatShowDate } from '@/lib/website/showHistory';
import { afterRedeemHref, inviteKindNoun, inviterLabel, invitePath, previewHeadline, previewInvite, redeemInvite, type InvitePreview, type RedeemResult } from '@/lib/website/invites';

const H1 = 'text-[28px] sm:text-[34px] font-bold leading-tight text-ink';
const NOTE = 'text-[13px] leading-snug text-ink-muted';
const BODY = 'text-[15px] leading-relaxed text-ink';

function TargetCard({ p }: { p: InvitePreview }) {
  if (!p.target || !p.kind) return null;
  const t = p.target;
  const sub = p.kind === 'gym'
    ? (t.place ?? 'Gym listing')
    : `${t.date ? formatShowDate(t.date) : 'Date not set'} · ${t.athletes ?? 0} ${t.athletes === 1 ? 'athlete' : 'athletes'}`;
  const href = p.kind === 'gym' ? `/gyms/${encodeURIComponent(t.slug)}` : `/shows/${encodeURIComponent(t.slug)}`;
  return (
    <div className="border-2 border-ink p-4 flex flex-col gap-1">
      <Cap as="span">{p.kind === 'gym' ? 'Gym listing' : 'Meet'}</Cap>
      <Link href={href} className={`text-[20px] font-bold ${textLink}`}>{t.name}</Link>
      <span className={NOTE}>{sub}</span>
    </div>
  );
}

export default function InviteClient({ token }: { token: string }) {
  const auth = useAuth();
  const sb = useMemo(() => (typeof window === 'undefined' ? null : getSupabase()), []);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const redeemedFor = useRef<string | null>(null);

  useEffect(() => {
    // Server and first client paint both show "Checking…" (no Supabase client on the server); the not-configured
    // message arrives through state so the trees match (hydration #418, same shape as useAuth's loading flag).
    if (!sb) { setError('Accounts are not configured on this build.'); return; }
    let alive = true;
    previewInvite(sb, token).then((p) => { if (alive) setPreview(p); }).catch((e) => { if (alive) setError(e instanceof Error ? e.message : String(e)); });
    return () => { alive = false; };
  }, [sb, token, auth.user?.id]);

  // Redeem as soon as there is a session and the invite is open (or already ours). Once per user per token.
  useEffect(() => {
    if (!sb || !auth.user || !preview || result) return;
    if (preview.status !== 'open' && !(preview.status === 'redeemed' && preview.isMine)) return;
    if (preview.isCreator) return;
    const key = `${auth.user.id}:${token}`;
    if (redeemedFor.current === key) return;
    redeemedFor.current = key;
    setBusy(true);
    redeemInvite(sb, token)
      .then(async (r) => {
        setResult(r);
        await auth.refreshProfile();
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  }, [sb, auth, preview, result, token]);

  if (!preview && !error) return <p className={NOTE}>Checking this invite…</p>;

  const headline = preview ? previewHeadline(preview) : 'This invite link could not be checked.';
  const dead = !preview || preview.status === 'unknown' || preview.status === 'expired' || preview.status === 'revoked' || (preview.status === 'redeemed' && !preview.isMine);

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <div className="flex flex-col gap-2">
        <Cap as="span">Ownership invite</Cap>
        <h1 className={H1}>{result ? (result.already ? 'This one is already yours.' : 'It is yours.') : headline}</h1>
        {preview?.status === 'open' && !result && (
          <p className={BODY}>
            {inviterLabel(preview.from)} set this {inviteKindNoun(preview.kind ?? 'meet')} up and is handing it to you. Accepting makes your
            account the owner: you edit it, you run it, it shows under your name.
            {preview.kind === 'meet' ? ` ${inviterLabel(preview.from)} stays on the meet as an admin so you can keep working on it together.` : ''}
          </p>
        )}
      </div>

      {preview && <TargetCard p={preview} />}

      {result && (
        <div className="flex flex-col gap-3">
          <p className={BODY}>
            {result.kind === 'gym'
              ? 'The listing is now maintained by you. Edit implements, day-pass details and hours from My Gym.'
              : 'The meet now belongs to this account. Open it in the promoter dashboard to keep building.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Key href={afterRedeemHref(result.kind, result.targetId)} variant="pen">{result.kind === 'gym' ? 'Open My Gym' : 'Open the meet'}</Key>
            <Key href="/website/account" variant="line">Your account</Key>
          </div>
        </div>
      )}

      {!result && preview?.isCreator && (
        <p className={BODY}>This is your own invite. Copy the link from where you made it and send it to the person who should own this.</p>
      )}

      {!result && !dead && !preview?.isCreator && !auth.user && !auth.loading && (
        <div className="flex flex-col gap-3">
          <p className={BODY}>Create a ZeroTacky account to accept, or sign in if you already have one. You come straight back here afterwards.</p>
          <SignInForm auth={auth} defaultMode="signup" returnTo={invitePath(token)} idPrefix="invite-acct" />
        </div>
      )}

      {!result && !dead && auth.user && busy && <p className={NOTE}>Accepting…</p>}

      {dead && (
        <p className={BODY}>
          Ask {preview?.from ? inviterLabel(preview.from) : 'whoever sent it'} for a fresh link, or <Link href="/gyms" className={textLink}>find the gym</Link> and use Claim this gym.
        </p>
      )}

      {error && <p role="alert" className="text-[13px] font-bold text-redpen">{error}</p>}
    </div>
  );
}
