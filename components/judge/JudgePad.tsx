'use client';
// UI transition Phase 4 (11/2): the judge pad as an engineering sheet (approved mockups pad.html + pad_states.html).
// Same controller, same props as before plus `mode`, `sync`, `stationFlight`, `eventCount`; the result model gains an
// optional attempt log (padModel.ts) and nothing in the sync path changes. The pad never takes the promoter's colour.
//
// Top to bottom: header block (meet | SYNC, station | event, athlete, clock, count), sync notice when offline,
// the entry block for the event type (or the run order while nothing is scored yet), clock + undo keys, the lock
// key (or UNLOCK TO EDIT + GO TO next once locked), UP NEXT, the two judge keys, the title block with the REV letter.
import React, { useEffect, useMemo, useState } from 'react';
import type { Athlete, Division, EventDef, Meet, Result, RunOrderItem } from '@/lib/types';
import type { Mode } from '@/lib/theme/promoter';
import { stationById, stationForDivision } from '@/lib/engine';
import { revFor } from '@/lib/tv/model';
import { RuledBlock, Cell, TitleBlock, NoLiftKey, GoodLiftKey } from '@/components/sheet';
import PadClock from './PadClock';
import {
  bestWeight, canUndo, clockTime, currentBarWeight, formatSeconds, hasEntry, implementsFromLog, keyLabels, logOf,
  pressPatch, repsFromLog, stoneRows, syncLabel, undoPatch, IMPLEMENT_DEFAULT, type SyncStatus,
} from './padModel';

type StatusAction = { id: string; label: string; icon?: React.ComponentType<{ className?: string }> };
type PadSync = { enabled?: boolean; status?: SyncStatus; link?: { slug: string; role: string } | null; syncNow?: () => void } | null | undefined;

export type JudgePadProps = {
  mode?: Mode;
  /** false inside the Phase 5 shell: the meet | SYNC and station | event rows are the shell header's. */
  chrome?: boolean;
  sync?: PadSync;
  stationFlight?: string;
  eventCount?: number;
  currentAthlete: Athlete;
  currentDivision: Division;
  currentEvent: EventDef;
  currentResult: Partial<Result>;
  divisionAthletes: Athlete[];
  getElapsedSeconds: () => number;
  handleStatusAction: (a: StatusAction) => void;
  isLocked: boolean;
  lane2Athlete?: Athlete | null;
  lane2AthleteId?: string;
  lane2Result?: Partial<Result> | null;
  lockAndAdvance: () => void;
  goToNextSetup: () => void;
  meet: Meet;
  nextRunItem?: RunOrderItem;
  nextSetup?: { division: Division; event: EventDef } | null;
  pendingStatusAction: string | null;
  resetStopwatch: () => void;
  results: Result[];
  runOrder: RunOrderItem[];
  saveResultPatch: (athleteId: string, patch: Partial<Result>) => void;
  selectRunOrderItem: (item: RunOrderItem) => void;
  setLane2AthleteId: (id: string) => void;
  setPendingStatusAction: (id: string | null) => void;
  setPitCrewCustomWeight: (w: string) => void;
  setStatusMenuOpen: (fn: boolean | ((o: boolean) => boolean)) => void;
  stopAndStampFinish: () => void;
  subscribeClock: (fn: (ms: number) => void) => () => void;
  showStopStamp?: boolean;
  statusActions: StatusAction[];
  statusMenuOpen: boolean;
  timerRunning: boolean;
  toggleTimer: () => void;
  unlockScore: () => void;
  upNowPinHeight?: string | null;
};

// ---------- small parts ----------

const CAP = 'text-ink-muted tracking-[0.04em]';
const KEY = 'font-sheet uppercase font-bold rounded-none flex items-center justify-center gap-2 text-center select-none min-h-[56px] px-3 text-[15px] leading-tight';
const LINE = `${KEY} bg-sheet text-ink border-2 border-rule`;
const PEN = `${KEY} bg-pen text-pen-label`;
const INK = `${KEY} bg-ink text-sheet`;
const OFF = `${KEY} zt-key-off`;
const lineKey = (live: boolean) => (live ? LINE : OFF);

function Row({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid grid-cols-2 gap-2 ${className}`}>{children}</div>;
}

function H({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-2 py-1 text-[10px] ${CAP} ${className}`}>{children}</div>;
}

function R({ children, className = '', ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`px-2 py-1 text-[14px] min-h-[25px] flex items-center whitespace-nowrap overflow-hidden text-ellipsis ${className}`}>{children}</div>;
}

const NoMark = ({ children }: { children: React.ReactNode }) => (
  <span className="text-redpen font-bold"><span aria-hidden="true" className="font-normal">&#x2715;</span> {children}</span>
);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={`block text-[10px] mb-1 ${CAP}`}>{label}</span>
      {children}
    </label>
  );
}

function NumInput({ value, step, placeholder, onChange, disabled, ariaLabel }: { value: number | undefined | null; step?: string; placeholder?: string; onChange: (v: number | undefined) => void; disabled?: boolean; ariaLabel?: string }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      placeholder={placeholder}
      aria-label={ariaLabel}
      disabled={disabled}
      value={value === undefined || value === null || value === 0 ? '' : value}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
      className="zt-input font-sheet disabled:opacity-50"
    />
  );
}

// ---------- the pad ----------

export default function JudgePad(p: JudgePadProps) {
  const {
    mode = 'home', chrome = true, sync, stationFlight, eventCount, currentAthlete, currentDivision, currentEvent, currentResult,
    divisionAthletes, getElapsedSeconds, handleStatusAction, isLocked, lane2Athlete, lane2AthleteId, lane2Result,
    lockAndAdvance, goToNextSetup, meet, nextRunItem, nextSetup, pendingStatusAction, resetStopwatch, results,
    runOrder, saveResultPatch, selectRunOrderItem, setLane2AthleteId, setPendingStatusAction, setPitCrewCustomWeight,
    setStatusMenuOpen, stopAndStampFinish, subscribeClock, statusActions, statusMenuOpen, timerRunning, toggleTimer,
    unlockScore, upNowPinHeight,
  } = p;

  const ev = currentEvent;
  const r = currentResult;
  const type = ev.scoringType;
  const labels = keyLabels(type);
  const log = logOf(r);
  const entered = hasEntry(r);
  const station = stationById(meet, stationFlight) ?? stationForDivision(meet, currentDivision);
  const stationLabel = station?.label ?? (stationFlight && stationFlight !== 'ALL' ? `Station ${stationFlight}` : 'Station');
  const runIdx = runOrder.findIndex((it) => it.athlete.id === currentAthlete.id);
  const rev = revFor(results, divisionAthletes);
  const syncOn = !!sync?.enabled;
  const syncStatus = sync?.status;
  const syncCell = syncLabel(syncOn, syncStatus);
  const syncTrouble = syncOn && (syncStatus?.state === 'offline' || syncStatus?.state === 'error');
  const lane2 = ev.lanes === 2;

  // Run order shows itself while nothing is on the sheet for this athlete and the clock is idle; a key pins it either way.
  const [orderPinned, setOrderPinned] = useState<boolean | null>(null);
  useEffect(() => { setOrderPinned(null); }, [currentAthlete.id, ev.id]);
  const showOrder = orderPinned ?? (!entered && !timerRunning && !isLocked);

  // Rising bar: the weight the next press scores.
  const [pickedWeight, setPickedWeight] = useState<number | null>(null);
  useEffect(() => { setPickedWeight(null); }, [currentAthlete.id, ev.id]);
  const barWeights = ev.risingBarWeights ?? [];
  const barWeight = type === 'max_weight' ? currentBarWeight(barWeights, r.risingBarAttempts, pickedWeight) : null;

  const stoneCount = ev.implementCount || IMPLEMENT_DEFAULT;
  const stones = useMemo(() => (type === 'time_or_implements' ? stoneRows(log, stoneCount) : []), [type, log, stoneCount]);
  const done = type === 'time_or_implements' ? (log.length ? implementsFromLog(log).implementsCompleted : (r.implementsCompleted ?? 0)) : 0;
  const noReps = type === 'reps' ? repsFromLog(log).noReps : 0;

  const press = (kind: 'good' | 'no') => {
    if (isLocked) return;
    if (type === 'time_or_distance') {
      if (kind === 'good' && timerRunning) { stopAndStampFinish(); return; }
      saveResultPatch(currentAthlete.id, pressPatch(ev, r, kind, getElapsedSeconds()));
      return;
    }
    if (type === 'max_weight') {
      if (barWeight === null) return;
      saveResultPatch(currentAthlete.id, pressPatch(ev, r, kind, 0, barWeight));
      setPitCrewCustomWeight(String(barWeight));
      setPickedWeight(null);
      return;
    }
    const patch = pressPatch(ev, r, kind, getElapsedSeconds());
    if (Object.keys(patch).length === 0) return;
    saveResultPatch(currentAthlete.id, patch);
    // the last stone stops the clock and stamps the course time, as the sport does
    if (type === 'time_or_implements' && kind === 'good' && timerRunning && (patch.implementsCompleted ?? 0) >= stoneCount) stopAndStampFinish();
  };
  const undo = () => { if (!isLocked && canUndo(ev, r)) saveResultPatch(currentAthlete.id, undoPatch(ev, r)); };
  const keysLive = !isLocked && !(type === 'max_weight' && barWeight === null) && !(type === 'time_or_implements' && done >= stoneCount);

  // ---------- count cell ----------
  let count: React.ReactNode; let countCap: React.ReactNode;
  if (type === 'time_or_implements') {
    count = <><span className="text-pen">{done}</span>/{stoneCount}</>; countCap = <>Qty<br />{labels.qtyCap}</>;
  } else if (type === 'reps') {
    const reps = log.length ? repsFromLog(log).reps : (r.reps ?? 0);
    count = <span className={reps > 0 ? 'text-pen' : ''}>{reps}</span>;
    countCap = <>Qty<br />{labels.qtyCap}{noReps > 0 && <><br /><span className="text-redpen">&#x2715; {noReps} no rep{noReps === 1 ? '' : 's'}</span></>}</>;
  } else if (type === 'max_weight') {
    const best = bestWeight(r);
    count = <span className={best > 0 ? 'text-pen' : ''}>{best || 0}</span>; countCap = <>{labels.qtyCap}<br />lb</>;
  } else {
    const t = r.timeSeconds ?? 0; const d = r.distanceFeet ?? 0;
    if (t > 0) { count = <span className="text-pen">{Number(t).toFixed(2)}</span>; countCap = <>{labels.qtyCap}<br />seconds</>; }
    else if (d > 0) { count = <span className="text-pen">{d}</span>; countCap = <>Distance<br />ft · DNF</>; }
    else { count = <span>--</span>; countCap = <>{labels.qtyCap}<br />seconds</>; }
  }

  const subLine = isLocked
    ? <span className="font-bold tracking-[0.06em]">Score locked · Rev <span className="text-pen">{rev}</span>{r.updatedAt ? ` · ${clockTime(r.updatedAt)}` : ''}</span>
    : <>
        {runIdx >= 0 ? `Run order ${runIdx + 1} of ${runOrder.length}` : 'Not in the run order'}
        {upNowPinHeight ? ` · ${ev.heightLabel || 'Rack / pin'} ${upNowPinHeight}` : ''}
        {!entered && !timerRunning ? ' · not started' : ''}
        {r.didNotStart && <> · <NoMark>DNS</NoMark></>}
        {currentAthlete.status === 'withdrawn' && <> · <NoMark>Scratched</NoMark></>}
      </>;

  const nextLabel = nextRunItem
    ? `Lot ${nextRunItem.athlete.lotNumber} ${nextRunItem.athlete.name}`
    : nextSetup
      ? `${nextSetup.division.name}${nextSetup.event.id !== ev.id ? ` on ${nextSetup.event.name}` : ''}`
      : 'Last athlete on this station';

  return (
    <div data-zt-sheet data-zt-mode={mode} className={`font-sheet uppercase text-ink bg-sheet flex flex-col leading-[1.15] antialiased ${chrome ? 'border-2 border-rule' : ''}`} style={{ fontSynthesis: 'none' }}>
      <div className="flex flex-col gap-2 p-2">
        {/* ---------- header block ---------- */}
        <RuledBlock columns="minmax(0,1fr) auto">
          {chrome && <>
          <div className="px-2 flex items-center text-[12px] font-bold min-h-[22px] whitespace-nowrap overflow-hidden text-ellipsis">{meet.name}</div>
          <button
            type="button"
            onClick={() => sync?.syncNow?.()}
            disabled={!syncOn}
            aria-label={`Sync: ${syncCell.text}${syncOn ? '. Tap to sync now' : ''}`}
            className="px-2 flex items-center gap-1.5 text-[12px] whitespace-nowrap min-h-[22px] font-sheet uppercase"
          >
            <span className={CAP}>Sync</span>
            <span aria-hidden="true" className={`inline-block w-2 h-2 border-[1.5px] border-current ${syncCell.filled ? 'bg-current' : ''}`} />
            <span className={syncCell.filled ? 'text-ink' : 'font-bold text-ink'}>{syncCell.text}</span>
          </button>
          <div className="px-2 flex items-center text-[12px] min-h-[22px]">{stationLabel}</div>
          <div className="px-2 flex items-center text-[12px] font-bold min-h-[22px] whitespace-nowrap overflow-hidden text-ellipsis">E{ev.eventNumber} {ev.name}</div>
          </>}
          <div className="col-span-2 px-2 py-1.5 flex items-start justify-between gap-2 min-h-[46px]">
            <div className="min-w-0">
              <h2 className="text-[19px] font-bold leading-tight text-balance">Lot {currentAthlete.lotNumber} {currentAthlete.name}</h2>
              <div className={`text-[11px] mt-0.5 ${CAP}`}>{subLine}</div>
            </div>
            <button
              type="button"
              onClick={() => { setStatusMenuOpen((o) => !o); setPendingStatusAction(null); }}
              aria-expanded={statusMenuOpen}
              aria-controls="athlete-status-menu"
              className={`shrink-0 text-[11px] px-2 min-h-[32px] border-2 border-rule font-bold ${statusMenuOpen ? 'bg-ink text-sheet' : 'text-ink'}`}
            >
              Status
            </button>
          </div>
          <div className="col-span-2">
            <PadClock subscribe={subscribeClock} running={timerRunning} capSeconds={ev.timeCapSeconds} locked={isLocked} onReset={resetStopwatch} />
          </div>
          <div className="col-span-2 px-2 flex items-center justify-between gap-2 min-h-[96px]">
            <span className="text-[88px] leading-none">{count}</span>
            <span className={`text-right text-[12px] leading-tight ${CAP}`}>{countCap}</span>
          </div>
        </RuledBlock>

        {/* ---------- status menu (DNS / scratch), tap twice ---------- */}
        {statusMenuOpen && (
          <RuledBlock id="athlete-status-menu" columns="1fr 1fr">
            <div className="col-span-2 px-2 py-1 flex items-center justify-between text-[10px]">
              <span className={CAP}>Athlete status / scratch</span><span className={CAP}>Tap twice to confirm</span>
            </div>
            {statusActions.map((a) => {
              const armed = pendingStatusAction === a.id;
              return (
                <div key={a.id} className="p-1.5">
                  <button type="button" onClick={() => handleStatusAction(a)} className={`${KEY} w-full min-h-[48px] text-[13px] ${armed ? 'bg-sheet text-redpen border-[3px] border-redpen' : 'bg-sheet text-ink border-2 border-rule'}`}>
                    {armed ? 'Tap again to confirm' : a.label}
                  </button>
                </div>
              );
            })}
          </RuledBlock>
        )}

        {/* ---------- sync notice ---------- */}
        {syncTrouble && (
          <RuledBlock columns="minmax(0,1fr) auto">
            <div className="px-2.5 py-1.5">
              <div className={`text-[10px] ${CAP}`}>
                {syncStatus?.state === 'error' ? 'Sync error' : `Offline${syncStatus?.lastSyncAt ? ` since ${clockTime(syncStatus.lastSyncAt)}` : ''}`}
                {syncStatus?.pending ? ` · ${syncStatus.pending} waiting` : ''}
              </div>
              <div className="text-[11px] leading-snug normal-case">
                {syncStatus?.state === 'error'
                  ? <>This phone cannot reach the meet. Keep scoring; write down anything still waiting, then re-join with the current code and PIN.</>
                  : <><b>Keep scoring.</b> Scores send when the Wi-Fi comes back.</>}
              </div>
            </div>
            {syncStatus?.state === 'error'
              ? <a href="/join" className={`${LINE} border-0 text-[12px] px-3 h-full no-underline`}>Re-join</a>
              : <button type="button" onClick={() => sync?.syncNow?.()} className={`${LINE} border-0 text-[12px] px-3 h-full`}>Sync now</button>}
          </RuledBlock>
        )}

        {/* ---------- entry block ---------- */}
        {showOrder ? (
          <RuledBlock columns="40px minmax(0,1fr) 96px" role="table" aria-label="Run order">
            <H>{lane2 ? 'Heat' : 'Order'}</H><H>{currentDivision.name} · {ev.name}</H><H>Result</H>
            {runOrder.map((item) => {
              const res = results.find((x) => x.eventId === ev.id && x.athleteId === item.athlete.id);
              const isNow = item.athlete.id === currentAthlete.id;
              const isL2 = lane2 && item.athlete.id === lane2AthleteId;
              const isNext = nextRunItem?.athlete.id === item.athlete.id;
              const word = res?.locked ? 'Locked' : isNow ? 'Now' : isL2 ? 'Lane 2' : res && hasEntry(res) ? 'Scored' : isNext ? 'Up next' : '';
              return (
                <button key={item.athlete.id} type="button" onClick={() => selectRunOrderItem(item)} className="contents text-left font-sheet uppercase" aria-current={isNow ? 'true' : undefined}>
                  <R className={isNow ? 'font-bold' : ''}>{lane2 ? `${item.heatNumber}·L${item.lane}` : item.orderIndex}</R>
                  <R className={isNow ? 'font-bold' : ''}>Lot {item.athlete.lotNumber} {item.athlete.name}</R>
                  <R className={res?.locked ? 'text-pen' : 'text-ink-muted'}>{word}</R>
                </button>
              );
            })}
          </RuledBlock>
        ) : (
          <>
            {type === 'time_or_implements' && (
              <RuledBlock columns="40px minmax(0,1fr) 96px" role="table" aria-label="Stones">
                <H>Stone</H><H>Result</H><H>Split</H>
                {stones.map((s) => (
                  <React.Fragment key={s.n}>
                    <R className="font-bold">{s.n}</R>
                    <R className={s.state === 'good' ? 'text-pen' : s.state === 'pending' ? 'text-ink-muted' : ''}>
                      {s.state === 'good' ? `Good${s.misses ? ` · ${s.misses} miss${s.misses === 1 ? '' : 'es'}` : ''}` : s.state === 'no' ? <NoMark>No{s.misses > 1 ? ` ×${s.misses}` : ''}</NoMark> : 'Pending'}
                    </R>
                    <R className="text-pen">{s.state === 'good' ? formatSeconds(s.split) : ''}</R>
                  </React.Fragment>
                ))}
              </RuledBlock>
            )}
            {type === 'time_or_implements' && (
              <Row>
                <Field label="Last split (s)">
                  <NumInput step="0.01" value={r.splitTimeSeconds} disabled={isLocked} ariaLabel="Last split seconds" onChange={(v) => saveResultPatch(currentAthlete.id, { splitTimeSeconds: v })} />
                </Field>
                <Field label="Full course finish (s)">
                  <NumInput step="0.01" value={r.timeSeconds} disabled={isLocked} ariaLabel="Full course finish seconds" onChange={(v) => saveResultPatch(currentAthlete.id, { timeSeconds: v })} />
                </Field>
              </Row>
            )}

            {type === 'reps' && ev.hasTrumpWeight && (
              <Row>
                {(['heavy', 'light'] as const).map((t) => {
                  const on = (r.tier || 'heavy') === t;
                  const w = t === 'heavy' ? ev.divisionWeights[currentDivision.id] : ev.divisionLightWeights?.[currentDivision.id];
                  return (
                    <button key={t} type="button" aria-pressed={on} disabled={isLocked} onClick={() => saveResultPatch(currentAthlete.id, { tier: t })} className={`${on ? INK : LINE} text-[13px] disabled:opacity-50`}>
                      {t === 'heavy' ? 'Heavy bar' : 'Light bar'}{w ? ` ${w} lb` : ''}
                    </button>
                  );
                })}
              </Row>
            )}
            {type === 'reps' && ev.groundTouchWarning && (
              <button
                type="button"
                aria-pressed={!!r.groundTouchWarned}
                disabled={isLocked}
                onClick={() => saveResultPatch(currentAthlete.id, { groundTouchWarned: !r.groundTouchWarned })}
                className={`${KEY} w-full text-[13px] disabled:opacity-50 ${r.groundTouchWarned ? 'bg-sheet text-redpen border-[3px] border-redpen' : 'bg-sheet text-ink border-2 border-rule'}`}
              >
                {r.groundTouchWarned ? <><span aria-hidden="true" className="font-normal">&#x2715;</span> Ground-touch warning issued · tap to clear</> : 'Ground-touch warning'}
              </button>
            )}

            {type === 'max_weight' && ev.maxFormat === 'rising_bar' && barWeights.length > 0 && (
              <>
                <RuledBlock columns="minmax(0,1fr) 110px" role="table" aria-label="Rising bar">
                  <H>Bar · tap a weight to score it</H><H>Result</H>
                  {barWeights.map((w) => {
                    const st = r.risingBarAttempts?.[w] || 'pending';
                    const isCur = barWeight === w;
                    return (
                      <button key={w} type="button" disabled={isLocked} onClick={() => setPickedWeight(w)} className="contents text-left font-sheet uppercase" aria-current={isCur ? 'true' : undefined}>
                        <R className={isCur ? 'font-bold' : ''}>{isCur && <span aria-hidden="true" className="mr-1.5">&#x25B8;</span>}{w} lb</R>
                        <R className={st === 'good' ? 'text-pen' : st === 'pending' ? 'text-ink-muted' : ''}>
                          {st === 'good' ? 'Good' : st === 'fail' ? <NoMark>No</NoMark> : st === 'pass' ? 'Pass' : isCur ? 'Next' : 'Pending'}
                        </R>
                      </button>
                    );
                  })}
                </RuledBlock>
                <button
                  type="button"
                  disabled={isLocked || barWeight === null}
                  onClick={() => { if (barWeight !== null) { saveResultPatch(currentAthlete.id, { risingBarAttempts: { ...(r.risingBarAttempts ?? {}), [barWeight]: 'pass' }, didNotStart: false }); setPickedWeight(null); } }}
                  className={`${lineKey(!isLocked && barWeight !== null)} w-full text-[13px]`}
                >
                  {barWeight !== null ? `Pass ${barWeight} lb` : 'Pass'}
                </button>
              </>
            )}
            {type === 'max_weight' && (
              <Field label="Exact max weight override (lb)">
                <NumInput value={r.maxWeightLbs} disabled={isLocked} placeholder="Or type the exact max lift" ariaLabel="Exact max weight in pounds" onChange={(v) => saveResultPatch(currentAthlete.id, { maxWeightLbs: v ?? 0, didNotStart: false })} />
              </Field>
            )}

            {type === 'time_or_distance' && (
              <Row>
                <Field label={lane2 ? 'Lane 1 finish (s)' : 'Finish time (s)'}>
                  <NumInput step="0.01" placeholder="0.00" value={r.timeSeconds} disabled={isLocked} ariaLabel="Finish time seconds" onChange={(v) => saveResultPatch(currentAthlete.id, { timeSeconds: v ?? 0, didNotStart: false })} />
                </Field>
                <Field label="If DNF: distance (ft)">
                  <NumInput step="0.5" placeholder="e.g. 42.5" value={r.distanceFeet} disabled={isLocked} ariaLabel="Distance in feet" onChange={(v) => saveResultPatch(currentAthlete.id, { distanceFeet: v ?? 0, didNotStart: false })} />
                </Field>
              </Row>
            )}
          </>
        )}

        {/* ---------- lane 2 (head-to-head) ---------- */}
        {lane2 && lane2Athlete && lane2Result && (
          <RuledBlock columns="minmax(0,1fr) auto">
            <div className="px-2 py-1.5 min-w-0">
              <div className={`text-[10px] ${CAP}`}>Lane 2 · head-to-head</div>
              <div className="text-[16px] font-bold leading-tight">Lot {lane2Athlete.lotNumber} {lane2Athlete.name}</div>
            </div>
            <div className="px-2 py-1.5 flex items-center">
              <select
                value={lane2Athlete.id}
                onChange={(e) => setLane2AthleteId(e.target.value)}
                aria-label="Pair lane 2 with"
                className="zt-input font-sheet text-[12px] min-h-[36px] py-1 w-auto"
              >
                {divisionAthletes.filter((a) => a.id !== currentAthlete.id).map((a) => (
                  <option key={a.id} value={a.id}>Pair: {a.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2 p-2 grid grid-cols-2 gap-2">
              <Field label="Lane 2 finish (s)">
                <NumInput step="0.01" placeholder="0.00" value={lane2Result.timeSeconds} disabled={isLocked} ariaLabel="Lane 2 finish seconds" onChange={(v) => saveResultPatch(lane2Athlete.id, { timeSeconds: v ?? 0 })} />
              </Field>
              <Field label="If DNF: distance (ft)">
                <NumInput step="0.5" placeholder="e.g. 51.0" value={lane2Result.distanceFeet} disabled={isLocked} ariaLabel="Lane 2 distance in feet" onChange={(v) => saveResultPatch(lane2Athlete.id, { distanceFeet: v ?? 0 })} />
              </Field>
              <button type="button" disabled={isLocked} onClick={() => saveResultPatch(lane2Athlete.id, { timeSeconds: getElapsedSeconds() })} className={`${lineKey(!isLocked)} text-[13px] min-h-[44px]`}>
                Lane 2 finish at clock
              </button>
              <button type="button" disabled={isLocked} onClick={() => saveResultPatch(lane2Athlete.id, { timeSeconds: 0 })} className={`${KEY} text-[13px] min-h-[44px] ${isLocked ? 'zt-key-off' : 'bg-sheet text-redpen border-[3px] border-redpen'}`}>
                <span aria-hidden="true" className="font-normal">&#x2715;</span> Lane 2 DNF
              </button>
            </div>
          </RuledBlock>
        )}

        {/* ---------- clock + undo, order toggle ---------- */}
        <Row>
          <button type="button" disabled={isLocked} onClick={toggleTimer} className={isLocked ? OFF : PEN}>
            {timerRunning ? 'Stop clock' : 'Start clock'}
          </button>
          <button type="button" disabled={isLocked || !canUndo(ev, r)} onClick={undo} className={lineKey(!isLocked && canUndo(ev, r))}>
            Undo last
          </button>
        </Row>
        {type === 'time_or_implements' && !isLocked && !timerRunning && done < stoneCount && entered && (
          <button
            type="button"
            onClick={() => saveResultPatch(currentAthlete.id, { implementsCompleted: stoneCount, timeSeconds: getElapsedSeconds(), didNotStart: false })}
            className={`${LINE} w-full text-[13px]`}
          >
            Finished all {stoneCount} at {formatSeconds(getElapsedSeconds()) || '0.00 s'}
          </button>
        )}
        <button type="button" onClick={() => setOrderPinned(!showOrder)} aria-pressed={showOrder} className={`${LINE} w-full min-h-[40px] text-[12px]`}>
          {showOrder ? (entered || isLocked ? 'Back to the score sheet' : 'Hide run order') : 'Run order'}
        </button>

        {/* ---------- lock ---------- */}
        {isLocked ? (
          <>
            <button type="button" onClick={unlockScore} className={`${LINE} w-full`}>Unlock to edit</button>
            {nextRunItem ? (
              <button type="button" onClick={() => selectRunOrderItem(nextRunItem)} className={`${INK} w-full text-[14px]`}>
                Go to Lot {nextRunItem.athlete.lotNumber} {nextRunItem.athlete.name} <span aria-hidden="true">&rarr;</span>
              </button>
            ) : nextSetup ? (
              <button type="button" onClick={goToNextSetup} className={`${INK} w-full text-[14px]`}>
                Go to {nextSetup.division.name}{nextSetup.event.id !== ev.id ? ` (${nextSetup.event.name})` : ''} <span aria-hidden="true">&rarr;</span>
              </button>
            ) : null}
          </>
        ) : (
          <button type="button" onClick={lockAndAdvance} className={`${LINE} w-full text-[14px]`}>
            {nextRunItem ? 'Lock score & advance to next athlete' : nextSetup ? 'Lock score & advance to next group' : 'Lock score'}
          </button>
        )}
      </div>

      {/* ---------- bottom: up next, judge keys, title block ---------- */}
      <div className="mt-auto">
        <RuledBlock columns="86px minmax(0,1fr)" className="border-x-0 border-b-0">
          <div className={`px-2 flex items-center text-[11px] min-h-[33px] ${CAP}`}>Up next</div>
          <div className="px-2 flex items-center text-[14px] font-bold min-h-[33px] whitespace-nowrap overflow-hidden text-ellipsis">{nextLabel}</div>
        </RuledBlock>
        <div className="grid grid-cols-2 gap-2 p-2 border-t-2 border-rule">
          <GoodLiftKey label={labels.good} onClick={() => press('good')} disabled={!keysLive} className={`min-h-[112px] text-[22px] ${keysLive ? '' : 'zt-key-off !opacity-100'}`} />
          <NoLiftKey label={labels.no} onClick={() => press('no')} disabled={!keysLive} className={`min-h-[112px] text-[22px] ${keysLive ? '' : 'zt-key-off !opacity-100 !border-2'}`} />
        </div>
        {chrome && <TitleBlock
          columns="40px minmax(0,1fr) minmax(0,1fr)"
          rows="30px 30px"
          logoSize={30}
          valueClass="text-[11px] font-bold whitespace-nowrap overflow-hidden text-ellipsis"
          className="[&_.text-\[13px\]]:text-[9px] [&_.mb-1]:mb-0"
          fields={[
            { cap: 'Title', value: meet.name },
            { cap: 'Sheet', value: `E${ev.eventNumber}${eventCount ? ` of ${eventCount}` : ''}` },
            { cap: 'Rev', value: <>{rev} {isLocked ? 'Locked' : 'Provisional'}</> },
            { cap: 'Division', value: currentDivision.name },
          ]}
        />}
      </div>
    </div>
  );
}
