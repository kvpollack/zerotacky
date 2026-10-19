'use client';

import {
  Lock,
  Moon,
  Sun,
} from 'lucide-react';
import SyncDot from './SyncDot';

export default function Header({
  athletes,
  currentDivision,
  currentEvent,
  divisions,
  events,
  filteredDivisions,
  handleUnlockWithPin,
  isDaylight,
  meet,
  pinError,
  pinInput,
  pinPromptOpen,
  roleLock,
  setPinError,
  setPinInput,
  setPinPromptOpen,
  setPitCrewCustomWeight,
  setSelectedAthleteId,
  setSelectedDivisionId,
  setSelectedEventId,
  setStationFlight,
  stationFlight,
  sync,
  toggleDaylight,
}) {
  const stations =
    Array.isArray(meet.stations) && meet.stations.length > 0
      ? meet.stations
      : [
          { id: 'A', label: 'Station 1' },
          { id: 'B', label: 'Station 2' },
        ];

  const stationIds = new Set(stations.map((s) => s.id));
  const stationLabelMap = new Map(stations.map((s) => [s.id, s.label]));

  return (
    <header className="bg-zt-surface/95 backdrop-blur border-b border-zt-border px-3.5 py-3 sticky top-0 z-20 shadow-lg">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <SyncDot sync={sync} placement="header" />
              <span className="text-[10px] font-black uppercase tracking-widest text-zt-primary">
                ZEROTACKY
              </span>
              {meet.isDemo && (
                <span className="text-sm font-black uppercase tracking-widest px-2 py-0.5 rounded bg-amber-500 text-black border border-amber-300" title="Demo meet: hidden from the public list. Meet Setup > Meet Details has the switch.">
                  DEMO
                </span>
              )}
              {roleLock !== 'admin' && (
                <button
                  type="button"
                  onClick={() => setPinPromptOpen((o) => !o)}
                  className="text-[10px] font-black uppercase bg-red-600 text-white px-2 py-0.5 rounded flex items-center gap-1"
                >
                  <Lock className="w-2.5 h-2.5" />
                  {roleLock.toUpperCase()} LOCKED • UNLOCK
                </button>
              )}
            </div>
            <h1 className="text-base sm:text-lg font-black truncate text-zt-text">{meet.name}</h1>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={toggleDaylight}
              aria-pressed={isDaylight}
              aria-label={isDaylight ? 'Switch back to dark theme' : 'Switch to Outdoor Daylight theme'}
              title={isDaylight ? 'Dark mode' : 'Sun / Daylight mode'}
              className={`p-2.5 rounded-xl border transition active:scale-95 ${
                isDaylight
                  ? 'bg-zt-primary text-zt-on-primary border-zt-primary'
                  : 'bg-zt-inset text-zt-primary border-zt-border'
              }`}
            >
              {isDaylight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>

            {/* Concurrent Station / Flight Selector Driven by meet.stations */}
            <div className="flex bg-zt-inset p-1 rounded-xl border border-zt-border text-xs font-extrabold flex-shrink-0">
              {[...stations.map((s) => ({ id: s.id, label: s.label })), { id: 'ALL', label: 'All' }].map(
                (item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setStationFlight(item.id);
                      const firstDiv = divisions.find((d) =>
                        item.id === 'ALL'
                          ? true
                          : d.flight === item.id
                      );
                      if (firstDiv) {
                        setSelectedDivisionId(firstDiv.id);
                        const firstAth = athletes.find(
                          (a) => a.divisionId === firstDiv.id && a.status === 'active'
                        );
                        if (firstAth) setSelectedAthleteId(firstAth.id);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-lg transition ${
                      stationFlight === item.id
                        ? 'bg-zt-primary text-zt-on-primary shadow'
                        : 'text-zt-muted hover:text-zt-text-2'
                    }`}
                  >
                    {item.label}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Inline Admin PIN Unlock Prompt */}
        {pinPromptOpen && (
          <div className="mt-2.5 p-2.5 bg-zt-inset border border-zt-primary rounded-xl flex items-center gap-2">
            <input
              type="password"
              inputMode="numeric"
              placeholder="Enter Promoter PIN"
              value={pinInput}
              onChange={(e) => {
                setPinInput(e.target.value);
                setPinError(false);
              }}
              className="flex-1 bg-zt-surface border border-zt-border-strong rounded-lg px-3 py-1.5 text-sm font-bold text-zt-text"
            />
            <button
              type="button"
              onClick={handleUnlockWithPin}
              className="bg-zt-primary text-zt-on-primary font-black text-xs uppercase px-3 py-2 rounded-lg"
            >
              Unlock
            </button>
            <button
              type="button"
              onClick={() => {
                setPinPromptOpen(false);
                setPinError(false);
              }}
              className="bg-zt-surface-2 text-zt-text-2 font-bold text-xs px-2.5 py-2 rounded-lg"
            >
              Cancel
            </button>
            {pinError && <span className="text-xs font-bold text-red-400">{typeof pinError === 'string' ? pinError : 'Wrong PIN'}</span>}
          </div>
        )}

        {/* Division & Event Selectors */}
        <div className="grid grid-cols-2 gap-2 mt-2.5">
          <select
            value={currentDivision?.id ?? ''}
            disabled={filteredDivisions.length === 0}
            onChange={(e) => {
              const nextDivId = e.target.value;
              setSelectedDivisionId(nextDivId);
              const firstAth = athletes.find(
                (a) => a.divisionId === nextDivId && a.status === 'active'
              );
              if (firstAth) setSelectedAthleteId(firstAth.id);
            }}
            className="bg-zt-inset border border-zt-border-strong rounded-xl px-2.5 py-2 text-xs sm:text-sm font-bold text-zt-text focus:outline-none focus:border-zt-primary disabled:opacity-50"
          >
            {filteredDivisions.length === 0 ? (
              <option value="">No Divisions</option>
            ) : (
              filteredDivisions.map((d) => {
                const stLabel = stationIds.has(d.flight)
                  ? stationLabelMap.get(d.flight) || `Flight ${d.flight}`
                  : `Unassigned (${d.flight})`;
                return (
                  <option key={d.id} value={d.id}>
                    [{stLabel}] {d.name}
                  </option>
                );
              })
            )}
          </select>

          <select
            value={currentEvent?.id ?? ''}
            disabled={events.length === 0}
            onChange={(e) => {
              setSelectedEventId(e.target.value);
              setPitCrewCustomWeight('');
            }}
            className="bg-zt-inset border border-zt-border-strong rounded-xl px-2.5 py-2 text-xs sm:text-sm font-bold text-zt-primary focus:outline-none focus:border-zt-primary disabled:opacity-50"
          >
            {events.length === 0 ? (
              <option value="">No Events</option>
            ) : (
              events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  Ev {ev.eventNumber}: {ev.name}
                </option>
              ))
            )}
          </select>
        </div>
      </div>
    </header>
  );
}