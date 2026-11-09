'use client';
// 053 (Kurt 11/9): /promoter/import. Search the results archive, pick a show, optionally link the host gym, import.
// The result is a completed meet under this account with the published placings and the import disclaimer. One
// import per archive show; a show someone else already imported shows who has it (transfer is the path then).
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Cap, keyClass, textLink } from '@/components/website/sheet';
import { useAuth } from '@/lib/auth/useAuth';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { formatShowDate } from '@/lib/website/showHistory';
import { sanctionLabel, ARCHIVE_CREDIT } from '@/lib/website/archive';
import { adoptArchiveCompetition, adoptState, archiveCounts, archivePlace, searchArchiveCompetitions, type ArchiveSearchRow } from '@/lib/website/adoptArchive';
import HostGymPicker from '@/components/promoter/HostGymPicker';
import type { HostGymOption } from '@/lib/website/hostGym';

const H1 = 'text-[28px] sm:text-[34px] font-bold leading-tight text-ink';
const NOTE = 'text-[13px] leading-snug text-ink-muted';
const BODY = 'text-[15px] leading-relaxed text-ink';
const INPUT = 'zt-input w-full';
const SMALL = 'min-h-10 px-3.5 text-[12px] disabled:opacity-40 disabled:cursor-not-allowed';

export default function ImportArchiveClient({ initialGymId = '' }: { initialGymId?: string }) {
  const auth = useAuth();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<ArchiveSearchRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<ArchiveSearchRow | null>(null);
  const [gymId, setGymId] = useState(initialGymId);
  const [gymName, setGymName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (term: string) => {
    const sb = getSupabase(); if (!sb) return;
    setSearching(true); setError(null);
    try { setRows(await searchArchiveCompetitions(sb, term, 25)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setSearching(false);
  }, []);
  useEffect(() => { if (auth.user) void search(''); }, [auth.user, search]);

  const submitSearch = (e: React.FormEvent) => { e.preventDefault(); setPicked(null); void search(q); };

  const doImport = async () => {
    const sb = getSupabase(); if (!sb || !picked) return;
    setBusy(true); setError(null);
    try {
      const r = await adoptArchiveCompetition(sb, picked.slug, gymId || null);
      router.push(`/promoter/${encodeURIComponent(r.meetId)}?imported=1`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };

  if (auth.loading) return <p className={NOTE}>Loading…</p>;
  if (!auth.user) {
    return (
      <div className="flex flex-col gap-3 max-w-xl">
        <Cap as="span">Promoter · import</Cap>
        <h1 className={H1}>Import a past show</h1>
        <p className={BODY}>Sign in first. The imported show lands on your account as a completed meet.</p>
        <Link href="/website/account" className={keyClass('ink')}>Go to Account &amp; Sign-In</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2 max-w-2xl">
        <Cap as="span">Promoter · import</Cap>
        <h1 className={H1}>Import a past show</h1>
        <p className={BODY}>
          Pick a show from the results archive and it becomes a completed meet on your account: divisions, athletes,
          event marks and the published placings, listed under your name and on the host gym&rsquo;s hosting record.
          Imported shows carry a note that the results came from Iron Podium (or the source they were published on) and
          were not scored live on ZeroTacky. Athletes can still claim their results from it.
        </p>
        <p className={NOTE}>{ARCHIVE_CREDIT.text}</p>
      </div>

      <form onSubmit={submitSearch} className="flex flex-col sm:flex-row gap-2 max-w-2xl">
        <label htmlFor="archive-q" className="sr-only">Search the archive by show name, city, state or year</label>
        <input id="archive-q" className={INPUT} placeholder="Show name, city, state or year" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        <button type="submit" className={keyClass('pen', SMALL)} disabled={searching}>{searching ? 'Searching…' : 'Search'}</button>
      </form>

      {error && <p role="alert" className="text-[13px] font-bold text-redpen">{error}</p>}

      {picked && (
        <section aria-labelledby="import-confirm" className="border-2 border-ink p-4 sm:p-5 flex flex-col gap-4 max-w-2xl">
          <div className="flex flex-col gap-1">
            <Cap as="h2" id="import-confirm">Import this show</Cap>
            <div className="text-[20px] font-bold text-ink">{picked.name}</div>
            <div className={NOTE}>{formatShowDate(picked.date)}{archivePlace(picked) ? ` · ${archivePlace(picked)}` : ''}{picked.sanction ? ` · ${sanctionLabel(picked.sanction)}` : ''}</div>
            <div className={NOTE}>{archiveCounts(picked)}</div>
          </div>
          <HostGymPicker
            id="import-host-gym"
            value={gymId}
            label="Host gym (optional)"
            help="Puts the show on that gym's hosting record. You can set or change it later on the Listing tab."
            onChange={(g: HostGymOption | null) => { setGymId(g?.id ?? ''); setGymName(g?.name ?? ''); }}
          />
          <p className={NOTE}>
            The meet will be yours to transfer or hand off like any other. Results are locked as published{gymName ? `, and the show will list ${gymName} as host` : ''}.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={keyClass('pen', SMALL)} disabled={busy} onClick={() => void doImport()}>{busy ? 'Importing…' : 'Import as a completed meet'}</button>
            <button type="button" className={keyClass('line', SMALL)} disabled={busy} onClick={() => setPicked(null)}>Back to the list</button>
          </div>
        </section>
      )}

      {!picked && rows && (
        <div className="flex flex-col gap-1">
          <Cap as="span">{rows.length === 0 ? 'No shows match' : `${rows.length} show${rows.length === 1 ? '' : 's'}${q.trim() ? ` for “${q.trim()}”` : ', newest first'}`}</Cap>
          <ul className="flex flex-col divide-y-2 divide-rule border-y-2 border-rule">
            {rows.map((r) => {
              const st = adoptState(r);
              return (
                <li key={r.slug} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1 basis-[18rem] flex flex-col gap-0.5">
                    <Cap as="span">{formatShowDate(r.date)}{archivePlace(r) ? ` · ${archivePlace(r)}` : ''}{r.sanction ? ` · ${sanctionLabel(r.sanction)}` : ''}</Cap>
                    <span className="text-[17px] font-bold text-ink">{r.name}</span>
                    <span className={NOTE}>{archiveCounts(r)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {st === 'open' && <button type="button" className={keyClass('pen', SMALL)} onClick={() => setPicked(r)}>Import</button>}
                    {st === 'mine' && r.adopted && <Link href={`/promoter/${encodeURIComponent(r.adopted.id)}`} className={keyClass('ink', SMALL)}>Already yours · open</Link>}
                    {st === 'taken' && r.adopted && <Link href={`/shows/${encodeURIComponent(r.adopted.slug)}`} className={`${textLink} text-[13px]`}>Imported by another account</Link>}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
