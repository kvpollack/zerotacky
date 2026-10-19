'use client';

import { useState } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';

// Step 3 (Kurt 10/19): stations live after divisions. Divisions get nailed down first; how many stations run, and
// which divisions share one, is decided later from sign-ups and floor space. A division's `flight` is its station id.
export default function StationsSection({
  meet,
  divisions,
  athletes,
  addStation,
  updateStation,
  removeStation,
  updateDivision,
}) {
  const [newStationLabel, setNewStationLabel] = useState('');

  const stations =
    Array.isArray(meet.stations) && meet.stations.length > 0
      ? meet.stations
      : [
          { id: 'A', label: 'Station 1' },
          { id: 'B', label: 'Station 2' },
        ];
  const stationIds = new Set(stations.map((s) => s.id));
  const sortedDivisions = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder);
  const athleteCount = (divId) => athletes.filter((a) => a.divisionId === divId && a.status === 'active').length;
  const unassigned = sortedDivisions.filter((d) => !stationIds.has(d.flight));

  const handleAddStation = (e) => {
    e.preventDefault();
    addStation({ label: newStationLabel.trim() || `Station ${stations.length + 1}` });
    setNewStationLabel('');
  };

  return (
    <section className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-wider text-zt-primary">
          3. Stations &amp; Floor Plan ({stations.length})
        </h2>
        <span className="text-[10px] font-bold text-zt-subtle">Min 1 station</span>
      </div>
      <p className="text-xs font-semibold text-zt-text-2">
        A station is one set of implements running its own order. Divisions on the same station run back to back; two
        stations run at the same time. Decide this once sign-ups are in: a small meet is fine on one station.
      </p>

      {/* Station list */}
      <div className="space-y-2">
        {stations.map((st) => {
          const assigned = sortedDivisions.filter((d) => d.flight === st.id);
          const ath = assigned.reduce((n, d) => n + athleteCount(d.id), 0);
          return (
            <div key={st.id} className="bg-zt-inset border border-zt-border rounded-xl p-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-1 rounded bg-zt-surface-2 text-[11px] font-black text-zt-primary font-mono">{st.id}</span>
                <input
                  type="text"
                  value={st.label}
                  onChange={(e) => updateStation(st.id, { label: e.target.value })}
                  aria-label={`Station ${st.id} label`}
                  className="flex-1 min-w-0 bg-zt-surface border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-bold text-zt-text"
                />
                <span className="text-[10px] font-bold text-zt-muted whitespace-nowrap">
                  {assigned.length} div{assigned.length === 1 ? '' : 's'} · {ath} ath
                </span>
                <button
                  type="button"
                  disabled={stations.length <= 1}
                  onClick={() => removeStation(st.id)}
                  title={stations.length <= 1 ? 'At least 1 station required' : `Remove ${st.label}`}
                  aria-label={`Remove ${st.label}`}
                  className="p-1.5 rounded-lg bg-zt-surface border border-zt-border-strong text-zt-muted hover:text-red-400 disabled:opacity-30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              {assigned.length > 0 && (
                <div className="flex flex-wrap gap-1 pl-1">
                  {assigned.map((d) => (
                    <span key={d.id} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zt-surface border border-zt-border text-zt-text-2">
                      {d.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={handleAddStation} className="flex gap-2">
        <input
          type="text"
          placeholder={`New station label (e.g. Station ${stations.length + 1})...`}
          value={newStationLabel}
          onChange={(e) => setNewStationLabel(e.target.value)}
          className="flex-1 min-w-0 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
        />
        <button
          type="submit"
          className="px-3 py-2 rounded-xl bg-zt-surface-2 border border-zt-border-strong text-zt-text font-black text-xs uppercase flex items-center gap-1 flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Add Station
        </button>
      </form>

      {/* Assign divisions to stations */}
      <div className="pt-2 border-t border-zt-border space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-extrabold uppercase text-zt-muted">Assign divisions to stations</label>
          {unassigned.length > 0 && (
            <span className="text-[10px] font-black uppercase text-amber-400">{unassigned.length} unassigned</span>
          )}
        </div>
        {sortedDivisions.length === 0 ? (
          <p className="text-xs font-bold text-zt-muted bg-zt-inset border border-zt-border rounded-xl p-3">
            Add your divisions in step 2 first. Each one gets a station here.
          </p>
        ) : (
          <div className="space-y-1.5">
            {sortedDivisions.map((div) => {
              const invalid = !stationIds.has(div.flight);
              return (
                <div key={div.id} className="bg-zt-inset border border-zt-border rounded-xl p-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-zt-text truncate">{div.name}</span>
                    <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-zt-surface-2 text-zt-muted whitespace-nowrap">
                      {athleteCount(div.id)} ath
                    </span>
                  </div>
                  <div role="group" aria-label={`Station for ${div.name}`} className="flex flex-wrap gap-1.5">
                    {stations.map((s) => {
                      const on = div.flight === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => updateDivision(div.id, { flight: s.id })}
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-black border ${
                            on ? 'bg-zt-primary text-zt-on-primary border-zt-primary' : 'bg-zt-surface text-zt-text-2 border-zt-border-strong'
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                  {invalid && (
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400 px-1">
                      <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Station &ldquo;{div.flight}&rdquo; was removed; pick a station or this division shows under &ldquo;All&rdquo; only.</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
