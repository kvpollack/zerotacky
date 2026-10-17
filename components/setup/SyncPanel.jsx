'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Radio, KeyRound, Copy, Unlink, UploadCloud, Link2, UserCheck } from 'lucide-react';
import { copyText } from '@/lib/download';
import { slugFor } from '@/hooks/useMeetSync';

// Admin side of live sync: publish this meet (signed-in account, or a legacy publish key), show the join code and
// the public scoreboard link, or join another phone's meet by code. Hidden when sync is not configured.
export default function SyncPanel({ sync, meet }) {
  const [key, setKey] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showKeyWhileSignedIn, setShowKeyWhileSignedIn] = useState(false);
  if (!sync?.enabled) return null;
  const { status, link, account } = sync;
  const canPublish = sync.canPublish ?? !!sync.publishKey;

  const say = (text, tone = 'ok') => {
    setNotice({ text, tone });
    setTimeout(() => setNotice(null), 5000);
  };
  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) say(okMsg);
    } catch (e) {
      say(e?.message || String(e), 'warn');
    } finally {
      setBusy(false);
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const boardUrl = link ? `${origin}/m/${link.slug}` : '';
  const joinUrl = link ? `${origin}/join?code=${link.joinCode}` : '';
  const slug = link?.slug || slugFor(meet);

  const onSaveKey = () => {
    sync.setPublishKey(key.trim());
    setKey('');
    say(key.trim() ? 'Publish key saved on this phone' : 'Publish key cleared');
  };

  return (
    <div className="pt-2 border-t border-zt-border space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-extrabold uppercase text-zt-primary flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5" aria-hidden="true" /> Live Sync
        </span>
        <span className="text-[10px] font-bold text-zt-muted">
          {status.state === 'off' ? 'not linked' : status.state}{status.pending ? ` · ${status.pending} waiting` : ''}
        </span>
      </div>

      {notice && (
        <div className={`text-xs font-bold rounded-lg px-3 py-2 ${notice.tone === 'warn' ? 'bg-zt-danger/10 text-zt-danger-text border border-zt-danger/50' : 'bg-zt-inset text-zt-text-2 border border-zt-border'}`}>
          {notice.text}
        </div>
      )}

      {link ? (
        <div className="bg-zt-inset border border-zt-border rounded-xl p-3 space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-bold uppercase text-zt-muted">Join code</span>
            <span className="text-[10px] font-bold text-zt-muted">/{link.slug} · {link.role}</span>
          </div>
          <div className="text-3xl font-black tracking-[0.3em] text-zt-text text-center select-text">{link.joinCode}</div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => run(async () => { if (!(await copyText(joinUrl))) throw new Error('Clipboard blocked'); }, 'Join link copied')} className="py-2 rounded-lg bg-zt-surface-2 text-zt-text-2 font-extrabold text-[11px] uppercase flex items-center justify-center gap-1">
              <Copy className="w-3 h-3" /> Join link
            </button>
            <button type="button" onClick={() => run(async () => { if (!(await copyText(boardUrl))) throw new Error('Clipboard blocked'); }, 'Scoreboard link copied')} className="py-2 rounded-lg bg-zt-surface-2 text-zt-text-2 font-extrabold text-[11px] uppercase flex items-center justify-center gap-1">
              <Copy className="w-3 h-3" /> Scoreboard
            </button>
          </div>
          <div className="text-[10px] text-zt-muted break-all">{boardUrl}</div>
          {status.error && <div className="text-[11px] text-zt-danger-text break-words">{status.error}</div>}
          {status.publishError && status.publishError !== status.error && (
            <div className="text-[11px] text-zt-danger-text break-words">
              <span className="font-bold">Last publish was refused:</span> {status.publishError} Config changes since then are not online.
            </div>
          )}
        </div>
      ) : (
        <div className="text-xs text-zt-text-2">
          Scores stay on this phone until you publish the meet (promoter) or join one by code (any phone).
        </div>
      )}

      {/* Who publishes: signed-in account (v2) or the legacy publish key */}
      <div className="bg-zt-inset border border-zt-border rounded-xl p-3 space-y-2">
        {account ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase text-zt-muted flex items-center gap-1">
                <UserCheck className="w-3 h-3" /> Publishing as <span className="text-zt-text normal-case">{account.label}</span>
              </div>
              <Link href="/website/account" className="text-[10px] font-bold uppercase text-zt-primary">Account</Link>
            </div>
            {/* A meet published with a key before accounts existed is claimed by publishing once with the key while signed in (006). */}
            {sync.publishKey ? (
              <div className="text-[10px] text-zt-muted flex items-center justify-between gap-2">
                <span><KeyRound className="w-3 h-3 inline mr-1" />Publish key saved on this phone; it is sent with your account so meets published with it become yours.</span>
                <button type="button" onClick={() => sync.setPublishKey('')} className="font-bold uppercase text-zt-primary">Forget</button>
              </div>
            ) : showKeyWhileSignedIn ? (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="paste the publish key"
                  autoComplete="off"
                  className="flex-1 bg-zt-surface border border-zt-border rounded-lg px-3 py-2 text-sm text-zt-text"
                />
                <button type="button" onClick={() => { onSaveKey(); setShowKeyWhileSignedIn(false); }} className="px-3 py-2 rounded-lg bg-zt-surface-2 text-zt-text-2 font-extrabold text-[11px] uppercase">
                  Save
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowKeyWhileSignedIn(true)} className="text-[10px] font-bold text-zt-muted underline">
                Published this meet with a publish key before? Enter it once to claim it for this account.
              </button>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase text-zt-muted flex items-center gap-1">
                <KeyRound className="w-3 h-3" /> Promoter publish key {sync.publishKey ? '(saved)' : '(not set)'}
              </div>
              <Link href="/website/account" className="text-[10px] font-bold uppercase text-zt-primary">Sign in instead</Link>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={sync.publishKey ? '••••••••' : 'paste key'}
                autoComplete="off"
                className="flex-1 bg-zt-surface border border-zt-border rounded-lg px-3 py-2 text-sm text-zt-text"
              />
              <button type="button" onClick={onSaveKey} className="px-3 py-2 rounded-lg bg-zt-surface-2 text-zt-text-2 font-extrabold text-[11px] uppercase">
                Save
              </button>
            </div>
          </>
        )}
        {!link && (
          <div className="text-[10px] text-zt-muted">
            Scoreboard address will be <span className="font-bold text-zt-text-2">/m/{slug}</span> (change it in Meet Details above; fixed after publishing).
          </div>
        )}
        <button
          type="button"
          disabled={busy || !canPublish}
          onClick={() => run(() => sync.publish({ slug }), link ? 'Meet updated online' : 'Meet published')}
          className="w-full py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase flex items-center justify-center gap-1.5 disabled:opacity-40"
        >
          <UploadCloud className="w-4 h-4" /> {link ? 'Publish update' : `Publish as /${slug}`}
        </button>
        {link?.role === 'admin' && (
          <div className="text-[10px] text-zt-muted">Config changes (weights, events, roster adds and removals) re-publish automatically from this phone. If the server refuses one (an athlete with a recorded result, or on the roster through an accepted registration), the reason shows here and the roster comes back.</div>
        )}
      </div>

      {/* Join by code */}
      {!link && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (code.trim()) run(() => sync.joinByCode(code), 'Joined meet'); }}
          className="flex gap-2"
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="JOIN CODE"
            maxLength={6}
            autoCapitalize="characters"
            className="flex-1 bg-zt-surface border border-zt-border rounded-lg px-3 py-2 text-sm font-black tracking-widest text-zt-text"
          />
          <button type="submit" disabled={busy || code.trim().length < 6} className="px-3 py-2 rounded-lg bg-zt-secondary text-zt-on-secondary font-extrabold text-[11px] uppercase flex items-center gap-1 disabled:opacity-40">
            <Link2 className="w-3 h-3" /> Join
          </button>
        </form>
      )}

      {link && (
        !confirmLeave ? (
          <button type="button" onClick={() => setConfirmLeave(true)} className="w-full py-2 rounded-lg bg-zt-surface-2 text-zt-text-2 font-extrabold text-[11px] uppercase flex items-center justify-center gap-1">
            <Unlink className="w-3 h-3" /> Leave meet (keep scores on this phone)
          </button>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => { sync.unlink(); setConfirmLeave(false); say('Left the meet. Scores stay on this phone.'); }} className="flex-1 py-2 rounded-lg bg-red-600 text-white font-black text-[11px] uppercase">
              Confirm leave
            </button>
            <button type="button" onClick={() => setConfirmLeave(false)} className="px-4 py-2 rounded-lg bg-zt-surface-2 text-zt-text-2 font-bold text-[11px] uppercase">
              Cancel
            </button>
          </div>
        )
      )}
    </div>
  );
}
