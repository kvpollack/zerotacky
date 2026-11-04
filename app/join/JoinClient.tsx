'use client';

import { useEffect, useState } from 'react';
import { createSyncClient, readSyncEnv } from '@/lib/sync/client';
import { SyncController, getDeviceId } from '@/lib/sync/controller';
import { checkAdminPin } from '@/lib/sync/meetApi';
import { STORAGE_KEY, ROLE_STORAGE_KEY, SNAPSHOT_STORAGE_KEY, SNAPSHOT_LIMIT } from '@/lib/constants';
import Link from 'next/link';
import WebsiteThemeFrame from '@/components/website/WebsiteThemeFrame';
import Wordmark from '@/components/brand/Wordmark';
import { ModeToggle } from '@/components/website/SheetMode';
import { Cap, keyClass, textLink } from '@/components/website/sheet';
import type { RemoteMeet } from '@/lib/sync/meetApi';
import type { AppState } from '@/lib/types';

// Roles a joined phone can take (Kurt 10/19). The join code alone gets a viewing role; the judge pad and the
// promoter's setup need the meet PIN, checked on the server (zt_check_admin_pin, rate-limited) and never stored.
// The chosen role is remembered on the phone (ROLE_STORAGE_KEY), so the PIN is asked once per join.
type Role = 'admin' | 'judge' | 'pitcrew' | 'spectator';
const PIN_ROLES: Role[] = ['judge', 'admin'];
const EMPTY = { meet: { id: '' }, divisions: [], events: [], athletes: [], results: [] } as unknown as AppState;

// Standalone join flow for volunteer phones: code -> preview -> pick role (PIN for judge/promoter) -> the main app
// opens already attached to the meet. Writes the same localStorage keys the app hydrates from.
// UI transition (Kurt 11/4: "/join still shows the old UI"): drawn like the root splash, one small ruled sheet with the
// wordmark / Mode strip; the code and PIN fields are .zt-input, the roles are keys (pen for the primary action).
export default function JoinClient() {
  const [code, setCode] = useState('');
  const [remote, setRemote] = useState<RemoteMeet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinRole, setPinRole] = useState<Role | null>(null);   // which PIN-gated role is being unlocked
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const env = readSyncEnv();

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('code');
    if (c) setCode(c.toUpperCase());
  }, []);

  const lookup = async (c: string) => {
    if (!env) return;
    setBusy(true); setError(null);
    try {
      const client = createSyncClient(env);
      const ctl = new SyncController({ client, storage: localStorage, deviceId: getDeviceId(localStorage), getState: () => EMPTY, onIncoming: () => {} });
      const r = await ctl.lookupJoinCode(c);
      if (!r) setError('No meet with that code. Check it with the promoter.');
      else setRemote(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const chooseRole = (role: Role) => {
    setPinError(null);
    setPin('');
    if (PIN_ROLES.includes(role)) {
      setPinRole(role);
      return;
    }
    attachAs(role);
  };

  const submitPin = async () => {
    if (!remote || !env || !pinRole) return;
    setBusy(true); setPinError(null);
    try {
      const grant = await checkAdminPin(createSyncClient(env), remote.joinCode ?? code, pin.trim(), getDeviceId(localStorage));
      if (!grant) { setPinError('Wrong PIN. Ask the promoter for the meet PIN.'); return; }
      attachAs(pinRole, grant);
    } catch (e) {
      setPinError(e instanceof Error ? e.message : 'Could not check the PIN. Try again.');
    } finally { setBusy(false); }
  };

  // 011: the grant from a correct PIN rides on the link; without it the server refuses this phone's scores.
  const attachAs = (role: Role, grant: string | null = null) => {
    if (!remote || !env) return;
    const client = createSyncClient(env);
    const ctl = new SyncController({ client, storage: localStorage, deviceId: getDeviceId(localStorage), getState: () => remote.state, onIncoming: () => {} });
    // Same safety net as the in-app path: whatever was on this phone goes into the auto-snapshots first.
    try {
      const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as AppState | null;
      if (prev?.results?.length) {
        const snaps = JSON.parse(localStorage.getItem(SNAPSHOT_STORAGE_KEY) || '[]');
        const snap = { at: Date.now(), reason: 'before join meet', results: prev.results.length, state: prev };
        localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify([snap, ...(Array.isArray(snaps) ? snaps : [])].slice(0, SNAPSHOT_LIMIT)));
      }
    } catch { /* ignore */ }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(remote.state)); } catch { /* ignore */ }
    ctl.attach(remote, 'device', grant);
    try { localStorage.setItem(ROLE_STORAGE_KEY, role); } catch { /* ignore */ }
    window.location.href = '/scorer';
  };

  const note = 'text-[13px] text-ink-muted';
  const codeField = 'zt-input w-full text-center text-[28px] font-sheet tracking-[0.3em] uppercase h-14';

  return (
    <WebsiteThemeFrame sheet className="p-2 sm:p-4 lg:p-6 items-center justify-center">
      <main className="w-full max-w-md bg-sheet border-2 border-rule">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-px bg-rule border-b-2 border-rule">
          <div className="bg-sheet flex items-center h-14 px-4 text-[22px] text-ink">
            <Wordmark />
          </div>
          <div className="bg-sheet flex items-center h-14">
            <ModeToggle />
          </div>
        </header>

        <div className="zt-block border-0">
          <div className="px-5 py-6 sm:px-6 sm:py-7 flex flex-col gap-1.5">
            <Cap as="h2">Join a meet</Cap>
            <h1 className="text-[32px] font-bold leading-none tracking-tight text-ink">{remote ? remote.state.meet.name : 'Type the code.'}</h1>
            <p className={note}>
              {remote
                ? `${remote.state.meet.date || 'date TBD'} · ${remote.state.divisions.length} divisions · ${remote.state.athletes.length} athletes`
                : 'The promoter has the 6-character code on the Meet Day tab of their meet.'}
            </p>
          </div>

          {!env && (
            <div role="alert" className="px-5 py-4 sm:px-6 text-[13px] font-bold text-ink">Live sync is not configured on this build.</div>
          )}

          {!remote ? (
            <form onSubmit={(e) => { e.preventDefault(); if (code.trim().length >= 6) lookup(code.trim()); }} className="px-5 py-5 sm:px-6 flex flex-col gap-3">
              <label htmlFor="join-code" className="flex flex-col gap-1.5">
                <Cap as="span">Meet join code</Cap>
                <input
                  id="join-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                  placeholder="ABC123"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoComplete="off"
                  className={codeField}
                />
              </label>
              <button type="submit" disabled={busy || !env || code.length < 6} className={keyClass('pen', 'w-full disabled:opacity-40 disabled:cursor-not-allowed')}>
                {busy ? 'Looking up…' : 'Find meet'}
              </button>
              {error && <div role="alert" className="text-[13px] font-bold text-ink">{error}</div>}
            </form>
          ) : pinRole ? (
            <form onSubmit={(e) => { e.preventDefault(); if (pin.trim().length >= 4) submitPin(); }} className="px-5 py-5 sm:px-6 flex flex-col gap-3">
              <label htmlFor="join-pin" className="flex flex-col gap-1.5">
                <Cap as="span">{pinRole === 'admin' ? 'Promoter' : 'Judge'} access needs the meet PIN</Cap>
                <input
                  id="join-pin"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                  placeholder="PIN"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  className={codeField}
                />
              </label>
              <button type="submit" disabled={busy || pin.trim().length < 4} className={keyClass('pen', 'w-full disabled:opacity-40 disabled:cursor-not-allowed')}>
                {busy ? 'Checking…' : `Unlock ${pinRole === 'admin' ? 'promoter' : 'judge'} access`}
              </button>
              {pinError && <div role="alert" className="text-[13px] font-bold text-ink">{pinError}</div>}
              <p className={note}>
                The promoter sets the PIN on the Meet tab of their meet. It is checked on the server and remembered on this phone for this meet.
              </p>
              <button type="button" onClick={() => setPinRole(null)} className={`${textLink} self-start text-[13px]`}>Pick a different role</button>
            </form>
          ) : (
            <div className="px-5 py-5 sm:px-6 flex flex-col gap-2">
              <Cap as="span" className="mb-1">What is this phone for?</Cap>
              <RoleButton label="Athlete / Spectator" detail="Standings, events and who is up next. Nothing to unlock." variant="line" onClick={() => chooseRole('spectator')} />
              <RoleButton label="Volunteer (pit crew)" detail="Next up, loading and rack heights, plus standings." variant="line" onClick={() => chooseRole('pitcrew')} />
              <RoleButton label="Judge" detail="Judge pad for scoring. Needs the meet PIN." variant="pen" onClick={() => chooseRole('judge')} />
              <RoleButton label="Promoter" detail="Everything, including Meet Setup. Needs the meet PIN." variant="ink" onClick={() => chooseRole('admin')} />
              <p className={`${note} mt-1`}>
                Joining replaces whatever meet is on this phone. You can change the role later from the lock in the header (PIN needed to go up).
              </p>
            </div>
          )}

          <div className="px-5 py-4 sm:px-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            {remote && <button type="button" onClick={() => setRemote(null)} className={textLink}>Different code</button>}
            <Link href="/website" className={textLink}>ZeroTacky home</Link>
            <Link href="/website/account" className={textLink}>Account and sign in</Link>
          </div>
        </div>
      </main>
    </WebsiteThemeFrame>
  );
}

function RoleButton({ label, detail, variant, onClick }: { label: string; detail: string; variant: 'ink' | 'line' | 'pen'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={keyClass(variant, 'w-full min-h-14 flex-col items-start gap-0 leading-tight py-2 text-left')}>
      <span>{label}</span>
      <span className="text-[11px] normal-case font-normal tracking-normal opacity-80">{detail}</span>
    </button>
  );
}
