'use client';

import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, Mail, ShieldCheck } from 'lucide-react';
import type { AppState } from '@/lib/types';
import type { PromoterMeetSummary } from '@/lib/promoter/contract';
import { standingsText } from '@/lib/export';
import { federationCsvFilename, federationEmailDraft, federationResultsCsv, SC_RESULTS_EMAIL, SC_RESULTS_WINDOW_DAYS } from '@/lib/exportFederation';
import { copyText, shareOrDownloadText } from '@/lib/download';
import { Cap, keyClass } from '@/components/website/sheet';

// Federation results pack (feature 1, 11/3). Shown on the Meet Day tab once the meet is completed. Three keys: the
// results CSV, the standings text, the prefilled email to Strongman Corporation; then "Mark as submitted", which sets
// the 037 retention guard (no delete, show page stays up when unlisted). Sheet grammar: a ruled block of cells.
interface ResultsPackSectionProps {
  summary: PromoterMeetSummary;
  state: AppState;
  onMarkSubmitted: () => Promise<{ error: string | null; resultsSubmittedAt: string | null }>;
}

const SITE_FALLBACK = 'https://www.zerotacky.com';

export default function ResultsPackSection({ summary, state, onMarkSubmitted }: ResultsPackSectionProps) {
  const [origin, setOrigin] = useState(SITE_FALLBACK);
  useEffect(() => { if (typeof window !== 'undefined' && window.location?.origin) setOrigin(window.location.origin); }, []);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listing = summary.listing;
  const final = listing.resultsStatus === 'final';
  const resultsUrl = `${origin}/shows/${summary.slug}`;
  const meta = { venue: listing.venue, federation: listing.federation, promoterContact: listing.promoterContact, resultsUrl };
  const draft = federationEmailDraft(state, meta);
  const submittedAt = listing.resultsSubmittedAt;
  const submittedDay = submittedAt ? submittedAt.slice(0, 10) : null;

  const handleDownload = async () => {
    const out = await shareOrDownloadText(federationCsvFilename(state), federationResultsCsv(state, meta), 'text/csv');
    if (out !== 'cancelled') { setDownloaded(true); setTimeout(() => setDownloaded(false), 2000); }
  };
  const handleCopy = async () => {
    await copyText(standingsText(state));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };
  const handleMark = async () => {
    setMarking(true); setError(null);
    const res = await onMarkSubmitted();
    setMarking(false);
    if (res.error) setError(res.error);
  };

  return (
    <section aria-labelledby="results-pack-heading" className="zt-block">
      <div className="px-5 py-4 sm:px-6 sm:py-5 flex flex-col gap-1">
        <Cap as="h2" id="results-pack-heading">Federation results pack</Cap>
        <p className="text-[15px] text-ink leading-snug">
          Strongman Corporation asks for results from shows not scored on Iron Podium within {SC_RESULTS_WINDOW_DAYS} days, by email to{' '}
          <span className="font-bold">{SC_RESULTS_EMAIL}</span> or as a live link that stays viewable for a year. Both are here.
        </p>
        {!final && (
          <p className="text-[13px] text-ink-muted">
            Results are <span className="font-bold text-ink">{listing.resultsStatus.replace('_', ' ')}</span>. Set them to final on the Listing tab before sending; the pack below reflects what is scored so far.
          </p>
        )}
      </div>

      <div className="px-5 py-4 sm:px-6 sm:py-5 grid gap-2 sm:grid-cols-3">
        <button type="button" onClick={handleDownload} className={keyClass('ink', 'w-full')}>
          {downloaded ? <Check className="w-4 h-4" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
          {downloaded ? 'Saved' : 'Results CSV'}
        </button>
        <button type="button" onClick={handleCopy} className={keyClass('line', 'w-full')}>
          {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy standings'}
        </button>
        <a href={draft.mailto} className={keyClass('line', 'w-full')}>
          <Mail className="w-4 h-4" aria-hidden="true" />
          Email to SC
        </a>
      </div>

      <div className="px-5 py-4 sm:px-6 sm:py-5 flex flex-col gap-1.5 text-[13px] text-ink-muted">
        <div><Cap as="span" className="mr-2">To</Cap><span className="text-ink">{draft.to}</span></div>
        <div><Cap as="span" className="mr-2">Subject</Cap><span className="text-ink">{draft.subject}</span></div>
        <div><Cap as="span" className="mr-2">Link</Cap><a href={resultsUrl} className="text-ink underline underline-offset-4 decoration-1 hover:text-pen break-all">{resultsUrl}</a></div>
        <p>
          The email opens in your mail app with the link{draft.standingsIncluded ? ' and the standings' : ''} filled in. Attach the CSV you saved before sending
          {draft.standingsIncluded ? '.' : '; this meet is too large for the standings to ride in the email body.'}
          {draft.trimmed ? ' The venue, federation and contact lines were left out to keep the link short; they are in the CSV title block.' : ''}
        </p>
      </div>

      <div className="px-5 py-4 sm:px-6 sm:py-5 flex flex-col gap-3">
        {submittedDay ? (
          <div className="flex items-start gap-2.5 text-[15px] text-ink">
            <ShieldCheck className="w-5 h-5 shrink-0 text-pen" aria-hidden="true" />
            <div>
              <div className="font-bold">Results marked as submitted on {submittedDay}.</div>
              <div className="text-[13px] text-ink-muted">
                This meet can no longer be deleted, and its show page stays reachable at the link above even if you unlist it. Unlisting on the Listing tab hides it from the Shows list.
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[13px] text-ink-muted">
              Once you have sent the results, mark them as submitted. From then on the meet cannot be deleted and the show page stays up for the year the federation expects, even when unlisted. This cannot be undone.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={handleMark} disabled={marking || !final} className={keyClass('pen', 'disabled:opacity-50 disabled:cursor-not-allowed')}>
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                {marking ? 'Marking…' : 'Mark results as submitted'}
              </button>
              {!final && <span className="text-[13px] text-ink-muted">Needs final results.</span>}
            </div>
            {error && <div role="alert" className="text-[13px] font-bold text-ink">{error}</div>}
          </>
        )}
      </div>
    </section>
  );
}
