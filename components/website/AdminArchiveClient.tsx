'use client';
// #11 (11/9): admin queue for archive name requests. Each row: the archive name with its record beside the account
// asking (display name, @username, location, sign-in email), plus two signals: do the names line up, do the states.
// Approve attaches the name (other pending asks for it close); reject leaves the account free to ask again.
import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Cap, keyClass, textLink } from '@/components/website/sheet';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { fetchIsAdmin } from '@/lib/website/myGym';
import { formatShowDate } from '@/lib/website/showHistory';
import { decideArchiveLink, fetchAdminArchiveLinks, nameSimilarity, type AdminArchiveLink } from '@/lib/website/archive';
import { stateFromLocation } from '@/lib/website/athletes';

const SMALL = 'min-h-10 px-3.5 text-[12px] disabled:opacity-40 disabled:cursor-not-allowed';
const CHIP = 'inline-flex items-center border-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] whitespace-nowrap';
const CHIP_GOOD = `${CHIP} border-pen bg-pen text-pen-label`;
const CHIP_WARN = `${CHIP} border-dashed border-rule text-ink-muted`;
const CHIP_BAD = `${CHIP} border-redpen text-redpen`;
const NOTE = 'text-[13px] leading-snug text-ink-muted';

function NameChip({ r }: { r: AdminArchiveLink }) {
  const v = nameSimilarity(r.name ?? r.key, r.displayName ?? '');
  const cls = v === 'same' ? CHIP_GOOD : v === 'close' ? CHIP_WARN : CHIP_BAD;
  return <span className={cls}>{v === 'same' ? 'Names match' : v === 'close' ? 'Names close, check' : 'Names differ'}</span>;
}
function StateChip({ r }: { r: AdminArchiveLink }) {
  const st = stateFromLocation(r.location ?? '');
  if (!st) return <span className={CHIP_WARN}>No location on profile</span>;
  return r.states.includes(st) ? <span className={CHIP_GOOD}>Competed in {st}</span> : <span className={CHIP_WARN}>Profile {st}, archive {r.states.join(', ') || 'none'}</span>;
}

export default function AdminArchiveClient() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<AdminArchiveLink[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) { setIsAdmin(false); return; }
    const ok = await fetchIsAdmin(sb); setIsAdmin(ok);
    if (!ok) return;
    try { setRows(await fetchAdminArchiveLinks(sb)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const decide = async (id: string, approve: boolean) => {
    const sb = getSupabase(); if (!sb) return;
    setBusy(id); setError(null);
    try { await decideArchiveLink(sb, id, approve); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  if (isAdmin === null) return <p className={NOTE}>Loading…</p>;
  if (!isAdmin) return <p className={NOTE}>This page is for ZeroTacky admins. <Link href="/website/account" className={textLink}>Back to your account</Link>.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Cap as="span">Admin</Cap>
        <h1 className="text-[28px] font-bold leading-tight text-ink">Archive name requests</h1>
        <p className={`${NOTE} max-w-2xl`}>Approve attaches the archive name to the account and puts its competitions on their athlete page. One owner per name.</p>
      </div>
      {error && <p role="alert" className="text-[13px] font-bold text-pen">{error}</p>}
      {rows.length === 0 ? <p className={NOTE}>Nothing waiting.</p> : (
        <ul className="zt-block grid-cols-1">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-4 py-3 sm:px-5">
              <div className="min-w-0 flex-1 basis-[18rem] flex flex-col gap-1">
                <Cap as="span">Archive name · {r.competitions} {r.competitions === 1 ? 'competition' : 'competitions'}{r.lastDate ? `, last ${formatShowDate(r.lastDate)}` : ''}{r.states.length ? ` · ${r.states.join(', ')}` : ''}</Cap>
                <div className="text-[17px] font-bold text-ink">{r.name ?? r.key}</div>
                <div className="text-[13px] text-ink">
                  Asked by <strong>{r.displayName ?? '(no display name)'}</strong>
                  {r.username ? <> · <Link href={`/athletes/${encodeURIComponent(r.username)}`} target="_blank" className={textLink}>@{r.username}</Link></> : ' · no username'}
                  {r.location ? ` · ${r.location}` : ''}{r.email ? ` · ${r.email}` : ''}
                </div>
                {r.note && <div className={NOTE}>“{r.note}”</div>}
                <div className="flex flex-wrap gap-1.5 pt-1"><NameChip r={r} /><StateChip r={r} /></div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={keyClass('pen', SMALL)} disabled={busy === r.id} onClick={() => void decide(r.id, true)}>Approve</button>
                <button type="button" className={keyClass('line', SMALL)} disabled={busy === r.id} onClick={() => void decide(r.id, false)}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
