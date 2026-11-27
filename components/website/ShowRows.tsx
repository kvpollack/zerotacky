// Shows as a results table (Phase 3, 11/2; mockup hybrid/web_home.html `.list`): Date | Show / venue | Status |
// Source | Open. The date is set in pen like a filled-in value; a live row's status is pen too.
// Pass 2 (11/27, merged audit finding 1): below md the five-column table left ~112 px for the name. Phones now get a
// stacked list instead: date and status on one line, the name on its own line at full width, the venue under it, and
// the whole row is the link; division and implement lists stay on the show page. The table is unchanged from md up.
// Both are rendered and CSS shows one. The table sits in a `hidden md:block` wrapper because `.zt-block` sets
// display:grid outside Tailwind's layers, so `hidden` on the block itself would lose.
import React from 'react';
import Link from 'next/link';
import type { PublicShowSummary } from '@/lib/website/types';
import { showRowLink, showRowStatus, splitIsoDate, venueLine } from '@/lib/website/sheetFormat';
import { actionLink } from './sheet';

const H = 'flex items-center h-[34px] px-3.5 text-xs tracking-[0.06em] uppercase text-ink-muted';
const STACK_LINK = 'flex flex-col gap-1 px-4 py-3.5 min-h-11 text-ink no-underline outline-none hover:bg-ground focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-pen focus-visible:-outline-offset-2';

function divisionsShort(labels: string[]): string {
  return labels.length ? `${labels.slice(0, 3).join(', ')}${labels.length > 3 ? ` +${labels.length - 3}` : ''}` : '';
}

// `detail` (the /shows list): the promoter's note, every division and every implement under the name, as text lines
// (desktop table only; on phones those lists live on the show page).
export default function ShowRows({ shows, ariaLabelledby, detail = false }: { shows: PublicShowSummary[]; ariaLabelledby?: string; detail?: boolean }) {
  return (
    <>
      <ul aria-labelledby={ariaLabelledby} className="md:hidden border-2 border-rule bg-sheet">
        {shows.map((show) => {
          const d = splitIsoDate(show.date);
          const st = showRowStatus(show);
          const go = showRowLink(show);
          const venue = venueLine(show.venue);
          const source = show.externalUrl ? `Listed on ${show.externalHost}` : show.isDemoFixture ? 'Demo fixture' : '';
          // a live show's row opens the live board (one tap on meet day), so its show page gets its own link under the row
          const showPage = `/shows/${show.slug}`;
          const opensElsewhere = !go.external && go.href !== showPage;
          const body = (
            <>
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[15px] font-bold text-pen whitespace-nowrap">{d.day ? `${d.day} ${d.rest}` : d.rest || 'Date not set'}</span>
                <span className={`text-xs uppercase tracking-[0.04em] text-right ${st.live ? 'text-pen font-bold' : 'text-ink-muted'}`}>{st.text}</span>
              </span>
              <span className="text-[20px] leading-6 font-bold text-ink">{show.name}{go.external && <span aria-hidden="true"> ↗</span>}</span>
              {venue && <span className="text-[15px] leading-[22px] text-ink-muted">{venue}</span>}
              {source && <span className="text-[13px] leading-snug text-ink-muted truncate">{source}</span>}
              {opensElsewhere && <span className="text-[13px] leading-snug font-bold text-pen">{go.label} →</span>}
            </>
          );
          return (
            <li key={show.id} data-zt-show-row="" className="zt-wide border-t border-rule-subtle first:border-t-0">
              {go.external ? (
                <a href={go.href} target="_blank" rel="noopener noreferrer" className={STACK_LINK}>{body}</a>
              ) : (
                <Link href={go.href} className={STACK_LINK}>{body}</Link>
              )}
              {opensElsewhere && <Link href={showPage} className={`${actionLink} mx-4 text-[13px]`}>Show details</Link>}
            </li>
          );
        })}
      </ul>

      <div className="hidden md:block">
      <div role="table" aria-labelledby={ariaLabelledby} className="zt-block grid-cols-[120px_1fr_260px_150px_140px]">
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
                  <a href={show.externalUrl} target="_blank" rel="noopener noreferrer" className="text-lg font-bold leading-tight text-ink no-underline hover:text-pen hover:underline underline-offset-4">
                    {show.name}
                  </a>
                ) : (
                  <Link href={`/shows/${show.slug}`} className="text-lg font-bold leading-tight text-ink no-underline hover:text-pen hover:underline underline-offset-4">
                    {show.name}
                  </Link>
                )}
                <span className="block text-[13px] text-ink-muted mt-1 truncate">
                  {[venueLine(show.venue), !detail && show.divisionLabels.length > 0 ? divisionsShort(show.divisionLabels) : ''].filter(Boolean).join(' · ')}
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
              <div role="cell" className={`flex items-center px-3.5 min-h-[72px] text-[13px] uppercase tracking-[0.04em] ${st.live ? 'text-pen font-bold' : 'text-ink'}`}>
                {st.text}
              </div>
              <div role="cell" className={`flex items-center px-3.5 min-h-[72px] text-[13px] uppercase tracking-[0.04em] ${show.isDemoFixture ? 'text-ink-muted' : 'text-ink'}`}>
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
      </div>
    </>
  );
}
