'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ExternalLink, Flag, RefreshCw, ShieldCheck, Trash2, UserCheck, X } from 'lucide-react';
import { useAuth } from '@/lib/auth/useAuth';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import {
  adminApproveClaim, adminRejectClaim, adminRemoveGym, adminResolveReport, emailMatchesSite, fetchAdminClaims, fetchIsAdmin,
  sendClaimApprovedEmail,
  type AdminClaimRow,
} from '@/lib/website/myGym';

// Gym claims queue (017, 10/21). Admins are rows in zt_admins; everything here runs through admin-gated RPCs, so the
// page is a convenience over SQL, not the security boundary. Non-admins see a short refusal and the RPCs return
// nothing anyway.
const primaryBtn = 'px-3 py-1.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-[11px] uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-40';
const quietBtn = 'px-3 py-1.5 rounded-xl bg-zt-surface border border-zt-border-strong text-zt-text font-extrabold text-[11px] uppercase inline-flex items-center gap-1.5 disabled:opacity-40';
const dangerBtn = 'px-3 py-1.5 rounded-xl bg-zt-danger/10 border border-zt-danger/50 text-zt-danger-text font-extrabold text-[11px] uppercase inline-flex items-center gap-1.5 disabled:opacity-40';

function errText(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
}

// The signal uses the account's confirmed sign-in email, never the address typed into the claim form (Astra G-M2).
function EmailChip({ accountEmail, website }: { accountEmail: string | null; website: string }) {
  const v = emailMatchesSite(accountEmail, website);
  const cls = v === 'match'
    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
    : v === 'generic' || v === 'related'
      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
      : v === 'mismatch'
        ? 'bg-zt-danger/15 text-zt-danger-text border-zt-danger/50'
        : 'bg-zt-inset text-zt-muted border-zt-border';
  const label = !accountEmail
    ? 'No confirmed account email'
    : v === 'match' ? 'Account email is on the site domain'
      : v === 'related' ? 'Account email on a subdomain, check by hand'
        : v === 'generic' ? 'Personal email, verify another way'
          : v === 'mismatch' ? 'Account email is not on the site domain'
            : 'Site on a shared platform, domain says nothing';
  return <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>;
}

function Row({ r, busy, onAction }: { r: AdminClaimRow; busy: boolean; onAction: (label: string, fn: () => Promise<void | string>) => void }) {
  const isReport = r.kind === 'report';
  const newListing = r.gym_status === 'pending';
  const site = r.gym_website || r.gym_source_url;
  return (
    <li className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${isReport ? 'bg-zt-inset text-zt-text-2 border-zt-border' : newListing ? 'bg-sky-500/20 text-sky-300 border-sky-500/40' : 'bg-zt-primary/15 text-zt-primary border-zt-primary/50'}`}>
              {isReport ? 'Report' : newListing ? 'New listing' : 'Claim'}
            </span>
            <span className="text-sm font-black text-zt-text">{r.gym_name}</span>
            <span className="text-xs text-zt-muted">{r.gym_city}, {r.gym_state}</span>
            {r.pending_claims_on_gym > 1 && (
              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">{r.pending_claims_on_gym} claims on this gym</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zt-text-2">
            {!newListing && (
              <Link href={`/gyms/${r.gym_slug}`} target="_blank" className="inline-flex items-center gap-1 text-zt-primary font-bold">
                <ExternalLink className="w-3 h-3" aria-hidden="true" /> Public page
              </Link>
            )}
            {site && (
              <a href={/^https?:\/\//i.test(site) ? site : `https://${site}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-zt-primary font-bold break-all">
                <ExternalLink className="w-3 h-3" aria-hidden="true" /> {site.replace(/^https?:\/\/(www\.)?/i, '')}
              </a>
            )}
            <span className="text-zt-muted">filed {new Date(r.created_at).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-3 text-xs">
        <div className="space-y-1">
          <div className="text-[10px] font-extrabold uppercase text-zt-muted">{isReport ? 'Reported by' : 'Claimant'}</div>
          <div className="font-bold text-zt-text">{r.name}{r.claimant_display_name && r.claimant_display_name !== r.name ? <span className="text-zt-muted font-normal"> (account: {r.claimant_display_name})</span> : null}</div>
          <div className="text-zt-text-2 break-all">
            {r.account_email ? <>{r.account_email} <span className="text-zt-muted">(account)</span></> : <span className="text-zt-muted">no confirmed account email</span>}
          </div>
          {r.email && r.email.toLowerCase() !== (r.account_email ?? '').toLowerCase() && (
            <div className="text-zt-muted break-all">{r.email} <span>(typed into the form, unverified)</span></div>
          )}
          {r.role && <div className="text-zt-text-2">{r.role}</div>}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {!isReport && <EmailChip accountEmail={r.account_email} website={site} />}
            {!r.user_id && <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-zt-inset text-zt-muted border border-zt-border">Not signed in</span>}
          </div>
        </div>
        <div className="space-y-1">
          <div className="text-[10px] font-extrabold uppercase text-zt-muted">Message</div>
          <p className="text-zt-text-2 whitespace-pre-wrap break-words">{r.message || <span className="text-zt-muted">(none)</span>}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-zt-border pt-3">
        {isReport ? (
          <>
            <button type="button" disabled={busy} className={primaryBtn} onClick={() => onAction('Marked handled', () => adminResolveReport(getSupabase()!, r.id, true))}>
              <Check className="w-3.5 h-3.5" aria-hidden="true" /> Handled
            </button>
            <button type="button" disabled={busy} className={quietBtn} onClick={() => onAction('Dismissed', () => adminResolveReport(getSupabase()!, r.id, false))}>
              <X className="w-3.5 h-3.5" aria-hidden="true" /> Dismiss
            </button>
          </>
        ) : (
          <>
            <button type="button" disabled={busy || !r.user_id} title={r.user_id ? undefined : 'Claimant was not signed in; ask them to sign in and claim again'} className={primaryBtn} onClick={() => onAction(newListing ? 'Listing published' : 'Claim approved', async () => {
              const sb = getSupabase()!;
              await adminApproveClaim(sb, r.id);
              // 027: the approval stands even if the email fails; the notice says which happened.
              try {
                const sent = await sendClaimApprovedEmail(sb, r.id);
                return sent.skipped ? `${sent.to} was already notified` : `email sent to ${sent.to}`;
              } catch (e) {
                return `EMAIL_FAILED:${r.id}:${errText(e)}`;
              }
            })}>
              <UserCheck className="w-3.5 h-3.5" aria-hidden="true" /> {newListing ? 'Approve and publish' : 'Approve claim'}
            </button>
            <button type="button" disabled={busy} className={quietBtn} onClick={() => onAction('Claim rejected', () => adminRejectClaim(getSupabase()!, r.id))}>
              <X className="w-3.5 h-3.5" aria-hidden="true" /> Reject
            </button>
          </>
        )}
        {!newListing && r.gym_status !== 'removed' && (
          <button
            type="button"
            disabled={busy}
            className={`${dangerBtn} ml-auto`}
            onClick={() => { if (window.confirm(`Remove ${r.gym_name} from the directory? Its open claims are rejected and its reports marked handled.`)) onAction('Listing removed', () => adminRemoveGym(getSupabase()!, r.gym_id)); }}
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> Remove listing
          </button>
        )}
      </div>
    </li>
  );
}

export default function AdminClaimsClient() {
  const auth = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [rows, setRows] = useState<AdminClaimRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn'; retryClaimId?: string } | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !auth.user) return;
    const admin = await fetchIsAdmin(sb);
    setIsAdmin(admin);
    if (!admin) { setRows([]); return; }
    try {
      setRows(await fetchAdminClaims(sb));
    } catch (e) {
      setNotice({ text: errText(e), tone: 'warn' });
      setRows([]);
    }
  }, [auth.user]);
  useEffect(() => { void load(); }, [load]);

  const onAction = async (label: string, fn: () => Promise<void | string>) => {
    setBusy(true);
    setNotice(null);
    try {
      const extra = await fn();
      if (typeof extra === 'string' && extra.startsWith('EMAIL_FAILED:')) {
        const [, claimId, ...rest] = extra.split(':');
        setNotice({ text: `${label}, but the email did not go out: ${rest.join(':')}`, tone: 'warn', retryClaimId: claimId });
      } else {
        setNotice({ text: extra ? `${label}; ${extra}.` : `${label}.`, tone: 'ok' });
      }
      await load();
    } catch (e) {
      setNotice({ text: errText(e), tone: 'warn' });
    } finally {
      setBusy(false);
    }
  };

  // 027: the claim is already approved (it has left the queue); only the email is retried.
  const retryEmail = async (claimId: string) => {
    setBusy(true);
    try {
      const sent = await sendClaimApprovedEmail(getSupabase()!, claimId);
      setNotice({ text: sent.skipped ? `${sent.to} was already notified.` : `Email sent to ${sent.to}.`, tone: 'ok' });
    } catch (e) {
      setNotice({ text: `Email still failing: ${errText(e)}`, tone: 'warn', retryClaimId: claimId });
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <Link href="/website/account" className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase text-zt-muted hover:text-zt-text">
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> Account
    </Link>
  );

  if (!auth.enabled) {
    return <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 text-sm text-zt-text-2">Accounts are not configured on this build.</section>;
  }
  if (auth.loading || (auth.user && isAdmin === null)) {
    return <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 text-xs font-bold uppercase text-zt-muted">Checking your session…</section>;
  }
  if (!auth.user || !isAdmin) {
    return (
      <div className="space-y-4">
        {back}
        <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-2 max-w-xl">
          <h1 className="text-xl font-black text-zt-text flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-zt-muted" aria-hidden="true" /> Admin only</h1>
          <p className="text-sm text-zt-text-2">{auth.user ? 'This account is not on the admin list.' : 'Sign in with an admin account to review gym claims.'}</p>
          {!auth.user && <Link href="/website/account" className={primaryBtn}>Sign in</Link>}
        </section>
      </div>
    );
  }

  const claims = (rows ?? []).filter((r) => r.kind === 'claim');
  const reports = (rows ?? []).filter((r) => r.kind === 'report');

  return (
    <div className="space-y-6">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-black text-zt-text">Gym claims queue</h1>
          <p className="text-xs sm:text-sm text-zt-text-2 max-w-2xl">
            Approve a claim to give that account control of the listing; approving a new listing also publishes it. Reject closes the claim, and for a new listing drops the gym too. The email chip compares the account&rsquo;s confirmed sign-in address with the gym&rsquo;s site; treat it as a hint and verify ownership another way when it is not a clear match.
          </p>
        </div>
        <button type="button" disabled={busy} className={quietBtn} onClick={() => void load()}>
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Refresh
        </button>
      </div>
      {notice && (
        <div role="status" className={`text-xs font-bold rounded-lg px-3 py-2 flex flex-wrap items-center gap-2 ${notice.tone === 'warn' ? 'bg-zt-danger/10 text-zt-danger-text border border-zt-danger/50' : 'bg-zt-inset text-zt-text-2 border border-zt-border'}`}>
          <span className="min-w-0 break-words">{notice.text}</span>
          {notice.retryClaimId && (
            <button type="button" disabled={busy} className={quietBtn} onClick={() => void retryEmail(notice.retryClaimId!)}>
              <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Retry email
            </button>
          )}
        </div>
      )}

      <section aria-labelledby="claims-heading" className="space-y-2">
        <h2 id="claims-heading" className="text-sm font-black uppercase text-zt-text flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-zt-secondary" aria-hidden="true" /> Claims and new listings <span className="text-zt-muted font-bold">({claims.length})</span>
        </h2>
        {rows === null ? (
          <p className="text-xs font-bold uppercase text-zt-muted">Loading…</p>
        ) : claims.length === 0 ? (
          <p className="text-xs text-zt-muted">Nothing waiting.</p>
        ) : (
          <ul className="space-y-3">{claims.map((r) => <Row key={r.id} r={r} busy={busy} onAction={onAction} />)}</ul>
        )}
      </section>

      <section aria-labelledby="reports-heading" className="space-y-2">
        <h2 id="reports-heading" className="text-sm font-black uppercase text-zt-text flex items-center gap-2">
          <Flag className="w-4 h-4 text-zt-secondary" aria-hidden="true" /> Reports <span className="text-zt-muted font-bold">({reports.length})</span>
        </h2>
        {rows === null ? null : reports.length === 0 ? (
          <p className="text-xs text-zt-muted">Nothing waiting.</p>
        ) : (
          <ul className="space-y-3">{reports.map((r) => <Row key={r.id} r={r} busy={busy} onAction={onAction} />)}</ul>
        )}
      </section>
    </div>
  );
}
