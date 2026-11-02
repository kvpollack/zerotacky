'use client';
// Phase 5 (11/2): Standings as the Sheet B card at phone width (approved mockup scorer_results.html): place, athlete,
// one pen column per event, total in pen; a scratched athlete is struck through in red pen. The current event's
// breakdown follows as a ruled list; the TV layout (projector) widens the type and adds each event's display.
import React from 'react';
import type { Division, EventDef, Meet } from '@/lib/types';
import { RuledBlock } from '@/components/sheet';
import { CAP, LH, LR, Key, Sec } from './parts';

export type StandingRow = {
  athleteId: string; athleteName: string; overallPlace: number; isTiedOverall?: boolean; totalPoints: number; eventWins: number;
  status?: string; eventBreakdown?: Record<string, { points: number; display: string } | undefined>;
};
export type EventScoreRow = { athleteId: string; athleteName: string; place: number; isTied?: boolean; displayScore: string; points: number };

export type StandingsSheetProps = {
  currentDivision: Division;
  currentEvent?: EventDef | null;
  eventScores: EventScoreRow[];
  events: EventDef[];
  meet: Meet;
  overallStandings: StandingRow[];
  layout?: 'phone' | 'tv';
  toggleLayout?: () => void;
  children?: React.ReactNode;
};

export default function StandingsSheet({ currentDivision, currentEvent, eventScores, events, meet, overallStandings, layout = 'phone', toggleLayout, children }: StandingsSheetProps) {
  const tv = layout === 'tv';
  const tiebreak = meet.tiebreakerRule === 'event_wins' ? 'Event Wins' : 'Final Event';
  const evCol = tv ? 'minmax(64px,auto)' : '26px';
  const cols = `${tv ? '44px' : '30px'} minmax(0,1fr) repeat(${events.length}, ${evCol}) ${tv ? '72px' : '42px'}`;
  const num = tv ? 'text-[20px]' : 'text-[13px]';
  const scored = currentEvent ? eventScores.filter((s) => s.points > 0).length : 0;

  return (
    <>
      <Sec right={<>Tiebreaker: {tiebreak}</>}>Overall Standings &middot; {currentDivision.name}</Sec>
      <RuledBlock columns={cols} role="table" aria-label={`Overall standings, ${currentDivision.name}`}>
        <LH className="justify-center">Pl</LH>
        <LH>Athlete</LH>
        {events.map((ev) => (
          <LH key={ev.id} className={`justify-center ${ev.id === currentEvent?.id ? 'font-bold text-ink' : ''}`}><abbr title={ev.name} className="no-underline">E{ev.eventNumber}</abbr></LH>
        ))}
        <LH className="justify-center text-center leading-none !whitespace-normal">Total Pts</LH>
        {overallStandings.map((row) => {
          const scr = row.status === 'withdrawn';
          return (
            <div key={row.athleteId} role="row" className="contents">
              <LR center className={`font-bold ${num} ${scr ? 'text-redpen' : ''}`}>{scr ? '\u2013' : row.isTiedOverall ? `T-${row.overallPlace}` : row.overallPlace}</LR>
              <LR className={`font-bold ${tv ? 'text-[18px]' : 'text-[12px]'} ${scr ? 'text-redpen line-through decoration-2' : ''}`}>{row.athleteName}</LR>
              {scr ? (
                <LR className="text-redpen font-bold text-[9px]" style={{ gridColumn: `span ${events.length + 1}` }}>SCRATCHED</LR>
              ) : (
                <>
                  {events.map((ev) => {
                    const b = row.eventBreakdown?.[ev.id];
                    return (
                      <LR key={ev.id} center className={`flex-col !items-center ${num} ${b ? 'text-pen' : 'text-ink-muted'}`}>
                        {b ? <>{b.points}{tv && <span className={`block text-[10px] leading-none ${CAP}`}>{b.display}</span>}</> : '\u2013'}
                      </LR>
                    );
                  })}
                  <LR center className={`text-pen font-bold ${tv ? 'text-[24px]' : 'text-[15px]'}`}>{row.totalPoints}</LR>
                </>
              )}
            </div>
          );
        })}
      </RuledBlock>
      {toggleLayout && (
        <Key size="sm" onClick={toggleLayout} aria-pressed={tv} title={tv ? 'Switch to phone layout' : 'Switch to TV / projector layout'}>
          {tv ? 'Phone layout' : 'TV / projector layout'}
        </Key>
      )}

      {currentEvent && (
        <>
          <Sec right={`${scored} of ${eventScores.length} scored`}>Event {currentEvent.eventNumber} Breakdown &middot; {currentEvent.name}</Sec>
          <RuledBlock columns="30px minmax(0,1fr) auto 48px" role="table" aria-label={`Event ${currentEvent.eventNumber} breakdown`}>
            <LH className="justify-center">Pl</LH><LH>Athlete</LH><LH className="justify-end">Score</LH><LH className="justify-center">Pts</LH>
            {eventScores.map((s) => (
              <div key={s.athleteId} role="row" className="contents">
                <LR center className="font-bold">{s.points > 0 ? s.place : '\u2013'}</LR>
                <LR className={`font-bold ${tv ? 'text-[16px]' : 'text-[12px]'}`}>{s.athleteName}{s.isTied && <span className={`ml-1.5 text-[9px] font-normal ${CAP}`}>Tie split</span>}</LR>
                <LR className={`justify-end ${s.displayScore && s.displayScore !== '—' && s.displayScore !== '-' ? 'text-pen' : 'text-ink-muted'}`}>{s.displayScore || '\u2013'}</LR>
                <LR center className="text-pen font-bold">{s.points}</LR>
              </div>
            ))}
          </RuledBlock>
        </>
      )}
      {children}
    </>
  );
}
