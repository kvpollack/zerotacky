'use client';
// The venue TV (/m/<slug>?layout=tv). Picks the sheet and venue mode from tv_control (the scorer's choice, 036),
// else the link's ?sheet=a|b and ?mode=dark, else Sheet A bright. Sheet A needs a live station; without one the
// board shows Sheet B when there are scores, the idle screen when there are none. Sheet B pages rotate every
// PAGE_MS. Promoter colour: resolveAccent on the show's theme.primary (three slots), resolveGround on background;
// a refused accent leaves the slots in ink and sets the meet name in the clamped colour instead.
import React, { useEffect, useMemo, useState } from 'react';
import type { AppState } from '@/lib/types';
import type { LiveStateRow, RemoteMeet, TvControlRow } from '@/lib/sync/meetApi';
import { resolveAccent, resolveGround } from '@/lib/theme/promoter';
import { buildCardPages, buildIdle, buildSheetA, formatSheetDate, isMode, isSheet, pickStation, surname, venueLine, PAGE_MS, type TvMode, type TvSheet } from '@/lib/tv/model';
import TvFrame from './TvFrame';
import SheetA from './SheetA';
import SheetB from './SheetB';
import TvIdle from './TvIdle';

export type TitleData = {
  name: string;
  nameColor?: string;      // set when the promoter's colour was refused for the slots
  client: string;
  venue: string;
  date: string;
  status: string;          // Live | Final | Provisional | Waiting | Cancelled
  demo: boolean;
  statusLine: string;      // status with the demo marker, for the title block
  resultsWord: string;     // Provisional | Final | Not started
  subline: string;         // band right-hand text when nothing is on platform
  onPlatform: string;
  then: string;
  scoredBy: string;
};

export type TvBoardProps = {
  meet: RemoteMeet;
  state: AppState;
  live: LiveStateRow[];
  control: TvControlRow | null;
  clientName: string | null;
  error: string | null;
  demo: boolean;
  updatedAt: number | null;
};

function fromSearch(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(key);
}

export default function TvBoard({ meet, state, live, control, clientName, error, demo, updatedAt }: TvBoardProps) {
  const [params, setParams] = useState<{ sheet: TvSheet | null; mode: TvMode | null; station: string | null; division: string | null }>({ sheet: null, mode: null, station: null, division: null });
  useEffect(() => {
    const s = fromSearch('sheet')?.toLowerCase(), m = fromSearch('mode')?.toLowerCase();
    setParams({ sheet: isSheet(s) ? s : null, mode: isMode(m) ? m : null, station: fromSearch('station'), division: fromSearch('division') });
  }, []);

  const completed = meet.competitionStatus === 'completed';
  const cancelled = meet.competitionStatus === 'cancelled';
  const mode: TvMode = control?.mode ?? params.mode ?? 'home';
  const wanted: TvSheet = control?.sheet ?? params.sheet ?? 'a';

  const station = useMemo(() => pickStation(state, live, params.station), [state, live, params.station]);
  const a = useMemo(() => (completed ? null : buildSheetA(state, live, station)), [state, live, station, completed]);
  // Astra DR3-09 (11/3): a completed meet has no one on the platform, so Sheet B gets no live rows (no ON PLATFORM
  // header, live-event marker or active-athlete underline on a final board).
  const pages = useMemo(() => buildCardPages(state, completed ? [] : live, params.division), [state, live, params.division, completed]);
  const anyScores = state.results.length > 0;
  const sheet: TvSheet | 'idle' = wanted === 'a' && a ? 'a' : pages.length && (anyScores || completed || wanted === 'b') ? 'b' : a ? 'a' : 'idle';

  // page rotation for Sheet B
  const [pageIdx, setPageIdx] = useState(0);
  const [left, setLeft] = useState(PAGE_MS / 1000);
  useEffect(() => {
    if (sheet !== 'b' || pages.length <= 1) { setPageIdx(0); return; }
    setLeft(PAGE_MS / 1000);
    const id = setInterval(() => {
      setLeft((s) => {
        if (s <= 1) { setPageIdx((i) => (i + 1) % pages.length); return PAGE_MS / 1000; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [sheet, pages.length]);
  const page = pages[Math.min(pageIdx, Math.max(0, pages.length - 1))];

  // paint
  const accent = resolveAccent(meet.theme?.primary ?? null, mode);
  const ground = resolveGround(meet.theme?.background ?? null, mode);

  const resultsWord = completed ? (meet.resultsStatus === 'final' ? 'Final' : 'Provisional') : anyScores ? 'Provisional' : 'Not started';
  const status = cancelled ? 'Cancelled' : completed ? (meet.resultsStatus === 'final' ? 'Final' : 'Complete') : a ? 'Live' : anyScores ? 'Between events' : 'Waiting';
  const onDeck = a?.onDeck[0], then = a?.onDeck[1];
  const title: TitleData = {
    name: state.meet.name,
    nameColor: accent.refused ? accent.clamped : undefined,
    client: clientName ?? 'ZeroTacky',   // host gym (030 host_gym_id) or the fixture's promoter; federation is not a client
    venue: venueLine(meet.venue),
    date: formatSheetDate(state.meet.date),
    status,
    demo,
    statusLine: demo ? `${status} · Demo` : status,
    resultsWord,
    subline: error ? 'Reconnecting' : completed ? (meet.resultsStatus === 'final' ? 'Official results' : 'Provisional until the promoter marks final') : updatedAt ? `Updated ${new Date(updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : '',
    onPlatform: a?.athlete ? `Lot ${a.athlete.lotNumber} ${surname(a.athlete.name)}${a.lane2 ? ` + ${surname(a.lane2.name)}` : ''}` : '',
    then: then ? `Lot ${then.lotNumber} ${surname(then.name)}` : '—',
    scoredBy: a?.station.label ?? station.label,
  };

  const frameStyle: React.CSSProperties = sheet === 'a'
    ? { gridTemplateColumns: '846px 1fr', gridTemplateRows: 'minmax(0, 1fr)' }
    : sheet === 'b'
      ? { gridTemplateRows: '64px minmax(0, 1fr) 120px' }
      : { gridTemplateRows: '1fr 214px' };

  return (
    <TvFrame mode={mode} ground={ground} accent={accent.accent} accentLabel={accent.label} frameStyle={frameStyle}>
      {sheet === 'a' && a && <SheetA m={a} title={title} />}
      {sheet === 'b' && page && (
        <SheetB
          p={page}
          title={title}
          pageIn={pages.length > 1 ? left : null}
          onDeck={onDeck ? `Lot ${onDeck.lotNumber} ${surname(onDeck.name)}` : '—'}
          upcoming={a?.next ? `E${a.next.eventNumber} ${a.next.name}` : '—'}
        />
      )}
      {sheet === 'idle' && <TvIdle m={buildIdle(state)} title={title} divisions={state.divisions.map((d) => d.name)} athletes={state.athletes.filter((x) => x.status === 'active').length} sponsors={meet.sponsors ?? null} />}
    </TvFrame>
  );
}
