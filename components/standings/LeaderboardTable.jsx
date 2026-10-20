'use client';

// Overall leaderboard for one division: place, athlete, points per event, total. Built for a TV or
// projector (large type, full width) but renders on a phone too; Standings.jsx picks it in TV mode.
/**
 * @param {{ division: any, events: any[], standings: any[], meet: any, highlightEventId?: string | null, size?: 'tv' | 'phone' }} props
 */
export default function LeaderboardTable({ division, events, standings, meet, highlightEventId = null, size = 'tv' }) {
  const tv = size === 'tv';
  const cell = tv ? 'px-3 py-2.5' : 'px-2 py-1.5';
  const num = tv ? 'text-xl' : 'text-sm';
  return (
    <div className="bg-zt-surface border border-zt-border rounded-2xl overflow-hidden">
      <div className={`flex items-end justify-between gap-3 ${tv ? 'px-4 pt-4 pb-2' : 'px-3 pt-3 pb-1.5'}`}>
        <h2 className={`font-black uppercase tracking-wide text-zt-primary ${tv ? 'text-2xl' : 'text-base'}`}>
          {division.name}
        </h2>
        <span className="text-[11px] font-bold text-zt-muted">
          {standings.length} athletes · Tiebreaker: {meet.tiebreakerRule === 'event_wins' ? 'Event Wins' : 'Final Event'}
        </span>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-zt-muted border-b border-zt-border">
            <th scope="col" className={`${cell} text-left w-12`}>#</th>
            <th scope="col" className={`${cell} text-left`}>Athlete</th>
            {events.map((ev) => (
              <th
                key={ev.id}
                scope="col"
                title={ev.name}
                className={`${cell} text-right whitespace-nowrap ${ev.id === highlightEventId ? 'text-zt-primary' : ''}`}
              >
                E{ev.eventNumber}
              </th>
            ))}
            <th scope="col" className={`${cell} text-right`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((row, idx) => (
            <tr
              key={row.athleteId}
              className={`border-b border-zt-border/60 ${idx % 2 ? 'bg-zt-inset/40' : ''} ${row.status === 'withdrawn' ? 'opacity-50' : ''}`}
            >
              <td className={`${cell}`}>
                <span
                  className={`inline-block min-w-[2rem] text-center rounded font-black ${num} ${
                    row.overallPlace === 1 ? 'bg-zt-primary text-zt-on-primary px-1.5' : 'text-zt-text-2'
                  }`}
                >
                  {row.isTiedOverall ? `T-${row.overallPlace}` : row.overallPlace}
                </span>
              </td>
              <td className={`${cell} font-black text-zt-text ${tv ? 'text-xl' : 'text-sm'} min-w-0`}>
                <span className="truncate block">{row.athleteName}</span>
                {row.status === 'withdrawn' && (
                  <span className="text-[10px] bg-zt-danger text-white px-1.5 py-0.5 rounded font-extrabold">SCRATCHED</span>
                )}
              </td>
              {events.map((ev) => {
                const b = row.eventBreakdown?.[ev.id];
                const live = ev.id === highlightEventId;
                return (
                  <td key={ev.id} className={`${cell} text-right font-mono ${live ? 'text-zt-text' : 'text-zt-text-2'}`}>
                    {b ? (
                      <>
                        <span className={`font-black ${tv ? 'text-lg' : 'text-sm'}`}>{b.points}</span>
                        {tv && <span className="block text-[10px] text-zt-muted leading-none">{b.display}</span>}
                      </>
                    ) : (
                      <span className="text-zt-subtle">–</span>
                    )}
                  </td>
                );
              })}
              <td className={`${cell} text-right font-black text-zt-primary ${tv ? 'text-2xl' : 'text-base'}`}>{row.totalPoints}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
