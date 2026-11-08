'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/useAuth';
import { usePromoterApi } from '@/lib/promoter/usePromoterApi';
import { CLAIM_NOTE_MAX, type ClaimStatus } from '@/lib/promoter/contract';
import type { Athlete, Division } from '@/lib/types';
import { Cap, KeyButton, WebCell, textLink } from './sheet';

interface Props {
  meetServerId: string;
  athletes: Athlete[];
  divisions: Division[];
  isDemoFixture: boolean;
  /** Final results are already on the athlete page; otherwise they land there once the promoter marks them Final. */
  resultsFinal: boolean;
}

// 048 "claim my result" (#9, 11/8). On a completed show, a signed-in athlete picks their roster row and asks the
// promoter to link it; approval puts the show on their public page and feeds the competition bests. Linked rows are
// greyed; one pending claim per account per show. Signed out: a sign-in link. Demo fixtures: nothing (no server row).
export default function ClaimResultClient({ meetServerId, athletes, divisions, isDemoFixture, resultsFinal }: Props) {
  const auth = useAuth();
  const api = usePromoterApi();
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<ClaimStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [athleteId, setAthleteId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!mounted || auth.loading || !auth.user || isDemoFixture) return;
    let cancelled = false;
    (async () => {
      const res = await api.getClaimStatus(meetServerId);
      if (cancelled) return;
      if (res.data) setStatus(res.data);
      else setError(res.error ?? 'Could not load your claim status.');
    })();
    return () => { cancelled = true; };
  }, [mounted, auth.loading, auth.user, api, meetServerId, isDemoFixture]);

  const linked = useMemo(() => new Set(status?.linkedAthleteIds ?? []), [status]);
  const grouped = useMemo(() => {
    const divs = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder);
    return divs.map((d) => ({
      division: d,
      athletes: athletes.filter((a) => a.divisionId === d.id).sort((a, b) => a.name.localeCompare(b.name)),
    })).filter((g) => g.athletes.length > 0);
  }, [athletes, divisions]);

  if (isDemoFixture || !mounted || auth.loading) return null;

  const shell = (children: React.ReactNode) => (
    <div className="zt-block grid-cols-1 mt-3">
      <WebCell className="gap-2">
        <Cap>Competed here?</Cap>
        {children}
      </WebCell>
    </div>
  );

  if (!auth.user) {
    return shell(
      <p className="text-[14px] leading-snug text-ink">
        <Link href="/website/account" className={textLink}>Sign in</Link> to claim your result. Approved claims put this show on your athlete page and into your competition bests.
      </p>
    );
  }
  if (!status) return error ? shell(<p role="alert" className="text-[13px] font-bold text-pen">{error}</p>) : null;

  const myName = status.myAthleteId ? athletes.find((a) => a.id === status.myAthleteId)?.name ?? 'you' : null;
  if (status.myAthleteId) {
    return shell(<p className="text-[14px] leading-snug text-ink">This show is linked to your account as <strong>{myName}</strong>. {resultsFinal ? 'It is on your athlete page.' : 'It shows on your athlete page once the promoter marks results Final.'}</p>);
  }
  const claim = status.myClaim;
  if (claim && claim.status === 'pending') {
    const withdraw = async () => {
      setBusy(true); setError(null);
      const res = await api.withdrawClaim(claim.id);
      setBusy(false);
      if (res.error) { setError(res.error); return; }
      setStatus({ ...status, myClaim: null });
    };
    return shell(
      <>
        <p className="text-[14px] leading-snug text-ink">
          Your claim for <strong>{claim.athleteName}</strong> is with the promoter. You will see it on your account page when it is approved.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <KeyButton variant="line" className="min-h-9 px-3 text-xs" disabled={busy} onClick={withdraw}>Withdraw claim</KeyButton>
          {error && <span role="alert" className="text-[13px] font-bold text-pen">{error}</span>}
        </div>
      </>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!athleteId) { setError('Pick your name from the roster.'); return; }
    setBusy(true); setError(null);
    const res = await api.claimResult(meetServerId, athleteId, note.trim() || null);
    setBusy(false);
    if (res.error || !res.data) { setError(res.error ?? 'Could not send the claim.'); return; }
    setStatus({ ...status, myClaim: res.data });
    setOpen(false); setAthleteId(''); setNote('');
  };

  return shell(
    <>
      <p className="text-[14px] leading-snug text-ink">
        {claim?.status === 'rejected'
          ? <>Your earlier claim for <strong>{claim.athleteName}</strong> was not approved. If you picked the wrong row, claim again.</>
          : <>Claim your result and the promoter links it to your account: this show lands on your athlete page and in your competition bests.</>}
      </p>
      {!open ? (
        <div>
          <KeyButton variant="ink" className="min-h-9 px-3 text-xs" onClick={() => setOpen(true)}>Claim my result</KeyButton>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2 max-w-[520px]">
          <label htmlFor="claim-athlete" className="text-[12px] font-bold uppercase tracking-[0.04em] text-ink">Your name on the roster</label>
          <select
            id="claim-athlete"
            value={athleteId}
            onChange={(e) => setAthleteId(e.target.value)}
            className="min-h-10 border-2 border-rule bg-sheet px-3 text-[14px] font-bold text-ink focus:outline-none focus:border-pen"
          >
            <option value="">Pick a row</option>
            {grouped.map((g) => (
              <optgroup key={g.division.id} label={g.division.name}>
                {g.athletes.map((a) => (
                  <option key={a.id} value={a.id} disabled={linked.has(a.id)}>
                    {a.name}{linked.has(a.id) ? ' (already linked)' : a.status === 'withdrawn' ? ' (scratched)' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <label htmlFor="claim-note" className="text-[12px] font-bold uppercase tracking-[0.04em] text-ink">Note to the promoter (optional)</label>
          <input
            id="claim-note"
            type="text"
            maxLength={CLAIM_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. registered under my maiden name"
            className="min-h-10 border-2 border-rule bg-sheet px-3 text-[14px] text-ink focus:outline-none focus:border-pen"
          />
          <div className="flex flex-wrap items-center gap-2">
            <KeyButton type="submit" variant="ink" className="min-h-9 px-3 text-xs" disabled={busy}>{busy ? 'Sending…' : 'Send claim'}</KeyButton>
            <KeyButton variant="line" className="min-h-9 px-3 text-xs" disabled={busy} onClick={() => { setOpen(false); setError(null); }}>Cancel</KeyButton>
            {error && <span role="alert" className="text-[13px] font-bold text-pen">{error}</span>}
          </div>
        </form>
      )}
    </>
  );
}
