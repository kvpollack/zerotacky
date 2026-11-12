// Sheet B, the card: one division's standings as a ruled grid. Band on top (the promoter's slot) with the page
// counter; Pl, Lot, Name, one points column per event (the live event's heading in pen, a ring round each
// event win), Total; title block along the bottom. 12 items a page; the board rotates pages (TvBoard).
import React from 'react';
import { PAGE_SIZE, type SheetBPage } from '@/lib/tv/model';
import StoneMark from '@/components/sheet/StoneMark';
import { TvCell, Cap, TField } from './TvFrame';
import type { TitleData } from './TvBoard';

const CELL = 'bg-sheet';

export default function SheetB({ p, title, pageIn, onDeck, upcoming }: { p: SheetBPage; title: TitleData; pageIn: number | null; onDeck: string; upcoming: string }) {
  const n = p.events.length;
  // columns: Pl 64, Lot 64, Name 330, events share the middle (96-260 px each), Total takes what is left (>= 150)
  const evW = n ? Math.max(96, Math.min(260, Math.floor((1826 - 64 - 64 - 330 - 150 - (n + 4)) / n))) : 96;
  const cols = `64px 64px 330px repeat(${n}, ${evW}px) 1fr`;
  const rowsN = Math.max(PAGE_SIZE, p.rows.length);   // a page is always 12 ruled rows, blank ones included
  const blanks = Math.max(0, PAGE_SIZE - p.rows.length);
  const liveIdx = p.events.findIndex((e) => e.id === p.liveEventId);
  return (
    <>
      <div className="bg-slot text-slot-label flex items-center justify-between px-6 text-[24px]">
        <span>
          <b>{p.afterEvent ? `Standings after E${p.afterEvent.eventNumber}` : 'Standings'}</b>
          <Sep />{p.division.name}<Sep />{title.status}{title.demo && <><Sep />Demo</>}
        </span>
        <span className="inline-flex items-center gap-3">
          {p.pages > 1 ? `Items ${p.from}-${p.to} of ${p.count}` : `${p.count} ${p.count === 1 ? 'athlete' : 'athletes'}`}
          {p.pages > 1 && (
            <span className="inline-flex gap-1.5" aria-hidden="true">
              {Array.from({ length: p.pages }, (_, i) => (
                <i key={i} className="inline-block w-3 h-3 border-2" style={{ borderColor: 'var(--accent-label)', background: i + 1 === p.page ? 'var(--accent-label)' : 'transparent' }} />
              ))}
            </span>
          )}
          {pageIn !== null && p.pages > 1 && <span>next page in {pageIn} s</span>}
        </span>
        <span className="truncate max-w-[640px]">{p.liveAthleteIds.length ? <>On platform<Sep />{title.onPlatform}</> : title.subline}</span>
      </div>

      <div className="min-h-0 grid gap-px bg-rule" style={{ gridTemplateColumns: cols, gridTemplateRows: `44px 34px repeat(${rowsN}, minmax(0, 1fr))` }}>
        {/* header row 1: Pl / Lot / Name span both header rows; event names; Total */}
        <Hs rows>Pl</Hs>
        <Hs rows>Lot</Hs>
        <Hs rows>Name</Hs>
        {p.events.map((e, i) => (
          <div key={e.id} className={`${CELL} flex items-center px-2.5 text-[17px] font-bold min-w-0 ${i === liveIdx ? 'text-pen' : ''}`} style={{ gridColumn: 4 + i, gridRow: 1 }}>
            <span className="truncate">E{e.eventNumber} {e.name}{i === liveIdx ? ' · live' : ''}</span>
          </div>
        ))}
        <div className={`${CELL} flex flex-col justify-center items-end px-2.5 text-[15px] text-ink-muted tracking-[0.04em]`} style={{ gridRow: '1 / 3', gridColumn: 4 + n }}>
          <span>Total</span>{p.afterEvent && <small className="text-[12px]">after E{p.afterEvent.eventNumber}</small>}
        </div>
        {/* header row 2: pts under each event */}
        {p.events.map((e, i) => (
          <div key={`${e.id}-u`} className={`${CELL} flex items-center justify-end px-2.5 text-[14px] text-ink-muted`} style={{ gridColumn: 4 + i, gridRow: 2 }}>pts</div>
        ))}
        {p.rows.length === 0 && <div className={`${CELL} flex items-center px-2.5 text-[22px] text-ink-muted`} style={{ gridColumn: `1 / -1` }}>No athletes in this division</div>}
        {p.rows.map((r) => {
          const live = p.liveAthleteIds.includes(r.athleteId);
          return (
            <React.Fragment key={r.athleteId}>
              <div className={`${CELL} flex items-center justify-center text-[30px] text-pen`}>{r.withdrawn || !r.total ? '' : `${r.place}${r.tied ? '=' : ''}`}</div>
              <div className={`${CELL} flex items-center justify-center text-[30px] text-pen`}>{r.lot || ''}</div>
              <div className={`${CELL} flex flex-col justify-center px-2.5 min-w-0`}>
                <span className={`text-[25px] font-bold truncate ${live ? 'underline decoration-pen decoration-[3px] underline-offset-[5px]' : ''} ${r.withdrawn ? 'text-ink-muted line-through' : ''}`}>{r.name}</span>
                {r.withdrawn && <span className="text-[15px] text-ink-muted mt-0.5">Withdrawn</span>}
              </div>
              {r.cells.map((c, i) => (
                <div key={i} className={`${CELL} flex flex-col items-end justify-center px-2.5 min-w-0`}>
                  <span className="relative inline-block text-[30px] text-pen leading-none">{c.points}{c.win && <Ring />}</span>
                  {c.display && c.display !== c.points && <span className="text-[13px] text-ink-muted truncate max-w-full mt-1">{c.display}</span>}
                </div>
              ))}
              <div className={`${CELL} flex items-center justify-end px-2.5 text-[38px] font-bold text-pen`}>{r.total}</div>
            </React.Fragment>
          );
        })}
        {Array.from({ length: blanks }, (_, i) => (
          <React.Fragment key={`blank-${i}`}>
            {Array.from({ length: n + 4 }, (_, j) => <div key={j} className={CELL} />)}
          </React.Fragment>
        ))}
      </div>

      <div className="grid gap-px bg-rule" style={{ borderTop: '2px solid var(--rule)', gridTemplateColumns: '120px 1fr 240px 220px 200px 170px 220px 170px', gridTemplateRows: '1fr 1fr' }}>
        <TvCell className={`${CELL} items-center justify-center`} style={{ gridRow: '1 / 3' }}><StoneMark size={64} stroke={7} title="ZeroTacky" /></TvCell>
        <TField cap="Title" value={title.name} valueSize={title.name.length > 24 ? 22 : 30} valueStyle={title.nameColor ? { color: title.nameColor } : undefined} className={CELL} />
        <TField cap="Client" value={title.client} slot className={CELL} />
        <TField cap="Date" value={title.date} className={CELL} />
        <TField cap="Division" value={p.division.name} className={CELL} />
        <TField cap="Sheet" value={p.pages > 1 ? `B · ${p.page} of ${p.pages}` : 'B'} className={CELL} />
        <TField cap="Rev" value={`${p.rev} ${title.resultsWord}`} className={CELL} />
        <TField cap="Units" value={title.units} className={CELL} />
        <TField cap="Venue" value={title.venue} className={CELL} />
        <TField cap="Status" value={title.statusLine} className={CELL} />
        <TField cap="On deck" value={onDeck} className={CELL} />
        <TField cap="Then" value={title.then} span={2} className={CELL} />
        <TField cap="Upcoming" value={upcoming} className={CELL} />
        <TField cap="Scored by" value={title.scoredBy} className={CELL} />
      </div>
    </>
  );
}

function Hs({ children, rows }: { children: React.ReactNode; rows?: boolean }) {
  return <div className={`${CELL} flex flex-col justify-center px-2.5 text-[15px] text-ink-muted tracking-[0.04em]`} style={rows ? { gridRow: '1 / 3' } : undefined}>{children}</div>;
}
function Sep() { return <span className="mx-3.5 opacity-60">·</span>; }

/** The ring round a best mark: a hand-drawn loop in pen. */
function Ring() {
  return (
    <svg className="absolute pointer-events-none" style={{ left: -16, right: -16, top: -9, bottom: -9, width: 'calc(100% + 32px)', height: 'calc(100% + 18px)' }} viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
      <path d="M80 8 C62 1 24 3 10 16 C-1 28 6 50 33 56 C61 61 94 52 97 33 C99 18 85 7 62 5 C54 4.5 47 5.5 41 7" fill="none" stroke="var(--pen)" strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
