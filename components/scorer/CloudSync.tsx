'use client';
// Phase 5 (11/2): Live Sync in the sheet grammar (port of setup/SyncPanel.jsx). Sits on the Meet Details screen and,
// as the publish key alone, on Live Control. The publish-key UI stayed retired (Kurt 10/21); a key already on the
// phone can still be forgotten here. Copy unchanged.
import React, { useState } from 'react';
import Link from 'next/link';
import type { Meet } from '@/lib/types';
import { copyText } from '@/lib/download';
import { slugFor } from '@/hooks/useMeetSync';
import { rememberReturnTo } from '@/components/auth/SignInForm';
import { RuledBlock } from '@/components/sheet';
import { CAP, Field, Key, Note, Row, Sec, TextInput, Toast, Val } from './parts';

export type PanelSync = {
  enabled?: boolean;
  status: { state: string; pending?: number; error?: string | null; publishError?: string | null };
  link?: { slug: string; joinCode: string; role: string } | null;
  account?: { label: string } | null;
  canPublish?: boolean;
  publish: (opts: { slug: string }) => Promise<unknown>;
  joinByCode: (code: string) => Promise<unknown>;
  unlink: () => void;
};

export function useSay() {
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const say = (text: string, tone: 'ok' | 'warn' = 'ok') => { setNotice({ text, tone }); setTimeout(() => setNotice(null), 5000); };
  return { notice, say };
}

export default function CloudSync({ sync, meet, compact = false }: { sync: PanelSync | null | undefined; meet: Meet; compact?: boolean }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { notice, say } = useSay();
  if (!sync?.enabled) return null;
  const { status, link, account } = sync;
  const canPublish = sync.canPublish ?? !!account;
  const run = async (fn: () => Promise<unknown>, okMsg?: string) => {
    setBusy(true);
    try { await fn(); if (okMsg) say(okMsg); } catch (e) { say((e as Error)?.message || String(e), 'warn'); } finally { setBusy(false); }
  };
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const boardUrl = link ? `${origin}/m/${link.slug}` : '';
  const joinUrl = link ? `${origin}/join?code=${link.joinCode}` : '';
  const slug = link?.slug || slugFor(meet);
  const stateWord = `${status.state === 'off' ? 'not linked' : status.state}${status.pending ? ` · ${status.pending} waiting` : ''}`;

  const publishKey = (
    <Key variant="pen" disabled={busy || !canPublish} onClick={() => run(() => sync.publish({ slug }), link ? 'Meet updated online' : 'Meet published')}>
      {link ? 'Publish update' : `Publish as /${slug}`}
    </Key>
  );

  if (compact) {
    return (
      <>
        {publishKey}
        {notice && <Toast cap="Live Sync" tone={notice.tone === 'warn' ? 'red' : 'pen'}>{notice.text}</Toast>}
      </>
    );
  }

  return (
    <>
      <Sec right={account ? <>Publishing as <span className="normal-case">{account.label}</span></> : stateWord}>Live Sync</Sec>
      <RuledBlock columns="minmax(0,1fr) minmax(0,1fr)">
        {link ? (
          <>
            <Field label={<>Join code &middot; /{link.slug} &middot; {link.role}</>}><Val className="tracking-[0.2em] select-text">{link.joinCode}</Val></Field>
            <Field label="Account">
              {account ? <Val className="normal-case">{account.label}</Val> : <Link href="/website/account" onClick={() => rememberReturnTo('/scorer')} className="text-[13px] font-bold text-pen underline">Sign in</Link>}
            </Field>
            <Field wide label="Scoreboard"><Val className="normal-case !text-[12px]">{boardUrl}</Val></Field>
          </>
        ) : (
          <>
            <Field wide label="Live Sync">
              <Note className="!mt-0">Scores stay on this phone until you publish the meet (promoter) or join one by code (any phone).</Note>
            </Field>
            <Field label="Account">
              {account ? <Val className="normal-case">{account.label}</Val> : <Link href="/website/account" onClick={() => rememberReturnTo('/scorer')} className="text-[13px] font-bold text-pen underline">Sign in</Link>}
            </Field>
            <Field label="Scoreboard address"><Val className="normal-case">/m/{slug}</Val></Field>
          </>
        )}
      </RuledBlock>
      {!account && <Note>Sign in to publish this meet. Judges and pit crew do not sign in; they join with the code.</Note>}
      {!link && <Note>Scoreboard address will be <b>/m/{slug}</b> (change it in Meet Details above; fixed after publishing).</Note>}

      {link && (
        <Row>
          <Key onClick={() => run(async () => { if (!(await copyText(joinUrl))) throw new Error('Clipboard blocked'); }, 'Join link copied')}>Join link</Key>
          <Key onClick={() => run(async () => { if (!(await copyText(boardUrl))) throw new Error('Clipboard blocked'); }, 'Scoreboard link copied')}>Scoreboard</Key>
        </Row>
      )}
      {publishKey}
      {link?.role === 'admin' && canPublish && (
        <Note>Config changes (weights, events, roster adds and removals) re-publish automatically from this phone. If the server refuses one (an athlete with a recorded result, or on the roster through an accepted registration), the reason shows here and the roster comes back.</Note>
      )}
      {link?.role === 'admin' && !canPublish && (
        <Note>Signed out: scores from this phone still sync, but weights, events and roster changes stay on this phone until the promoter signs in here and publishes.</Note>
      )}
      {status.error && <Toast cap="Sync" tone="red">{status.error}</Toast>}
      {status.publishError && status.publishError !== status.error && (
        <Note className="text-redpen"><b>Last publish was refused:</b> {status.publishError} Config changes since then are not online.</Note>
      )}

      {!link && (
        <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) run(() => sync.joinByCode(code), 'Joined meet'); }} className="grid grid-cols-[1fr_auto] gap-2">
          <TextInput value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="JOIN CODE" maxLength={6} autoCapitalize="characters" aria-label="Join code" className="!border-2 !border-rule tracking-[0.2em]" />
          <Key type="submit" variant="ink" disabled={busy || code.trim().length < 6}>Join</Key>
        </form>
      )}
      {link && (!confirmLeave ? (
        <Key size="sm" onClick={() => setConfirmLeave(true)}>Leave meet (keep scores on this phone)</Key>
      ) : (
        <Row>
          <Key variant="red" onClick={() => { sync.unlink(); setConfirmLeave(false); say('Left the meet. Scores stay on this phone.'); }}>Confirm leave</Key>
          <Key onClick={() => setConfirmLeave(false)}>Cancel</Key>
        </Row>
      ))}
      {notice && <Toast cap="Live Sync" tone={notice.tone === 'warn' ? 'red' : 'pen'}>{notice.text}</Toast>}
      <span className={`text-[9px] ${CAP}`}>{stateWord}</span>
    </>
  );
}
