'use client';

import { Lock, Palette, RotateCcw } from 'lucide-react';
import { THEMES } from '@/lib/constants';
import { DEFAULT_PRESET_ID } from '@/lib/presets';
import BackupPanel from './BackupPanel';
import SyncPanel from './SyncPanel';
import MeetSection from './builder/MeetSection';
import DivisionsSection from './builder/DivisionsSection';
import EventsSection from './builder/EventsSection';
import AthletesSection from './builder/AthletesSection';
import MeetsSection from './builder/MeetsSection';

export default function MeetSetup({
  state,
  meet,
  divisions,
  events,
  athletes,
  results,
  snapshots,
  themeId,
  selectTheme,
  lockDeviceToRole,
  updateMeetConfig,
  toggleGymPlate,
  addStation,
  updateStation,
  removeStation,
  addDivision,
  updateDivision,
  removeDivision,
  reorderDivisions,
  addEvent,
  updateEvent,
  removeEvent,
  reorderEvents,
  addAthlete,
  bulkAddAthletes,
  updateAthlete,
  removeAthlete,
  moveAthlete,
  shuffleLots,
  toggleAthleteWithdrawn,
  createNewBlankMeet,
  pendingPresetId,
  setPendingPresetId,
  requestMeetPreset,
  loadMeetPreset,
  importMeetState,
  restoreSnapshot,
  clearResults,
  resetConfirmOpen,
  setResetConfirmOpen,
  sync,
}) {
  const isDemo = Boolean(meet.isDemo);

  return (
    <div className="space-y-4">
      {/* Volunteer Phone Role Lock & Promoter Theme */}
      <div className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-4">
        <div className="bg-zt-inset border border-zt-border rounded-xl p-3 space-y-2.5">
          <div className="flex justify-between items-center">
            <span className="text-xs font-extrabold uppercase text-zt-primary flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              Volunteer Phone Role Lock
            </span>
            <span className="text-[10px] font-bold text-zt-muted">
              Unlock PIN: {meet.adminPin || '1050'}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => lockDeviceToRole('judge')}
              className="py-2.5 px-2 rounded-xl font-black text-xs bg-zt-surface border border-zt-primary/60 text-zt-text active:scale-95"
            >
              Lock Judge
            </button>
            <button
              type="button"
              onClick={() => lockDeviceToRole('pitcrew')}
              className="py-2.5 px-2 rounded-xl font-black text-xs bg-zt-surface border border-zt-secondary/60 text-zt-text active:scale-95"
            >
              Lock Pit Crew
            </button>
            <button
              type="button"
              onClick={() => lockDeviceToRole('spectator')}
              className="py-2.5 px-2 rounded-xl font-black text-xs bg-zt-surface border border-zt-border-strong text-zt-text active:scale-95"
            >
              Lock Spectator
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-2">
            <span
              id="theme-picker-label"
              className="text-xs font-extrabold uppercase text-zt-muted flex items-center gap-1.5"
            >
              <Palette className="w-3.5 h-3.5" aria-hidden="true" />
              Promoter Theme
            </span>
            <span className="text-[10px] font-bold text-zt-subtle">
              {THEMES.find((t) => t.id === themeId)?.name}
            </span>
          </div>
          <div
            role="radiogroup"
            aria-labelledby="theme-picker-label"
            className="grid grid-cols-2 gap-2 mt-1.5"
          >
            {THEMES.map((t) => {
              const active = t.id === themeId;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => selectTheme(t.id)}
                  className={`p-2 rounded-xl border-2 text-left flex items-center gap-2.5 bg-zt-inset transition active:scale-[0.98] ${
                    active ? 'border-zt-primary' : 'border-zt-border'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="w-11 h-11 rounded-lg flex-shrink-0 flex flex-col justify-end gap-1 p-1.5 border border-black/20"
                    style={{ backgroundColor: t.surface }}
                  >
                    <span
                      className="h-1.5 rounded-full w-full"
                      style={{ backgroundColor: t.primary }}
                    />
                    <span
                      className="h-1.5 rounded-full w-2/3"
                      style={{ backgroundColor: t.secondary }}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-black text-zt-text truncate">
                      {t.name}
                    </span>
                    <span className="block text-[10px] font-bold text-zt-muted leading-tight">
                      {t.tagline}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 1. Meet Section */}
      <MeetSection
        meet={meet}
        divisions={divisions}
        updateMeetConfig={updateMeetConfig}
        toggleGymPlate={toggleGymPlate}
        addStation={addStation}
        updateStation={updateStation}
        removeStation={removeStation}
      />

      {/* 2. Divisions Section */}
      <DivisionsSection
        meet={meet}
        divisions={divisions}
        athletes={athletes}
        results={results}
        addDivision={addDivision}
        updateDivision={updateDivision}
        removeDivision={removeDivision}
        reorderDivisions={reorderDivisions}
      />

      {/* 3. Events Section */}
      <EventsSection
        divisions={divisions}
        events={events}
        results={results}
        addEvent={addEvent}
        updateEvent={updateEvent}
        removeEvent={removeEvent}
        reorderEvents={reorderEvents}
      />

      {/* 4. Athletes Section */}
      <AthletesSection
        divisions={divisions}
        athletes={athletes}
        results={results}
        addAthlete={addAthlete}
        bulkAddAthletes={bulkAddAthletes}
        updateAthlete={updateAthlete}
        removeAthlete={removeAthlete}
        moveAthlete={moveAthlete}
        shuffleLots={shuffleLots}
        toggleAthleteWithdrawn={toggleAthleteWithdrawn}
      />

      {/* 5. Meets, Demo Presets & Validation Section */}
      <MeetsSection
        state={state}
        meet={meet}
        results={results}
        pendingPresetId={pendingPresetId}
        setPendingPresetId={setPendingPresetId}
        requestMeetPreset={requestMeetPreset}
        loadMeetPreset={loadMeetPreset}
        createNewBlankMeet={createNewBlankMeet}
      />

      {/* 6. Backup Panel & Reset / Clear Scores */}
      <div className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-4">
        <BackupPanel
          state={state}
          snapshots={snapshots}
          importMeetState={importMeetState}
          restoreSnapshot={restoreSnapshot}
        />

        <SyncPanel sync={sync} meet={meet} />

        <div className="pt-2 border-t border-zt-border">
          {!resetConfirmOpen ? (
            <button
              type="button"
              onClick={() => setResetConfirmOpen(true)}
              className="w-full py-3 rounded-xl bg-zt-danger/10 border border-zt-danger/60 text-zt-danger-text font-extrabold text-xs uppercase flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              {isDemo ? 'Reset this meet to its preset' : 'Clear all scores'}
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isDemo) {
                    loadMeetPreset(meet.presetId ?? DEFAULT_PRESET_ID);
                  } else {
                    clearResults();
                    setResetConfirmOpen(false);
                  }
                }}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-black text-xs uppercase"
              >
                {isDemo ? 'Confirm Preset Reset' : 'Confirm Clear All Scores'}
              </button>
              <button
                type="button"
                onClick={() => setResetConfirmOpen(false)}
                className="px-4 py-3 rounded-xl bg-zt-surface-2 text-zt-text-2 font-bold text-xs uppercase"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}