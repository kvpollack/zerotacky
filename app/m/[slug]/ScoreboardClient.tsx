'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createSyncClient, readSyncEnv } from '@/lib/sync/client';
import { fetchMeetBySlug, pullChanges, getLiveState, getTvControl, getGymName } from '@/lib/sync/meetApi';
import type { LiveStateRow, RemoteMeet, TvControlRow } from '@/lib/sync/meetApi';
import TvBoard from '@/components/tv/TvBoard';
import { mergeResults } from '@/lib/sync/mapping';
import { mergeAthletes } from '@/lib/sync/controller';
import { scoreSingleEvent, calculateDivisionStandings } from '@/lib/engine';
import { THEMES } from '@/lib/constants';
import WebsiteThemeFrame from '@/components/website/WebsiteThemeFrame';
import Wordmark from '@/components/brand/Wordmark';
import { ModeToggle } from '@/components/website/SheetMode';
import { Cap, keyClass, textLink } from '@/components/website/sheet';
import SponsorStrip from '@/components/website/SponsorStrip';
import { RuledBlock } from '@/components/sheet';
import { CAP, LH, LR, Sec } from '@/components/scorer/parts';
import StandingsSheet from '@/components/scorer/StandingsSheet';
import type { AppState, Division, EventDef } from '@/lib/types';
import useLayoutMode from '@/hooks/useLayoutMode';
import { getDemoScoreboardState } from '@/lib/website/data';
import { FOLLOW_KEY, notifyKey, upLine, upStatus } from '@/lib/tv/youreUp';

const POLL_MS = 4000;

// Public, read-only scoreboard: /m/<slug>. Loads the meet once, then polls results, athletes and
// live_state. No login, no join code. ?theme=volt (any THEMES id) pins a theme for a TV link; otherwise the show's own
// colours (030, meets.theme) when the promoter set them, else the shared preference; the header controls change it
// either way (MS-12). ?layout=tv for the gym TV; the header button
// toggles phone/TV too and remembers the choice on this device.
export default function ScoreboardClient({ slug }: { slug: string }) {
  const env = useMemo(() => readSyncEnv(), []);
  const client = useMemo(() => (env ? createSyncClient(env) : null), [env]);
  const [meet, setMeet] = useState<RemoteMeet | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [live, setLive] = useState<LiveStateRow[]>([]);
  const [control, setControl] = useState<TvControlRow | null>(null);   // 036: the scorer's sheet + venue mode for the TV
  const [clientName, setClientName] = useState<string | null>(null);   // host gym name for the TV title block
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [demo, setDemo] = useState(false);   // fixture-backed board: no polling, DEMO shown
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [division, setDivision] = useState<string>('ALL');
  const since = useRef<string | null>(null);
  const [themeOverride, setThemeOverride] = useState<string | null>(null);   // from ?theme=, dropped once the user picks
  // #7b "you're up": the athlete this phone follows (device-local), and whether the browser may buzz on deck / up.
  const [followId, setFollowId] = useState<string | null>(null);
  const [followOpen, setFollowOpen] = useState(false);
  const [notifyOn, setNotifyOn] = useState(false);
  const lastNotify = useRef<string | null>(null);
  useEffect(() => {
    try { setFollowId(window.localStorage.getItem(FOLLOW_KEY(slug))); } catch { /* private mode */ }
    setNotifyOn(typeof Notification !== 'undefined' && Notification.permission === 'granted');
  }, [slug]);
  const chooseFollow = (id: string | null) => {
    setFollowId(id);
    setFollowOpen(false);
    lastNotify.current = null;
    try {
      if (id) window.localStorage.setItem(FOLLOW_KEY(slug), id); else window.localStorage.removeItem(FOLLOW_KEY(slug));
    } catch { /* private mode */ }
  };
  const askNotify = async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setNotifyOn(p === 'granted');
  };
  // MD-03 (audit 11/6): a completed or cancelled meet has nobody up, whatever a stale live_state row says; no banner, no alert
  const lifecycleOver = meet?.competitionStatus === 'completed' || meet?.competitionStatus === 'cancelled';
  const myStatus = useMemo(() => (state && followId && !lifecycleOver ? upStatus(state, live, followId) : null), [state, live, followId, lifecycleOver]);
  useEffect(() => {
    if (!myStatus || !notifyOn || lifecycleOver) return;
    const key = notifyKey(myStatus);
    if (!key || key === lastNotify.current) return;
    lastNotify.current = key;
    const line = upLine(myStatus);
    try {
      new Notification(line.title, { body: line.detail, tag: key });
      if ('vibrate' in navigator) navigator.vibrate?.(myStatus.kind === 'up' ? [200, 100, 200] : 150);
    } catch { /* notifications unavailable on this browser */ }
  }, [myStatus, notifyOn, lifecycleOver]);
  const [layout, toggleLayout] = useLayoutMode() as ['phone' | 'tv', () => void];
  const tv = layout === 'tv';

  useEffect(() => {
    if (meet?.state.meet.name) document.title = `${meet.state.meet.name} — ${meet.competitionStatus === 'completed' ? 'Final Results' : 'Live Scoreboard'} | ZeroTacky`;
  }, [meet?.state.meet.name, meet?.competitionStatus]);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('theme');
    if (t && THEMES.some((x) => x.id === t)) setThemeOverride(t);
  }, []);

  // fixture-backed demo board: used when there is no backend, or when the slug is not on the server but matches a demo show
  const useDemo = () => {
    const fx = getDemoScoreboardState(slug);
    if (!fx) return false;
    setDemo(true);
    // the fixture's lifecycle, venue and promoter ride along so the demo board reads like a real one (UI transition Phase 2)
    setMeet({ state: fx.state, slug: fx.slug, stations: fx.state.meet.stations ?? [{ id: 'A', label: 'Station 1' }, { id: 'B', label: 'Station 2' }], isDemo: true, competitionStatus: fx.competitionStatus ?? null, resultsStatus: fx.resultsStatus ?? null, latestServerAt: null, updatedAt: null, venue: fx.venue ?? null, sponsors: fx.sponsors ?? null, livestreamUrl: fx.livestreamUrl ?? null });
    if (fx.promoterName) setClientName(fx.promoterName);
    setState(fx.state);
    setUpdatedAt(Date.now());
    return true;
  };

  // initial load
  useEffect(() => {
    if (!client) { if (!useDemo()) setNotFound(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchMeetBySlug(client, slug);
        if (cancelled) return;
        if (!r) { if (!useDemo()) setNotFound(true); return; }
        setMeet(r);
        setState(r.state);
        since.current = r.latestServerAt;
        const [ls, tc] = await Promise.all([getLiveState(client, r.state.meet.id), getTvControl(client, r.state.meet.id)]);
        if (cancelled) return;
        setLive(ls);
        setControl(tc);
        setUpdatedAt(Date.now());
        setError(null);
        if (r.hostGymId) getGymName(client, r.hostGymId).then((n) => { if (!cancelled) setClientName(n); });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [client, slug]);

  // poll
  const meetId = state?.meet.id;
  useEffect(() => {
    if (!client || !meetId || demo) return;
    let busy = false;
    const tick = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const [chg, ls, tc] = await Promise.all([pullChanges(client, meetId, since.current), getLiveState(client, meetId), getTvControl(client, meetId)]);
        since.current = chg.latestIso;
        setLive(ls);
        setControl(tc);
        setMeet((prev) => prev && (prev.competitionStatus !== chg.competitionStatus || prev.resultsStatus !== chg.resultsStatus)
          ? { ...prev, competitionStatus: chg.competitionStatus, resultsStatus: chg.resultsStatus } : prev);
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
  }, [client, meetId, demo]);

  // UI transition, phone board (11/4; Kurt: "/m still shows the old UI"). One ruled sheet like the root splash and
  // /join: wordmark / Mode strip, title block (status cap, meet name, updated time), Up Now as a ruled block, the
  // division filter as a key row, then the scorer's StandingsSheet per division. The TV layout (Phase 2) is unchanged.
  const shell = (children: React.ReactNode) => (
    <WebsiteThemeFrame sheet className="p-2 sm:p-4 lg:p-6 items-center" override={themeOverride} onUserChange={() => setThemeOverride(null)} brand={meet?.theme ?? null}>
      <main className="w-full max-w-xl bg-sheet border-2 border-rule">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] gap-px bg-rule border-b-2 border-rule">
          <div className="bg-sheet flex items-center h-14 px-4 text-[22px] text-ink"><Wordmark /></div>
          <div className="bg-sheet flex items-center h-14"><ModeToggle /></div>
        </header>
        {children}
      </main>
    </WebsiteThemeFrame>
  );

  if (!env) return shell(<Notice text="Live scoreboard is not configured on this build." />);
  if (notFound) return shell(<Notice text="No meet found for this scoreboard link. Check the link with the promoter." />);
  if (!state || !meet) return shell(<Notice text={error ? `Could not load: ${error}` : 'Loading…'} />);

  // UI transition Phase 2: the TV is the sheet board (components/tv).
  if (tv) {
    return (
      <>
        <TvBoard meet={meet} state={state} live={live} control={control} clientName={clientName} error={error} demo={!!meet.isDemo} updatedAt={updatedAt} />
        <button
          type="button"
          onClick={toggleLayout}
          className="fixed bottom-1.5 left-1.5 z-10 px-2 py-1 text-[11px] font-sheet uppercase text-ink bg-sheet border border-rule opacity-30 hover:opacity-100 focus:opacity-100"
        >
          Phone view
        </button>
      </>
    );
  }

  const stations = meet.stations?.length ? meet.stations : [{ id: 'A', label: 'Station 1' }, { id: 'B', label: 'Station 2' }];
  const completed = meet.competitionStatus === 'completed';
  const cancelled = meet.competitionStatus === 'cancelled';
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
  const statusCap = completed
    ? (meet.resultsStatus === 'final' ? 'Final results' : 'Completed · results provisional')
    : cancelled ? 'Cancelled' : error ? 'Live scoreboard · retrying' : 'Live scoreboard';
  const updated = updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '';

  return shell(
    <div className="zt-block border-0">
      <div className="px-4 py-5 sm:px-5 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          {!completed && !cancelled && (
            <span aria-hidden="true" className={`inline-block w-2 h-2 border-[1.5px] ${error ? 'border-redpen' : 'border-pen bg-pen'}`} />
          )}
          <Cap as="h2">{statusCap}</Cap>
          {meet.isDemo && <span className="text-[9px] font-bold border border-rule px-1 leading-[14px] font-sheet uppercase text-ink">Demo</span>}
        </div>
        <h1 className="text-[26px] font-bold leading-none tracking-tight text-ink break-words">{state.meet.name}</h1>
        <p className={`text-[12px] ${CAP}`}>
          {updated ? `Updated ${updated} · ` : ''}refreshes every {POLL_MS / 1000}s
          {' · '}
          <button type="button" onClick={toggleLayout} className={`${textLink} font-normal`}>TV layout</button>
        </p>
      </div>

      {/* #7b: follow one athlete; the banner says where they stand on their station. Device-local, no account. */}
      {!completed && !cancelled && (
        <div className="px-4 py-3 sm:px-5 flex flex-col gap-2 border-t border-rule">
          {myStatus ? (() => {
            const line = upLine(myStatus);
            const tone = line.tone === 'up' ? 'bg-pen text-sheet' : line.tone === 'soon' ? 'border-2 border-pen text-ink' : 'border border-rule text-ink';
            return (
              <div role="status" aria-live="polite" className={`px-4 py-3 flex flex-col gap-0.5 ${tone}`}>
                <span className="text-[18px] font-bold leading-tight break-words">{line.title}</span>
                <span className={`text-[12px] ${line.tone === 'up' ? 'opacity-90' : CAP}`}>{line.detail}</span>
              </div>
            );
          })() : null}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
            <button type="button" onClick={() => setFollowOpen((v) => !v)} className={textLink} aria-expanded={followOpen}>
              {followId ? 'Follow someone else' : 'Follow an athlete: get told when they are up'}
            </button>
            {followId && <button type="button" onClick={() => chooseFollow(null)} className={textLink}>Stop following</button>}
            {followId && typeof Notification !== 'undefined' && !notifyOn && Notification.permission !== 'denied' && (
              <button type="button" onClick={() => void askNotify()} className={textLink}>Buzz this phone when on deck</button>
            )}
            {followId && notifyOn && <span className={`text-[12px] ${CAP}`}>Alerts on while this page is open</span>}
          </div>
          {followOpen && (
            <label className="flex flex-col gap-1 text-[12px]">
              <span className={CAP}>Athlete</span>
              <select
                value={followId ?? ''}
                onChange={(e) => chooseFollow(e.target.value || null)}
                className="min-h-10 px-3 bg-sheet border-2 border-rule text-[14px] font-bold text-ink"
              >
                <option value="">Choose…</option>
                {[...state.divisions].sort((a, b) => a.sortOrder - b.sortOrder).map((d) => (
                  <optgroup key={d.id} label={d.name}>
                    {state.athletes.filter((a) => a.divisionId === d.id && a.status === 'active').sort((a, b) => a.name.localeCompare(b.name)).map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span className={`text-[11px] ${CAP}`}>Alerts only work while this page is open. On iPhone, add the page to your Home Screen first (Share, then Add to Home Screen).</span>
            </label>
          )}
        </div>
      )}

      {/* Up now per station. Hidden once the meet is completed (Astra DR-02). */}
      {!completed && (
        <div className="px-4 py-4 sm:px-5 flex flex-col gap-2">
          <Sec>Up now</Sec>
          <RuledBlock columns="minmax(88px,auto) minmax(0,1fr)" role="table" aria-label="Up now per station">
            <LH>Station</LH><LH>Athlete · event</LH>
            {stations.map((s) => {
              const l = live.find((x) => x.station === s.id);
              const ev = state.events.find((e) => e.id === l?.current_event_id);
              const dv = state.divisions.find((d) => d.id === l?.current_division_id);
              return (
                <div key={s.id} role="row" className="contents">
                  <LR className="font-bold text-[12px]">{s.label}</LR>
                  <LR className="flex-col !items-start gap-0.5 py-1.5">
                    {l && ev ? (
                      <>
                        <span className="font-bold text-[14px] leading-tight text-pen break-words">{name(l.current_athlete_id) ?? '—'}{l.lane2_athlete_id ? ` + ${name(l.lane2_athlete_id) ?? '—'}` : ''}</span>
                        <span className={`text-[11px] ${CAP}`}>Ev {ev.eventNumber} {ev.name}{dv ? ` · ${dv.name}` : ''}</span>
                      </>
                    ) : (
                      <span className={`text-[12px] ${CAP}`}>Idle</span>
                    )}
                  </LR>
                </div>
              );
            })}
          </RuledBlock>
        </div>
      )}

      {completed && (
        <div role="status" className="px-4 py-4 sm:px-5 text-[13px] text-ink">
          {meet.resultsStatus === 'final'
            ? 'This show is complete and the standings below are final.'
            : 'This show is complete. Standings are provisional until the promoter marks them final.'}
        </div>
      )}

      {/* Division filter: a key row, pen for the chosen one */}
      <div className="px-4 py-3 sm:px-5 flex gap-1.5 overflow-x-auto" role="group" aria-label="Division">
        {[{ id: 'ALL', name: 'All' }, ...state.divisions].map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => setDivision(d.id)}
            aria-pressed={division === d.id}
            className={keyClass(division === d.id ? 'pen' : 'line', 'min-h-10 px-3 text-xs whitespace-nowrap shrink-0')}
          >
            {d.name}
          </button>
        ))}
      </div>

      {divisions.map((d) => {
        const ev = eventFor(d);
        const divAth = state.athletes.filter((a) => a.divisionId === d.id);
        if (!ev || divAth.length === 0) return null;
        return (
          <div key={d.id} className="px-4 py-4 sm:px-5 flex flex-col gap-2">
            {/* the sheet's own caption truncates long division names at phone width; the name gets its own line */}
            <h2 className="text-[16px] font-bold leading-tight text-ink">{d.name}</h2>
            <StandingsSheet
              currentDivision={d}
              currentEvent={ev}
              eventScores={scoreSingleEvent(ev, divAth, state.results, state.events)}
              events={state.events}
              meet={state.meet}
              overallStandings={calculateDivisionStandings(d, divAth, state.events, state.results, state.meet.tiebreakerRule)}
            />
          </div>
        );
      })}

      {/* 046: sponsors (#14) and the stream link (#17) ride on the public meet row */}
      {meet.sponsors?.length ? <SponsorStrip sponsors={meet.sponsors} className="px-4 py-4 sm:px-5 border-t border-rule" /> : null}
      <div className="px-4 py-4 sm:px-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
        {meet.livestreamUrl && <a href={meet.livestreamUrl} target="_blank" rel="noopener noreferrer" className={`${textLink} text-pen`}>Watch live ↗</a>}
        <a href="/website" className={textLink}>ZeroTacky home</a>
        <a href="/website/account" className={textLink}>Account</a>
      </div>
    </div>
  );
}

function Notice({ text }: { text: string }) {
  return <div className="px-5 py-8 text-center text-[14px] font-bold text-ink">{text}</div>;
}
