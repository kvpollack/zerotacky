'use client';
// #11 (11/9): Account page: "Competed before ZeroTacky?" Search the imported archive by name, ask to attach a name to
// this account ("This is me"), see what is waiting on review. Approved names put the archive competitions on the public
// athlete page. Admins approve on /website/admin/archive; there is no promoter to ask.
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Cap, keyClass, textLink } from '@/components/website/sheet';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { formatShowDate } from '@/lib/website/showHistory';
import { ArchiveCredit } from '@/components/website/ArchiveHistory';
import {
  claimArchive, fetchMyArchiveLinks, searchArchive, withdrawArchiveClaim, type ArchiveLink, type ArchiveSearchHit,
} from '@/lib/website/archive';

const NOTE = 'text-[13px] leading-snug text-ink-muted';
const H2 = 'text-[22px] font-bold leading-tight text-ink';
const SMALL = 'min-h-10 px-3.5 text-[12px] disabled:opacity-40 disabled:cursor-not-allowed';
const INPUT = 'w-full max-w-md border-2 border-rule bg-sheet px-3 py-2 text-[15px] font-bold text-pen placeholder:font-normal placeholder:text-ink-muted outline-none focus-visible:border-pen';

export const ARCHIVE_LINK_STATUS: Record<ArchiveLink['status'], string> = {
  pending: 'Waiting on review',
  approved: 'On your athlete page',
  rejected: 'Not approved',
};

export default function ArchiveClaimSection({ displayName, username }: { displayName: string; username: string | null }) {
  const [links, setLinks] = useState<ArchiveLink[] | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ArchiveSearchHit[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    try { setLinks(await fetchMyArchiveLinks(sb)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const sb = getSupabase();
  if (!sb || links === null) return null;

  const search = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('search'); setError(null); setNotice(null);
    try { setHits(await searchArchive(sb, query)); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    setBusy(null);
  };
  const claim = async (h: ArchiveSearchHit) => {
    setBusy(h.key); setError(null); setNotice(null);
    try {
      await claimArchive(sb, h.key);
      setNotice(`Asked to attach "${h.name}" to your account. A ZeroTacky admin reviews it; approved names show on your athlete page.`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    setBusy(null);
  };
  const withdraw = async (id: string) => {
    setBusy(id); setError(null); setNotice(null);
    try { await withdrawArchiveClaim(sb, id); await load(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    setBusy(null);
  };
  const claimedKeys = new Set(links.filter((l) => l.status !== 'rejected').map((l) => l.key));
  const startSearch = () => { setOpen(true); if (!query) setQuery(displayName); };

  return (
    <section aria-labelledby="archive-claim-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Cap as="span">Results</Cap>
        <h2 id="archive-claim-heading" className={H2}>Archive results</h2>
        <p className={`${NOTE} max-w-2xl`}>
          Competed before ZeroTacky? US amateur results back to 2019 (PSL, Strongman Corporation, USS) are in the archive. Find your
          name, mark it as yours, and once an admin confirms it your competitions appear on your athlete page.
          {!username && <> Set a <strong>username</strong> above first so your athlete page exists.</>}
        </p>
      </div>
      {error && <p role="alert" className="text-[13px] font-bold text-pen">{error}</p>}
      {notice && !error && <p role="status" className="text-[13px] font-bold text-ink">{notice}</p>}

      {links.length > 0 && (
        <ul className="zt-block grid-cols-1" aria-label="Your archive names">
          {links.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1 basis-[14rem] flex flex-col gap-0.5">
                <Cap as="span">{l.competitions} {l.competitions === 1 ? 'competition' : 'competitions'} · asked {formatShowDate(l.createdAt.slice(0, 10))}</Cap>
                <div className="text-[17px] font-bold text-ink">{l.name ?? l.key}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`${NOTE} ${l.status === 'approved' ? 'text-pen font-bold' : ''}`}>{ARCHIVE_LINK_STATUS[l.status]}</span>
                {l.status === 'approved' && username && <Link href={`/athletes/${encodeURIComponent(username)}`} className={textLink}>View</Link>}
                {l.status === 'pending' && (
                  <button type="button" className={keyClass('line', SMALL)} disabled={busy === l.id} onClick={() => void withdraw(l.id)}>Withdraw</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!open ? (
        <div><button type="button" className={keyClass('ink', SMALL)} onClick={startSearch}>Find my archive results</button></div>
      ) : (
        <form onSubmit={search} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="archive-q" className="sr-only">Name as it appeared on the scoreboard</label>
            <input id="archive-q" className={INPUT} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name as it appeared on the scoreboard" autoComplete="off" />
            <button type="submit" className={keyClass('pen', SMALL)} disabled={busy === 'search' || query.trim().length < 3}>Search</button>
          </div>
          {hits && hits.length === 0 && <p className={NOTE}>No archive name matches that. Try fewer words, or the spelling the meet used.</p>}
          {hits && hits.length > 0 && (
            <ul className="zt-block grid-cols-1" aria-label="Archive names">
              {hits.map((h) => {
                const mine = claimedKeys.has(h.key);
                return (
                  <li key={h.key} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1 basis-[14rem] flex flex-col gap-0.5">
                      <Cap as="span">{h.competitions} {h.competitions === 1 ? 'competition' : 'competitions'} · {h.firstDate.slice(0, 4)}{h.lastDate.slice(0, 4) !== h.firstDate.slice(0, 4) ? `–${h.lastDate.slice(0, 4)}` : ''}{h.states.length ? ` · ${h.states.join(', ')}` : ''}</Cap>
                      <div className="text-[17px] font-bold text-ink">{h.name}</div>
                    </div>
                    {h.linked ? <span className={NOTE}>Already attached to an account</span>
                      : mine ? <span className={NOTE}>Asked</span>
                        : <button type="button" className={keyClass('pen', SMALL)} disabled={busy === h.key} onClick={() => void claim(h)}>This is me</button>}
                  </li>
                );
              })}
            </ul>
          )}
        </form>
      )}
      <ArchiveCredit />
    </section>
  );
}
