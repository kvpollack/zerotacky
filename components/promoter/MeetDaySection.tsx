'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Copy, ExternalLink, KeyRound, RefreshCw, Trash2, Tv } from 'lucide-react';
import { copyText } from '@/lib/download';
import type { DeletedMeet, PromoterMeetSummary } from '@/lib/promoter/contract';
import { isLiveBackend } from '@/lib/promoter/usePromoterApi';
import MeetDayQrCards from './MeetDayQrCards';

interface MeetDaySectionProps {
  summary: PromoterMeetSummary;
  resultCount: number;   // state.results.length; the summary carries the other counts
  onRotateCode: () => Promise<{ error: string | null; joinCode: string | null }>;
  // 010: hard delete, owner only. Resolves with the server's error text or null; the parent navigates away on success.
  onDelete: (confirmName: string | null) => Promise<{ error: string | null; deleted: DeletedMeet | null }>;
}

export default function MeetDaySection({ summary, resultCount, onRotateCode, onDelete }: MeetDaySectionProps) {
  const [rotating, setRotating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const status = summary.listing.competitionStatus;
  const deletable = status !== 'live' && status !== 'completed';
  const dataCounts = [
    { label: 'divisions', n: summary.divisionCount },
    { label: 'athletes on the roster', n: summary.athleteCount },
    { label: 'recorded results', n: resultCount },
    { label: 'registration requests (accepted, pending, waitlisted, declined)', n: summary.registrationCount + summary.pendingCount },
  ];
  const hasData = dataCounts.some((c) => c.n > 0);
  const nameMatches = deleteName.trim().toLowerCase() === summary.name.trim().toLowerCase();

  const handleDelete = async () => {
    if (!hasData) {
      const ok = typeof window !== 'undefined' ? window.confirm(`Delete "${summary.name}"? This draft has no divisions, athletes, results or registrations. This cannot be undone.`) : false;
      if (!ok) return;
    } else if (!nameMatches) {
      setDeleteError('Type the meet name exactly as shown to confirm.');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    const res = await onDelete(hasData ? deleteName.trim() : null);
    if (res.error) {
      setDeleting(false);
      setDeleteError(res.error);
    }
    // on success the parent navigates to the dashboard; leave the button disabled meanwhile
  };
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const scorerUrl = `${origin}/scorer`;
  const joinUrl = summary.joinCode
    ? `${origin}/join?code=${summary.joinCode}`
    : `${origin}/join`;
  const tvUrl = `${origin}/m/${summary.slug}?layout=tv`;
  const boardUrl = `${origin}/m/${summary.slug}`;
  const qrItems = useMemo(() => [
    { key: 'join', title: 'Judges & pit crew: join this meet', hint: `Scan, then pick your role. Code ${summary.joinCode || 'not set'}.`, url: joinUrl },
    { key: 'board', title: 'Live scoreboard', hint: 'Scan to follow the standings on your phone.', url: boardUrl },
  ], [joinUrl, boardUrl, summary.joinCode]);

  const handleCopy = async (key: string, value: string) => {
    const ok = await copyText(value);
    if (!ok) {
      setError('Clipboard access was blocked by the browser. Select and copy the text directly.');
      return;
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 3000);
  };

  const handleRotate = async () => {
    setRotating(true);
    setError(null);
    const res = await onRotateCode();
    setRotating(false);
    if (res.error) {
      setError(res.error);
    }
  };

  const copyRows = [
    {
      key: 'scorer',
      label: 'Promoter / Admin Scorer App',
      path: '/scorer',
      fullUrl: scorerUrl,
      help: 'Open on the admin phone to run Meet Setup, Judge Pad, Pit Crew, and Live Sync.',
    },
    {
      key: 'join',
      label: 'Volunteer Judge & Pit Crew Join URL',
      path: summary.joinCode ? `/join?code=${summary.joinCode}` : '/join',
      fullUrl: joinUrl,
      help: isLiveBackend()
        ? 'Share with judges and pit crew. Their phones attach to this meet with the current join code.'
        : 'Preview link: in this browser-tab preview the code is fixture data and attaches no phones.',
    },
    {
      key: 'tv',
      label: 'Gym TV / Projector Live Leaderboard URL',
      path: `/m/${summary.slug}?layout=tv`,
      fullUrl: tvUrl,
      help: 'Full-width multi-division standings table for a laptop HDMI feed or gym TV.',
    },
  ];

  return (
    <section className="bg-zt-surface border border-zt-border rounded-2xl p-5 space-y-5">
      <div className="border-b border-zt-border pb-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-zt-primary flex items-center gap-2">
          <Tv className="w-4 h-4" aria-hidden="true" />
          <span>8. Meet Day Codes &amp; Screen Links</span>
        </h2>
        <p className="text-xs text-zt-muted mt-0.5">
          {isLiveBackend()
            ? 'Meet-day codes and screen links for this meet. The join code is checked on every write from a volunteer phone.'
            : 'Preview of the meet-day codes and screen links. The join code shown here is fixture data and does not attach volunteer phones to a live meet; it connects to the live backend in a later milestone.'}
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="p-3.5 rounded-xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold flex items-center gap-2"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Join Code Card */}
      <div className="bg-zt-inset border-2 border-zt-primary/60 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-[11px] font-extrabold uppercase text-zt-primary flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Volunteer Phone Join Code (Owner Only)</span>
          </div>
          <div className="text-3xl sm:text-4xl font-mono font-black tracking-[0.28em] text-zt-text select-all">
            {summary.joinCode || 'NOT SET'}
          </div>
          <p className="text-xs text-zt-muted">
            {isLiveBackend()
              ? 'Rotate replaces the code. Every phone that joined with the old code, including an admin phone that published with it, is locked out on its next write until it rejoins with the new one. A phone signed in to this account is unaffected.'
              : 'Rotate generates a new 6-character code in this preview (this browser tab only). When live, every phone that joined with the old code must rejoin with the new one.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          {summary.joinCode && (
            <button
              type="button"
              onClick={() => handleCopy('code', summary.joinCode!)}
              className="px-4 py-2.5 rounded-xl bg-zt-surface border border-zt-border-strong text-zt-text font-black text-xs uppercase inline-flex items-center gap-1.5"
            >
              {copiedKey === 'code' ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  Copied Code
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  Copy Code
                </>
              )}
            </button>
          )}

          <button
            type="button"
            disabled={rotating}
            onClick={handleRotate}
            className="px-4 py-2.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase inline-flex items-center gap-1.5 shadow disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${rotating ? 'animate-spin' : ''}`} aria-hidden="true" />
            {rotating ? 'Rotating…' : 'Rotate Code'}
          </button>
        </div>
      </div>

      {/* QR codes (Kurt 10/19): join link and live board, printable */}
      <MeetDayQrCards meetName={summary.name} items={qrItems} />

      {/* Copyable Route Fields */}
      <div className="space-y-3">
        {copyRows.map((row) => (
          <div
            key={row.key}
            className="bg-zt-inset border border-zt-border rounded-xl p-4 space-y-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-black uppercase text-zt-text">{row.label}</span>
              <Link
                href={row.path}
                className="text-xs font-extrabold uppercase text-zt-primary hover:underline inline-flex items-center gap-1"
              >
                Open
                <ExternalLink className="w-3 h-3" aria-hidden="true" />
              </Link>
            </div>
            <p className="text-[11px] font-semibold text-zt-muted">{row.help}</p>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={row.fullUrl}
                aria-label={row.label}
                onFocus={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 bg-zt-surface border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-mono font-bold text-zt-text"
              />
              <button
                type="button"
                onClick={() => handleCopy(row.key, row.fullUrl)}
                className="px-4 py-2 rounded-xl bg-zt-surface-2 border border-zt-border-strong text-zt-text font-black text-xs uppercase inline-flex items-center gap-1.5 flex-shrink-0"
              >
                {copiedKey === row.key ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* 010: delete meet. Hidden for live/completed meets (archive is the record); a draft deletes on a plain confirm,
          a meet with data needs the name typed, and the server checks the same name. */}
      {deletable && (
        <div className="border-2 border-zt-danger/60 rounded-2xl p-4 space-y-3" data-testid="delete-meet">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-extrabold uppercase text-zt-danger-text flex items-center gap-1.5">
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Delete This Meet</span>
              </div>
              <p className="text-xs text-zt-muted mt-1">
                Removes the meet, its divisions, events, roster, scores, registrations and the public page for good. Only the
                promoter who owns the meet can do this. A live or completed meet cannot be deleted; set it to cancelled on the
                Listing tab or keep it as a record.
              </p>
            </div>
            {!deleteOpen && (
              <button
                type="button"
                onClick={() => { setDeleteOpen(true); setDeleteError(null); }}
                className="px-4 py-2.5 rounded-xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text font-black text-xs uppercase inline-flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                Delete Meet
              </button>
            )}
          </div>

          {deleteOpen && (
            <div className="space-y-3">
              {hasData ? (
                <div className="rounded-xl bg-zt-danger/15 border-2 border-zt-danger p-4 space-y-2">
                  <div className="text-sm font-black uppercase tracking-wide text-zt-danger-text flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                    <span>This meet has data associated with it. Confirm before deletion.</span>
                  </div>
                  <ul className="text-xs font-bold text-zt-text space-y-0.5 pl-7">
                    {dataCounts.filter((c) => c.n > 0).map((c) => (
                      <li key={c.label}>{c.n} {c.label}</li>
                    ))}
                  </ul>
                  <label className="block text-[11px] font-extrabold uppercase text-zt-muted pl-7 pt-1">
                    Type the meet name to confirm: <span className="text-zt-text normal-case">{summary.name}</span>
                    <input
                      type="text"
                      value={deleteName}
                      onChange={(e) => setDeleteName(e.target.value)}
                      placeholder={summary.name}
                      autoComplete="off"
                      className="w-full mt-1 bg-zt-surface border border-zt-danger rounded-xl px-3 py-2 text-sm font-bold text-zt-text"
                    />
                  </label>
                </div>
              ) : (
                <p className="text-xs font-bold text-zt-text">This meet has no divisions, athletes, results or registrations yet. Deleting it removes the empty draft.</p>
              )}
              {deleteError && (
                <div className="p-3 rounded-xl bg-zt-danger/15 border border-zt-danger text-zt-danger-text text-xs font-bold" role="alert">
                  {deleteError}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={deleting || (hasData && !nameMatches)}
                  onClick={handleDelete}
                  className="px-4 py-2.5 rounded-xl bg-zt-danger text-white font-black text-xs uppercase inline-flex items-center gap-1.5 disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  {deleting ? 'Deleting…' : hasData ? 'Delete Meet and All Its Data' : 'Delete Empty Meet'}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => { setDeleteOpen(false); setDeleteName(''); setDeleteError(null); }}
                  className="px-4 py-2.5 rounded-xl bg-zt-surface border border-zt-border-strong text-zt-text font-black text-xs uppercase"
                >
                  Keep Meet
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
