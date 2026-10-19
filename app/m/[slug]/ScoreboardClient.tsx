'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createSyncClient, readSyncEnv } from '@/lib/sync/client';
import { fetchMeetBySlug, pullChanges, getLiveState } from '@/lib/sync/meetApi';
import type { LiveStateRow, RemoteMeet } from '@/lib/sync/meetApi';
import { mergeResults } from '@/lib/sync/mapping';
import { mergeAthletes } from '@/lib/sync/controller';
import { scoreSingleEvent, calculateDivisionStandings } from '@/lib/engine';
import { DEFAULT_THEME_ID, THEMES } from '@/lib/constants';
import type { AppState, Division, EventDef } from '@/lib/types';
import Standings from '@/components/standings/Standings';
import LeaderboardTable from '@/components/standings/LeaderboardTable';
import LayoutToggle from '@/components/shell/LayoutToggle';
import useLayoutMode from '@/hooks/useLayoutMode';

const POLL_MS = 4000;

// Public, read-only scoreboard: /m/<slug>. Loads the meet once, then polls results, athletes and
// live_state. No login, no join code. ?theme=volt (any THEMES id) and ?layout=tv for the gym TV; the header
// button toggles phone/TV too and remembers the choice on this device.
export default function ScoreboardClient({ slug }: { slug: string }) {
  const env = useMemo(() => readSyncEnv(), []);
  const client = useMemo(() => (env ? createSyncClient(env) : null), [env]);
  const [meet, setMeet] = useState<RemoteMeet | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [live, setLive] = useState<LiveStateRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [division, setDivision] = useState<string>('ALL');
  const since = useRef<string | null>(null);
  const [theme, setTheme] = useState(DEFAULT_THEME_ID);
  const [layout, toggleLayout] = useLayoutMode() as ['phone' | 'tv', () => void];
  const tv = layout === 'tv';

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('theme');
    if (t && THEMES.some((x) => x.id === t)) setTheme(t);
  }, []);

  // initial load
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchMeetBySlug(client, slug);
        if (cancelled) return;
        if (!r) { setNotFound(true); return; }
        setMeet(r);
        setState(r.state);
        since.current = r.latestServerAt;
        setLive(await getLiveState(client, r.state.meet.id));
        setUpdatedAt(Date.now());
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [client, slug]);

  // poll
  const meetId = state?.meet.id;
  useEffect(() => {
    if (!client || !meetId) return;
    let busy = false;
    const tick = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const [chg, ls] = await Promise.all([pullChanges(client, meetId, since.current), getLiveState(client, meetId)]);
        since.current = chg.latestIso;
        setLive(ls);
        setState((prev) => {
          if (!prev) return prev;
          let next = prev;
          const r = mergeResults(prev.results, chg.results);
          if (r.changed) next = { ...next, results: r.merged };
          const a = mergeAthletes(prev.athletes, chg.athletes);
          if (a.changed) next = { ...next, athletes: a.merged };
          return next;
        });
        setUpdatedAt(Date.now());
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally { busy = false; }
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, [client, meetId]);

  const shell = (children: React.ReactNode) => (
    <div data-zt-theme={theme} className="min-h-screen bg-zt-bg text-zt-text font-sans pb-10">
      <div className={`mx-auto space-y-4 ${tv ? 'max-w-[1800px] p-6' : 'max-w-xl p-3.5'}`}>{children}</div>
    </div>
  );

  if (!env) return shell(<Notice text="Live scoreboard is not configured on this build." />);
  if (notFound) return shell(<Notice text="No meet found for this scoreboard link. Check the link with the promoter." />);
  if (!state || !meet) return shell(<Notice text={error ? `Could not load: ${error}` : 'Loading…'} />);

  const stations = meet.stations?.length ? meet.stations : [{ id: 'A', label: 'Station 1' }, { id: 'B', label: 'Station 2' }];
  const divisions = division === 'ALL' ? state.divisions : state.divisions.filter((d) => d.id === division);
  const eventFor = (d: Division): EventDef | undefined => {
    const st = live.find((l) => l.station === d.flight);
    const liveEv = st?.current_division_id === d.id ? state.events.find((e) => e.id === st.current_event_id) : undefined;
    if (liveEv) return liveEv;
    const divAth = new Set(state.athletes.filter((a) => a.divisionId === d.id).map((a) => a.id));
    const scored = state.events.filter((e) => state.results.some((r) => r.eventId === e.id && divAth.has(r.athleteId)));
    return scored[scored.length - 1] ?? state.events[0];
  };
  const name = (id: string | null) => state.athletes.find((a) => a.id === id)?.name;

  return shell(
    <>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-widest text-zt-primary flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${error ? 'bg-amber-500' : 'bg-emerald-400 animate-pulse'}`} />
            Live scoreboard
            {meet.isDemo && (
              <span className={`font-black uppercase tracking-widest px-2 py-0.5 rounded bg-amber-500 text-black ${tv ? 'text-2xl' : 'text-sm'}`}>
                DEMO
              </span>
            )}
          </div>
          <h1 className={`font-black truncate ${tv ? 'text-3xl' : 'text-xl'}`}>{state.meet.name}</h1>
        </div>
        <div className="flex items-start gap-2 flex-shrink-0">
        <LayoutToggle layout={layout} onToggle={toggleLayout} />
        <div className="text-right text-[10px] font-bold text-zt-muted flex-shrink-0">
          {updatedAt ? `updated ${new Date(updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : ''}
          {error && <div className="text-zt-danger-text">retrying…</div>}
        </div>
        </div>
      </header>

      {/* Up now per station */}
      <div className={`grid gap-2 ${stations.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {stations.map((s) => {
          const l = live.find((x) => x.station === s.id);
          const ev = state.events.find((e) => e.id === l?.current_event_id);
          const dv = state.divisions.find((d) => d.id === l?.current_division_id);
          return (
            <div key={s.id} className="bg-zt-surface border border-zt-border rounded-2xl p-3">
              <div className="text-[10px] font-extrabold uppercase text-zt-muted">{s.label} · up now</div>
              {l && ev ? (
                <>
                  <div className={`font-black text-zt-text truncate ${tv ? 'text-2xl' : 'text-base'}`}>{name(l.current_athlete_id) ?? '—'}</div>
                  {l.lane2_athlete_id && <div className="text-sm font-bold text-zt-text-2 truncate">+ {name(l.lane2_athlete_id)}</div>}
                  <div className="text-[11px] text-zt-muted truncate">Ev {ev.eventNumber} {ev.name}{dv ? ` · ${dv.name}` : ''}</div>
                </>
              ) : (
                <div className="text-sm font-bold text-zt-muted">idle</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Division filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {[{ id: 'ALL', name: 'All' }, ...state.divisions].map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setDivision(d.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold whitespace-nowrap border ${division === d.id ? 'bg-zt-primary text-zt-on-primary border-zt-primary' : 'bg-zt-inset text-zt-muted border-zt-border'}`}
          >
            {d.name}
          </button>
        ))}
      </div>

      {tv ? (
        <div className={`grid gap-4 items-start ${divisions.length > 1 ? 'grid-cols-1 2xl:grid-cols-2' : 'grid-cols-1'}`}>
          {divisions.map((d) => {
            const divAth = state.athletes.filter((a) => a.divisionId === d.id);
            if (divAth.length === 0) return null;
            return (
              <LeaderboardTable
                key={d.id}
                division={d}
                events={state.events}
                standings={calculateDivisionStandings(d, divAth, state.events, state.results, state.meet.tiebreakerRule)}
                meet={state.meet}
                highlightEventId={eventFor(d)?.id ?? null}
              />
            );
          })}
        </div>
      ) : divisions.map((d) => {
        const ev = eventFor(d);
        const divAth = state.athletes.filter((a) => a.divisionId === d.id);
        if (!ev || divAth.length === 0) return null;
        return (
          <Standings
            key={d.id}
            currentDivision={d}
            currentEvent={ev}
            eventScores={scoreSingleEvent(ev, divAth, state.results)}
            meet={state.meet}
            overallStandings={calculateDivisionStandings(d, divAth, state.events, state.results, state.meet.tiebreakerRule)}
          />
        );
      })}
      <div className="text-center text-[10px] text-zt-muted pt-2">ZEROTACKY · refreshes every {POLL_MS / 1000}s</div>
    </>
  );
}

function Notice({ text }: { text: string }) {
  return <div className="bg-zt-surface border border-zt-border rounded-2xl p-5 text-center text-sm font-bold text-zt-text-2 mt-10">{text}</div>;
}
