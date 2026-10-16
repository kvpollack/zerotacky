'use client';

import { useEffect, useState } from 'react';
import { createSyncClient, readSyncEnv } from '@/lib/sync/client';
import { SyncController, getDeviceId } from '@/lib/sync/controller';
import { STORAGE_KEY, ROLE_STORAGE_KEY, DEFAULT_THEME_ID, SNAPSHOT_STORAGE_KEY, SNAPSHOT_LIMIT } from '@/lib/constants';
import type { RemoteMeet } from '@/lib/sync/meetApi';
import type { AppState } from '@/lib/types';

type Role = 'judge' | 'pitcrew' | 'spectator';
const EMPTY = { meet: { id: '' }, divisions: [], events: [], athletes: [], results: [] } as unknown as AppState;

// Standalone join flow for volunteer phones: code -> preview -> pick role -> the main app opens
// already attached to the meet. Writes the same localStorage keys the app hydrates from.
export default function JoinClient() {
  const [code, setCode] = useState('');
  const [remote, setRemote] = useState<RemoteMeet | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const attachAs = (role: Role) => {
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
    ctl.attach(remote, 'device');
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
              Scan the promoter's QR with your phone camera and the code fills in by itself, or type the 6-character code from their Meet Setup tab.
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
            <div className="text-xs font-extrabold uppercase text-zt-muted text-center">This phone will be a</div>
            <button type="button" onClick={() => attachAs('judge')} className={`${btn} bg-zt-primary text-zt-on-primary`}>Judge</button>
            <button type="button" onClick={() => attachAs('pitcrew')} className={`${btn} bg-zt-secondary text-zt-on-secondary`}>Pit crew</button>
            <button type="button" onClick={() => attachAs('spectator')} className={`${btn} bg-zt-surface-2 text-zt-text-2 border border-zt-border`}>Spectator</button>
            <p className="text-xs text-zt-muted text-center">
              Joining replaces whatever meet is on this phone. Admin unlock still uses the meet PIN.
            </p>
            <button type="button" onClick={() => setRemote(null)} className="w-full text-xs font-bold text-zt-muted py-2">Different code</button>
          </div>
        )}
        <a href="/" className="block text-center text-xs font-bold text-zt-muted py-2">Back</a>
      </div>
    </div>
  );
}
