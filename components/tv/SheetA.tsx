// Sheet A, the drawing: one station, its live event and athlete large on the left, the running order as a
// parts list on the right, the title block beneath it. Pen blue for every filled-in value; the live row is the
// promoter's slot. No invented data: the big cell shows the recorded result when there is one, else the target.
import React from 'react';
import type { SheetAModel } from '@/lib/tv/model';
import { surname, partsWindow, PARTS_ROWS } from '@/lib/tv/model';
import StoneMark from '@/components/sheet/StoneMark';
import { TvCell, Cap, TField } from './TvFrame';
import type { TitleData } from './TvBoard';

const RULE = { border: '2px solid var(--rule)', display: 'grid', gap: 1, background: 'var(--rule)' } as const;
const CELL = 'bg-sheet';

export default function SheetA({ m, title }: { m: SheetAModel; title: TitleData }) {
  const ev = m.event!;
  const lane2 = m.lane2;
  const shown = partsWindow(m.parts, m.runPosition);
  const rowsN = Math.max(PARTS_ROWS, shown.length);
  const blanks = Math.max(0, PARTS_ROWS - shown.length);
  return (
    <>
      {/* the field */}
      <div className="flex flex-col gap-[14px] min-h-0 p-4">
        {/* hero */}
        <div style={{ ...RULE, gridTemplateColumns: '1fr 210px', gridTemplateRows: '40px 96px 200px 84px' }}>
          <TvCell className={`${CELL} text-[18px]`}>
            <span className="truncate"><b>Event {ev.eventNumber} {ev.name}</b> <span className="text-ink-muted">{m.spec}</span></span>
          </TvCell>
          <TvCell className={`${CELL} text-[18px]`}><span className="text-ink-muted truncate">{m.runPosition ? `Run order ${m.runPosition} of ${m.parts.length}` : `${m.parts.length} in order`}</span></TvCell>
          <TvCell className={`${CELL} col-span-2 font-bold leading-none`} style={{ fontSize: 72 }}>
            <span className="truncate">{m.athlete ? `Lot ${m.athlete.lotNumber} ${surname(m.athlete.name)}` : 'No one on platform'}</span>
            {lane2 && <span className="truncate text-[36px] mt-2 text-ink-muted">+ Lot {lane2.lotNumber} {surname(lane2.name)}</span>}
          </TvCell>
          <TvCell className={`${CELL} col-span-2 items-center leading-none ${m.mark.pen ? 'text-pen' : ''}`}>
            <span className="text-[13px] text-ink-muted tracking-[0.04em] mb-3">{m.mark.cap}</span>
            <span className="whitespace-nowrap font-bold" style={{ fontSize: m.mark.value.length > 10 ? 72 : 150 }}>{m.mark.value}</span>
          </TvCell>
          <TvCell className={`${CELL} font-bold leading-none`} style={{ fontSize: 64 }}>
            <span><span className="text-pen">{m.eventIndex}</span> <span className="text-[28px] text-ink-muted">of {m.eventCount}</span></span>
          </TvCell>
          <TvCell className={`${CELL} text-[22px] gap-1.5`}>
            <span className="font-bold">{m.status}</span>
            <span className="text-ink-muted">{ev.timeCapSeconds ? `Limit ${ev.timeCapSeconds} s` : m.division?.name}</span>
          </TvCell>
        </div>
        {/* the ladder (rising bar attempts) or the per-division spec */}
        <div className="flex-1 min-h-0" style={{ ...RULE, gridTemplateColumns: '1fr 320px', gridTemplateRows: `34px repeat(${Math.max(1, m.ladder.length)}, minmax(0, 1fr))` }}>
          <TvCell className={`${CELL} text-[15px]`}><Cap>{m.ladderTitle}</Cap></TvCell>
          <TvCell className={`${CELL} text-[15px]`}><Cap>{m.ladderTitle === 'Rising bar' ? 'Result' : 'Spec'}</Cap></TvCell>
          {m.ladder.length === 0 && <><TvCell className={`${CELL} text-[26px] text-ink-muted`}>—</TvCell><TvCell className={CELL} /></>}
          {m.ladder.map((r, i) => (
            <React.Fragment key={i}>
              <TvCell className={`${CELL} text-[26px] ${r.state === 'spec' ? '' : 'font-bold'}`}><span className="truncate">{r.state === 'spec' ? r.label : r.label}</span></TvCell>
              <TvCell className={`${CELL} ${r.state === 'spec' ? 'text-[20px] text-ink-muted' : 'text-[26px]'} ${r.state === 'good' || r.state === 'pass' ? 'text-pen' : ''} ${r.state === 'fail' ? 'text-redpen font-bold' : ''} ${r.state === 'pending' ? 'text-ink-muted' : ''}`}>
                <span className={r.state === 'spec' ? 'line-clamp-2 leading-tight' : 'truncate'}>{r.state === 'fail' ? <><span aria-hidden="true">&#x2715; </span>No lift</> : r.value}</span>
              </TvCell>
            </React.Fragment>
          ))}
        </div>
        {/* on deck */}
        <div style={{ ...RULE, gridTemplateColumns: '150px 1fr', gridTemplateRows: '34px 46px 46px' }}>
          <TvCell className={`${CELL} col-span-2 text-[15px]`}><Cap>On deck</Cap></TvCell>
          {[0, 1].map((i) => {
            const a = m.onDeck[i];
            return (
              <React.Fragment key={i}>
                <TvCell className={`${CELL} text-[26px]`}>{a ? `Lot ${a.lotNumber}` : ''}</TvCell>
                <TvCell className={`${CELL} text-[26px] font-bold`}><span className="truncate">{a ? a.name : (i === 0 && m.onDeck.length === 0 ? <span className="text-ink-muted font-normal">Last in order</span> : '')}</span></TvCell>
              </React.Fragment>
            );
          })}
        </div>
        {/* upcoming */}
        <div style={{ ...RULE, gridTemplateColumns: '150px 1fr', gridTemplateRows: '34px 50px' }}>
          <TvCell className={`${CELL} col-span-2 text-[15px]`}><Cap>Upcoming</Cap></TvCell>
          <TvCell className={`${CELL} text-[26px]`}>{m.next ? `Event ${m.next.eventNumber}` : ''}</TvCell>
          <TvCell className={`${CELL} text-[26px]`}>
            <span className="truncate">{m.next ? <><b>{m.next.name}</b> <span className="text-ink-muted">{m.nextSpec}</span></> : <span className="text-ink-muted">Last event on this station</span>}</span>
          </TvCell>
        </div>
      </div>

      {/* side column: parts list + title block */}
      <div className="flex flex-col min-h-0" style={{ borderLeft: '2px solid var(--rule)' }}>
        <div className="flex-1 min-h-0 grid gap-px bg-rule" style={{ gridTemplateColumns: '72px 72px 1fr 190px 100px 140px', gridTemplateRows: `38px 34px repeat(${rowsN}, minmax(0, 1fr))` }}>
          <TvCell className={`${CELL} col-span-6 text-[18px]`}><span className="truncate"><b>Running order</b> <span className="text-ink-muted">Event {ev.eventNumber} {ev.name}, {m.division?.name}</span></span></TvCell>
          {['Item', 'Lot', 'Name', 'Result', 'Pts', 'Status'].map((h, i) => (
            <TvCell key={h} className={`${CELL} text-[15px] ${i === 3 || i === 4 ? 'items-end' : ''}`}><Cap>{h}</Cap></TvCell>
          ))}
          {m.parts.length === 0 && <TvCell className={`${CELL} col-span-6 text-[22px] text-ink-muted`}>No athletes in this division</TvCell>}
          {shown.map((p) => {
            const live = p.status === 'live';
            const row = live ? 'bg-slot text-slot-label' : CELL;
            const pen = live ? '' : 'text-pen';
            return (
              <React.Fragment key={p.athleteId}>
                <TvCell className={`${row} text-[30px]`}>{p.item}</TvCell>
                <TvCell className={`${row} text-[30px]`}>{p.lot}</TvCell>
                <TvCell className={row}><div className="text-[24px] font-bold truncate">{p.name}</div></TvCell>
                <TvCell className={`${row} ${pen} text-[30px] items-end whitespace-nowrap`}>{p.result}</TvCell>
                <TvCell className={`${row} ${pen} text-[36px] items-end`}>{p.points}</TvCell>
                <TvCell className={`${row} text-[18px] ${live ? 'font-bold' : p.status === 'on deck' ? 'text-ink-muted' : ''}`}>{p.status === 'live' ? 'Live' : p.status === 'locked' ? 'Locked' : p.status === 'scored' ? 'Scored' : p.status === 'on deck' ? 'On deck' : ''}</TvCell>
              </React.Fragment>
            );
          })}
          {Array.from({ length: blanks }, (_, i) => (
            <React.Fragment key={`blank-${i}`}>{Array.from({ length: 6 }, (_, j) => <div key={j} className={CELL} />)}</React.Fragment>
          ))}
        </div>
        <div className="grid gap-px bg-rule" style={{ height: 214, borderTop: '2px solid var(--rule)', gridTemplateColumns: '120px 210px 1fr 1fr 230px', gridTemplateRows: '1fr 1fr 1fr' }}>
          <TvCell className={`${CELL} items-center justify-center`} style={{ gridRow: '1 / 3' }}><StoneMark size={72} stroke={7} title="ZeroTacky" /></TvCell>
          <TField cap="Title" value={title.name} colStart={2} colEnd={5} valueSize={title.name.length > 30 ? 28 : 38} valueStyle={title.nameColor ? { color: title.nameColor } : undefined} className={CELL} />
          <TField cap="Client" value={title.client} slot className={CELL} />
          <TField cap="Venue" value={title.venue} colStart={2} colEnd={4} className={CELL} />
          <TField cap="Date" value={title.date} className={CELL} />
          <TField cap="Division" value={m.division?.name ?? '—'} className={CELL} />
          <TField cap="Units" value="lb" className={CELL} />
          <TField cap="Sheet" value={`A · E${m.eventIndex} of ${m.eventCount}`} className={CELL} />
          <TField cap="Rev" value={`${m.rev} ${title.resultsWord}`} className={CELL} />
          <TField cap="Status" value={title.statusLine} className={CELL} />
          <TField cap="Scored by" value={m.station.label} className={CELL} />
        </div>
      </div>
    </>
  );
}
