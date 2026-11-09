// #11 (11/9): "Archive history" on the athlete page: competitions from the imported archive attached to this profile
// through an approved archive link. Server-safe. Each row: date · city, state / competition / division · sanction, place
// as "3rd of 10" with points, and the athlete's event rows behind a native disclosure (no JS). Credit line is a
// license condition and always renders with the section.
import React from 'react';
import { Cap, SectionCap } from '@/components/website/sheet';
import { formatShowDate } from '@/lib/website/showHistory';
import {
  ARCHIVE_CREDIT, dedupeArchive, formatArchivePlace, formatArchivePlaceCity, formatArchiveResult, sanctionLabel, summarizeArchive,
  type ArchiveCompetition,
} from '@/lib/website/archive';

const NOTE = 'text-[13px] leading-snug text-ink-muted';
const NUM = 'font-sheet tabular-nums';

export function ArchiveCredit({ className = '' }: { className?: string }) {
  return (
    <p className={`${NOTE} ${className}`}>
      Archive results via <a href={ARCHIVE_CREDIT.sourceUrl} className="font-bold underline underline-offset-4 decoration-1 text-ink hover:text-pen" target="_blank" rel="noopener noreferrer">{ARCHIVE_CREDIT.sourceName}</a>
      {' '}(<a href={ARCHIVE_CREDIT.licenseUrl} className="underline underline-offset-4 decoration-1" target="_blank" rel="noopener noreferrer">{ARCHIVE_CREDIT.licenseName}</a>);
      original scoring published on {ARCHIVE_CREDIT.originalName}. ZeroTacky is not affiliated with either. Results are shown as published; corrections go to the source.
    </p>
  );
}

export default function ArchiveHistory({ competitions, displayName }: { competitions: ArchiveCompetition[]; displayName: string }) {
  const rows = dedupeArchive(competitions);
  if (rows.length === 0) return null;
  const s = summarizeArchive(rows);
  const aside = `${s.competitions} ${s.competitions === 1 ? 'competition' : 'competitions'}${s.podiums ? ` · ${s.podiums} ${s.podiums === 1 ? 'podium' : 'podiums'}` : ''}${s.firstDate ? ` · since ${s.firstDate.slice(0, 4)}` : ''}`;
  return (
    <section aria-labelledby="archive-heading">
      <SectionCap id="archive-heading" aside={<span className={`${NOTE} hidden sm:inline`}>{aside}</span>}>Archive history</SectionCap>
      <ol className="zt-block grid-cols-1">
        {rows.map((c) => {
          const podium = c.place != null && c.place <= 3 && c.fieldSize > 1;
          const where = formatArchivePlaceCity(c);
          const sanction = sanctionLabel(c.sanction);
          return (
            <li key={`${c.slug}|${c.division}`} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                <div className="min-w-0 flex-1 basis-[14rem] flex flex-col gap-0.5">
                  <Cap as="span">{formatShowDate(c.date)}{where ? ` · ${where}` : ''}</Cap>
                  <div className="text-[15px] font-bold leading-snug text-ink break-words">{c.name}</div>
                  <div className="text-[13px] text-ink-muted">
                    {c.division}{sanction ? ` · ${sanction}` : ''}
                    {c.enteredAs !== displayName ? ` · entered as ${c.enteredAs}` : ''}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col gap-0.5 sm:text-right">
                  <div className={`text-[20px] font-bold leading-none ${podium ? 'text-pen' : 'text-ink'}`}>{formatArchivePlace(c)}</div>
                  {c.points != null && <div className="text-[12px] text-ink-muted"><span className={NUM}>{c.points}</span> pts</div>}
                </div>
              </div>
              {c.events.length > 0 && (
                <details className="mt-2 group">
                  <summary className="cursor-pointer list-none text-[12px] font-bold uppercase tracking-[0.04em] text-ink-muted hover:text-pen">
                    <span className="group-open:hidden">Show {c.events.length} {c.events.length === 1 ? 'event' : 'events'}</span>
                    <span className="hidden group-open:inline">Hide events</span>
                  </summary>
                  <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                    {c.events.map((e, i) => (
                      <li key={`${e.num ?? i}-${e.event}`} className="flex items-baseline justify-between gap-3 text-[13px] border-b border-rule/60 py-1">
                        <span className="text-ink min-w-0 break-words">{e.event}</span>
                        <span className={`${NUM} shrink-0 text-ink-muted`}>{formatArchiveResult(e)}{e.points != null ? ` · ${e.points} pts` : ''}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          );
        })}
      </ol>
      <ArchiveCredit className="mt-2" />
    </section>
  );
}
