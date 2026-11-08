'use client';

import { useState } from 'react';
import { Link2, Link2Off } from 'lucide-react';
import type { Athlete, Division } from '@/lib/types';
import type { AthleteAccountLink, ResultClaim } from '@/lib/promoter/contract';

interface Props {
  /** Saved roster (server state), not the working draft: a link needs a saved athlete row. */
  athletes: Athlete[];
  divisions: Division[];
  links: AthleteAccountLink[];
  onLink: (athleteId: string, username: string | null) => Promise<{ error?: string }>;
  /** 048: athletes' claims on this meet (pending first). Approve links the row like onLink does. */
  claims: ResultClaim[];
  onResolveClaim: (claimId: string, approve: boolean) => Promise<{ error?: string }>;
  /** Set while the working draft is dirty; linking reloads nothing but the roster ids must be the saved ones. */
  blockedReason: string | null;
}

// 023 show history (10/26). A roster athlete linked to a ZeroTacky account gets this show on their public page once
// the show is Final. Accepted registrations link themselves; this is for hand-entered rosters and fixes.
export default function AthleteAccountsSection({ athletes, divisions, links, onLink, blockedReason, claims, onResolveClaim }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [claimError, setClaimError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const pendingClaims = claims.filter((c) => c.status === 'pending');
  const resolvedClaims = claims.filter((c) => c.status !== 'pending');
  const resolve = async (id: string, approve: boolean) => {
    setBusyId(`claim-${id}`); setClaimError(null);
    const res = await onResolveClaim(id, approve);
    setBusyId(null);
    if (res.error) setClaimError(res.error);
  };
  const byAthlete = new Map(links.map((l) => [l.athleteId, l]));
  const divName = (id: string) => divisions.find((d) => d.id === id)?.name ?? id;
  const sorted = [...athletes].sort((a, b) => {
    const da = divisions.findIndex((d) => d.id === a.divisionId);
    const db = divisions.findIndex((d) => d.id === b.divisionId);
    return da !== db ? da - db : a.lotNumber - b.lotNumber || a.name.localeCompare(b.name);
  });

  const run = async (athleteId: string, username: string | null) => {
    if (blockedReason) {
      setRowErrors((prev) => ({ ...prev, [athleteId]: blockedReason }));
      return;
    }
    setBusyId(athleteId);
    setRowErrors((prev) => {
      const next = { ...prev };
      delete next[athleteId];
      return next;
    });
    const res = await onLink(athleteId, username);
    setBusyId(null);
    if (res.error) {
      setRowErrors((prev) => ({ ...prev, [athleteId]: res.error as string }));
    } else {
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[athleteId];
        return next;
      });
    }
  };

  return (
    <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-4 mt-4" aria-labelledby="athlete-accounts-heading">
      <div className="border-b border-zt-border pb-3">
        <h2 id="athlete-accounts-heading" className="text-sm font-black uppercase tracking-wider text-zt-primary flex items-center gap-2">
          <Link2 className="w-4 h-4" aria-hidden="true" />
          <span>Linked Accounts ({links.length} of {athletes.length})</span>
        </h2>
        <p className="text-xs text-zt-muted mt-0.5">
          Link a roster athlete to their ZeroTacky username and this show appears in their Show History once you mark
          results Final. Athletes accepted from a registration are linked automatically. Ask the athlete for the
          username on their account page; only one account per athlete, one athlete per account.
        </p>
      </div>

      {(pendingClaims.length > 0 || resolvedClaims.length > 0) && (
        <div className="rounded-xl border border-zt-border bg-zt-inset p-3 space-y-2" aria-labelledby="claims-heading">
          <h3 id="claims-heading" className="text-xs font-black uppercase tracking-wider text-zt-text">
            Claims from athletes ({pendingClaims.length} waiting)
          </h3>
          <p className="text-xs text-zt-muted">
            An athlete picked a roster row on the show page and asked to have it linked. Approve when the name matches
            the person; the show then appears on their page once results are Final.
          </p>
          {pendingClaims.length === 0 && <p className="text-xs font-semibold text-zt-muted">Nothing waiting.</p>}
          <ul className="divide-y divide-zt-border">
            {pendingClaims.map((c) => (
              <li key={c.id} className="py-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <div className="min-w-[10rem] flex-1">
                  <div className="text-sm font-black text-zt-text">{c.athleteName ?? 'Roster row removed'} <span className="text-zt-muted font-semibold">· {c.divisionName ?? ''}</span></div>
                  <div className="text-xs text-zt-muted">
                    @{c.username} · {c.displayName}{c.note ? ` · "${c.note}"` : ''}{c.alreadyLinked ? ' · row already linked' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" disabled={busyId === `claim-${c.id}` || c.alreadyLinked} onClick={() => resolve(c.id, true)} className="px-3 py-1.5 rounded-lg bg-zt-primary text-zt-on-primary text-xs font-black disabled:opacity-50">Approve</button>
                  <button type="button" disabled={busyId === `claim-${c.id}`} onClick={() => resolve(c.id, false)} className="px-3 py-1.5 rounded-lg border border-zt-border text-xs font-bold text-zt-text-2 hover:text-zt-text disabled:opacity-50">Reject</button>
                </div>
              </li>
            ))}
          </ul>
          {resolvedClaims.length > 0 && (
            <div>
              <button type="button" onClick={() => setShowResolved((v) => !v)} className="text-xs font-bold text-zt-text-2 hover:text-zt-text underline underline-offset-2">
                {showResolved ? 'Hide' : 'Show'} {resolvedClaims.length} resolved
              </button>
              {showResolved && (
                <ul className="mt-1 divide-y divide-zt-border">
                  {resolvedClaims.map((c) => (
                    <li key={c.id} className="py-1.5 text-xs text-zt-muted">
                      <span className="font-bold text-zt-text">{c.athleteName ?? 'Roster row removed'}</span> · @{c.username} · {c.status === 'approved' ? 'approved' : 'rejected'}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {claimError && <p role="alert" className="text-xs font-bold text-red-300">{claimError}</p>}
        </div>
      )}

      {athletes.length === 0 ? (
        <p className="text-xs font-semibold text-zt-muted">No saved athletes yet. Add them above and save.</p>
      ) : (
        <ul className="divide-y divide-zt-border">
          {sorted.map((a) => {
            const link = byAthlete.get(a.id);
            const draft = drafts[a.id] ?? '';
            const busy = busyId === a.id;
            const err = rowErrors[a.id];
            const inputId = `link-${a.id}`;
            return (
              <li key={a.id} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <div className="min-w-[10rem] flex-1">
                  <div className="text-sm font-black text-zt-text">{a.name}</div>
                  <div className="text-xs text-zt-muted">{divName(a.divisionId)}{a.status === 'withdrawn' ? ' • scratched' : ''}</div>
                </div>
                {link ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-zt-text bg-zt-inset border border-zt-border rounded-lg px-2.5 py-1.5">
                      @{link.username}
                      <span className="text-zt-muted font-semibold"> · {link.displayName}{link.fromRegistration ? ' · from registration' : ''}</span>
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => run(a.id, null)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zt-border text-xs font-bold text-zt-text-2 hover:text-zt-text disabled:opacity-50"
                      title="Unlink this account"
                    >
                      <Link2Off className="w-3.5 h-3.5" aria-hidden="true" />
                      Unlink
                    </button>
                  </div>
                ) : (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (draft.trim()) run(a.id, draft);
                    }}
                  >
                    <label htmlFor={inputId} className="sr-only">ZeroTacky username for {a.name}</label>
                    <input
                      id={inputId}
                      value={draft}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [a.id]: e.target.value }))}
                      placeholder="@username"
                      autoComplete="off"
                      spellCheck={false}
                      className="w-40 bg-zt-inset border border-zt-border rounded-lg px-2.5 py-1.5 text-xs font-bold text-zt-text focus:outline-none focus:border-zt-primary"
                    />
                    <button
                      type="submit"
                      disabled={busy || !draft.trim()}
                      className="px-3 py-1.5 rounded-lg bg-zt-primary text-zt-on-primary text-xs font-black disabled:opacity-50"
                    >
                      {busy ? 'Linking…' : 'Link'}
                    </button>
                  </form>
                )}
                {err && <p role="alert" className="w-full text-xs font-bold text-red-300">{err}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
