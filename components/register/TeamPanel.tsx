'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Cap, keyClass, textLink } from '@/components/website/sheet';
import type { MyRegistration, Team } from '@/lib/promoter/contract';
import { getPromoterApi, isLiveBackend } from '@/lib/promoter/usePromoterApi';

// 055: the team step after registration. Each teammate registers and pays alone; this panel is where the team forms:
// start one (name + join code + share link), join by code, or opt in to the partner board and team up with another
// athlete who is also looking. Rendered under the confirmation and again at the top of the form on a return visit.
// The panel owns its fetch (zt_my_registration) and renders nothing when the athlete has no live entry in a team
// division, so the host page can mount it blind. Preview builds have no accounts: nothing renders.

const INPUT = 'zt-input w-full';
const BODY = 'text-[15px] leading-snug text-ink';
const NOTE = 'text-[13px] leading-snug text-ink-muted';
const CELL = 'flex flex-col gap-1.5 px-4 py-3 sm:px-5 sm:py-3.5 min-w-0';

export function teamShareUrl(slug: string, code: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/register/${slug}?team=${encodeURIComponent(code)}`;
}

export default function TeamPanel({ slug, refreshKey = 0 }: { slug: string; refreshKey?: number }) {
  const [mine, setMine] = useState<MyRegistration | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isLiveBackend()) { setLoaded(true); return; }
    const res = await getPromoterApi().getMyRegistration(slug);
    if (res.error) setError(res.error);
    setMine(res.data ?? null);
    setLoaded(true);
  }, [slug]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  if (!loaded || !mine || mine.teamSize < 2) return null;

  const run = async (label: string, fn: () => Promise<{ error: string | null }>) => {
    setBusy(true); setError(null); setNotice(null);
    const res = await fn();
    setBusy(false);
    if (res.error) { setError(res.error); return false; }
    setNotice(label);
    await load();
    return true;
  };

  return (
    <section className="zt-block" aria-labelledby="team-panel-heading" data-testid="team-panel">
      <div className={`${CELL} py-4 gap-1`}>
        <Cap as="span">Your team</Cap>
        <h2 id="team-panel-heading" className="text-[22px] font-bold leading-tight text-ink">
          {mine.divisionName}: team of {mine.teamSize}
        </h2>
        <p className={NOTE}>
          Every teammate registers and pays on their own, then the team forms here. The team scores as one athlete.
          {mine.waitlisted ? ' Your own entry is on the waitlist; you can still form up.' : ''}
        </p>
      </div>
      {error && <div role="alert" className={`${CELL} ${BODY} font-bold`}>{error}</div>}
      {notice && !error && <div role="status" className={`${CELL} ${NOTE} font-bold text-pen`}>{notice}</div>}
      {mine.team ? (
        <TeamCard slug={slug} mine={mine} team={mine.team} busy={busy} run={run} />
      ) : (
        <NoTeam mine={mine} busy={busy} run={run} />
      )}
    </section>
  );
}

type Run = (label: string, fn: () => Promise<{ error: string | null }>) => Promise<boolean>;

function TeamCard({ slug, mine, team, busy, run }: { slug: string; mine: MyRegistration; team: Team; busy: boolean; run: Run }) {
  const api = getPromoterApi();
  const me = team.members.find((m) => m.registrationId === mine.registrationId);
  const isCaptain = Boolean(me?.isCaptain);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(team.name);
  const spotsOpen = Math.max(0, team.teamSize - team.activeCount);
  const url = team.joinCode ? teamShareUrl(slug, team.joinCode) : '';
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async (text: string, label: string) => {
    try { await navigator.clipboard.writeText(text); await run(label, async () => ({ error: null })); }
    catch { await run('Could not copy; select the text and copy it yourself.', async () => ({ error: null })); }
  };
  const share = async () => {
    try { await navigator.share({ title: `Join ${team.name}`, text: `Join my team "${team.name}" for ${mine.divisionName}. Code ${team.joinCode}.`, url }); }
    catch { /* the athlete closed the share sheet */ }
  };

  return (
    <>
      <div className={CELL}>
        <Cap as="span">Team name</Cap>
        {renaming ? (
          <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); if (await run('Team renamed.', () => api.teamRename(team.id, draft.trim()))) setRenaming(false); }}>
            <input className={`${INPUT} max-w-sm`} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={60} aria-label="Team name" required />
            <button type="submit" disabled={busy} className={keyClass('pen', 'disabled:opacity-40')}>Save</button>
            <button type="button" disabled={busy} onClick={() => { setRenaming(false); setDraft(team.name); }} className={keyClass('line')}>Cancel</button>
          </form>
        ) : (
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-[20px] font-bold text-ink" data-testid="team-name">{team.name}</span>
            {isCaptain && <button type="button" className={`${textLink} text-[13px]`} onClick={() => setRenaming(true)}>Rename</button>}
          </div>
        )}
        <p className={NOTE}>{team.activeCount} of {team.teamSize} spots filled{spotsOpen > 0 ? `, ${spotsOpen} open` : ''}.{isCaptain ? ' You are the captain; the promoter can rename the team too.' : ''}</p>
      </div>

      {team.joinCode && spotsOpen > 0 && (
        <div className={CELL}>
          <Cap as="span">Invite your teammates</Cap>
          <p className={BODY}>
            They register for <strong>{mine.divisionName}</strong> and enter code <code className="font-mono text-[18px] font-bold tracking-[0.12em]" data-testid="team-code">{team.joinCode}</code>, or open your link.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy} onClick={() => copy(team.joinCode ?? '', 'Code copied.')} className={keyClass('line')}>Copy code</button>
            <button type="button" disabled={busy} onClick={() => copy(url, 'Link copied.')} className={keyClass('line')}>Copy link</button>
            {canShare && <button type="button" disabled={busy} onClick={share} className={keyClass('ink')}>Share…</button>}
          </div>
          <p className={`${NOTE} break-all`}>{url}</p>
        </div>
      )}

      <div className={CELL}>
        <Cap as="span">Members</Cap>
        <ul className="flex flex-col gap-1">
          {team.members.map((m) => (
            <li key={m.registrationId} className={BODY}>
              <strong>{m.name}</strong>
              {m.isCaptain ? ' (captain)' : ''}
              <span className={NOTE}> · {m.status === 'accepted' ? 'accepted' : 'pending'}{m.registrationId === mine.registrationId ? ' · you' : ''}</span>
            </li>
          ))}
        </ul>
        {mine.status === 'pending' ? (
          <button type="button" disabled={busy} onClick={() => run('You left the team.', () => api.teamLeave(mine.registrationId))} className={`${textLink} text-[13px] self-start`}>Leave this team</button>
        ) : (
          <p className={NOTE}>Your entry is accepted, so the roster is set. Need to change teams? Ask the promoter.</p>
        )}
      </div>
    </>
  );
}

function NoTeam({ mine, busy, run }: { mine: MyRegistration; busy: boolean; run: Run }) {
  const api = getPromoterApi();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  return (
    <>
      <div className={CELL}>
        <Cap as="span">Start a team</Cap>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void run('Team started. Share the code with your teammates.', () => api.teamCreate(mine.registrationId, name.trim())); }}>
          <input className={`${INPUT} max-w-sm`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Team name" maxLength={60} minLength={2} aria-label="New team name" required data-testid="team-start-name" />
          <button type="submit" disabled={busy} className={keyClass('pen', 'disabled:opacity-40')}>Start team</button>
        </form>
        <p className={NOTE}>You become the captain and get a join code to share.</p>
      </div>

      <div className={CELL}>
        <Cap as="span">Join a team</Cap>
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); void run('You joined the team.', () => api.teamJoin(mine.registrationId, code.trim().toUpperCase())); }}>
          <input className={`${INPUT} max-w-[12rem] font-mono uppercase tracking-[0.12em]`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Join code" maxLength={8} aria-label="Team join code" required data-testid="team-join-code" />
          <button type="submit" disabled={busy} className={keyClass('ink', 'disabled:opacity-40')}>Join</button>
        </form>
        <p className={NOTE}>The code comes from your captain; the team has to be in {mine.divisionName}.</p>
      </div>

      <div className={CELL}>
        <Cap as="span">Find a partner</Cap>
        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" className="mt-1 accent-[var(--pen)]" checked={mine.lookingForPartner} disabled={busy} onChange={(e) => void run(e.target.checked ? 'You are on the partner board.' : 'Removed from the partner board.', () => api.setPartnerFlag(mine.registrationId, e.target.checked))} data-testid="partner-flag" />
          <span className={BODY}>List me as looking for a partner. Other athletes in {mine.divisionName} see your first name and last initial.</span>
        </label>
        {mine.board.length === 0 ? (
          <p className={NOTE}>Nobody else in {mine.divisionName} is looking right now. Check back, or share the show with someone.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="partner-board">
            {mine.board.map((b) => (
              <li key={b.registrationId} className="flex flex-wrap items-center justify-between gap-2">
                <span className={BODY}>
                  <strong>{b.name}</strong>
                  <span className={NOTE}> · {b.teamName ? `${b.teamName}, ${b.spotsOpen} open` : 'no team yet'}</span>
                </span>
                <button
                  type="button"
                  disabled={busy || !mine.lookingForPartner}
                  title={mine.lookingForPartner ? undefined : 'Tick the box above first'}
                  onClick={() => void run(`You teamed up with ${b.name}.`, () => api.teamUp(mine.registrationId, b.registrationId))}
                  className={keyClass('pen', 'disabled:opacity-40 disabled:cursor-not-allowed')}
                >
                  Team up
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
