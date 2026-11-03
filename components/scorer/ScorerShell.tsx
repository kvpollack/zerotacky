'use client';
// Phase 5 (11/2): the scorer's chrome as an engineering sheet (approved mockups scorer_*.html). The page is a sheet on
// the grey ground with the zone strips and the 2 px frame; inside it a sticky header block (meet | mode | SYNC, then
// the station chips and the division / event selects on the floor tabs), the screen, and at the bottom the nav strip
// over the title block. Never takes the promoter's colour.
import React from 'react';
import type { Athlete, Division, EventDef, Meet, Result } from '@/lib/types';
import type { Mode } from '@/lib/theme/promoter';
import { hasCustomEventOrder, stationById, stationEvents, stationForDivision, stationPosition } from '@/lib/engine';
import { revFor } from '@/lib/tv/model';
import { RuledBlock, TitleBlock } from '@/components/sheet';
import { syncLabel, type SyncStatus } from '@/components/judge/padModel';
import { CAP, Key, TextInput } from './parts';
import { divisionOption, navTabs, ordinal, sheetLabel, stationChips, type RoleLock, type SetupSectionId, type Tab } from './scorerModel';

const ZONE_COLS = ['1', '2', '3', '4', '5', '6', '7', '8'];
const ZONE_ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function ScorerFrame({ mode, children }: { mode: Mode; children: React.ReactNode }) {
  return (
    <div data-zt-sheet data-zt-mode={mode} className="font-sheet uppercase text-ink bg-ground min-h-screen p-2 leading-[1.15] antialiased select-none" style={{ fontSynthesis: 'none' }}>
      <div className="relative bg-sheet min-h-[calc(100vh-16px)] pl-4 pt-4 flex flex-col">
        <div aria-hidden="true" className="absolute left-4 top-0 right-0 h-4 flex text-[11px]">
          {ZONE_COLS.map((c, i) => <span key={c} className="flex-1 flex items-center justify-center" style={{ borderLeft: i ? '1px solid var(--rule)' : undefined }}>{c}</span>)}
        </div>
        <div aria-hidden="true" className="absolute left-0 top-4 bottom-0 w-4 flex flex-col text-[11px]">
          {ZONE_ROWS.map((r, i) => <span key={r} className="flex-1 flex items-center justify-center" style={{ borderTop: i ? '1px solid var(--rule)' : undefined }}>{r}</span>)}
        </div>
        <div className="border-2 border-rule flex-1 flex flex-col min-w-0">{children}</div>
      </div>
    </div>
  );
}

export type ScorerSync = { enabled?: boolean; status?: SyncStatus; link?: { slug: string; role: string } | null; syncNow?: () => void } | null | undefined;

export type ScorerHeaderProps = {
  tab: Tab;
  mode: Mode;
  toggleMode: () => void;
  meet: Meet;
  sync: ScorerSync;
  roleLock: RoleLock;
  athletes: Athlete[];
  divisions: Division[];
  filteredDivisions: Division[];
  events: EventDef[];
  currentDivision?: Division | null;
  currentEvent?: EventDef | null;
  stationFlight: string;
  setStationFlight: (id: string) => void;
  onPickStation?: (id: string) => void;
  setSelectedDivisionId: (id: string) => void;
  setSelectedAthleteId: (id: string) => void;
  setSelectedEventId: (id: string) => void;
  setPitCrewCustomWeight: (w: string) => void;
  pinPromptOpen: boolean;
  setPinPromptOpen: (fn: boolean | ((o: boolean) => boolean)) => void;
  pinInput: string;
  setPinInput: (s: string) => void;
  pinError: boolean | string;
  setPinError: (e: boolean | string) => void;
  handleUnlockWithPin: () => void;
};

const HCELL = 'px-2 flex items-center min-h-[22px] text-[12px] whitespace-nowrap overflow-hidden text-ellipsis';

export function ScorerHeader(p: ScorerHeaderProps) {
  const { tab, mode, toggleMode, meet, sync, roleLock } = p;
  const syncOn = !!sync?.enabled;
  const cell = syncLabel(syncOn, sync?.status);
  const chips = stationChips(meet);
  const pickerStation = stationById(meet, p.stationFlight) ?? stationForDivision(meet, p.currentDivision ?? undefined);
  const pickerEvents = stationEvents(pickerStation, p.events);
  const showPosition = hasCustomEventOrder(pickerStation, p.events);
  const floor = tab !== 'setup';

  const pickStation = (id: string) => {
    if (p.onPickStation) { p.onPickStation(id); return; }
    p.setStationFlight(id);
    const firstDiv = p.divisions.find((d) => (id === 'ALL' ? true : d.flight === id));
    if (firstDiv) {
      p.setSelectedDivisionId(firstDiv.id);
      p.setSelectedAthleteId('');
    }
  };

  return (
    <header className="sticky top-0 z-20 bg-sheet border-b-2 border-rule">
      <RuledBlock columns="minmax(0,1fr) 34px auto" className="border-0">
        <div className={`${HCELL} font-bold gap-1.5`}>
          <span className="min-w-0 overflow-hidden text-ellipsis">{meet.name}</span>
          {meet.isDemo && <span className="shrink-0 text-[9px] font-bold border border-rule px-1 leading-[14px]" title="Demo meet: hidden from the public list. Meet Setup > Meet Details has the switch.">Demo</span>}
          {roleLock !== 'admin' && (
            <button type="button" onClick={() => p.setPinPromptOpen((o) => !o)} className="shrink-0 text-[9px] font-bold text-redpen border border-redpen px-1 leading-[14px] font-sheet uppercase">
              {roleLock} locked &middot; Unlock
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={toggleMode}
          aria-pressed={mode === 'dark'}
          aria-label={mode === 'dark' ? 'Switch to Outdoor Daylight theme' : 'Switch back to dark theme'}
          title={mode === 'dark' ? 'Switch to Outdoor Daylight theme' : 'Switch back to dark theme'}
          className="flex items-center justify-center text-[13px] font-sheet"
        >
          <span aria-hidden="true">{mode === 'dark' ? '\u263D' : '\u2600'}</span>
        </button>
        <button
          type="button"
          onClick={() => sync?.syncNow?.()}
          disabled={!syncOn}
          aria-label={`Sync: ${cell.text}${syncOn ? '. Tap to sync now' : ''}`}
          className={`${HCELL} gap-1.5 text-[10px] font-sheet uppercase`}
        >
          <span aria-hidden="true" className={`inline-block w-2 h-2 border-[1.5px] ${cell.filled ? 'border-pen bg-pen' : 'border-redpen'}`} />
          <span className={cell.filled ? 'text-ink' : 'font-bold text-ink'}>{cell.text}</span>
          {sync?.link && <span className={CAP}>&middot; {sync.link.role}</span>}
        </button>
      </RuledBlock>

      {p.pinPromptOpen && (
        <div className="border-t border-rule p-2 flex items-center gap-2">
          <TextInput
            type="password"
            inputMode="numeric"
            placeholder="Enter Promoter PIN"
            value={p.pinInput}
            onChange={(e) => { p.setPinInput(e.target.value); p.setPinError(false); }}
            className="flex-1 !border-2 !border-rule"
            aria-label="Promoter PIN"
          />
          <Key variant="pen" size="sm" onClick={p.handleUnlockWithPin}>Unlock</Key>
          <Key size="sm" onClick={() => { p.setPinPromptOpen(false); p.setPinError(false); }}>Cancel</Key>
          {p.pinError && <span className="text-[11px] font-bold text-redpen">{typeof p.pinError === 'string' ? p.pinError : 'Wrong PIN'}</span>}
        </div>
      )}

      {floor && (
        <>
          <div role="tablist" aria-label="Station" className="border-t border-rule grid grid-flow-col auto-cols-fr gap-px bg-rule">
            {chips.map((c) => {
              const on = p.stationFlight === c.id;
              return (
                <button key={c.id} type="button" role="tab" aria-selected={on} onClick={() => pickStation(c.id)} className={`min-h-[30px] text-[10px] font-bold font-sheet uppercase px-1 whitespace-nowrap overflow-hidden ${on ? 'bg-ink text-sheet' : 'bg-sheet text-ink'}`}>
                  {c.label}
                </button>
              );
            })}
          </div>
          <div className="border-t border-rule grid grid-cols-2 gap-px bg-rule">
            <label className="bg-sheet px-2 py-1 flex flex-col justify-center min-h-[30px] relative">
              <span className={`text-[8px] leading-none ${CAP}`}>Division</span>
              <select
                value={p.currentDivision?.id ?? ''}
                disabled={p.filteredDivisions.length === 0}
                onChange={(e) => {
                  // Astra DR3-01 (11/3): an empty athlete id lets the generated run order pick lot 1; the first
                  // raw roster row is whatever order the server returned (Group 2 opened on lot 5).
                  p.setSelectedDivisionId(e.target.value);
                  p.setSelectedAthleteId('');
                }}
                className="font-sheet uppercase font-bold text-[11px] bg-transparent text-ink appearance-none w-full pr-4 disabled:opacity-50 focus:outline-none"
              >
                {p.filteredDivisions.length === 0 ? <option value="">No Divisions</option> : p.filteredDivisions.map((d) => <option key={d.id} value={d.id}>{p.stationFlight === 'ALL' ? divisionOption(d, chips) : d.name}</option>)}
              </select>
              <span aria-hidden="true" className="absolute right-2 bottom-1 text-[10px]">&#x25BE;</span>
            </label>
            <label className="bg-sheet px-2 py-1 flex flex-col justify-center min-h-[30px] relative">
              <span className={`text-[8px] leading-none ${CAP}`}>Event</span>
              <select
                value={p.currentEvent?.id ?? ''}
                disabled={p.events.length === 0}
                onChange={(e) => { p.setSelectedEventId(e.target.value); p.setPitCrewCustomWeight(''); }}
                className="font-sheet uppercase font-bold text-[11px] bg-transparent text-ink appearance-none w-full pr-4 disabled:opacity-50 focus:outline-none"
              >
                {p.events.length === 0 ? <option value="">No Events</option> : pickerEvents.map((ev, idx) => <option key={ev.id} value={ev.id}>{showPosition ? `${idx + 1}. ` : ''}Ev {ev.eventNumber}: {ev.name}</option>)}
              </select>
              <span aria-hidden="true" className="absolute right-2 bottom-1 text-[10px]">&#x25BE;</span>
            </label>
          </div>
          {showPosition && p.currentEvent && pickerStation && (
            <div className={`border-t border-rule px-2 min-h-[18px] flex items-center justify-end text-[10px] ${CAP}`}>
              Ev {p.currentEvent.eventNumber} runs {ordinal(stationPosition(pickerStation, p.events, p.currentEvent.id))} of {pickerEvents.length} on {pickerStation.label}
            </div>
          )}
        </>
      )}
    </header>
  );
}

export type ScorerNavProps = {
  tab: Tab;
  setTab: (t: Tab) => void;
  roleLock: RoleLock;
  meet: Meet;
  results: Result[];
  currentDivision?: Division | null;
  currentEvent?: EventDef | null;
  eventCount: number;
  setupSection?: SetupSectionId;
  /** Athletes of the current division: REV counts locks in this division (the pad's rule). */
  divisionAthletes?: Athlete[];
  /** The current athlete's score is locked (judge tab): REV reads Locked instead of Provisional. */
  locked?: boolean;
};

export function ScorerNav({ tab, setTab, roleLock, meet, results, currentDivision, currentEvent, eventCount, setupSection, divisionAthletes, locked }: ScorerNavProps) {
  const tabs = navTabs(roleLock);
  const rev = revFor(results, divisionAthletes);
  return (
    <div className="mt-auto flex flex-col">
      <TitleBlock
        columns="40px minmax(0,1fr) minmax(0,1fr)"
        rows="30px 30px"
        logoSize={30}
        valueClass="text-[11px] font-bold whitespace-nowrap overflow-hidden text-ellipsis"
        className="[&_.text-\[13px\]]:text-[9px] [&_.mb-1]:mb-0"
        fields={[
          { cap: 'Title', value: meet.name },
          { cap: 'Sheet', value: sheetLabel(tab, { event: currentEvent, eventCount, setupSection }) },
          { cap: 'Rev', value: <>{rev} {locked && tab === 'judge' ? 'Locked' : 'Provisional'}</> },
          { cap: 'Division', value: currentDivision?.name ?? '\u2014' },
        ]}
      />
      <nav aria-label="Scorer" className="sticky bottom-0 z-20 border-t-2 border-rule grid gap-px bg-rule" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0,1fr))` }}>
        {tabs.map((t) => {
          const on = tab === t.id;
          return (
            <button key={t.id} type="button" aria-current={on ? 'page' : undefined} onClick={() => setTab(t.id)} className={`min-h-[46px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-bold font-sheet uppercase ${on ? 'bg-ink text-sheet' : 'bg-sheet text-ink'}`}>
              <span aria-hidden="true" className="text-[14px] leading-none font-normal">{t.glyph}</span>
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
