'use client';
// Comp-prep sheet (11/5, feature gaps #15). One ruled table an athlete or coach programs from: event, scoring and cap,
// implement and rules, the weight for the chosen division (lb with kg), notes and video. "All divisions" widens to a
// column per division. Download CSV uses the same rows (lib/website/prepSheet.ts); Print hides the shell (print:hidden).
import React from 'react';
import Link from 'next/link';
import { Cap, Key, KeyButton, textLink } from './sheet';
import { prepSheetCsv, prepSheetFilename, prepSheetHref, timeCapLabel, type PrepSheet } from '@/lib/website/prepSheet';
import { longIsoDate, venueLine } from '@/lib/website/sheetFormat';
import { shareOrDownloadText } from '@/lib/download';
import type { PublicShowSummary } from '@/lib/website/types';

const TH = 'text-left text-xs tracking-[0.06em] uppercase font-normal text-ink-muted px-3 py-2 border border-rule bg-sheet align-bottom print:px-1.5 print:py-1 print:text-[9px] print:min-w-0';
const TD = 'px-3 py-2.5 border border-rule align-top text-[13px] text-ink print:px-1.5 print:py-1.5 print:text-[10px]';
const NUM = 'font-sheet text-pen';
/** On paper a long video URL is not typeable; the host says where it goes and the CSV carries the full link. */
const videoHost = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'link'; } };

export default function PrepSheetClient({ sheet, venue, isDemo }: { sheet: PrepSheet; venue: PublicShowSummary['venue']; isDemo: boolean }) {
  const one = sheet.division;
  const download = () => { void shareOrDownloadText(prepSheetFilename(sheet), prepSheetCsv(sheet), 'text/csv'); };
  const print = () => window.print();
  const hasRules = sheet.rows.some((r) => r.implement || r.courseFeet || r.allowed || r.notAllowed || r.risingBar);
  const hasNotes = sheet.rows.some((r) => r.notes || r.videoUrl);

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Cap>Comp-prep sheet{isDemo ? ' \u00b7 demo show' : ''}</Cap>
            <h1 className="text-[28px] sm:text-[34px] font-bold leading-tight text-ink mt-1">{sheet.showName}</h1>
            <p className="text-[15px] text-ink mt-1">
              <span className={`${NUM} font-bold`}>{longIsoDate(sheet.showDate)}</span>
              {venueLine(venue) ? <span className="text-ink-muted">{' \u00b7 '}{venueLine(venue)}</span> : null}
              {one ? <span className="text-ink-muted">{' \u00b7 '}</span> : null}
              {one ? <span className="font-bold">{one.name}</span> : null}
            </p>
            <p className="text-[13px] text-ink-muted mt-1 print:hidden">
              <Link href={`/shows/${encodeURIComponent(sheet.showSlug)}`} className={textLink}>Back to the show page</Link>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <KeyButton variant="pen" onClick={download}>Download CSV</KeyButton>
            <KeyButton variant="line" onClick={print}>Print</KeyButton>
          </div>
        </div>

        {sheet.divisions.length > 1 && (
          <nav aria-label="Division" className="print:hidden">
            <Cap className="mb-1.5">Division</Cap>
            <div className="flex flex-wrap gap-1.5">
              <Key href={prepSheetHref(sheet.showSlug)} variant={one ? 'line' : 'ink'} className="!min-h-10 !px-3.5 !text-[12px]" aria-current={one ? undefined : 'page'}>All divisions</Key>
              {sheet.divisions.map((d) => (
                <Key key={d.id} href={prepSheetHref(sheet.showSlug, d.id)} variant={one?.id === d.id ? 'ink' : 'line'} className="!min-h-10 !px-3.5 !text-[12px]" aria-current={one?.id === d.id ? 'page' : undefined}>{d.name}</Key>
              ))}
            </div>
          </nav>
        )}
      </header>

      {sheet.rows.length === 0 ? (
        <div className="border-2 border-rule px-5 py-5 text-[15px] text-ink-muted">The promoter has not entered any events yet.</div>
      ) : (
        <div className="border-2 border-rule">
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full text-[13px] border-collapse print:text-[10px] print:table-fixed">
              <caption className="sr-only">{sheet.showName}: events{one ? ` for ${one.name}` : ' for every division'}</caption>
              <thead>
                <tr>
                  <th scope="col" className={`${TH} min-w-[12rem] ${one ? 'print:w-[24%]' : 'print:w-[14%]'}`}>Event</th>
                  <th scope="col" className={`${TH} min-w-[8rem] ${one ? 'print:w-[17%]' : 'print:w-[11%]'}`}>Scoring &amp; cap</th>
                  {hasRules && <th scope="col" className={`${TH} min-w-[11rem] ${one ? 'print:w-[20%]' : 'print:w-[12%]'}`}>Implement &amp; rules</th>}
                  {one ? (
                    <th scope="col" className={`${TH} min-w-[9rem] print:w-[15%]`}>Weight</th>
                  ) : (
                    sheet.divisions.map((d) => <th key={d.id} scope="col" className={`${TH} text-ink font-bold normal-case tracking-normal text-[14px] min-w-[8rem] whitespace-nowrap print:whitespace-normal print:text-[9px]`}>{d.name}</th>)
                  )}
                  {hasNotes && <th scope="col" className={`${TH} min-w-[12rem] ${one ? 'print:w-[24%]' : 'print:w-[14%]'}`}>Notes</th>}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((r) => (
                  <tr key={r.eventNumber} className="break-inside-avoid">
                    <th scope="row" className={`${TD} text-left font-normal`}>
                      <div className="flex items-baseline gap-2">
                        <span className={`${NUM} text-base`}>E{r.eventNumber}</span>
                        <span className="font-bold text-[15px] print:text-[12px]">{r.name}</span>
                      </div>
                    </th>
                    <td className={TD}>
                      <div>{r.scoring}</div>
                      {timeCapLabel(r.timeCapSeconds) && <div className="text-ink-muted mt-0.5">{timeCapLabel(r.timeCapSeconds)} cap</div>}
                    </td>
                    {hasRules && (
                      <td className={TD}>
                        {r.implement && <div>{r.implement}</div>}
                        {r.courseFeet !== null && <div className="text-ink-muted">{r.courseFeet} ft course</div>}
                        {r.risingBar && <div className="text-ink-muted">Rising bar: <span className={NUM}>{r.risingBar}</span></div>}
                        {r.allowed && <div className="text-ink-muted">{r.allowed} allowed</div>}
                        {r.notAllowed && <div className="text-redpen">No {r.notAllowed.toLowerCase()}</div>}
                        {!r.implement && r.courseFeet === null && !r.risingBar && !r.allowed && !r.notAllowed && <span className="text-ink-muted">{'\u2014'}</span>}
                      </td>
                    )}
                    {r.weights.map((w) => (
                      <td key={w.divisionId} className={TD}>
                        <div className={w.main ? `${NUM} text-[20px] leading-none print:text-[13px] print:whitespace-nowrap` : 'text-ink-muted'}>{w.main || 'Not provided'}</div>
                        {w.kg && <div className="text-[12px] text-ink-muted mt-1">{w.kg}</div>}
                        {w.setup && <div className="text-[12px] text-ink-muted mt-1">{w.setup}</div>}
                      </td>
                    ))}
                    {hasNotes && (
                      <td className={TD}>
                        {r.notes && <div>{r.notes}</div>}
                        {r.videoUrl && (
                          <div className="mt-0.5">
                            <a href={r.videoUrl} target="_blank" rel="noopener noreferrer" className={`${textLink} print:hidden`}>Video</a>
                            <span className="hidden print:inline text-ink-muted">Video: {videoHost(r.videoUrl)} (link on the show page)</span>
                          </div>
                        )}
                        {!r.notes && !r.videoUrl && <span className="text-ink-muted">{'\u2014'}</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[12px] text-ink-muted">
        Weights are what the promoter published; details the promoter left out say &quot;Not provided&quot; rather than a guess.
        Printed from zerotacky.com/shows/{sheet.showSlug} on the date you printed it; check the show page before the meet.
      </p>
    </div>
  );
}
