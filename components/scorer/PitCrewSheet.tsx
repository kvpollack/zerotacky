'use client';
// Phase 5 (11/2): the floor view in the sheet grammar (port of pitcrew/PitCrew.jsx, same props). Load card as a ruled
// block: target, load per point, the plate stack as ink keys; the rack / pin callout; the next-group transition list
// (Astra DR-05: the next lifter and the next group's setup change stay labelled apart). Copy unchanged.
import React from 'react';
import type { Athlete, Division, EventDef, RunOrderItem } from '@/lib/types';
import { RuledBlock } from '@/components/sheet';
import { CAP, Field, Key, KeyGroup, LH, LR, Note, Sec, TextInput, NumInput, Toast, Val } from './parts';

type PlateLoad = {
  callOutLabel: string; targetInputWeight: number; weightPerLoadingPoint: number; totalSystemWeight: number; collarWeightApplied: number;
  loadingPoints: number; platesPerPoint: Array<{ weight: number; count: number }>; warningMessage?: string | null;
};
type Callout = { headline: string; stats?: Array<{ label: string; value: string }> } | null;

/** "50 ft", "265 lbs", "44\" bar": a number stays on the same line as its unit when the cell wraps (Astra DR3-07). */
function keepUnits(s: string): string {
  return String(s).replace(/(\d)\s+(?=(lbs?|lb|kg|ft|in|s|sec|m|cm|mm|"|'|x|reps?)\b)/gi, '$1\u00a0');
}
type TransitionRow = { label: string; from: string; to: string; delta: string; changed: boolean };

export type PitCrewSheetProps = {
  layout?: 'phone' | 'tv';
  toggleLayout?: () => void;
  currentAthlete?: Athlete | null;
  currentDivision: Division;
  currentEvent: EventDef;
  nextRunItem?: RunOrderItem | null;
  nextSetup?: { division: Division; event: EventDef } | null;
  onDeckPinHeight?: string | null;
  pitCrewCallout: Callout;
  pitCrewCustomWeight: string;
  pitCrewUseLightTier: boolean;
  plateLoad: PlateLoad | null;
  setPitCrewCustomWeight: (w: string) => void;
  setPitCrewUseLightTier: (b: boolean) => void;
  transitionRows: TransitionRow[];
  upNowPinHeight?: string | null;
  updateAthleteRackPin: (athleteId: string, eventId: string, v: string) => void;
  readOnly?: boolean;
};

export default function PitCrewSheet(p: PitCrewSheetProps) {
  const { currentAthlete, currentDivision, currentEvent: ev, plateLoad, nextRunItem, nextSetup, readOnly = false } = p;
  const tv = p.layout === 'tv';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = ev as any;
  if (!plateLoad) return null;
  const big = tv ? '!text-[32px]' : '!text-[24px]';

  return (
    <div className={tv ? 'grid grid-cols-1 lg:grid-cols-5 gap-2 items-start' : 'flex flex-col gap-2'}>
      <div className={`flex flex-col gap-2 ${tv ? 'lg:col-span-3' : ''}`}>
        {e.hasHeightCallout && currentAthlete && (
          <>
            <Sec right={currentDivision.name}>{e.heightLabel || 'Implement Rack / Pin Height'}</Sec>
            <RuledBlock columns="minmax(0,1fr) minmax(0,1fr)">
              <Field label={<>Up now &middot; {currentAthlete.name}</>}><Val className="!text-[20px] !whitespace-normal">{p.upNowPinHeight || '\u2014'}</Val></Field>
              <Field label={<>On deck &middot; {nextRunItem ? nextRunItem.athlete.name : 'End of Division'}</>}><Val className="!text-[20px] !text-ink !whitespace-normal">{p.onDeckPinHeight || '\u2014'}</Val></Field>
              <Field wide label={readOnly ? `${currentAthlete.name}'s Personal Pin / Height` : `Update ${currentAthlete.name}'s Personal Pin / Height Override`}>
                {readOnly ? (
                  <Val className="!whitespace-normal" empty={!currentAthlete.rackHeights?.[ev.id]}>{currentAthlete.rackHeights?.[ev.id] || 'not set'}</Val>
                ) : (
                  <TextInput type="text" placeholder={'e.g., Pin 14 (6\'4") or 48" Bar...'} value={currentAthlete.rackHeights?.[ev.id] || ''} onChange={(x) => p.updateAthleteRackPin(currentAthlete.id, ev.id, x.target.value)} />
                )}
              </Field>
            </RuledBlock>
          </>
        )}

        <Sec right={<>Empty Tare <span className="text-pen font-bold">{e.implementEmptyWeight} lbs</span></>}>{plateLoad.callOutLabel} &middot; {ev.name}</Sec>
        {e.hasTrumpWeight && (
          <KeyGroup
            ariaLabel="Bar tier"
            disabled={readOnly}
            value={p.pitCrewUseLightTier ? 'light' : 'heavy'}
            onChange={(v) => { p.setPitCrewUseLightTier(v === 'light'); p.setPitCrewCustomWeight(''); }}
            options={[
              { value: 'heavy', label: `Heavy Bar (${e.divisionWeights?.[currentDivision.id]} lbs)` },
              { value: 'light', label: `Light Bar (${e.divisionLightWeights?.[currentDivision.id]} lbs)` },
            ]}
          />
        )}
        {p.pitCrewCallout && (
          <RuledBlock columns="minmax(0,1fr) minmax(0,1fr)">
            <div className="col-span-full px-2 py-1.5 flex items-baseline justify-between gap-2">
              <span className={`text-[10px] ${CAP}`}>{e.pitCrewCallout?.title}</span>
              <span className="text-[10px] font-bold">{currentDivision.name} &middot; Flight {currentDivision.flight}</span>
            </div>
            <div className={`col-span-full px-2 py-1.5 font-bold leading-tight text-balance ${tv ? 'text-[28px]' : 'text-[20px]'}`}>{p.pitCrewCallout.headline}</div>
            {p.pitCrewCallout.stats?.map((s) => (
              <Field key={s.label} label={s.label}><Val className="!text-[18px] !whitespace-normal">{keepUnits(s.value)}</Val></Field>
            ))}
          </RuledBlock>
        )}

        {e.loadingPoints === 0 ? (
          p.pitCrewCallout ? null : (
            <RuledBlock columns="minmax(0,1fr)">
              <Field label="Fixed Implement Layout (No Plate Math)"><Val className="!text-[16px] !whitespace-normal">{e.fixedImplementDescription || `Load ${plateLoad.targetInputWeight} lb Implement`}</Val></Field>
            </RuledBlock>
          )
        ) : (
          <>
            <RuledBlock columns="minmax(0,1fr) minmax(0,1fr)">
              <Field label={e.weightIsAddedPlatesOnly ? 'Added Plate Weight' : e.weightEntryMode === 'per_hand' ? 'Target Per Hand' : 'Target Total Weight'} note={plateLoad.collarWeightApplied > 0 ? `Includes ${plateLoad.collarWeightApplied} lb collars` : undefined}>
                <Val className={`${big} !text-ink`}>{plateLoad.targetInputWeight} lbs</Val>
              </Field>
              <Field label={`Load ${plateLoad.callOutLabel}`} note={`Total System: ${plateLoad.totalSystemWeight} lbs`}>
                <Val className={big}>{plateLoad.weightPerLoadingPoint} lbs</Val>
              </Field>
              <div className="col-span-full px-2 py-2">
                <div className={`text-[10px] mb-1.5 ${CAP}`}>Plates on EACH Loading Point ({plateLoad.loadingPoints} Points Total):</div>
                {plateLoad.platesPerPoint.length === 0 ? (
                  <div className="text-[13px] font-bold text-ink-muted">Empty Implement Only (No Plates Needed)</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {plateLoad.platesPerPoint.map((pl) => (
                      <span key={pl.weight} className={`bg-ink text-sheet font-bold px-3 flex items-baseline gap-1.5 ${tv ? 'text-[26px] min-h-[56px]' : 'text-[20px] min-h-[48px]'}`}>
                        <span>{pl.count}&times;</span><span className="text-[0.8em]">{pl.weight} lb</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {!readOnly && (
                <Field wide label="Custom Target Weight Override (Test Rising Bar / Odd Yoke Jumps)">
                  <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                    <NumInput placeholder="Enter any target weight in lbs..." value={p.pitCrewCustomWeight} onChange={p.setPitCrewCustomWeight} aria-label="Custom target weight in lbs" />
                    {p.pitCrewCustomWeight && <Key size="sm" onClick={() => p.setPitCrewCustomWeight('')}>Clear</Key>}
                  </div>
                </Field>
              )}
            </RuledBlock>
            {plateLoad.warningMessage && <Toast cap="Check" tone="red">{plateLoad.warningMessage}</Toast>}
          </>
        )}
        {p.toggleLayout && (
          <Key size="sm" onClick={p.toggleLayout} aria-pressed={tv} title={tv ? 'Switch to phone layout' : 'Switch to TV / projector layout'}>{tv ? 'Phone layout' : 'TV / projector layout'}</Key>
        )}
      </div>

      <section aria-label="Next group transition" className={`flex flex-col gap-2 ${tv ? 'lg:col-span-2' : ''}`}>
        <Sec right={nextSetup ? (nextSetup.event.id === ev.id ? `Next group: ${nextSetup.division.name}` : `Next: Ev ${nextSetup.event.eventNumber} · ${nextSetup.division.name}`) : undefined}>Next Group / Lifter Transition</Sec>
        {nextRunItem && nextRunItem.athlete.divisionId === currentDivision.id && (
          <RuledBlock columns="minmax(0,1fr)">
            <Field label={`Still in ${currentDivision.name}`}>
              <span className="text-[12px] normal-case"><span className={CAP}>Next lifter: </span><b>{nextRunItem.athlete.name}</b> &mdash; same weight setup{p.onDeckPinHeight && p.onDeckPinHeight !== p.upNowPinHeight ? ` (Pin changes: ${p.upNowPinHeight} → ${p.onDeckPinHeight})` : ', no change.'}</span>
            </Field>
          </RuledBlock>
        )}
        {nextSetup ? (
          <RuledBlock columns="minmax(0,1fr) minmax(84px,32%)" role="list" aria-label={`Setup change for ${nextSetup.division.name}`}>
            <LH className="col-span-full">{nextSetup.event.id === ev.id ? `When ${nextSetup.division.name} starts` : `When Ev ${nextSetup.event.eventNumber} starts (${nextSetup.division.name})`}</LH>
            {p.transitionRows.map((row) => (
              <div key={row.label} role="listitem" className="contents">
                <div className="px-1.5 py-1 min-w-0">
                  <div className={`text-[9px] ${CAP}`}>{row.label}</div>
                  {/* Astra DR3-07 (11/3): full setup text, wrapping, numbers kept with their units; no ellipsis a loader has to guess past. */}
                  <div className="text-[13px] min-w-0 leading-snug"><span className="text-ink-muted">{keepUnits(row.from)}</span> <span aria-hidden="true">&rarr;</span> <span className={`font-bold ${row.changed ? 'text-pen' : ''}`}>{keepUnits(row.to)}</span></div>
                </div>
                <LR className={`text-[11px] font-bold !whitespace-normal !overflow-visible justify-end text-right leading-snug py-1 ${row.changed ? 'text-pen' : 'text-ink-muted'}`}>{keepUnits(row.delta)}</LR>
              </div>
            ))}
          </RuledBlock>
        ) : (
          <Note>Final group of the final event on this station &mdash; no further changeover.</Note>
        )}
      </section>
    </div>
  );
}
