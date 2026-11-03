// Shows as a results table (Phase 3, 11/2; mockup hybrid/web_home.html `.list`): Date | Show / venue | Status |
// Source | Open. The date is set in pen like a filled-in value; a live row's status is pen too. Phones fold the row
// to date + name with the status underneath and the link on the right.
import React from 'react';
import Link from 'next/link';
import type { PublicShowSummary } from '@/lib/website/types';
import { showRowLink, showRowStatus, splitIsoDate, venueLine } from '@/lib/website/sheetFormat';

const H = 'hidden md:flex items-center h-[34px] px-3.5 text-xs tracking-[0.06em] uppercase text-ink-muted';

// `detail` (the /shows list): the promoter's note, every division and every implement under the name, as text lines.
export default function ShowRows({ shows, ariaLabelledby, detail = false }: { shows: PublicShowSummary[]; ariaLabelledby?: string; detail?: boolean }) {
  return (
    <div role="table" aria-labelledby={ariaLabelledby} className="zt-block grid-cols-[72px_1fr_auto] md:grid-cols-[120px_1fr_260px_150px_140px]">
      <div role="row" className="contents">
        <div role="columnheader" className={H}>Date</div>
        <div role="columnheader" className={H}>Show / venue</div>
        <div role="columnheader" className={H}>Status</div>
        <div role="columnheader" className={H}>Source</div>
        <div role="columnheader" className={`${H} justify-end`}>Open</div>
      </div>
      {shows.map((show) => {
        const d = splitIsoDate(show.date);
        const st = showRowStatus(show);
        const go = showRowLink(show);
        return (
          <div role="row" key={show.id} className="contents">
            <div role="cell" className="flex flex-col justify-center px-3.5 min-h-[72px] py-2 text-pen">
              <span className="font-sheet text-[26px] leading-none">{d.day || '—'}</span>
              <span className="block text-xs text-ink-muted mt-1">{d.rest}</span>
            </div>
            <div role="cell" className="flex flex-col justify-center px-3.5 min-h-[72px] py-2 min-w-0">
              {show.externalUrl ? (
                <a href={show.externalUrl} target="_blank" rel="noopener noreferrer" className="text-base md:text-lg font-bold leading-tight text-ink no-underline hover:text-pen hover:underline underline-offset-4">
                  {show.name}
                </a>
              ) : (
                <Link href={`/shows/${show.slug}`} className="text-base md:text-lg font-bold leading-tight text-ink no-underline hover:text-pen hover:underline underline-offset-4">
                  {show.name}
                </Link>
              )}
              <span className="block text-[13px] text-ink-muted mt-1 truncate">
                {venueLine(show.venue)}
                {!detail && show.divisionLabels.length > 0 && ` · ${show.divisionLabels.slice(0, 3).join(', ')}${show.divisionLabels.length > 3 ? ` +${show.divisionLabels.length - 3}` : ''}`}
              </span>
              <span className={`md:hidden block text-xs uppercase tracking-[0.04em] mt-1.5 ${st.live ? 'text-pen font-bold' : 'text-ink-muted'}`}>
                {st.text}{show.isDemoFixture ? ' · Demo fixture' : ''}
              </span>
              {detail && (
                <div className="mt-2.5 text-[13px] leading-[1.5] text-ink space-y-1 whitespace-normal">
                  {show.summaryNote && <p>{show.summaryNote}</p>}
                  <p><span className="text-ink-muted">Divisions / Strength Groups ({show.divisionLabels.length}):</span> {show.divisionLabels.length ? show.divisionLabels.join(', ') : 'Not provided'}</p>
                  <p><span className="text-ink-muted">Implements ({show.implementTags.length}):</span> {show.implementTags.length ? show.implementTags.join(', ') : 'Not provided'}</p>
                  {show.federation && <p><span className="text-ink-muted">Format:</span> {show.federation}</p>}
                </div>
              )}
            </div>
            <div role="cell" className={`hidden md:flex items-center px-3.5 min-h-[72px] text-[13px] uppercase tracking-[0.04em] ${st.live ? 'text-pen font-bold' : 'text-ink'}`}>
              {st.text}
            </div>
            <div role="cell" className={`hidden md:flex items-center px-3.5 min-h-[72px] text-[13px] uppercase tracking-[0.04em] ${show.isDemoFixture ? 'text-ink-muted' : 'text-ink'}`}>
              {show.externalUrl ? `Listed on ${show.externalHost}` : show.isDemoFixture ? 'Demo fixture' : 'Published'}
            </div>
            <div role="cell" className="flex items-center justify-end px-3.5 min-h-[72px]">
              {go.external ? (
                <a href={go.href} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold uppercase tracking-[0.04em] text-ink underline underline-offset-4 decoration-1 hover:text-pen whitespace-nowrap">
                  {go.label} ↗
                </a>
              ) : (
                <Link href={go.href} className="text-[13px] font-bold uppercase tracking-[0.04em] text-ink underline underline-offset-4 decoration-1 hover:text-pen whitespace-nowrap">
                  {go.label}
                </Link>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
