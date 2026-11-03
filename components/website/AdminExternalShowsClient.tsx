'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useAuth } from '@/lib/auth/useAuth';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { fetchIsAdmin } from '@/lib/website/myGym';
import { Cap, keyClass, textLink } from '@/components/website/sheet';
import { externalHost } from '@/lib/website/externalShows';

// Feature 2 MVP (11/3): the admin queue for shows registered elsewhere (038). Pending rows first, then everything
// from the last week on, so a listed show can still be hidden. Open the link before listing: that is the whole review.
interface QueueRow {
  id: string; name: string; date: string; city: string; state: string; facility_name: string | null; federation: string | null;
  divisions_note: string | null; registration_url: string; source: 'promoter' | 'admin'; status: 'pending' | 'listed' | 'hidden';
  submitter_note: string | null; admin_note: string | null; reviewed_at: string | null; created_at: string; submitted_by_username: string | null;
}
const errText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e));

export default function AdminExternalShowsClient() {
  const auth = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !auth.user) return;
    const admin = await fetchIsAdmin(sb);
    setIsAdmin(admin);
    if (!admin) { setRows([]); return; }
    const { data, error } = await sb.rpc('zt_admin_external_shows');
    if (error) { setNotice(errText(error)); setRows([]); return; }
    setRows((data as QueueRow[]) ?? []);
  }, [auth.user]);
  useEffect(() => { void load(); }, [load]);

  const review = async (row: QueueRow, status: 'listed' | 'hidden' | 'pending') => {
    const sb = getSupabase();
    if (!sb) return;
    setBusy(row.id); setNotice(null);
    const { error } = await sb.rpc('zt_review_external_show', { p_id: row.id, p_status: status, p_admin_note: null });
    setBusy(null);
    if (error) { setNotice(errText(error)); return; }
    setNotice(`${row.name}: ${status}.`);
    await load();
  };

  const back = (
    <Link href="/website/account" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.04em] text-ink-muted hover:text-ink">
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Account
    </Link>
  );

  if (!auth.enabled) return <p className="text-[15px] text-ink-muted">Accounts are not configured on this build.</p>;
  if (auth.loading || (auth.user && isAdmin === null)) return <p className="text-[13px] uppercase tracking-[0.04em] text-ink-muted">Checking your session…</p>;
  if (!auth.user || !isAdmin) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <p className="text-[15px] text-ink">This queue is for ZeroTacky admins.</p>
      </div>
    );
  }
  const pending = (rows ?? []).filter((r) => r.status === 'pending');
  const rest = (rows ?? []).filter((r) => r.status !== 'pending');

  const Row = ({ r }: { r: QueueRow }) => (
    <div className="contents" role="row">
      <div role="cell" className="flex flex-col justify-center px-3.5 py-3 min-w-0">
        <div className="font-bold text-ink leading-tight">{r.name}</div>
        <div className="text-[13px] text-ink-muted mt-0.5">
          {r.date} · {[r.facility_name, r.city, r.state].filter(Boolean).join(', ')}{r.federation ? ` · ${r.federation}` : ''}
        </div>
        {r.divisions_note && <div className="text-[13px] text-ink mt-1">{r.divisions_note}</div>}
        <a href={r.registration_url} target="_blank" rel="noopener noreferrer" className={`${textLink} inline-flex items-center gap-1 text-[13px] mt-1.5 self-start break-all`}>
          {externalHost(r.registration_url)} <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
        </a>
        <div className="text-xs text-ink-muted mt-1.5">
          {r.source === 'admin' ? 'Entered by an admin' : `Submitted by ${r.submitted_by_username ? `@${r.submitted_by_username}` : 'a signed-in user'}`} on {r.created_at.slice(0, 10)}
          {r.submitter_note ? ` · "${r.submitter_note}"` : ''}
        </div>
      </div>
      <div role="cell" className="flex flex-col items-end justify-center gap-2 px-3.5 py-3">
        <span className={`text-xs uppercase tracking-[0.04em] ${r.status === 'listed' ? 'text-pen font-bold' : 'text-ink-muted'}`}>{r.status}</span>
        <div className="flex flex-wrap justify-end gap-2">
          {r.status !== 'listed' && <button type="button" disabled={busy === r.id} onClick={() => review(r, 'listed')} className={keyClass('ink', 'min-h-10 px-4 text-xs')}>List</button>}
          {r.status !== 'hidden' && <button type="button" disabled={busy === r.id} onClick={() => review(r, 'hidden')} className={keyClass('line', 'min-h-10 px-4 text-xs')}>Hide</button>}
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl flex flex-col gap-6">
      {back}
      <div className="flex flex-col gap-1">
        <Cap as="h2">Admin</Cap>
        <h1 className="text-[28px] font-bold leading-tight text-ink">Show listings queue</h1>
        <p className="text-[15px] text-ink">Shows registered elsewhere, submitted from <Link href="/shows/submit" className={textLink}>List a show</Link>. Open the link, check the date and place, then List or Hide.</p>
      </div>
      {notice && <div role="status" className="text-[13px] font-bold text-ink">{notice}</div>}
      <section aria-label="Pending listings" className="flex flex-col gap-2">
        <Cap>Pending ({pending.length})</Cap>
        {pending.length === 0 ? <p className="text-[13px] text-ink-muted">Nothing waiting.</p> : (
          <div role="table" className="zt-block grid-cols-[1fr_auto]">{pending.map((r) => <Row key={r.id} r={r} />)}</div>
        )}
      </section>
      <section aria-label="Recent listings" className="flex flex-col gap-2">
        <Cap>Listed or hidden, last 7 days and upcoming ({rest.length})</Cap>
        {rest.length === 0 ? <p className="text-[13px] text-ink-muted">None yet.</p> : (
          <div role="table" className="zt-block grid-cols-[1fr_auto]">{rest.map((r) => <Row key={r.id} r={r} />)}</div>
        )}
      </section>
    </div>
  );
}
