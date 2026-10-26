'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Edit3, Plus, Trash2 } from 'lucide-react';
import EventForm from './EventForm';

const TYPE_LABELS = {
  reps: 'Reps',
  max_weight: 'Max Wt',
  time_or_distance: 'Time / Dist',
  time_or_implements: 'Stones / Impl',
};

export default function EventsSection({
  divisions,
  events,
  results,
  addEvent,
  updateEvent,
  removeEvent,
  reorderEvents,
  onEditingChange, // optional: (open: boolean) => void, true while an EventForm draft is open (promoter dirty bar, Astra M2)
  closeFormSignal, // optional: a counter; each change closes any open EventForm draft (promoter bar's Discard draft, 10/26)
  defaultCollarWeightPerPair = 0, // meet.collarWeightPerPair, prefilled on new events (collars are per event, 10/26)
  sectionNumber = 3, // heading number; the promoter editor passes its tab number (build order 10/26)
}) {
  const [editingId, setEditingId] = useState(null); // 'NEW' | event.id | null

  useEffect(() => {
    if (onEditingChange) onEditingChange(editingId !== null);
  }, [editingId, onEditingChange]);
  const lastCloseSignal = useRef(closeFormSignal);
  useEffect(() => {
    if (closeFormSignal === lastCloseSignal.current) return;
    lastCloseSignal.current = closeFormSignal;
    setEditingId(null);
  }, [closeFormSignal]);
  const [armedDeleteId, setArmedDeleteId] = useState(null);

  const sortedEvents = [...events].sort((a, b) => a.eventNumber - b.eventNumber);
  const sortedDivisions = [...divisions].sort((a, b) => a.sortOrder - b.sortOrder);

  const moveEvent = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sortedEvents.length) return;
    const ids = sortedEvents.map((e) => e.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(targetIndex, 0, moved);
    reorderEvents(ids);
  };

  return (
    <section className="bg-zt-surface border border-zt-border rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-wider text-zt-primary">
          {sectionNumber}. Events ({sortedEvents.length})
        </h2>
        <button
          type="button"
          onClick={() => setEditingId(editingId === 'NEW' ? null : 'NEW')}
          className="px-3 py-1.5 rounded-xl bg-zt-primary text-zt-on-primary font-black text-xs uppercase flex items-center gap-1 active:scale-95"
        >
          <Plus className="w-3.5 h-3.5" /> Add Event
        </button>
      </div>

      {editingId === 'NEW' && (
        <EventForm
          divisions={sortedDivisions}
          defaultCollarWeightPerPair={defaultCollarWeightPerPair}
          initialEvent={null}
          onSave={(payload) => {
            addEvent(payload);
            setEditingId(null);
          }}
          onCancel={() => setEditingId(null)}
        />
      )}

      {sortedEvents.length === 0 ? (
        <p className="text-xs font-bold text-zt-muted bg-zt-inset border border-zt-border rounded-xl p-3">
          No events yet. Tap &ldquo;Add Event&rdquo; above to configure Event 1.
        </p>
      ) : (
        <div className="space-y-2">
          {sortedEvents.map((ev, idx) => {
            const evResultsCount = results.filter((r) => r.eventId === ev.id).length;
            const isEditing = editingId === ev.id;
            const isArmed = armedDeleteId === ev.id;

            return (
              <div
                key={ev.id}
                className="bg-zt-inset border border-zt-border rounded-xl p-2.5 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveEvent(idx, -1)}
                      aria-label={`Move ${ev.name} up`}
                      className="p-1 rounded bg-zt-surface border border-zt-border text-zt-muted disabled:opacity-30"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === sortedEvents.length - 1}
                      onClick={() => moveEvent(idx, 1)}
                      aria-label={`Move ${ev.name} down`}
                      className="p-1 rounded bg-zt-surface border border-zt-border text-zt-muted disabled:opacity-30"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : ev.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-zt-primary text-zt-on-primary">
                        Ev {ev.eventNumber}
                      </span>
                      <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-zt-surface-2 text-zt-primary">
                        {TYPE_LABELS[ev.scoringType] || ev.scoringType}
                      </span>
                      <span className="text-[10px] font-bold text-zt-muted">
                        {ev.timeCapSeconds}s • {ev.lanes === 2 ? '2 Lanes' : '1 Lane'} • {ev.loadingPoints}pt
                      </span>
                    </div>
                    <div className="text-xs font-black text-zt-text truncate mt-0.5">
                      {ev.name}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : ev.id)}
                    aria-label={`Edit ${ev.name}`}
                    className="p-1.5 rounded-lg bg-zt-surface border border-zt-border-strong text-zt-text-2"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setArmedDeleteId(isArmed ? null : ev.id)}
                    aria-label={`Remove ${ev.name}`}
                    className={`p-1.5 rounded-lg border transition ${
                      isArmed
                        ? 'bg-red-600 border-red-500 text-white'
                        : 'bg-zt-surface border-zt-border-strong text-zt-muted hover:text-red-400'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {isArmed && (
                  <div className="flex items-center justify-between gap-2 bg-red-950/50 border border-red-500/60 rounded-lg p-2">
                    <span className="text-[11px] font-bold text-red-200">
                      Remove <strong className="font-black">Ev {ev.eventNumber}: {ev.name}</strong> ({evResultsCount} score{evResultsCount === 1 ? '' : 's'})?
                    </span>
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          removeEvent(ev.id);
                          setArmedDeleteId(null);
                          if (editingId === ev.id) setEditingId(null);
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

                {isEditing && (
                  <EventForm
                    divisions={sortedDivisions}
                    defaultCollarWeightPerPair={defaultCollarWeightPerPair}
                    initialEvent={ev}
                    onSave={(patch) => {
                      updateEvent(ev.id, patch);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}