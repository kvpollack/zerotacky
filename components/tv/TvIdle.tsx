'use client';
// Idle: nothing live yet (or between events). The wordmark, the meet, the event list as the day's schedule, a
// local clock, and the title block reading Sheet Idle / Rev A Not started. Pen blue only on the event numbers.
import React, { useEffect, useState } from 'react';
import type { IdleModel } from '@/lib/tv/model';
import Wordmark from '@/components/brand/Wordmark';
import StoneMark from '@/components/sheet/StoneMark';
import { TvCell, TField } from './TvFrame';
import type { TitleData } from './TvBoard';
import { sponsorLogoUrl, type MeetSponsor } from '@/lib/website/extras';

const CELL = 'bg-sheet';

export default function TvIdle({ m, title, divisions, athletes, sponsors = null }: { m: IdleModel; title: TitleData; divisions: string[]; athletes: number; sponsors?: MeetSponsor[] | null }) {
  const [now, setNow] = useState('');
  useEffect(() => {
    const tick = () => setNow(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);
  const shown = m.schedule.slice(0, 6);
  return (
    <>
      <div className="flex flex-col items-center justify-center gap-7 normal-case min-h-0 overflow-hidden">
        <Wordmark className="text-[200px] leading-none" />
        <div className="text-[40px] font-bold uppercase" style={title.nameColor ? { color: title.nameColor } : undefined}>{title.name}</div>
        <div className="grid gap-px bg-rule mt-2.5" style={{ border: '2px solid var(--rule)', gridTemplateColumns: `repeat(${Math.max(1, shown.length)}, auto)` }}>
          {shown.length === 0 && <div className="bg-sheet px-7 py-3.5 uppercase text-[24px] text-ink-muted">No events published yet</div>}
          {shown.map((s) => (
            <div key={s.event.id} className="bg-sheet px-7 py-3.5 flex flex-col gap-1.5 uppercase">
              <span className="text-[14px] text-ink-muted tracking-[0.04em]">Event <span className="text-pen">{s.event.eventNumber}</span></span>
              <span className="text-[30px] font-bold whitespace-nowrap">{s.event.name}</span>
              <span className="text-[16px] text-ink-muted whitespace-nowrap max-w-[360px] truncate">{s.spec || s.divisions.join(' · ')}</span>
            </div>
          ))}
        </div>
        <div className="text-[24px] text-ink-muted uppercase">Now <span className="text-pen">{now}</span> · the board starts with the first score</div>
        {/* 046 (#14): sponsor strip between the clock and the title block; logos where uploaded, names otherwise */}
        {/* MD-05: bounded to the canvas; six long names wrap to a second line and each name is clipped at 480px */}
        {sponsors?.length ? (
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2 normal-case max-w-[1700px] px-6">
            <span className="text-[16px] text-ink-muted uppercase tracking-[0.06em]">Sponsors</span>
            {sponsors.map((s, i) => {
              const src = sponsorLogoUrl(s.logoPath);
              // eslint-disable-next-line @next/next/no-img-element
              return src ? <img key={i} src={src} alt={s.name} className="h-[64px] w-auto max-w-[260px] object-contain" /> : <span key={i} className="text-[24px] font-bold uppercase max-w-[640px] truncate" title={s.name}>{s.name}</span>;
            })}
          </div>
        ) : null}
      </div>
      <div className="grid gap-px bg-rule" style={{ borderTop: '2px solid var(--rule)', gridTemplateColumns: '120px 210px 1fr 1fr 230px', gridTemplateRows: '1fr 1fr 1fr' }}>
        <TvCell className={`${CELL} items-center justify-center`} style={{ gridRow: '1 / 3' }}><StoneMark size={72} stroke={7} title="ZeroTacky" /></TvCell>
        <TField cap="Title" value={title.name} colStart={2} colEnd={5} valueSize={title.name.length > 30 ? 28 : 38} valueStyle={title.nameColor ? { color: title.nameColor } : undefined} className={CELL} />
        <TField cap="Client" value={title.client} slot className={CELL} />
        <TField cap="Venue" value={title.venue} colStart={2} colEnd={4} className={CELL} />
        <TField cap="Date" value={title.date} className={CELL} />
        <TField cap="Divisions" value={divisions.join(' · ') || '—'} className={CELL} />
        <TField cap="Units" value="lb" className={CELL} />
        <TField cap="Sheet" value="Idle" className={CELL} />
        <TField cap="Rev" value={`${m.rev} · ${title.resultsWord}`} className={CELL} />
        <TField cap="Status" value={title.statusLine} className={CELL} />
        <TField cap="Athletes" value={`${athletes} entered`} className={CELL} />
      </div>
    </>
  );
}
