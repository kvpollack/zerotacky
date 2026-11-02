'use client';
// Phase 5 (11/2): Live Control at the top of the Pit Crew tab (approved mockup scorer_live.html): who is lifting, a
// read-only mirror of the judge's clock, up next, how many are scored, this phone's role lock, and the TV board
// controls (036 tv_control: Sheet A live / Sheet B standings, venue bright / dark). The venue keys drive the TV for
// everyone watching; this phone keeps its own daylight toggle in the header.
import React, { useEffect, useState } from 'react';
import type { Athlete, Division, EventDef, Result, RunOrderItem } from '@/lib/types';
import { RuledBlock } from '@/components/sheet';
import PadClock from '@/components/judge/PadClock';
import { CAP, Field, Key, KeyGroup, Note, Sec, Val } from './parts';
import { TV_DEFAULT, tvControlWord, type RoleLock, type TvControl, type TvMode, type TvSheet } from './scorerModel';

export type LiveSync = {
  enabled?: boolean;
  link?: { slug: string; role: string } | null;
  setTv?: (row: TvControl) => Promise<unknown> | undefined;
  readTv?: () => Promise<{ sheet: TvSheet; mode: TvMode } | null>;
} | null | undefined;

export type LiveControlProps = {
  currentAthlete?: Athlete | null;
  currentDivision: Division;
  currentEvent: EventDef;
  eventCount: number;
  divisionAthletes: Athlete[];
  results: Result[];
  runOrder: RunOrderItem[];
  nextRunItem?: RunOrderItem | null;
  stationLabel: string;
  subscribeClock: (fn: (ms: number) => void) => () => void;
  timerRunning: boolean;
  roleLock: RoleLock;
  lockDeviceToRole: (role: RoleLock) => void;
  sync: LiveSync;
  publishKey?: React.ReactNode;
  readOnly?: boolean;
};

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'judge', label: 'Lock Judge' },
  { value: 'pitcrew', label: 'Lock Pit Crew' },
  { value: 'spectator', label: 'Lock Spectator' },
] as const;

export default function LiveControl(p: LiveControlProps) {
  const { currentAthlete, currentDivision, currentEvent: ev, runOrder, nextRunItem, results, divisionAthletes } = p;
  const runIdx = currentAthlete ? runOrder.findIndex((it) => it.athlete.id === currentAthlete.id) : -1;
  const ids = new Set(divisionAthletes.map((a) => a.id));
  const scored = results.filter((r) => r.eventId === ev.id && ids.has(r.athleteId) && r.locked).length;
  const linked = !!p.sync?.enabled && !!p.sync?.link;

  const [tv, setTv] = useState<TvControl>(TV_DEFAULT);
  const [tvState, setTvState] = useState<'idle' | 'saving' | 'error' | 'offline'>(linked ? 'idle' : 'offline');
  useEffect(() => {
    if (!linked) { setTvState('offline'); return; }
    setTvState('idle');
    let dead = false;
    p.sync?.readTv?.().then((row) => { if (!dead && row) setTv({ sheet: row.sheet, mode: row.mode }); }).catch(() => {});
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, p.sync?.link?.slug]);
  const driveTv = async (next: TvControl) => {
    setTv(next);
    if (!linked || !p.sync?.setTv) { setTvState('offline'); return; }
    setTvState('saving');
    try { await p.sync.setTv(next); setTvState('idle'); } catch { setTvState('error'); }
  };
  const tvWord = tvControlWord(tvState);

  return (
    <>
      <Sec right={<>{p.stationLabel} &middot; Ev {ev.eventNumber} of {p.eventCount}</>}>Live Control</Sec>
      <RuledBlock columns="minmax(0,1fr) 118px">
        <Field wide label={runIdx >= 0 ? `Now lifting · Run order ${runIdx + 1} of ${runOrder.length}` : 'Now lifting'}>
          <Val className="!text-[18px]">{currentAthlete ? `Lot ${currentAthlete.lotNumber} ${currentAthlete.name}` : '\u2014'}</Val>
        </Field>
        <div className="col-span-full">
          <PadClock subscribe={p.subscribeClock} running={p.timerRunning} capSeconds={ev.timeCapSeconds} locked />
        </div>
        <Field label="Up next"><Val className="!text-ink">{nextRunItem ? `Lot ${nextRunItem.athlete.lotNumber} ${nextRunItem.athlete.name}` : 'Last athlete on this station'}</Val></Field>
        <Field label="Scored this event"><Val className="!text-ink"><span className="text-pen">{scored}</span>/{divisionAthletes.length}</Val></Field>
        {!p.readOnly && (
          <Field wide label="Volunteer Phone Role Lock" className="!py-2">
            <KeyGroup ariaLabel="Volunteer Phone Role Lock" options={ROLE_OPTIONS} value={p.roleLock} onChange={(r) => { if (r !== 'admin') p.lockDeviceToRole(r); }} />
          </Field>
        )}
      </RuledBlock>

      <Sec right={p.sync?.link ? <span className="normal-case">/m/{p.sync.link.slug}</span> : 'Not linked'}>TV Board</Sec>
      <RuledBlock columns="minmax(0,1fr)">
        <Field label="Sheet" className="!py-2">
          <KeyGroup ariaLabel="TV sheet" disabled={!linked || p.readOnly} value={tv.sheet} onChange={(s) => driveTv({ ...tv, sheet: s })} options={[{ value: 'a', label: 'A · Live' }, { value: 'b', label: 'B · Standings' }]} />
        </Field>
        <Field label="Venue" className="!py-2" note={<>Sets the TV board for everyone watching. This phone keeps its own daylight toggle.{tvWord ? <> <span className={tvState === 'error' ? 'text-redpen font-bold' : ''}>{tvWord}.</span></> : ''}</>}>
          <KeyGroup ariaLabel="TV venue" disabled={!linked || p.readOnly} value={tv.mode} onChange={(m) => driveTv({ ...tv, mode: m })} options={[{ value: 'home', label: 'Bright' }, { value: 'dark', label: 'Dark' }]} />
        </Field>
      </RuledBlock>
      {p.publishKey}
      {!linked && <Note className={CAP}>Publish the meet or join one by code (Meet Setup, Live Sync) to drive the TV.</Note>}
    </>
  );
}
