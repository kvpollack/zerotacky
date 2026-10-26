'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp, AlertTriangle, Plus, Trash2 } from 'lucide-react';

export default function DivisionsSection({
  meet,
  divisions,
  athletes,
  results,
  addDivision,
  updateDivision,
  removeDivision,
  reorderDivisions,
}) {
  const stations =
    Array.isArray(meet.stations) && meet.stations.length > 0
      ? meet.stations
      : [
          { id: 'A', label: 'Station 1' },
          { id: 'B', label: 'Station 2' },
        ];
  const stationIds = new Set(stations.map((s) => s.id));

  const [newDivName, setNewDivName] = useState('');
  // New divisions land on the first station; the promoter spreads them across stations in step 4 (after events, 10/26).
  const newDivFlight = stations[0]?.id ?? 'A';
  const stationLabel = (id) => stations.find((s) => s.id === id)?.label ?? `Missing (${id})`;
  const [armedDeleteId, setArmedDeleteId] = useState(null);

  const sortedDivisions = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder);

  const handleAddDivision = (e) => {
    e.preventDefault();
    if (!newDivName.trim()) return;
    const validFlight = stationIds.has(newDivFlight) ? newDivFlight : stations[0]?.id ?? 'A';
    addDivision({ name: newDivName.trim(), flight: validFlight });
    setNewDivName('');
  };

  const moveDivision = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sortedDivisions.length) return;
    const ids = sortedDivisions.map((d) => d.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(targetIndex, 0, moved);
    reorderDivisions(ids);
  };

  return (
    <section className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-wider text-zt-primary">
          2. Divisions ({sortedDivisions.length})
        </h2>
        <span className="text-[10px] font-bold text-zt-muted">
          Stations are assigned in step 4
        </span>
      </div>

      {sortedDivisions.length === 0 ? (
        <p className="text-xs font-bold text-zt-muted bg-zt-inset border border-zt-border rounded-xl p-3">
          No divisions yet. Add your first division or weight class below.
        </p>
      ) : (
        <div className="space-y-2">
          {sortedDivisions.map((div, idx) => {
            const divAthletes = athletes.filter((a) => a.divisionId === div.id);
            const divAthIds = new Set(divAthletes.map((a) => a.id));
            const divResultCount = results.filter((r) => divAthIds.has(r.athleteId)).length;
            const invalidStation = !stationIds.has(div.flight);
            const isArmed = armedDeleteId === div.id;

            return (
              <div
                key={div.id}
                className="bg-zt-inset border border-zt-border rounded-xl p-2.5 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveDivision(idx, -1)}
                      aria-label={`Move ${div.name} up`}
                      className="p-1 rounded bg-zt-surface border border-zt-border text-zt-muted disabled:opacity-30"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === sortedDivisions.length - 1}
                      onClick={() => moveDivision(idx, 1)}
                      aria-label={`Move ${div.name} down`}
                      className="p-1 rounded bg-zt-surface border border-zt-border text-zt-muted disabled:opacity-30"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>

                  <input
                    type="text"
                    value={div.name}
                    onChange={(e) => updateDivision(div.id, { name: e.target.value })}
                    aria-label="Division name"
                    className="flex-1 min-w-0 bg-zt-surface border border-zt-border-strong rounded-lg px-2.5 py-1.5 text-xs font-black text-zt-text"
                  />

                  <span
                    className={`text-[10px] font-extrabold px-2 py-1 rounded whitespace-nowrap ${invalidStation ? 'bg-amber-500/15 text-amber-400' : 'bg-zt-surface-2 text-zt-primary'}`}
                    title="Station (set in step 4)"
                  >
                    {stationLabel(div.flight)}
                  </span>

                  <span className="text-[10px] font-extrabold px-2 py-1 rounded bg-zt-surface-2 text-zt-muted whitespace-nowrap">
                    {divAthletes.length} ath
                  </span>

                  <button
                    type="button"
                    onClick={() => setArmedDeleteId(isArmed ? null : div.id)}
                    aria-label={`Remove ${div.name}`}
                    className={`p-1.5 rounded-lg border transition ${
                      isArmed
                        ? 'bg-red-600 border-red-500 text-white'
                        : 'bg-zt-surface border-zt-border-strong text-zt-muted hover:text-red-400'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {invalidStation && (
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400 px-1">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>
                      Station &ldquo;{div.flight}&rdquo; was removed; pick a station in step 4 or this division shows under
                      &ldquo;All&rdquo; only.
                    </span>
                  </div>
                )}

                {isArmed && (
                  <div className="flex items-center justify-between gap-2 bg-red-950/50 border border-red-500/60 rounded-lg p-2">
                    <span className="text-[11px] font-bold text-red-200">
                      Remove <strong className="font-black">{div.name}</strong> ({divAthletes.length}{' '}
                      athlete{divAthletes.length === 1 ? '' : 's'}, {divResultCount} score
                      {divResultCount === 1 ? '' : 's'})?
                    </span>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          removeDivision(div.id);
                          setArmedDeleteId(null);
                        }}
                        className="px-2.5 py-1 rounded bg-red-600 text-white font-black text-[10px] uppercase"
                      >
                        Tap to Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setArmedDeleteId(null)}
                        className="px-2 py-1 rounded bg-zt-surface-2 text-zt-text-2 font-bold text-[10px] uppercase"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Division Form */}
      <form onSubmit={handleAddDivision} className="flex gap-2 pt-1">
        <input
          type="text"
          placeholder="New division name (e.g. Men's Open 105kg)..."
          value={newDivName}
          onChange={(e) => setNewDivName(e.target.value)}
          className="flex-1 min-w-0 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
        />
        <button
          type="submit"
          className="bg-zt-primary text-zt-on-primary px-3.5 py-2 rounded-xl font-black text-xs uppercase flex items-center gap-1 flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Add
        </button>
      </form>
    </section>
  );
}