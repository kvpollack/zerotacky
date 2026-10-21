'use client';

import { useEffect, useState } from 'react';
import { createSyncClient, readSyncEnv } from '@/lib/sync/client';
import { SyncController, getDeviceId } from '@/lib/sync/controller';
import { checkAdminPin } from '@/lib/sync/meetApi';
import { STORAGE_KEY, ROLE_STORAGE_KEY, DEFAULT_THEME_ID, SNAPSHOT_STORAGE_KEY, SNAPSHOT_LIMIT } from '@/lib/constants';
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

  const field = 'w-full bg-zt-surface border border-zt-border rounded-xl px-4 py-3 text-2xl font-black tracking-[0.3em] text-center text-zt-text uppercase';
  const btn = 'w-full py-3 rounded-xl font-black text-sm uppercase';

  return (
    <div data-zt-theme={DEFAULT_THEME_ID} className="min-h-screen bg-zt-bg text-zt-text font-sans p-5 flex flex-col items-center">
      <div className="w-full max-w-sm space-y-4 mt-10">
        <div className="text-center">
          <div className="text-[10px] font-black uppercase tracking-widest text-zt-primary">ZEROTACKY</div>
          <h1 className="text-2xl font-black">Join a meet</h1>
        </div>
        {!env && (
          <div className="bg-zt-danger/10 border border-zt-danger/50 text-zt-danger-text rounded-xl p-3 text-sm font-bold">
            Live sync is not configured on this build.
          </div>
        )}
        {!remote ? (
          <form onSubmit={(e) => { e.preventDefault(); if (code.trim().length >= 6) lookup(code.trim()); }} className="space-y-3">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="ABC123"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              className={field}
            />
            <button type="submit" disabled={busy || !env || code.length < 6} className={`${btn} bg-zt-primary text-zt-on-primary disabled:opacity-40`}>
              {busy ? 'Looking up…' : 'Find meet'}
            </button>
            {error && <div className="text-sm font-bold text-zt-danger-text text-center">{error}</div>}
            <p className="text-xs text-zt-muted text-center">
              The promoter has the 6-character code on the Meet Day tab of their meet.
            </p>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="bg-zt-surface border border-zt-border rounded-2xl p-4 text-center">
              <div className="text-lg font-black">{remote.state.meet.name}</div>
              <div className="text-xs text-zt-muted">
                {remote.state.meet.date || 'date TBD'} · {remote.state.divisions.length} divisions · {remote.state.athletes.length} athletes
              </div>
            </div>
            {pinRole ? (
              <form onSubmit={(e) => { e.preventDefault(); if (pin.trim().length >= 4) submitPin(); }} className="space-y-3">
                <div className="text-xs font-extrabold uppercase text-zt-muted text-center">
                  {pinRole === 'admin' ? 'Promoter' : 'Judge'} access needs the meet PIN
                </div>
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                  placeholder="PIN"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  className={field}
                />
                <button type="submit" disabled={busy || pin.trim().length < 4} className={`${btn} bg-zt-primary text-zt-on-primary disabled:opacity-40`}>
                  {busy ? 'Checking…' : `Unlock ${pinRole === 'admin' ? 'promoter' : 'judge'} access`}
                </button>
                {pinError && <div className="text-sm font-bold text-zt-danger-text text-center">{pinError}</div>}
                <p className="text-xs text-zt-muted text-center">
                  The promoter sets the PIN on the Meet tab of their meet. It is checked on the server and remembered on this phone for this meet.
                </p>
                <button type="button" onClick={() => setPinRole(null)} className="w-full text-xs font-bold text-zt-muted py-2">Pick a different role</button>
              </form>
            ) : (
              <>
                <div className="text-xs font-extrabold uppercase text-zt-muted text-center">What is this phone for?</div>
                <RoleButton
                  label="Athlete / Spectator"
                  detail="Standings, events and who is up next. Nothing to unlock."
                  className="bg-zt-surface-2 text-zt-text border border-zt-border"
                  onClick={() => chooseRole('spectator')}
                />
                <RoleButton
                  label="Volunteer (pit crew)"
                  detail="Next up, loading and rack heights, plus standings."
                  className="bg-zt-secondary text-zt-on-secondary"
                  onClick={() => chooseRole('pitcrew')}
                />
                <RoleButton
                  label="Judge"
                  detail="Judge pad for scoring. Needs the meet PIN."
                  className="bg-zt-primary text-zt-on-primary"
                  onClick={() => chooseRole('judge')}
                />
                <RoleButton
                  label="Promoter"
                  detail="Everything, including Meet Setup. Needs the meet PIN."
                  className="bg-zt-inset text-zt-text border border-zt-border-strong"
                  onClick={() => chooseRole('admin')}
                />
                <p className="text-xs text-zt-muted text-center">
                  Joining replaces whatever meet is on this phone. You can change the role later from the lock in the header (PIN needed to go up).
                </p>
              </>
            )}
            <button type="button" onClick={() => setRemote(null)} className="w-full text-xs font-bold text-zt-muted py-2">Different code</button>
          </div>
        )}
        <a
          href="/website"
          className="w-full py-3 rounded-xl bg-zt-surface-2 border border-zt-border text-zt-text-2 font-black text-xs uppercase tracking-wider flex items-center justify-center hover:text-zt-text"
        >
          Back to ZeroTacky Home
        </a>
        <a href="/website/account" className="block w-full text-center text-xs font-bold text-zt-muted hover:text-zt-text py-1">
          Account and sign in
        </a>
      </div>
    </div>
  );
}

function RoleButton({ label, detail, className, onClick }: { label: string; detail: string; className: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`w-full rounded-xl px-4 py-3 text-left ${className}`}>
      <div className="font-black text-sm uppercase">{label}</div>
      <div className="text-xs font-semibold opacity-80 mt-0.5">{detail}</div>
    </button>
  );
}
