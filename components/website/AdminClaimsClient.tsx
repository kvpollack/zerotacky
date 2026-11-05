'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/useAuth';
import { getSupabase } from '@/lib/auth/supabaseBrowser';
import { Cap, Key, keyClass, textLink } from './sheet';
import {
  adminApproveClaim, adminRejectClaim, adminRemoveGym, adminResolveReport, emailMatchesSite, fetchAdminClaims, fetchIsAdmin,
  sendClaimApprovedEmail,
  type AdminClaimRow,
} from '@/lib/website/myGym';

// Gym claims queue (017, 10/21). Admins are rows in zt_admins; everything here runs through admin-gated RPCs, so the
// page is a convenience over SQL, not the security boundary. Non-admins see a short refusal and the RPCs return
// nothing anyway.
// Hand redraw in the sheet grammar (11/5, sweep item 5): small keys, each queue row a ruled block (header cell,
// claimant / message cells, action cell). Signals are chips: pen fill = good, dashed = check by hand, red rule = bad.
const SMALL = 'min-h-10 px-3.5 text-[12px] disabled:opacity-40 disabled:cursor-not-allowed';
const primaryBtn = keyClass('pen', SMALL);
const quietBtn = keyClass('line', SMALL);
const dangerBtn = keyClass('line', `${SMALL} border-redpen text-redpen hover:bg-redpen hover:text-sheet`);
const CHIP = 'inline-flex items-center border-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] whitespace-nowrap';
const CHIP_PLAIN = `${CHIP} border-rule text-ink`;
const CHIP_GOOD = `${CHIP} border-pen bg-pen text-pen-label`;
const CHIP_WARN = `${CHIP} border-dashed border-rule text-ink-muted`;
const CHIP_BAD = `${CHIP} border-redpen text-redpen`;
const NOTE = 'text-[13px] leading-snug text-ink-muted';

function errText(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
}

// The signal uses the account's confirmed sign-in email, never the address typed into the claim form (Astra G-M2).
function EmailChip({ accountEmail, website }: { accountEmail: string | null; website: string }) {
  const v = emailMatchesSite(accountEmail, website);
  const cls = v === 'match' ? CHIP_GOOD : v === 'generic' || v === 'related' ? CHIP_WARN : v === 'mismatch' ? CHIP_BAD : CHIP_WARN;
  const label = !accountEmail
    ? 'No confirmed account email'
    : v === 'match' ? 'Account email is on the site domain'
      : v === 'related' ? 'Account email on a subdomain, check by hand'
        : v === 'generic' ? 'Personal email, verify another way'
          : v === 'mismatch' ? 'Account email is not on the site domain'
            : 'Site on a shared platform, domain says nothing';
  return <span className={cls}>{label}</span>;
}

function Row({ r, busy, onAction }: { r: AdminClaimRow; busy: boolean; onAction: (label: string, fn: () => Promise<void | string>) => void }) {
  const isReport = r.kind === 'report';
  const newListing = r.gym_status === 'pending';
  const site = r.gym_website || r.gym_source_url;
  return (
    <li className="zt-block grid-cols-1">
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={isReport ? CHIP_PLAIN : newListing ? `${CHIP} border-ink bg-ink text-sheet` : CHIP_GOOD}>
              {isReport ? 'Report' : newListing ? 'New listing' : 'Claim'}
            </span>
            <span className="text-[17px] font-bold text-ink">{r.gym_name}</span>
            <span className="text-[13px] text-ink-muted">{r.gym_city}, {r.gym_state}</span>
            {r.pending_claims_on_gym > 1 && (
              <span className={CHIP_WARN}>{r.pending_claims_on_gym} claims on this gym</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink">
            {!newListing && (
              <Link href={`/gyms/${r.gym_slug}`} target="_blank" className={textLink}>
                Public page ↗
              </Link>
            )}
            {site && (
              <a href={/^https?:\/\//i.test(site) ? site : `https://${site}`} target="_blank" rel="noreferrer" className={`${textLink} break-all`}>
                {site.replace(/^https?:\/\/(www\.)?/i, '')}
              </a>
            )}
            <span className="text-ink-muted">filed {new Date(r.created_at).toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-x-6 gap-y-3 px-4 py-3 sm:px-5 text-[13px] leading-snug">
        <div className="flex flex-col gap-1">
          <Cap as="span">{isReport ? 'Reported by' : 'Claimant'}</Cap>
          <div className="font-bold text-ink">{r.name}{r.claimant_display_name && r.claimant_display_name !== r.name ? <span className="text-ink-muted font-normal"> (account: {r.claimant_display_name})</span> : null}</div>
          <div className="text-ink break-all">
            {r.account_email ? <>{r.account_email} <span className="text-ink-muted">(account)</span></> : <span className="text-ink-muted">no confirmed account email</span>}
          </div>
          {r.email && r.email.toLowerCase() !== (r.account_email ?? '').toLowerCase() && (
            <div className="text-ink-muted break-all">{r.email} <span>(typed into the form, unverified)</span></div>
          )}
          {r.role && <div className="text-ink">{r.role}</div>}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {!isReport && <EmailChip accountEmail={r.account_email} website={site} />}
            {!r.user_id && <span className={CHIP_WARN}>Not signed in</span>}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Cap as="span">Message</Cap>
          <p className="text-ink whitespace-pre-wrap break-words">{r.message || <span className="text-ink-muted">(none)</span>}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 px-4 py-3 sm:px-5">
        {isReport ? (
          <>
            <button type="button" disabled={busy} className={primaryBtn} onClick={() => onAction('Marked handled', () => adminResolveReport(getSupabase()!, r.id, true))}>
              Handled
            </button>
            <button type="button" disabled={busy} className={quietBtn} onClick={() => onAction('Dismissed', () => adminResolveReport(getSupabase()!, r.id, false))}>
              Dismiss
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
              {newListing ? 'Approve and publish' : 'Approve claim'}
            </button>
            <button type="button" disabled={busy} className={quietBtn} onClick={() => onAction('Claim rejected', () => adminRejectClaim(getSupabase()!, r.id))}>
              Reject
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
            Remove listing
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
    <Link href="/website/account" className="inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.04em] text-ink-muted hover:text-ink no-underline self-start">
      <span aria-hidden="true">←</span> Account
    </Link>
  );

  if (!auth.enabled) {
    return <section className="zt-block grid-cols-1"><p className="px-5 py-5 text-[15px] text-ink">Accounts are not configured on this build.</p></section>;
  }
  if (auth.loading || (auth.user && isAdmin === null)) {
    return <section className="zt-block grid-cols-1"><p className="px-5 py-5"><Cap as="span">Checking your session…</Cap></p></section>;
  }
  if (!auth.user || !isAdmin) {
    return (
      <div className="flex flex-col gap-5">
        {back}
        <section className="zt-block grid-cols-1 max-w-xl">
          <div className="flex flex-col gap-3 px-5 py-5 sm:px-6">
            <h1 className="text-[22px] font-bold leading-tight text-ink">Admin only</h1>
            <p className="text-[15px] leading-relaxed text-ink">{auth.user ? 'This account is not on the admin list.' : 'Sign in with an admin account to review gym claims.'}</p>
            {!auth.user && <Key href="/website/account" variant="pen" className="self-start">Sign in</Key>}
          </div>
        </section>
      </div>
    );
  }

  const claims = (rows ?? []).filter((r) => r.kind === 'claim');
  const reports = (rows ?? []).filter((r) => r.kind === 'report');

  return (
    <div className="flex flex-col gap-6">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-[28px] sm:text-[34px] font-bold leading-[1.05] text-ink">Gym claims queue</h1>
          <p className="text-[15px] leading-relaxed text-ink max-w-2xl">
            Approve a claim to give that account control of the listing; approving a new listing also publishes it. Reject closes the claim, and for a new listing drops the gym too. The email chip compares the account&rsquo;s confirmed sign-in address with the gym&rsquo;s site; treat it as a hint and verify ownership another way when it is not a clear match.
          </p>
        </div>
        <button type="button" disabled={busy} className={quietBtn} onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {notice && (
        <div role="status" className={`text-[13px] font-bold border-2 px-3 py-2 flex flex-wrap items-center gap-2 ${notice.tone === 'warn' ? 'border-redpen text-redpen' : 'border-rule text-ink'}`}>
          <span className="min-w-0 break-words">{notice.text}</span>
          {notice.retryClaimId && (
            <button type="button" disabled={busy} className={quietBtn} onClick={() => void retryEmail(notice.retryClaimId!)}>
              Retry email
            </button>
          )}
        </div>
      )}

      <section aria-labelledby="claims-heading" className="flex flex-col gap-2.5">
        <h2 id="claims-heading" className="text-[22px] font-bold leading-tight text-ink">
          Claims and new listings <span className="text-ink-muted font-normal">({claims.length})</span>
        </h2>
        {rows === null ? (
          <p className={NOTE}>Loading…</p>
        ) : claims.length === 0 ? (
          <p className={NOTE}>Nothing waiting.</p>
        ) : (
          <ul className="flex flex-col gap-3">{claims.map((r) => <Row key={r.id} r={r} busy={busy} onAction={onAction} />)}</ul>
        )}
      </section>

      <section aria-labelledby="reports-heading" className="flex flex-col gap-2.5">
        <h2 id="reports-heading" className="text-[22px] font-bold leading-tight text-ink">
          Reports <span className="text-ink-muted font-normal">({reports.length})</span>
        </h2>
        {rows === null ? null : reports.length === 0 ? (
          <p className={NOTE}>Nothing waiting.</p>
        ) : (
          <ul className="flex flex-col gap-3">{reports.map((r) => <Row key={r.id} r={r} busy={busy} onAction={onAction} />)}</ul>
        )}
      </section>
    </div>
  );
}
