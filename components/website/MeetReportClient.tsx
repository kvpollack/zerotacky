'use client';
// Post-meet report (11/8, feature gaps #19). Ruled blocks in the sheet grammar: headline facts, podiums per division,
// event winners, where the field came from, sponsors. Print hides the shell; Download CSV uses lib/website/meetReport.
import React from 'react';
import Link from 'next/link';
import { Cap, KeyButton, SectionCap, WebCell, textLink } from './sheet';
import { meetReportCsv, meetReportFilename, type MeetReport } from '@/lib/website/meetReport';
import { shareOrDownloadText } from '@/lib/download';

const NUM = 'font-sheet text-pen';
const NOTE = 'text-[13px] leading-snug text-ink-muted';
const FACT_V = 'text-[15px] font-bold leading-snug text-ink';
const place = (p: { place: number; tied: boolean }) => `${p.tied ? 'T' : ''}${p.place}`;

export default function MeetReportClient({ report: r, completed }: { report: MeetReport; completed: boolean }) {
  const download = () => { void shareOrDownloadText(meetReportFilename(r), meetReportCsv(r), 'text/csv'); };
  const print = () => window.print();
  const originsKnown = r.origins && r.origins.public > 0;

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Cap>Post-meet report{r.isDemo ? ' \u00b7 demo show' : ''}{!r.isFinal ? ' \u00b7 provisional results' : ''}</Cap>
          <h1 className="text-[28px] sm:text-[34px] font-bold leading-tight text-ink mt-1">{r.showName}</h1>
          <p className="text-[15px] text-ink mt-1">
            <span className={`${NUM} font-bold`}>{r.dateLabel}</span>
            {r.venue ? <span className="text-ink-muted">{' \u00b7 '}{r.venue}</span> : null}
            {r.hostGym ? <span className="text-ink-muted">{' \u00b7 hosted at '}<Link href={`/gyms/${encodeURIComponent(r.hostGym.slug)}`} className={textLink}>{r.hostGym.name}</Link></span> : null}
          </p>
          <p className={`${NOTE} mt-1 print:hidden`}>
            <Link href={`/shows/${encodeURIComponent(r.showSlug)}`} className={textLink}>Back to the show page</Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <KeyButton variant="pen" onClick={download}>Download CSV</KeyButton>
          <KeyButton variant="line" onClick={print}>Print</KeyButton>
        </div>
      </header>

      {!completed && (
        <div role="status" className="border-2 border-rule px-5 py-4 text-[14px] text-ink">
          This show is not completed yet. The numbers below are a snapshot of the live board and will change.
        </div>
      )}

      <section aria-labelledby="field-heading" className="zt-block grid-cols-2 md:grid-cols-5">
        <h2 id="field-heading" className="sr-only">The field</h2>
        {[
          ['Athletes entered', r.totals.entered],
          ['Scored', r.totals.scored],
          ['Scratched', r.totals.scratched],
          ['Divisions', r.totals.divisions],
          ['Events', r.totals.events],
        ].map(([label, n]) => (
          <WebCell key={String(label)} pad="sm" className="min-h-[84px] justify-center gap-1 px-4">
            <Cap>{label}</Cap>
            <div className={`${NUM} text-[28px] leading-none`}>{n}</div>
          </WebCell>
        ))}
      </section>

      <section aria-labelledby="podiums-heading">
        <SectionCap id="podiums-heading" aside={<span className={NOTE}>{r.isFinal ? 'Official, marked final by the promoter' : 'Provisional'}</span>}>Podiums</SectionCap>
        <div className={`zt-block grid-cols-1 ${r.divisions.length > 1 ? 'md:grid-cols-2' : ''}`}>
          {r.divisions.map((d) => (
            <WebCell key={d.id} pad="none" className="gap-0">
              <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-rule">
                <h3 className="text-base font-bold text-ink">{d.name}</h3>
                <span className={NOTE}>{d.entered} entered · {d.scored} scored{d.scratched ? ` · ${d.scratched} scratched` : ''}</span>
              </div>
              {d.podium.length === 0 ? (
                <p className={`${NOTE} px-5 py-4`}>No scored finishers.</p>
              ) : (
                <ol>
                  {d.podium.map((p) => (
                    <li key={`${p.place}-${p.name}`} className="grid grid-cols-[48px_1fr_auto] items-center gap-3 px-5 py-2.5 border-b border-rule last:border-b-0">
                      <span className={`${NUM} text-[24px] leading-none`}>{place(p)}</span>
                      <span className="font-bold text-[15px] text-ink truncate">{p.name}</span>
                      <span className={NOTE}>{p.points} pts · {p.eventWins} event win{p.eventWins === 1 ? '' : 's'}</span>
                    </li>
                  ))}
                </ol>
              )}
            </WebCell>
          ))}
        </div>
      </section>

      {r.eventWinners.length > 0 && (
        <section aria-labelledby="winners-heading">
          <SectionCap id="winners-heading">Event winners</SectionCap>
          <ul className="zt-block grid-cols-1">
            {r.eventWinners.map((e) => (
              <li key={e.eventName} className="flex flex-col gap-1 px-4 py-3 sm:px-5">
                <span className={FACT_V}>{e.eventName}</span>
                <span className={NOTE}>
                  {e.winners.map((w, i) => (
                    <span key={`${w.division}-${w.name}`}>{i > 0 ? ' · ' : ''}{w.division}: <strong className="text-ink">{w.name}</strong> ({w.display})</span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.origins && (
        <section aria-labelledby="origins-heading">
          <SectionCap id="origins-heading" aside={<span className={`${NOTE} hidden sm:inline`}>Linked ZeroTacky accounts with a public profile; counts only</span>}>Where the field came from</SectionCap>
          <div className="zt-block grid-cols-1">
            <WebCell className="gap-2">
              <p className="text-[14px] text-ink">
                <strong>{r.origins.linked}</strong> of {r.totals.entered} athletes are linked to a ZeroTacky account, <strong>{r.origins.public}</strong> with a public profile
                {originsKnown ? <>, from <strong>{r.origins.homeGyms.length}</strong> home gym{r.origins.homeGyms.length === 1 ? '' : 's'}.</> : '.'}
                {!originsKnown && ' Approved result claims and accepted registrations fill this in over time.'}
              </p>
              {originsKnown && (
                <ul className="flex flex-wrap gap-x-5 gap-y-1">
                  {r.origins.homeGyms.map((g) => (
                    <li key={`${g.slug ?? g.name}`} className="text-[14px] text-ink">
                      {g.slug ? <Link href={`/gyms/${encodeURIComponent(g.slug)}`} className={textLink}>{g.name}</Link> : g.name}
                      <span className={`${NUM} font-bold`}> {g.n}</span>
                      {r.hostGym && g.slug === r.hostGym.slug && <span className={NOTE}> (host)</span>}
                    </li>
                  ))}
                </ul>
              )}
            </WebCell>
          </div>
        </section>
      )}

      {(r.sponsors.length > 0 || r.livestreamUrl) && (
        <section aria-labelledby="sponsors-heading">
          <SectionCap id="sponsors-heading">Sponsors and stream</SectionCap>
          <div className="zt-block grid-cols-1">
            <WebCell className="gap-1">
              {r.sponsors.length > 0 && (
                <p className="text-[14px] text-ink">
                  {r.sponsors.map((s, i) => (
                    <span key={s.name}>{i > 0 ? ' · ' : ''}{s.url ? <a href={s.url} className={textLink} rel="noopener noreferrer sponsored">{s.name}</a> : s.name}</span>
                  ))}
                </p>
              )}
              {r.livestreamUrl && <p className={NOTE}>Stream: <a href={r.livestreamUrl} className={textLink} rel="noopener noreferrer">{r.livestreamUrl}</a></p>}
            </WebCell>
          </div>
        </section>
      )}

      <p className={`${NOTE} print:block`}>
        Generated from the ZeroTacky show page{r.promoterName ? ` · promoter ${r.promoterName}` : ''}{r.federation ? ` · ${r.federation}` : ''}.
      </p>
    </div>
  );
}
