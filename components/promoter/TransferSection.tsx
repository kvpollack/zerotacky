'use client';
// 051 (Kurt 11/9): "Ownership" block on the Meet tab. The owner sends a transfer to an @username; the pending request
// shows here with Cancel until the other account answers on its Account page. Members who are not the owner see who
// owns the meet. The sender stays on the meet as an admin after acceptance, so building a meet for someone and running
// it alongside them keeps working.
import React, { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cancelTransfer, fetchTransferState, partyLabel, requestTransfer, type TransferState } from '@/lib/website/meetTransfers';

const INPUT = 'w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-sm font-bold text-zt-text';
const KEY = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border font-black text-[11px] uppercase disabled:opacity-50 disabled:cursor-not-allowed';
const KEY_PRIMARY = `${KEY} bg-zt-primary border-zt-primary text-zt-on-primary`;
const KEY_QUIET = `${KEY} bg-zt-inset border-zt-border-strong text-zt-text`;
const NOTE = 'text-xs leading-snug text-zt-muted';

export default function TransferSection({ sb, meetId }: { sb: SupabaseClient | null; meetId: string }) {
  const [state, setState] = useState<TransferState | null>(null);
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sb) return;
    try { setState(await fetchTransferState(sb, meetId)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [sb, meetId]);
  useEffect(() => { void load(); }, [load]);

  if (!sb || !state) return null;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      const t = await requestTransfer(sb, meetId, username);
      setNotice(`Sent to ${partyLabel(t.to)}. They accept it on their Account page.`);
      setUsername('');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    setBusy(false);
  };
  const cancel = async (id: string) => {
    setBusy(true); setError(null); setNotice(null);
    try { await cancelTransfer(sb, id); setNotice('Transfer cancelled.'); await load(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    setBusy(false);
  };

  return (
    <section aria-labelledby="transfer-heading" className="rounded-2xl border border-zt-border bg-zt-surface p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="transfer-heading" className="text-sm font-black uppercase tracking-wide text-zt-text">Ownership</h3>
        <span className={NOTE}>Owner: {partyLabel(state.owner)}</span>
      </div>
      {!state.isOwner && (
        <p className={NOTE}>You are on this meet as an admin. Only the owner can transfer it.</p>
      )}
      {state.isOwner && state.pending && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-zt-border-strong px-3 py-2.5">
          <div className="text-sm text-zt-text">
            Transfer to <strong>{partyLabel(state.pending.to)}</strong> is waiting on their answer.
          </div>
          <button type="button" className={KEY_QUIET} disabled={busy} onClick={() => void cancel(state.pending!.id)}>Cancel transfer</button>
        </div>
      )}
      {state.isOwner && !state.pending && (
        <form onSubmit={send} className="flex flex-col gap-2">
          <p className={NOTE}>
            Hand this meet to another account. They accept on their Account page and become the owner; you stay on the meet as an
            admin, so you can keep building and running it with them. Everything on the meet (divisions, athletes, registrations,
            results, listing) moves with it.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="transfer-username" className="sr-only">Username of the new owner</label>
            <input id="transfer-username" className={`${INPUT} max-w-xs`} placeholder="@username" value={username}
              onChange={(e) => setUsername(e.target.value)} autoComplete="off" spellCheck={false} />
            <button type="submit" className={KEY_PRIMARY} disabled={busy || !username.trim()}>Send transfer</button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="text-xs font-bold text-red-400">{error}</p>}
      {notice && !error && <p role="status" className="text-xs font-bold text-zt-text">{notice}</p>}
    </section>
  );
}
