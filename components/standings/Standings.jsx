'use client';

import LayoutToggle from '@/components/shell/LayoutToggle';
import LeaderboardTable from './LeaderboardTable';

// Phone layout: overall cards then the current event breakdown. TV layout (projector / laptop): the full
// per-event leaderboard table with the breakdown beside it. `layout` / `toggleLayout` come from useLayoutMode.
/**
 * @param {{ currentDivision: any, currentEvent: any, eventScores: any[], events?: any[], meet: any, overallStandings: any[], layout?: 'phone' | 'tv', toggleLayout?: () => void }} props
 */
export default function Standings({
  currentDivision,
  currentEvent,
  eventScores,
  events = [],
  meet,
  overallStandings,
  layout = 'phone',
  toggleLayout,
}) {
  if (layout === 'tv') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-black uppercase tracking-widest text-zt-muted">
            Live leaderboard · {meet.name}
          </div>
          {toggleLayout && <LayoutToggle layout={layout} onToggle={toggleLayout} />}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[3fr_1fr] gap-4 items-start">
          <LeaderboardTable
            division={currentDivision}
            events={events}
            standings={overallStandings}
            meet={meet}
            highlightEventId={currentEvent?.id ?? null}
          />
          <EventBreakdown currentEvent={currentEvent} eventScores={eventScores} size="tv" />
        </div>
      </div>
    );
  }

  return (
        <div className="space-y-4">
          <div className="bg-zt-surface border border-zt-border rounded-2xl p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-base font-black text-zt-primary uppercase tracking-wide">
                Overall Standings • {currentDivision.name}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-zt-muted">
                  Tiebreaker: {meet.tiebreakerRule === 'event_wins' ? 'Event Wins' : 'Final Event'}
                </span>
                {toggleLayout && <LayoutToggle layout={layout} onToggle={toggleLayout} />}
              </div>
            </div>

            <div className="space-y-2">
              {overallStandings.map((row) => (
                <div
                  key={row.athleteId}
                  className="bg-zt-inset border border-zt-border rounded-xl p-3 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-black px-2 py-0.5 rounded ${
                          row.overallPlace === 1
                            ? 'bg-zt-primary text-zt-on-primary'
                            : 'bg-zt-surface-2 text-zt-text-2'
                        }`}
                      >
                        {row.isTiedOverall ? 'T-' : ''}#{row.overallPlace}
                      </span>
                      <span className="font-black text-base text-zt-text">{row.athleteName}</span>
                      {row.status === 'withdrawn' && (
                        <span className="text-xs bg-zt-danger text-white px-1.5 py-0.5 rounded font-extrabold">
                          SCRATCHED
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zt-muted mt-1">
                      Event Wins: <strong className="text-zt-text-2">{row.eventWins}</strong>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-black text-zt-primary">{row.totalPoints}</div>
                    <div className="text-xs uppercase text-zt-muted font-bold">Total Pts</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <EventBreakdown currentEvent={currentEvent} eventScores={eventScores} />
        </div>
  );
}

function EventBreakdown({ currentEvent, eventScores, size = 'phone' }) {
  if (!currentEvent) return null;
  const tv = size === 'tv';
  return (
          <div className="bg-zt-surface border border-zt-border rounded-2xl p-4">
            <h3 className="text-xs font-extrabold uppercase text-zt-muted mb-3">
              Event {currentEvent.eventNumber} Breakdown • {currentEvent.name}
            </h3>
            <div className="space-y-2">
              {eventScores.map((s) => (
                <div
                  key={s.athleteId}
                  className="flex justify-between items-center bg-zt-inset px-3.5 py-2.5 rounded-xl border border-zt-border text-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-black text-zt-muted">#{s.place}</span>
                    <span className={`font-bold text-zt-text ${tv ? 'text-base' : ''}`}>{s.athleteName}</span>
                    {s.isTied && (
                      <span className="text-xs bg-zt-primary/20 text-zt-primary-2 px-1.5 py-0.5 rounded font-bold">
                        TIE SPLIT
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-zt-muted font-mono text-xs">{s.displayScore}</span>
                    <span className={`font-black text-zt-primary min-w-[48px] text-right ${tv ? 'text-lg' : ''}`}>
                      {s.points} pts
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
  );
}
