'use client';
// 052 (Kurt 11/9): mint, copy and withdraw ownership invite links for one gym or meet. Used on the promoter Meet tab
// (theme 'promoter', zt-* tokens) and on the public gym page for admins (theme 'website', ink/pen). The link is the
// whole handoff: whoever opens it and signs in owns the target, so the copy here says that plainly.
import React, { useCallback, useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInvite, daysLeft, INVITE_STATUS_LABEL, inviteKindNoun, inviterLabel, inviteUrl, listInvites, revokeInvite, type Invite, type InviteKind } from '@/lib/website/invites';

type Theme = 'promoter' | 'website';
const T: Record<Theme, { input: string; primary: string; quiet: string; note: string; text: string; link: string; box: string }> = {
  promoter: {
    input: 'w-full bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-sm font-bold text-zt-text',
    primary: 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border font-black text-[11px] uppercase disabled:opacity-50 disabled:cursor-not-allowed bg-zt-primary border-zt-primary text-zt-on-primary',
    quiet: 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border font-black text-[11px] uppercase disabled:opacity-50 disabled:cursor-not-allowed bg-zt-inset border-zt-border-strong text-zt-text',
    note: 'text-xs leading-snug text-zt-muted',
    text: 'text-sm text-zt-text',
    link: 'font-mono text-xs break-all text-zt-text',
    box: 'rounded-xl border border-dashed border-zt-border-strong px-3 py-2.5 flex flex-col gap-2',
  },
  website: {
    input: 'w-full border-2 border-rule bg-paper px-3 py-2 text-[13px] font-bold text-ink',
    primary: 'inline-flex items-center justify-center border-2 border-pen bg-pen text-pen-label px-3.5 min-h-10 text-[12px] font-bold uppercase tracking-[0.04em] disabled:opacity-40 disabled:cursor-not-allowed',
    quiet: 'inline-flex items-center justify-center border-2 border-ink text-ink px-3.5 min-h-10 text-[12px] font-bold uppercase tracking-[0.04em] disabled:opacity-40 disabled:cursor-not-allowed',
    note: 'text-[13px] leading-snug text-ink-muted',
    text: 'text-[15px] text-ink',
    link: 'font-mono text-[12px] break-all text-ink',
    box: 'border-2 border-dashed border-rule px-3 py-2.5 flex flex-col gap-2',
  },
};

export default function InviteLinks({ sb, kind, targetId, theme, idPrefix = 'inv' }: { sb: SupabaseClient; kind: InviteKind; targetId: string; theme: Theme; idPrefix?: string }) {
  const t = T[theme];
  const [rows, setRows] = useState<Invite[] | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await listInvites(sb, kind, targetId)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [sb, kind, targetId]);
  useEffect(() => { void load(); }, [load]);

  const make = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await createInvite(sb, kind, targetId, label); setLabel(''); await load(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    setBusy(false);
  };
  const withdraw = async (id: string) => {
    setBusy(true); setError(null);
    try { await revokeInvite(sb, id); await load(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    setBusy(false);
  };
  const copy = async (inv: Invite) => {
    const url = inviteUrl(inv.token);
    try { await navigator.clipboard.writeText(url); setCopied(inv.id); window.setTimeout(() => setCopied(null), 2000); }
    catch { setError('Copy failed. Select the link and copy it by hand.'); }
  };

  if (rows === null) return null;
  const open = rows.filter((r) => r.status === 'open');
  const settled = rows.filter((r) => r.status !== 'open');
  const noun = inviteKindNoun(kind);

  return (
    <div className="flex flex-col gap-3">
      <p className={t.note}>
        No account yet on their side? Make an invite link and send it however you talk to them. Whoever opens it and
        signs up (or signs in) becomes the owner of this {noun} right away, no claim form and no review. Links work
        once and expire in 14 days; you can withdraw one before it is used.
        {kind === 'meet' ? ' You stay on the meet as an admin after they accept.' : ''}
      </p>
      {open.map((inv) => (
        <div key={inv.id} className={t.box}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className={t.text}><strong>{inv.label || 'Invite link'}</strong></span>
            <span className={t.note}>{INVITE_STATUS_LABEL.open} · {daysLeft(inv.expiresAt)} days left</span>
          </div>
          <code className={t.link}>{inviteUrl(inv.token)}</code>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={t.primary} disabled={busy} onClick={() => void copy(inv)}>{copied === inv.id ? 'Copied' : 'Copy link'}</button>
            <button type="button" className={t.quiet} disabled={busy} onClick={() => void withdraw(inv.id)}>Withdraw</button>
          </div>
        </div>
      ))}
      <form onSubmit={make} className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${idPrefix}-label`} className="sr-only">Who this invite is for</label>
        <input id={`${idPrefix}-label`} className={`${t.input} max-w-xs`} placeholder="Who it is for (optional)" value={label} maxLength={80}
          onChange={(e) => setLabel(e.target.value)} autoComplete="off" />
        <button type="submit" className={t.primary} disabled={busy}>{open.length ? 'Make another link' : 'Make invite link'}</button>
      </form>
      {settled.length > 0 && (
        <ul className={`${t.note} flex flex-col gap-0.5`}>
          {settled.map((inv) => (
            <li key={inv.id}>
              {inv.label || 'Invite'}: {INVITE_STATUS_LABEL[inv.status]}
              {inv.status === 'redeemed' && inv.redeemedBy ? ` by ${inviterLabel(inv.redeemedBy)}` : ''}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-xs font-bold text-red-400">{error}</p>}
    </div>
  );
}
