'use client';
// 048 result claims (#9, 11/8): the athlete's side on the Account page. Lists every claim with its status; a pending
// one can be withdrawn. Claims start on a completed show's page ("Competed here?").
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cap, keyClass, textLink } from '@/components/website/sheet';
import { usePromoterApi } from '@/lib/promoter/usePromoterApi';
import type { ResultClaim } from '@/lib/promoter/contract';
import { formatShowDate } from '@/lib/website/showHistory';

const NOTE = 'text-[13px] leading-snug text-ink-muted';
const H2 = 'text-[22px] font-bold leading-tight text-ink';

export const CLAIM_STATUS_LABEL: Record<ResultClaim['status'], string> = {
  pending: 'Waiting on the promoter',
  approved: 'Approved',
  rejected: 'Not approved',
};

export default function MyClaimsSection() {
  const api = usePromoterApi();
  const [claims, setClaims] = useState<ResultClaim[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await api.listMyClaims();
      if (cancelled) return;
      if (res.data) setClaims(res.data);
      else setError(res.error ?? 'Could not load your claims.');
    })();
    return () => { cancelled = true; };
  }, [api]);

  const withdraw = async (id: string) => {
    setBusyId(id); setError(null);
    const res = await api.withdrawClaim(id);
    setBusyId(null);
    if (res.error) { setError(res.error); return; }
    setClaims((prev) => (prev ?? []).filter((c) => c.id !== id));
  };

  if (claims && claims.length === 0 && !error) return null;

  return (
    <section aria-labelledby="claims-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Cap as="span">Results</Cap>
        <h2 id="claims-heading" className={H2}>Result claims</h2>
        <p className={`${NOTE} max-w-2xl`}>
          Competed on a show that was scored here but registered elsewhere? Open the show page and use <strong>Competed here?</strong> to
          claim your row. Approved claims appear on your athlete page and in your competition bests.
        </p>
      </div>
      {error && <p role="alert" className="text-[13px] font-bold text-pen">{error}</p>}
      {claims && claims.length > 0 && (
        <ul className="zt-block grid-cols-1">
          {claims.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="text-[15px] font-bold text-ink">
                  <Link href={`/shows/${encodeURIComponent(c.slug)}`} className={textLink}>{c.meetName}</Link>
                  <span className="text-ink-muted font-normal"> · {formatShowDate(c.meetDate)}</span>
                </div>
                <div className={NOTE}>
                  {c.athleteName ?? 'Roster row removed'}{c.divisionName ? ` · ${c.divisionName}` : ''}{c.note ? ` · "${c.note}"` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[12px] font-bold uppercase tracking-[0.04em] ${c.status === 'approved' ? 'text-pen' : c.status === 'rejected' ? 'text-ink-muted' : 'text-ink'}`}>
                  {CLAIM_STATUS_LABEL[c.status]}
                </span>
                {c.status === 'pending' && (
                  <button type="button" disabled={busyId === c.id} onClick={() => withdraw(c.id)} className={keyClass('line', 'min-h-8 px-2.5 text-[11px]')}>
                    Withdraw
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
