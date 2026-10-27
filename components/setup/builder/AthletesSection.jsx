'use client';

import { useRef, useState } from 'react';
import { Dices, GripVertical, Plus, Trash2, UserCheck, UserMinus } from 'lucide-react';

export default function AthletesSection({
  divisions,
  athletes,
  results,
  addAthlete,
  bulkAddAthletes,
  updateAthlete,
  removeAthlete,
  moveAthlete,
  shuffleLots,
  moveLot, // (divisionId, athleteId, toIndex): drag-and-drop lot order (Kurt 10/27); optional for older callers
  toggleAthleteWithdrawn,
  sectionNumber = 5, // heading number; the promoter editor passes its tab number (build order 10/26)
}) {
  const sortedDivisions = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder);
  const [targetDivId, setTargetDivId] = useState(sortedDivisions[0]?.id || '');
  const [newName, setNewName] = useState('');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [armedDeleteId, setArmedDeleteId] = useState(null);
  const [armedDrawDivId, setArmedDrawDivId] = useState(null);
  // Drag state for the lot handles: which athlete is lifted and where it would land (0-based index in its division).
  const [drag, setDrag] = useState(null); // { divId, athleteId, fromIndex, overIndex }
  const dragRef = useRef(null);
  const [liveMsg, setLiveMsg] = useState('');

  // Pointer events (not HTML5 drag) so the same code works for a mouse and a finger; the handle has touch-action: none
  // so the page does not scroll while a row is lifted.
  const rowIndexAt = (divId, clientY) => {
    const rows = Array.from(document.querySelectorAll(`[data-lot-row][data-div-id="${divId}"]`));
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return Math.max(0, rows.length - 1);
  };
  const startDrag = (e, divId, athleteId, fromIndex) => {
    if (!moveLot) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const next = { divId, athleteId, fromIndex, overIndex: fromIndex };
    dragRef.current = next;
    setDrag(next);
  };
  const onDragMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const overIndex = rowIndexAt(d.divId, e.clientY);
    if (overIndex !== d.overIndex) {
      dragRef.current = { ...d, overIndex };
      setDrag(dragRef.current);
    }
  };
  const endDrag = (e, cancelled = false) => {
    const d = dragRef.current;
    if (!d) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    dragRef.current = null;
    setDrag(null);
    if (!cancelled && d.overIndex !== d.fromIndex) {
      moveLot(d.divId, d.athleteId, d.overIndex);
      setLiveMsg(`Moved to lot ${d.overIndex + 1}.`);
    }
  };
  // Keyboard on the handle: arrows move one lot; Home/End to the ends.
  const onHandleKey = (e, divId, athleteId, index, count) => {
    if (!moveLot) return;
    let to = null;
    if (e.key === 'ArrowUp') to = index - 1;
    else if (e.key === 'ArrowDown') to = index + 1;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = count - 1;
    if (to === null) return;
    e.preventDefault();
    if (to < 0 || to >= count || to === index) return;
    moveLot(divId, athleteId, to);
    setLiveMsg(`Moved to lot ${to + 1} of ${count}.`);
  };

  const activeDivId = sortedDivisions.some((d) => d.id === targetDivId)
    ? targetDivId
    : sortedDivisions[0]?.id || '';

  const handleSingleAdd = (e) => {
    e.preventDefault();
    if (!newName.trim() || !activeDivId) return;
    addAthlete({ divisionId: activeDivId, name: newName.trim() });
    setNewName('');
  };

  const handleBulkAdd = (e) => {
    e.preventDefault();
    if (!bulkText.trim() || !activeDivId) return;
    bulkAddAthletes(activeDivId, bulkText);
    setBulkText('');
    setBulkMode(false);
  };

  const handleDrawLots = (divId, hasResults) => {
    if (hasResults && armedDrawDivId !== divId) {
      setArmedDrawDivId(divId);
      return;
    }
    shuffleLots(divId);
    setArmedDrawDivId(null);
  };

  return (
    <section className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-wider text-zt-primary">
          {sectionNumber}. Athletes ({athletes.length})
        </h2>
        <button
          type="button"
          disabled={sortedDivisions.length === 0}
          onClick={() => setBulkMode((b) => !b)}
          className="text-[11px] font-extrabold uppercase px-2.5 py-1 rounded-lg border border-zt-border-strong bg-zt-inset text-zt-text-2 disabled:opacity-40"
        >
          {bulkMode ? 'Single Add' : 'Bulk Add'}
        </button>
      </div>

      {sortedDivisions.length === 0 ? (
        <p className="text-xs font-bold text-zt-muted bg-zt-inset border border-zt-border rounded-xl p-3">
          Add at least one division above before adding athletes.
        </p>
      ) : (
        <>
          {/* Add / Bulk Add Controls */}
          {!bulkMode ? (
            <form onSubmit={handleSingleAdd} className="flex gap-1.5">
              <select
                value={activeDivId}
                onChange={(e) => setTargetDivId(e.target.value)}
                aria-label="Select division for new athlete"
                className="bg-zt-inset border border-zt-border-strong rounded-xl px-2.5 py-2 text-xs font-bold text-zt-primary max-w-[140px]"
              >
                {sortedDivisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Athlete full name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 min-w-0 bg-zt-inset border border-zt-border-strong rounded-xl px-3 py-2 text-xs font-bold text-zt-text"
              />
              <button
                type="submit"
                className="bg-zt-primary text-zt-on-primary px-3 py-2 rounded-xl font-black text-xs uppercase flex items-center gap-1 flex-shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </form>
          ) : (
            <form onSubmit={handleBulkAdd} className="bg-zt-inset border border-zt-border rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-extrabold uppercase text-zt-muted">
                  Bulk Add (One Name Per Line)
                </label>
                <select
                  value={activeDivId}
                  onChange={(e) => setTargetDivId(e.target.value)}
                  className="bg-zt-surface border border-zt-border-strong rounded-lg px-2 py-1 text-xs font-bold text-zt-primary"
                >
                  {sortedDivisions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                rows={4}
                placeholder={'Kurt Pollack\nDan Vance\nMarcus Trent'}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                className="w-full bg-zt-surface border border-zt-border-strong rounded-lg p-2.5 text-xs font-bold text-zt-text"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2 rounded-lg bg-zt-primary text-zt-on-primary font-black text-xs uppercase"
                >
                  Add All to Division
                </button>
                <button
                  type="button"
                  onClick={() => setBulkMode(false)}
                  className="px-3 py-2 rounded-lg bg-zt-surface-2 text-zt-text-2 font-bold text-xs uppercase"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Grouped Roster by Division */}
          {moveLot && athletes.length > 1 && (
            <p className="text-[11px] font-bold text-zt-muted">
              Lot order is the Event 1 run order (and every event's order when Run Order is Roster Order). Drag the grip
              to reorder, or type a lot number.
            </p>
          )}
          <div className="sr-only" role="status" aria-live="polite">{liveMsg}</div>
          <div className="space-y-3 pt-1">
            {sortedDivisions.map((div) => {
              const divAthletes = athletes
                .filter((a) => a.divisionId === div.id)
                .sort((a, b) => a.lotNumber - b.lotNumber);
              const divAthIds = new Set(divAthletes.map((a) => a.id));
              const divHasResults = results.some((r) => divAthIds.has(r.athleteId));
              const drawArmed = armedDrawDivId === div.id;

              return (
                <div key={div.id} className="bg-zt-inset border border-zt-border rounded-xl p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-black text-zt-text">{div.name}</span>
                      <span className="ml-2 text-[10px] font-bold text-zt-muted">
                        ({divAthletes.length} athlete{divAthletes.length === 1 ? '' : 's'})
                      </span>
                    </div>

                    {divAthletes.length > 1 && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDrawLots(div.id, divHasResults)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 border transition ${
                            drawArmed
                              ? 'bg-amber-500 text-slate-950 border-amber-400'
                              : 'bg-zt-surface border-zt-border-strong text-zt-primary'
                          }`}
                        >
                          <Dices className="w-3 h-3" />
                          {drawArmed ? 'Scores Exist — Tap to Shuffle' : 'Draw Lots'}
                        </button>
                        {drawArmed && (
                          <button
                            type="button"
                            onClick={() => setArmedDrawDivId(null)}
                            className="px-2 py-1 rounded-lg bg-zt-surface-2 text-zt-text-2 text-[10px] font-bold uppercase"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {divAthletes.length === 0 ? (
                    <p className="text-[11px] font-bold text-zt-muted py-1">No athletes in {div.name}.</p>
                  ) : (
                    <div className="space-y-1.5" style={drag?.divId === div.id ? { touchAction: 'none' } : undefined}>
                      {divAthletes.map((ath, rowIndex) => {
                        const isWithdrawn = ath.status === 'withdrawn';
                        const isArmed = armedDeleteId === ath.id;
                        const athResults = results.filter((r) => r.athleteId === ath.id).length;
                        const lifting = drag?.divId === div.id;
                        const isLifted = lifting && drag.athleteId === ath.id;
                        const isTarget = lifting && !isLifted && drag.overIndex === rowIndex;
                        const dropAbove = isTarget && drag.overIndex < drag.fromIndex;

                        return (
                          <div
                            key={ath.id}
                            data-lot-row
                            data-div-id={div.id}
                            data-athlete-id={ath.id}
                            className={`bg-zt-surface border rounded-lg p-2 space-y-1.5 transition-shadow ${
                              isLifted
                                ? 'border-zt-primary opacity-60 shadow-lg'
                                : isTarget
                                ? `border-zt-border ${dropAbove ? 'shadow-[0_-3px_0_0_var(--zt-primary)]' : 'shadow-[0_3px_0_0_var(--zt-primary)]'}`
                                : 'border-zt-border'
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              {moveLot && divAthletes.length > 1 && (
                                <button
                                  type="button"
                                  aria-label={`Lot ${ath.lotNumber}, ${ath.name}. Drag, or use arrow keys, to change the run order`}
                                  title="Drag to reorder (arrow keys also work)"
                                  onPointerDown={(e) => startDrag(e, div.id, ath.id, rowIndex)}
                                  onPointerMove={onDragMove}
                                  onPointerUp={(e) => endDrag(e)}
                                  onPointerCancel={(e) => endDrag(e, true)}
                                  onKeyDown={(e) => onHandleKey(e, div.id, ath.id, rowIndex, divAthletes.length)}
                                  className="p-1 -ml-0.5 rounded text-zt-muted hover:text-zt-text cursor-grab active:cursor-grabbing select-none"
                                  style={{ touchAction: 'none' }}
                                >
                                  <GripVertical className="w-4 h-4" aria-hidden="true" />
                                </button>
                              )}
                              <input
                                type="number"
                                min={1}
                                value={ath.lotNumber}
                                onChange={(e) => updateAthlete(ath.id, { lotNumber: Number(e.target.value) || 1 })}
                                title="Lot Number"
                                aria-label={`Lot number for ${ath.name}`}
                                className="w-12 bg-zt-inset border border-zt-border-strong rounded px-1.5 py-1 text-xs font-mono font-black text-center text-zt-primary"
                              />
                              <input
                                type="text"
                                value={ath.name}
                                onChange={(e) => updateAthlete(ath.id, { name: e.target.value })}
                                aria-label="Athlete name"
                                className={`flex-1 min-w-[7rem] bg-zt-inset border border-zt-border-strong rounded px-2 py-1 text-xs font-bold ${
                                  isWithdrawn ? 'line-through text-zt-muted' : 'text-zt-text'
                                }`}
                              />
                              {sortedDivisions.length > 1 && (
                                <select
                                  value={ath.divisionId}
                                  onChange={(e) => moveAthlete(ath.id, e.target.value)}
                                  aria-label={`Move ${ath.name} to division`}
                                  className="bg-zt-inset border border-zt-border-strong rounded px-1.5 py-1 text-[10px] font-bold text-zt-text-2 max-w-[95px]"
                                >
                                  {sortedDivisions.map((d) => (
                                    <option key={d.id} value={d.id}>
                                      {d.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleAthleteWithdrawn(ath)}
                                title={isWithdrawn ? 'Reinstate Athlete' : 'Scratch Athlete'}
                                className={`p-1.5 rounded border ${
                                  isWithdrawn
                                    ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                                    : 'bg-zt-inset border-zt-border-strong text-zt-muted'
                                }`}
                              >
                                {isWithdrawn ? <UserCheck className="w-3.5 h-3.5" /> : <UserMinus className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => setArmedDeleteId(isArmed ? null : ath.id)}
                                title={`Remove ${ath.name}`}
                                className={`p-1.5 rounded border ${
                                  isArmed
                                    ? 'bg-red-600 border-red-500 text-white'
                                    : 'bg-zt-inset border-zt-border-strong text-zt-muted hover:text-red-400'
                                }`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {isArmed && (
                              <div className="flex items-center justify-between gap-2 bg-red-950/50 border border-red-500/60 rounded p-1.5">
                                <span className="text-[10px] font-bold text-red-200">
                                  Delete <strong className="font-black">{ath.name}</strong> ({athResults} score{athResults === 1 ? '' : 's'})?
                                </span>
                                <div className="flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      removeAthlete(ath.id);
                                      setArmedDeleteId(null);
                                    }}
                                    className="px-2 py-0.5 rounded bg-red-600 text-white font-black text-[10px] uppercase"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setArmedDeleteId(null)}
                                    className="px-2 py-0.5 rounded bg-zt-surface-2 text-zt-text-2 font-bold text-[10px] uppercase"
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
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}