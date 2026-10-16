'use client';

import { useState } from 'react';
import { RefreshCw, Link2 } from 'lucide-react';

const TONE = {
  off: { dot: 'bg-zt-muted/50', label: 'Not linked', short: '' },
  idle: { dot: 'bg-emerald-400', label: 'Live', short: '' },
  syncing: { dot: 'bg-amber-400 animate-pulse', label: 'Syncing', short: '' },
  offline: { dot: 'bg-amber-500', label: 'Offline, will retry', short: 'OFFLINE' },
  error: { dot: 'bg-red-500', label: 'Sync error', short: 'ERROR' },
};

function ago(ms) {
  if (!ms) return 'never';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)} min ago`;
}

// Tiny status dot with a tap-to-open card. Sits in the Header's brand row (placement="header", the spot the
// static green pulse used to hold) so every role sees it; without a sync backend it renders that pulse.
export default function SyncDot({ sync, placement = 'nav' }) {
  const [open, setOpen] = useState(false);
  const inHeader = placement === 'header';
  if (!sync?.enabled) {
    return inHeader ? <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> : null;
  }
  const { status, link } = sync;
  const tone = TONE[status.state] || TONE.off;
  return (
    <div className={inHeader ? 'relative z-30' : 'absolute right-2 top-1.5 z-10'}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Sync: ${tone.label}`}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-zt-inset/80 border border-zt-border"
      >
        <span className={`inline-block w-2 h-2 rounded-full ${tone.dot}`} />
        {tone.short && <span className="text-[9px] font-black text-zt-text-2">{tone.short}</span>}
        {status.pending > 0 && <span className="text-[9px] font-black text-zt-text-2">{status.pending}</span>}
      </button>
      {open && (
        <div className={`absolute ${inHeader ? 'left-0 top-6' : 'right-0 bottom-7'} w-60 bg-zt-surface border border-zt-border rounded-xl p-3 shadow-xl text-xs space-y-2`}>
          <div className="flex items-center justify-between">
            <span className="font-black uppercase text-zt-primary flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-full ${tone.dot}`} /> {tone.label}
            </span>
            <button type="button" onClick={() => setOpen(false)} className="text-zt-muted font-bold">close</button>
          </div>
          {link ? (
            <div className="text-zt-text-2 space-y-0.5">
              <div>Meet <strong className="text-zt-text">/{link.slug}</strong> as {link.role}</div>
              <div>Last sync {ago(status.lastSyncAt)}{status.pending ? `, ${status.pending} waiting` : ''}</div>
              {status.error && <div className="text-zt-danger-text break-words">{status.error}</div>}
              {status.state === 'error' && (
                <a href="/join" className="block w-full py-1.5 rounded-lg bg-zt-primary text-zt-on-primary text-center font-extrabold uppercase">
                  Re-join with a code
                </a>
              )}
              <button
                type="button"
                onClick={() => sync.syncNow()}
                className="mt-1 w-full py-1.5 rounded-lg bg-zt-inset border border-zt-border font-extrabold uppercase flex items-center justify-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> Sync now
              </button>
            </div>
          ) : (
            <div className="text-zt-text-2 space-y-1.5">
              <div>This phone is scoring on its own. Join the meet to share scores live.</div>
              <a
                href="/join"
                className="block w-full py-1.5 rounded-lg bg-zt-primary text-zt-on-primary text-center font-extrabold uppercase"
              >
                <Link2 className="w-3 h-3 inline mr-1" /> Join a meet
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
