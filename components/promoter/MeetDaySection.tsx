'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, Copy, ExternalLink, KeyRound, RefreshCw, Tv } from 'lucide-react';
import { copyText } from '@/lib/download';
import type { PromoterMeetSummary } from '@/lib/promoter/contract';

interface MeetDaySectionProps {
  summary: PromoterMeetSummary;
  onRotateCode: () => Promise<{ error: string | null; joinCode: string | null }>;
}

export default function MeetDaySection({ summary, onRotateCode }: MeetDaySectionProps) {
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const scorerUrl = `${origin}/scorer`;
  const joinUrl = summary.joinCode
    ? `${origin}/join?code=${summary.joinCode}`
    : `${origin}/join`;
  const tvUrl = `${origin}/m/${summary.slug}?layout=tv`;

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
      help: 'Share with judges and pit crew so their phones attach directly to this meet.',
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
          <span>7. Meet Day Codes &amp; Screen Links</span>
        </h2>
        <p className="text-xs text-zt-muted mt-0.5">
          Preview of the meet-day codes and screen links. The join code shown here is fixture data and does not
          attach volunteer phones to a live meet; it connects to the live backend in a later milestone.
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
            Rotate generates a new 6-character code in this preview (this browser tab only). When live, rotating
            will invalidate the old code for new volunteer phones.
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
                Open {row.path}
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
    </section>
  );
}
